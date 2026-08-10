/**
 * Ruling 8a3321b57c045373 — Lotus Trap (UNL-013 → unl-013-219) · [Hidden] Reaction [2] "Choose a unit. Double all damage that
 *     would be dealt to it this turn."
 *   × Ki Barrier (VEN-126 → ven-126-166) · Reaction [2][order] "Choose a unit. Prevent the next 7 damage that would be dealt to
 *     it this turn."   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the damage source.)
 *
 * Q: Player B Lotus Traps Player A's unit; Player A answers with Ki Barrier. Who orders the two replacement effects?
 * A: Player A — the OWNER of the unit being damaged chooses the order in which replacement effects applying to the same
 *    event are applied (rule 372), and the order matters: Ki Barrier first ⇒ prevent everything, then double 0 = 0;
 *    Lotus Trap first ⇒ double, then prevent 7 ⇒ the excess gets through.
 * Rules: 369–372 (replacement effects; multiple on one event ⇒ owner of the affected object orders them).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const KI_BARRIER = "ven-126-166";
const VOID_SEEKER = "ogn-024-298";

/** P2's (Player B's) turn. P1's (Player A's) 6-Might Target holds bf1. P2: Lotus Trap + Void Seeker, [5]+fury. P1: Ki Barrier, [2]+order. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 1 } })
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Target" }, "target")
    .hand(P2, LOTUS_TRAP, "lotus")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P1, KI_BARRIER, "ki");
}

/** B casts Lotus Trap on A's Target; A reacts with Ki Barrier; both resolve. Then B Void Seekers the Target (4) and both pass → the ordering prompt. */
async function upToOrdering(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("lotus", { targets: "target" });
  await game.p2.passPriority();
  await game.p1.cast("ki", { targets: "target" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["lotus", "ki"]);
  await game.settle();
  expect(game.zoneOf("lotus")).toBe("trash");
  expect(game.zoneOf("ki")).toBe("trash");
  expect(game.state("target").damage).toBe(0);
  await game.p2.cast("seeker", { targets: "target" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 8a3321b57c045373 — Lotus Trap × Ki Barrier: the damaged unit's OWNER orders the replacements", () => {
  test("when the 4 damage would be dealt, the engine asks PLAYER A (P1, the unit's owner) — not the caster — to order the two replacement effects", async () => {
    const game = await upToOrdering();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    expect(game.actingSeat()).toBe(P1);
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.key).toSorted()).toEqual(["double", "prevent-shield"]);
    }
    expect(game.state("target").damage).toBe(0); // nothing dealt until A decides
  });

  test("A orders Ki Barrier FIRST: 4 prevented → 0, doubling 0 is still 0 — Target takes no damage", async () => {
    const game = await upToOrdering();
    await game.p1.answer({ keys: ["prevent-shield", "double"], kind: "pick" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("A orders Lotus Trap FIRST: 4 doubled → 8, Ki Barrier prevents 7 → 1 damage gets through", async () => {
    const game = await upToOrdering();
    await game.p1.answer({ keys: ["double", "prevent-shield"], kind: "pick" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
