/**
 * Ruling aa969395f8d0b7e9 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · 6 Might · "As an additional cost to play me, kill a friendly unit."
 *
 * Q: Can the unit found with Baited Hook be played to a battlefield where my only unit was the one the Hook killed?
 * A: No. The found unit's play only finalizes after the Hook has finished resolving; by then Cleanup has run and the
 *    empty battlefield is no longer mine, so it is not a legal destination. Contrast Cruel Patron: its kill is a COST,
 *    paid as the Patron itself is being played, so the destination was chosen while I still held the battlefield.
 * Rules: 190.4.c / 323.6 (no units → lose control at Cleanup), 346 (units are played to your base or a battlefield you
 *        control), 356.4 (additional costs are paid during the play), 359 (nothing finalizes mid-resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const CRUEL_PATRON = "ogn-208-298";
const SKULKER = "ogn-175-298"; // 3 Might vanilla

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn with [1][order]. P1 controls bf1 where Bait (2) is the ONLY unit; P2 holds bf2. Deck top→: Three, 4 Skulkers, below. */
function hookBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { energyCost: 2, might: 2, name: "Bait" }, "bait")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, [{ cardType: "unit", energyCost: 3, might: 3, name: "Three" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["three", "r1", "r2", "r3", "r4", "below"]);
}

/** Activate the Hook killing Bait; resolve to the look-at-5 offer and take Three. Returns at the destination prompt (if any). */
async function hookedThree(): Promise<Game> {
  const game = await hookBoard().build();
  await game.p1.activate("hook", 0, { targets: "bait" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("bait")).toBe("trash"); // killed as part of the Hook RESOLVING
  const offer = game.decision();
  expect(offer).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  expect((offer as Pick).options.map((o) => o.card)).toContain("three");
  await game.p1.pick("three");
  return game;
}

describe("Ruling aa969395f8d0b7e9 — the Hooked-in unit can't go to the battlefield the Hook just emptied; Cruel Patron can", () => {
  test("Baited Hook's kill is part of its resolution: Bait is still on bf1 while the ability sits on the chain and only dies when it resolves", async () => {
    const game = await hookBoard().build();
    await game.p1.activate("hook", 0, { targets: "bait" });
    expect(game.zoneOf("bait")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["bait"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge aa969395f8d0b7e9 (with 41251a7db1c8d7f0 / d1e31cb5c7f480a0 / 382c535e1d2ee445) says the
  // Hooked-in unit may not go to the battlefield the Hook just emptied; CR 190.4 / 323.6 (+ the official clarification
  // 9a32cc…) says control is only re-checked at a Cleanup run in an OPEN State, and the Hook is still resolving here —
  // engine follows CR. The pre-"1.1" minority rulings are not re-litigated per card; see the control-timing matrix in
  // core-rules/battlefield-control-timing.test.ts.
  test("ruling aa969395f8d0b7e9 (CR reading) — bf1 is still P1's while the Hook resolves, so the Hooked-in unit may be played there and P1 keeps it", async () => {
    const game = await hookedThree();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = (d as Pick).options.map((o) => o.key);
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf1"); // control has not lapsed: Closed State (rule 401.1)
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("three")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Three holds it, so no lapse at the Open Cleanup
    expect(game.p1.deck()[0]).toBe("below");
    expect(game.violations()).toEqual([]);
  });

  test("what does hold either way: choosing the base is legal, Three is played there free, and with bf1 empty in the Open State P1 no longer controls it", async () => {
    const game = await hookedThree();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((d as Pick).options.map((o) => o.key)).toContain("base");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("three")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.deck()[0]).toBe("below");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Cruel Patron: killing Bait is an additional COST paid as the Patron is played, so bf1 is chosen while still mine — the Patron lands on bf1 and I keep it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { energyCost: 2, might: 2, name: "Bait" }, "bait")
      .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    const loc = game.p1.option("play", "patron")?.fields.find((f) => f.name === "location");
    expect(loc?.options).toContain("battlefield-bf1"); // offered at play time, Bait still standing there
    await game.p1.play("patron", { sacrifice: "bait", to: "bf1" });
    expect(game.zoneOf("bait")).toBe("trash"); // paid up front
    await game.settle();
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["patron"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
