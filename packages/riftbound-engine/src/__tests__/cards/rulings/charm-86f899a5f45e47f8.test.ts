/**
 * Ruling 86f899a5f45e47f8 — Charm (OGN-043 → ogn-043-298) "Move an enemy unit."
 *   × Retreat (OGN-104 → ogn-104-298) "[Reaction] Return a friendly unit to its owner's hand. Its
 *     owner channels 1 rune exhausted."
 *
 * Q: P1 controls both battlefields. P2 Charms P1's unit from BF1 to BF2; in response P1 Retreats their
 *    own unit off BF2. When the charmed unit lands on BF2, does a showdown start and can P1 score?
 * A (riftjudge): yes — it says the Cleanup makes BF2 uncontrolled the moment the Retreat resolves, so
 *    the arriving unit conquers into a fresh showdown.
 * ENGINE / CR: no. Losing control (323.6, Cleanup step 4) only happens in an OPEN State, and the Charm
 *    is still on the chain — a Closed State. P1 therefore still controls BF2 when their own unit
 *    arrives: no Contested, no showdown, no point.
 * Rules: 190.4 / 323.6 (control is lost at a Cleanup in an Open State with nothing ongoing there),
 *    190.3.a (only a unit arriving where its controller does NOT control applies Contested),
 *    331.2 (a chain makes the state Closed), 344.2 (showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RETREAT = "ogn-104-298";

/** P2's turn. P1 controls BOTH battlefields, one unit on each. P2 holds Charm, P1 holds Retreat. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Wanderer" }, "wanderer")
    .unit(P1, "bf2", { might: 3, name: "Sitter" }, "sitter")
    .hand(P2, CHARM, "charm")
    .hand(P1, RETREAT, "retreat");
}

/** P2 Charms the BF1 unit toward BF2; P1 answers by Retreating the BF2 unit; the Retreat resolves. */
async function retreatResolved(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { answers: ["battlefield-bf2"], targets: "wanderer" });
  expect(game.chain()[0]).toMatchObject({ cardId: "charm", targets: ["wanderer"] });
  await game.p2.passPriority();
  await game.p1.cast("retreat", { targets: "sitter" });
  while (game.chain().length > 1) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("sitter")).toBe("hand");
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]); // Charm is still pending
  return game;
}

describe("Ruling 86f899a5f45e47f8 — Charm into a battlefield you just emptied", () => {
  test("the Retreat resolves and BF2 is left with no units — but the Charm is still on the chain", async () => {
    const game = await retreatResolved();
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p2.units("bf2")).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 86f899a5f45e47f8 says BF2 goes Uncontrolled the instant the Retreat
  // resolves, so the arriving unit conquers and scores. CR 323.6 only runs the control-loss Cleanup
  // step in an OPEN State, and the pending Charm keeps the state Closed — engine follows CR. This is
  // the same "control lost mid-chain" family as Baited Hook / Cruel Patron / Arcane Shift, settled in
  // DESIGN.md "Battlefield control"; do not flip back.
  test("RULING-CONFLICT: control of BF2 is KEPT while the chain is live", async () => {
    const game = await retreatResolved();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("RULING-CONFLICT: so the charmed unit arrives at a battlefield its own controller holds — no showdown, no point", async () => {
    const game = await retreatResolved();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("wanderer")).toBe("bf2");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.p1.points()).toBe(0);
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("the battlefield the unit LEFT does lapse — once the chain empties, the Open-State Cleanup takes BF1 away", async () => {
    const game = await retreatResolved();
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
  });

  test("what the ruling was reaching for really does work when the window is OPEN: vacate BF2 with the chain empty, and a later arrival conquers it", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", { might: 3, name: "Wanderer" }, "wanderer")
      .unit(P1, "bf2", { might: 3, name: "Sitter" }, "sitter")
      .build();
    await game.p1.move("sitter", "base"); // no chain — the next Cleanup is an Open State
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBe(null);
    await game.p1.move("wanderer", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // a genuine Conquer
    expect(game.violations()).toEqual([]);
  });
});
