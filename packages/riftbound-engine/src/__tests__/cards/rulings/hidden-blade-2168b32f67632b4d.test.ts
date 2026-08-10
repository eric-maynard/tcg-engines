/**
 * Ruling 2168b32f67632b4d — Hidden Blade (OGN-213 → ogn-213-298, [Hidden] Action, 2 + [order])
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298, Gear) "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."   (Guardian Angel sfd-051-221 is the equivalent equipment case; Deathgrip
 *     sfd-163-221 was the unanswered second question.)
 *
 * Q: Can I Hidden Blade my own unit twice?
 * A: Two Hidden Blades at the same unit are both playable, but only the first to RESOLVE succeeds: it kills the unit
 *    and its controller draws 2; the second then has no legal target — no kill and NO draw. Exception: if a
 *    replacement (Zhonya's / Guardian Angel) saved the unit from the first kill, it is still around for the second
 *    Blade, which resolves normally — 2 cards from each.
 * Rules: 340 (LIFO), 359.3.f.2.a (illegal target → its instructions are ignored), 359.3.e.14.b (the draw is linked to
 *        the targeted unit), 369–373 (replacement: the unit never died).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";

/**
 * P1's turn (turn 3). P1 controls bf1 with its own 3-Might Victim there and a Hidden Blade hidden at bf1 (from an
 * earlier turn); a second Hidden Blade in hand with exactly 2 + [order]. P2's Onlooker stands at P2's bf2.
 * Deck top known: d1..d5.
 */
function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .facedown(P1, "bf1", HIDDEN_BLADE, "bladeHidden")
    .hand(P1, HIDDEN_BLADE, "bladeHand")
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
  if (opts.zhonyas) {
    s.gear(P1, ZHONYAS, "zhonyas");
  }
  return s;
}

/** Blade from hand at Victim, then (holding priority) the hidden Blade at Victim too → chain [hand, hidden]. */
async function twoBladesAtVictim(game: Game): Promise<void> {
  await game.p1.cast("bladeHand", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bladeHand"]);
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("reveal", "bladeHidden")).toBe(true);
  await game.p1.reveal("bladeHidden");
  // A card played from facedown chooses from units HERE (811) — Victim is the only unit at bf1, so the choice is
  // locked without asking; answer it if the engine does ask.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("victim");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["bladeHand", "bladeHidden"]);
  expect(game.chain()[0]?.targets).toEqual(["victim"]);
  expect(game.p1.hand()).toEqual([]);
}

describe("Ruling 2168b32f67632b4d — two Hidden Blades at one unit: only the first to resolve kills and draws", () => {
  test("both Blades are playable at the same Victim (one from hand for 2 + [order], one from its hidden spot for 0) and sit on the chain together", async () => {
    const game = await board({ zhonyas: false }).build();
    await twoBladesAtVictim(game);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("LIFO: the hidden Blade resolves first — Victim dies and P1 (its controller) draws 2; the hand Blade then finds no legal target: no kill, NO further draw — P1 ends with exactly 2 cards", async () => {
    const game = await board({ zhonyas: false }).build();
    await twoBladesAtVictim(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // bladeHidden resolves
    expect(game.zoneOf("bladeHidden")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bladeHand"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bladeHand")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]); // the second Blade drew nothing
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("onlooker")).toBe("battlefield-bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 2168b32f67632b4d says a unit saved by Zhonya's is "still around" for the second Blade,
  // which resolves normally (kill + draw 2, 4 cards total); CR 359.3.f.2.a says a chain item's targets are re-checked on
  // resolution and an item whose only target is no longer legal has its instructions ignored — Hidden Blade targets "a
  // unit at a battlefield", and Zhonya's replacement RECALLS the saved unit to base, so it is no longer a legal target.
  // Engine follows CR. Landed ruling 0642074d3ef03805 (hidden-blade-0642074d3ef03805.test.ts) asserts exactly this
  // fizzle-on-leaving-a-battlefield behaviour, so the two rulings also disagree with each other.
  test("ruling 2168b32f67632b4d (CR targeting) — Zhonya's saves Victim from the FIRST Blade (Zhonya's killed instead; Victim healed, exhausted, recalled to base) and P1 draws 2; the SECOND Blade then finds its target no longer at a battlefield and is ignored — no kill, no further draw", async () => {
    const game = await board({ zhonyas: true }).build();
    await twoBladesAtVictim(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // bladeHidden resolves → replacement
    for (let i = 0; i < 3 && game.decision()?.kind !== "action"; i++) {
      await game.settle({ maxSteps: 1, policy: "first" }); // accept a replacement prompt if one is surfaced
    }
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bladeHand"]);
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bladeHand")).toBe("trash");
    // rule 359.3.f.2.a: target no longer "a unit at a battlefield" → the Blade's instructions are ignored entirely.
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
