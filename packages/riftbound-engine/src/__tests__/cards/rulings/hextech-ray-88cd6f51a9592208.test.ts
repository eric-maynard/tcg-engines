/**
 * Ruling 88cd6f51a9592208 — Hextech Ray (OGN-009 → ogn-009-298) · Action [1][fury] "Deal 3 to a unit at a battlefield."
 *   × Punch First (SFD-097 → sfd-097-221) · Action [1][body][body] "Give a unit +5 [Might] this turn."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction [1] "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: In a combat showdown my 4-Might unit takes Hextech Ray (3 damage). Focus passes to me; I cast Punch First on it; they
 *    react with Stupefy (-1 → 3 Might with 3 damage). Does my unit die before Punch First can give it +5?
 * A: Yes. Stupefy resolves first (LIFO); a Cleanup happens after EVERY chain item, and 3 damage ≥ 3 Might kills the unit
 *    right there. Punch First then finds its target gone and does nothing.
 * Rules: 340 (LIFO), 322–323 (Cleanup after each item leaves the chain), 428 (damage ≥ Might ⇒ dies), 359.3.f.2 (illegal
 *        target ⇒ instruction not executed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const PUNCH_FIRST = "sfd-097-221";
const STUPEFY = "ogn-095-298";

/** P2's turn. P1's 4-Might Brawler holds bf1; P2's 3-Might Raider attacks from base. P2: Ray + Stupefy, [2]+fury. P1: Punch First, [1]+body×2. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1, power: { body: 2 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Brawler" }, "brawler")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P1, PUNCH_FIRST, "punch");
}

/** Raider attacks bf1; P2 (Focus) Rays the Brawler for 3 and it resolves; P2 passes Focus; P1 casts Punch First; P2 reacts with Stupefy. */
async function upToStupefy(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("ray", { targets: "brawler" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.state("brawler")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" }); // survives: 3 < 4
  // Focus passes to P1 once P2's spell has resolved.
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("punch", { targets: "brawler" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["punch"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "stupefy")).toBe(true);
  await game.p2.cast("stupefy", { targets: "brawler" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["punch", "stupefy"]);
  return game;
}

describe("Ruling 88cd6f51a9592208 — Stupefy resolves before Punch First and the Cleanup in between kills the damaged unit", () => {
  test("steps 1–3: Ray marks 3 on the 4-Might Brawler (alive); Punch First goes on the chain; Stupefy goes on top of it", async () => {
    await upToStupefy();
  });

  test("steps 4–6: Stupefy resolves FIRST (−1 → 3 Might with 3 damage, P2 draws 1) and the Cleanup right after it kills the Brawler while Punch First is still waiting on the chain", async () => {
    const game = await upToStupefy();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["punch"]);
    expect(game.zoneOf("brawler")).toBe("trash"); // died in the Cleanup between the two resolutions
  });

  test("step 7: Punch First then resolves with its target gone — no +5, nothing saved; both spells in the trash, Brawler dead, Raider unharmed at bf1", async () => {
    const game = await upToStupefy();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("punch")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // Punch First was paid for regardless
    expect(game.violations()).toEqual([]);
  });
});
