/**
 * Ruling 31e121f57f92d159 — Alpha Strike (UNL-192 → unl-192-219) [Action] · 3 + [rainbow]
 *   "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for
 *    each unit this kills, do this: Gain 1 XP."
 *   × Temporal Breach (VEN-066 → ven-066-166) [Hidden] "Banish a unit, then its owner plays it to the same location,
 *     ignoring its cost."  (Flash ogs-011-024 / Repulse unl-106-219 are cited only for the severed-targeting precedent.)
 *
 * Q: A unit targeted by Alpha Strike would die; its controller reveals Temporal Breach to save it. Does Alpha
 *    Strike's controller get to re-choose targets?
 * A: No. Banishment is a non-board zone, so the targeting is severed; the replayed unit is a NEW object Alpha Strike
 *    never chose and takes no damage. At resolution the damage is split (re-decided then) among the REMAINING
 *    original targets only; if the saved unit was the only target, the damage instruction does nothing.
 * Rules: 056.1 (banishment is non-board), 124 (new object after zone change), 359.3.e.2/e.4, 355.14.e (split decided
 *        on resolution), 355.15 (no new targets).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const TEMPORAL_BREACH = "ven-066-166";

type Distribute = Extract<Decision, { kind: "distribute" }>;

/**
 * P1's turn 2. P1's 6-Might Striker in base; P2 holds bf1 with Victim A (2) [+ Victim B (3), Victim C (3) when
 * `crowd`], and has Temporal Breach hidden facedown at bf1 since an earlier turn. P1: exactly 3 + [rainbow].
 */
function board(crowd: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Striker" }, "striker")
    .unit(P2, "bf1", { might: 2, name: "Victim A" }, "va");
  if (crowd) {
    s.unit(P2, "bf1", { might: 3, name: "Victim B" }, "vb").unit(P2, "bf1", { might: 3, name: "Victim C" }, "vc");
  }
  return s.facedown(P2, "bf1", TEMPORAL_BREACH, "breach").hand(P1, ALPHA_STRIKE, "alpha");
}

/** P1 casts Alpha Strike (Striker as source, the listed enemies as targets) and passes; P2 reveals Breach on Victim A; Breach resolves. */
async function strikeThenBreachSavesA(game: Game, enemies: string[]): Promise<void> {
  await game.p1.cast("alpha", { targets: ["striker", ...enemies] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()[0]).toMatchObject({ cardId: "alpha", targets: ["striker", ...enemies] }); // targets locked at finalization
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "breach")).toBe(true);
  await game.p2.reveal("breach", { answers: ["va"] });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("va");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "breach"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2 });
  expect(game.chain()[1]?.targets ?? ["va"]).toEqual(["va"]); // (a lone unit at bf1 is a forced choice and may not be echoed)
  await game.p2.passPriority();
  await game.p1.passPriority(); // Temporal Breach resolves: banish Victim A, P2 replays it to bf1 for free
  expect(game.zoneOf("breach")).toBe("trash");
  expect(game.zoneOf("va")).toBe("battlefield-bf1"); // back — as a new object
  expect(game.p2.banishment()).toEqual([]);
  expect(game.chain().map((c) => c.cardId)).toEqual(["alpha"]); // Alpha Strike still waiting, targets unchanged
  expect(game.chain()[0]?.targets).toEqual(["striker", ...enemies]);
}

describe("Ruling 31e121f57f92d159 — Temporal Breach severs Alpha Strike's targeting; no re-choosing", () => {
  test("three original targets, Victim A breached out and back: at resolution P1 re-splits the 6 damage among ONLY Victim B and C (no bucket for the replayed A, no new targets); A takes nothing", async () => {
    const game = await board(true).build();
    await strikeThenBreachSavesA(game, ["va", "vb", "vc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Alpha Strike starts resolving → split decision
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1 });
    const keys = (d as Distribute).buckets.map((b) => b.card ?? b.key).sort();
    expect(keys).toEqual(["vb", "vc"]); // the replayed Victim A is not among them; nothing new was added either
    // The engine asks for ONE division of the 6 among B and C (355.14.e/f): 3 each = lethal for both. A is never offered.
    expect((d as Distribute).total).toBe(6);
    const bKey = (d as Distribute).buckets.find((b) => (b.card ?? b.key) === "vb")!.key;
    const cKey = (d as Distribute).buckets.find((b) => (b.card ?? b.key) === "vc")!.key;
    await game.p1.distribute({ [bKey]: 3, [cKey]: 3 });
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.zoneOf("vc")).toBe("trash");
    expect(game.state("va")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(2); // two kills, not three
    expect(game.violations()).toEqual([]);
  });

  test("Victim A was the ONLY target: after the Breach, Alpha Strike resolves and its damage instruction does nothing — the replayed A is untouched, nobody else is hit, no XP", async () => {
    const game = await board(false).build();
    await strikeThenBreachSavesA(game, ["va"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.state("va")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("striker").damage).toBe(0);
    expect(game.p1.xp()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Breach): the same single-target Alpha Strike puts all 6 on Victim A and kills it, +1 XP", async () => {
    const game = await board(false).build();
    await game.p1.cast("alpha", { targets: ["striker", "va"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
  });
});
