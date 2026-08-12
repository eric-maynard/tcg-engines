/**
 * Ruling b678d64449fbf8be — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 Might · [7][mind]
 *   "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · 5 Might · "[Ambush] (You may play me as a [Reaction] to a
 *     battlefield where you have units.)"
 *
 * Q: Does the Watcher's effect also hit units the opponent plays later that turn?
 * A: No. The ability snapshots the board as it RESOLVES: only enemy units already there take the -3. A unit
 *    that enters afterwards is unaffected, even in the same turn. But a unit played as a Reaction to the
 *    trigger (so it is already on the board when the trigger resolves) IS caught by it.
 * Rules: 355.10.d (a "criteria" instruction gathers its objects as it resolves), 359.3 (an effect applies to
 *        what exists at resolution; it is not a continuous effect that keeps looking).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THOUSAND_TAILED_WATCHER = "ogn-116-298";
const VI_PEACEKEEPER = "unl-176-219"; // [Ambush]
const HEXTECH_RAY = "ogn-009-298"; // a cheap Action, only to open a priority window later

/** P1's turn. P2 durably holds bf1 with a 5-Might Holder and has two Ambush Vis in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1, mind: 1 } })
    .resources(P2, { energy: 10, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Holder" }, "holder")
    .hand(P1, THOUSAND_TAILED_WATCHER, "ttw")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, VI_PEACEKEEPER, "vi1")
    .hand(P2, VI_PEACEKEEPER, "vi2");
}

/** P1 plays the Watcher; its trigger is on the chain, nothing has resolved yet. */
async function playWatcher(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ttw");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ttw"]);
  return game;
}

describe("Ruling b678d64449fbf8be — the Watcher's -3 snapshots the board at resolution", () => {
  test("baseline: enemy units already on the board when it resolves take the -3 (5 → 2)", async () => {
    const game = await playWatcher();
    await game.settle();
    expect(game.state("holder")).toMatchObject({ might: 2, mightModifier: -3 });
    expect(game.state("ttw").might).toBe(7); // friendly units are untouched
  });

  test("ruling: a unit played as a REACTION to the trigger is on the board at resolution — it IS caught (5 → 2)", async () => {
    const game = await playWatcher();
    await game.p1.passPriority();
    await game.p2.play("vi1", { to: "bf1" }); // [Ambush], onto the still-unresolved chain
    expect(game.chain().map((c) => c.cardId)).toEqual(["ttw"]); // permanents finalize immediately
    await game.settle();
    expect(game.state("vi1")).toMatchObject({ might: 2, mightModifier: -3 });
    expect(game.state("holder").might).toBe(2);
  });

  test("ruling: a unit that enters AFTER the trigger has resolved is unaffected, even on the same turn (still 5)", async () => {
    const game = await playWatcher();
    await game.p1.passPriority();
    await game.p2.play("vi1", { to: "bf1" });
    await game.settle();
    expect(game.state("vi1").might).toBe(2);
    // later that same turn, P1 casts a spell; P2 Ambushes the second Vi in on that chain
    await game.p1.cast("ray", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.play("vi2", { to: "bf1" });
    await game.settle();
    expect(game.state("vi2")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.state("vi1").might).toBe(2); // the earlier one keeps its -3 for the rest of the turn
    expect(game.violations()).toEqual([]);
  });

  test("ruling: 'to a minimum of 1' — a small enemy unit is floored at 1, not driven below", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Scamp" }, "scamp")
      .hand(P1, THOUSAND_TAILED_WATCHER, "ttw")
      .build();
    await game.p1.play("ttw");
    await game.settle();
    expect(game.state("scamp").might).toBe(1);
  });

  test("ruling: 'this turn' — the -3 lapses at end of turn", async () => {
    const game = await playWatcher();
    await game.settle();
    expect(game.state("holder").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("holder").might).toBe(5);
  });
});
