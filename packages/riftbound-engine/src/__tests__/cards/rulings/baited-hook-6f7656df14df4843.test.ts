/**
 * Ruling 6f7656df14df4843 — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5
 *     cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *     ignoring its cost. Then recycle the rest."
 *   × Soraka, Wanderer (SFD-173 → sfd-173-221) "If another unit you control here would die, if it has less Might than me, instead heal
 *     it, exhaust it, and recall it."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, recall it."
 *   × Hidden Blade (OGN-213 → ogn-213-298) "Kill a unit at a battlefield. Its controller draws 2." (nuance contrast)
 *   (The Boss / Sett legend ogn-269-298 is the third saver named in the question.)
 *
 * Q: If Baited Hook's kill is replaced by a save (Soraka / Zhonya's / Sett), is the unit saved and does the Hook still get to use
 *    "killed unit's Might + 1" to find a unit?
 * A: The unit is saved and Baited Hook finds nothing: no kill happened, so there is no "killed unit" to reference — you look at 5
 *    and recycle them all. Deathknell doesn't trigger either. Contrast: Hidden Blade ("its controller") still draws with Zhonya's.
 * Rules: 415.2 (killed = board → trash), 371–373 (replacement effects), 359.3.e.13 (last-known info only for a unit that WAS killed).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SORAKA = "sfd-173-221";
const ZHONYAS = "ogn-077-298";
const THE_BOSS = "ogn-269-298";
const HIDDEN_BLADE = "ogn-213-298";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might, "[Deathknell] — Draw 1" — the bait, so "no Deathknell" is observable

type Saver = "none" | "soraka" | "zhonyas" | "boss";

/**
 * P1's turn. P1: Baited Hook ready, [1][order] (+1 body for the Boss's [rainbow]), a damaged Watchful Sentry (1 Might, Deathknell draw)
 * in base as the bait. Deck top→: One(1) Two(2) Three(3) Junk(spell) Four(4), then Six as the 6th card.
 */
function board(saver: Saver) {
  let s = scenario()
    .resources(P1, { energy: 1, power: { order: 1, body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", WATCHFUL_SENTRY, "bait", saver === "boss" ? { buffed: true } : {})
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Six" },
      ],
      ["one", "two", "three", "junk", "four", "six"],
    );
  if (saver === "soraka") {
    s = s.unit(P1, "base", SORAKA, "soraka");
  } else if (saver === "zhonyas") {
    s = s.gear(P1, ZHONYAS, "zh");
  } else if (saver === "boss") {
    s = s.legend(P1, THE_BOSS, "boss");
  }
  return s;
}

const LOOKED = ["one", "two", "three", "junk", "four"];

/** After the save: no unit may be offered; if a decline-only prompt shows up, decline it. Then assert look-5-recycle-all happened. */
async function expectNothingFoundAndAllRecycled(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.filter((o) => LOOKED.includes(String(o.card ?? o.key)))).toEqual([]);
    await game.p1.decline();
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  for (const c of LOOKED) {
    expect(game.zoneOf(c)).toBe("mainDeck");
  }
  expect(game.p1.banishment()).toEqual([]);
  expect(game.p1.deck()[0]).toBe("six"); // the five looked-at cards were recycled to the bottom
  expect(game.p1.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
  expect(game.state("hook").isExhausted).toBe(true);
}

function expectBaitSaved(game: Game): void {
  expect(game.zoneOf("bait")).toBe("base");
  expect(game.p1.trash()).not.toContain("bait");
  expect(game.state("bait")).toMatchObject({ damage: 0, isExhausted: true });
  expect(game.p1.hand()).toEqual([]); // no Deathknell draw — nothing died
}

describe("Ruling 6f7656df14df4843 — a saved unit was never 'killed', so Baited Hook has no Might to compare against", () => {
  test("control (no saver): the Sentry (1) is killed → Deathknell draws 1, and P1 is offered the looked-at units of Might ≤ 2", async () => {
    const game = await board("none").build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    const stop = await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["one", "two"]);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // the Deathknell draw
  });

  test("Soraka (4 Might, same location): the Sentry is healed, exhausted and recalled instead of dying; Hook looks at 5, offers nothing, recycles all", async () => {
    const game = await board("soraka").build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    await game.settle();
    expectBaitSaved(game);
    expect(game.zoneOf("soraka")).toBe("base");
    await expectNothingFoundAndAllRecycled(game);
    expect(game.violations()).toEqual([]);
  });

  test("Zhonya's Hourglass: the Hourglass is killed instead; Sentry saved; Hook looks at 5, offers nothing, recycles all", async () => {
    const game = await board("zhonyas").build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expectBaitSaved(game);
    await expectNothingFoundAndAllRecycled(game);
    expect(game.violations()).toEqual([]);
  });

  test("The Boss (Sett): P1 is asked, pays [rainbow] + exhausts the legend + spends the buff; Sentry saved; Hook looks at 5, offers nothing, recycles all", async () => {
    const game = await board("boss").build();
    expect(game.state("bait")).toMatchObject({ isBuffed: true, might: 2 });
    await game.p1.activate("hook", 0, { targets: "bait" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expectBaitSaved(game);
    expect(game.state("bait").isBuffed).toBe(false);
    await expectNothingFoundAndAllRecycled(game);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Hidden Blade references 'its controller', not 'the killed unit': into Zhonya's the unit lives and its controller STILL draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .gear(P2, ZHONYAS, "zh")
      .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2a", "p2b", "p2c"])
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand()).toEqual(["p2a", "p2b"]);
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
