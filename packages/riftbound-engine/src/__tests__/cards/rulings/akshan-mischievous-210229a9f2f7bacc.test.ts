/**
 * Ruling 210229a9f2f7bacc — Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me.
 *    When you play me, if you paid the additional cost, move an enemy gear to your base.
 *    You control it until I leave the board. …"
 *   Gear used: Dazzling Aurora (OGN-160 → ogn-160-298), owned by P2.
 *
 * Q: I play Akshan to steal an Aurora; the opponent plays their own Akshan to steal it back. What happens
 *    when that second Akshan dies?
 * A: You get the Aurora back. Control-change effects are layered by timestamp: theirs was newer, so it won
 *    while it lasted. When their Akshan leaves the board that effect stops applying, the game recalculates,
 *    and the next-most-recent effect — yours — takes over again. Only when YOUR Akshan also leaves does the
 *    Aurora revert to its owner.
 * Rules: 613 (continuous effects apply in timestamp order), 190.2 (control is recalculated when an effect
 *        stops applying), 136.1 (an object with no control effect is controlled by its owner).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const AURORA = "ogn-160-298";

/** P1's turn. P2 owns the Aurora; both players hold an Akshan and exactly [4][body][body] to pay for it. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .resources(P2, { energy: 4, power: { body: 2 } })
    .gear(P2, AURORA, "aurora")
    .hand(P1, AKSHAN, "akshanP1")
    .hand(P2, AKSHAN, "akshanP2");
}

/** P1 steals the Aurora, then (on P2's turn) P2 steals it back. */
async function stolenTwice(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshanP1", { payOptional: true, to: "base" });
  await game.settle();
  expect(game.state("aurora").controller).toBe(P1);

  await game.advanceToTurnOf(P2);
  // pools empty at end of turn (317.2) — re-stock P2 for their own Akshan
  await game.p2.do("addResources", { energy: 4, power: { body: 2 }, playerId: P2 });
  await game.p2.play("akshanP2", { payOptional: true, to: "base" });
  await game.settle();
  expect(game.state("aurora").controller).toBe(P2);
  return game;
}

describe("Ruling 210229a9f2f7bacc — control reverts to the older Akshan's effect when the newer Akshan dies", () => {
  test("step 1: P1's Akshan (additional cost paid) takes the Aurora from P2", async () => {
    const game = await board().build();
    expect(game.state("aurora")).toMatchObject({ controller: P2, owner: P2 });
    await game.p1.play("akshanP1", { payOptional: true, to: "base" });
    await game.settle();
    expect(game.state("aurora")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.p1.gear()).toContain("aurora");
  });

  test("step 2: P2's own Akshan steals it back — the newer control effect wins", async () => {
    const game = await stolenTwice();
    expect(game.state("aurora")).toMatchObject({ controller: P2, owner: P2 });
  });

  test("ruling: when P2's Akshan dies, the Aurora goes back to P1 — P1's older effect applies again", async () => {
    const game = await stolenTwice();
    await game.p2.do("killUnit", { cardId: "akshanP2" });
    await game.settle();
    expect(game.zoneOf("akshanP2")).toBe("trash");
    expect(game.state("aurora").controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: only when P1's Akshan ALSO leaves does the Aurora revert to its owner P2", async () => {
    const game = await stolenTwice();
    await game.p2.do("killUnit", { cardId: "akshanP2" });
    await game.settle();
    await game.p1.do("killUnit", { cardId: "akshanP1" });
    await game.settle();
    expect(game.state("aurora")).toMatchObject({ controller: P2, owner: P2 });
  });
});
