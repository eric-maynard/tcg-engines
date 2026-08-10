/**
 * Ruling 1594865f218aced5 — Baited Hook (OGN-242 → ogn-242-298, Gear)
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *    among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × The Boss (ogn-269-298, Legend · Sett) "If a buffed unit you control would die, you may pay [rainbow], exhaust me,
 *     and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Baited Hook targets a buffed unit and Sett's legend saves it — does the Hook use the unit's Might, or find no
 *    killed unit?
 * A: The Boss is a replacement effect: the kill becomes a recall, so NO unit was killed. Baited Hook still looks at the
 *    top 5 but has no "killed unit" Might to compare against → you cannot play a unit; you recycle the rest (all 5).
 * Rules: 370.1/371.2 (optional replacement intercedes during resolution; replaced event never happened),
 *        359.3.f.2.a (a null referent → dependent instruction ignored), 702.2.b (spend the buff).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const THE_BOSS = "ogn-269-298";
const U = (n: number) => ({ cardType: "unit", energyCost: n, might: n, name: `Deck Unit ${n}` });

/**
 * P1's turn. The Boss (ready) is P1's legend; Baited Hook ready; Bait (printed 3, BUFFED → 4) in base.
 * P1 has exactly [1][order] for the Hook + 1 spare power (body) for The Boss's [rainbow].
 * P1's deck, top first: units of Might 1..5 (all ≤ 5, i.e. all eligible for a 4-Might kill), then 6 and 7.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1, body: 1 } })
    .legend(P1, THE_BOSS, "boss")
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 3, name: "Bait" }, "bait", { buffed: true })
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6), U(7)], ["u1", "u2", "u3", "u4", "u5", "u6", "u7"]);
}

const TOP5 = ["u1", "u2", "u3", "u4", "u5"];

/** Activate the Hook on Bait and pass priorities until The Boss asks (or something else stops us). */
async function hookBaitUntilBoss(game: Game): Promise<Decision | null> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook", 0, { answers: ["bait"] });
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.options.some((o) => o.key === "bait")) {
      await game.p1.pick("bait");
    } else {
      break;
    }
  }
  return game.decision();
}

/** Any prompt offering one of the top-5 deck cards to banish/play. */
function isLookOffer(d: Decision | null): boolean {
  return d?.kind === "pick" && d.options.some((o) => TOP5.includes((o.card ?? o.key) as string));
}

describe("Ruling 1594865f218aced5 — The Boss saves Baited Hook's victim: no killed unit → nothing to play, recycle all 5", () => {
  test("as the Hook resolves and would kill the buffed Bait, The Boss's optional replacement is offered to P1 (yes/no sourced from the legend) BEFORE any look-at-5 offer", async () => {
    const game = await board().build();
    expect(game.state("bait")).toMatchObject({ isBuffed: true, might: 4 });
    const d = await hookBaitUntilBoss(game);
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true, source: { cardId: "boss" } });
    expect(game.zoneOf("bait")).toBe("base"); // nothing has died
    expect(isLookOffer(d)).toBe(false);
  });

  test("YES: [rainbow] paid + Boss exhausted + buff spent; Bait is healed, exhausted and 'recalled' (stays in base) INSTEAD of dying — it never reaches the trash", async () => {
    const game = await board().build();
    await hookBaitUntilBoss(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.p1.trash()).not.toContain("bait");
  });

  test("…and since no unit was KILLED, the Hook plays nothing: no top-5 card is offered/played/banished, and all five looked-at cards are recycled to the bottom (u6 is the new top)", async () => {
    const game = await board().build();
    await hookBaitUntilBoss(game);
    await game.p1.yes();
    // Either no offer at all, or an offer with nothing selectable — never a playable unit.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.options.filter((o) => TOP5.includes((o.card ?? o.key) as string))).toEqual([]);
        await game.seat(d.seat).decline();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual(["bait"]);
    for (const c of TOP5) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
    const deck = game.p1.deck();
    expect(deck[0]).toBe("u6");
    expect(deck.slice(-5).sort()).toEqual([...TOP5].sort()); // recycled = put on the bottom
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — NO to The Boss: Bait (4 Might as it dies) is killed, and the look offers every unit with Might ≤ 5 (u1…u5) to banish-and-play", async () => {
    const game = await board().build();
    await hookBaitUntilBoss(game);
    await game.p1.no();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
    const d = game.decision();
    expect(isLookOffer(d)).toBe(true);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(TOP5);
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true);
    await game.p1.pick("u5");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("u5")).toBe("base");
    expect(game.p1.deck()[0]).toBe("u6");
  });
});
