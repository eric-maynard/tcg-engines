/**
 * Ruling 3bac0bae7eaf7cbb — Trinity Force (SFD-115 → sfd-115-221) · Equipment · +2 · "[Equip] [body] … When I hold, score 1 point."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment · +2 · "[Equip] [1][fury] … My hold effects are also conquer effects,
 *     and vice versa."
 *
 * Q: At 6 points, conquering my FIRST battlefield of the turn with a unit wearing Trinity Force + Skyfall — do I win (8)?
 * A: Yes. Conquer → 6→7 as a game action (allowed, you were below 7). Skyfall makes Trinity Force's hold effect a conquer
 *    effect too, so it triggers and goes on the chain (opponent may respond); on resolution 7→8 and you win. The "must
 *    conquer every battlefield to score the last point by conquering" limit applies only to the conquer action itself, not
 *    to points from triggered abilities.
 * Rules: 469.1 / 444 (conquer scores; final-point restriction on conquer scoring), 136/718.3 (Effect Text = wearer's
 *        ability), 383/340 (trigger uses the chain), 480 (reaching the victory score wins).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";

/**
 * P1's turn at `points` (victory at 8). P2 controls BOTH battlefields: bf1 with a 1-Might Weakling, bf2 with a 5-Might Far
 * unit (stays P2's — so this is P1's first and only conquer). P1: Bearer (3 + 2 + 2 = 7) in base wearing the given gear.
 */
function board(points: number, gear: readonly ("tf" | "sky")[] = ["tf", "sky"]) {
  let s = scenario()
    .points(P1, points)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
    .unit(P2, "bf2", { might: 5, name: "Far" }, "far")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: [...gear] });
  if (gear.includes("tf")) {
    s = s.card("tf", { def: TRINITY_FORCE, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" });
  }
  if (gear.includes("sky")) {
    s = s.card("sky", { def: SKYFALL, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" });
  }
  return s;
}

/** Bearer attacks bf1; both pass focus → combat: the Weakling dies and P1 conquers bf1. */
async function conquerBf1(game: Game): Promise<void> {
  await game.p1.move("bearer", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // only ONE battlefield conquered this turn
}

describe("Ruling 3bac0bae7eaf7cbb — 6 points + conquer with Trinity Force & Skyfall: 7 from the conquer, 8 (win) from the trigger", () => {
  test("premise: the Bearer wears both (3 + 2 + 2 = 7); P1 is on 6 of 8", async () => {
    const game = await board(6).build();
    expect(game.state("bearer")).toMatchObject({ might: 7 });
    expect([...game.state("bearer").attachments].sort()).toEqual(["sky", "tf"]);
    expect(game.p1.points()).toBe(6);
    expect(game.gameState.victoryScore).toBe(8);
  });

  test("1–2. the conquer point is IMMEDIATE (6 → 7, a game action) and, thanks to Skyfall, Trinity Force's 'When I hold, score 1' has triggered off the conquer and is waiting on the chain — game not over yet", async () => {
    const game = await board(6).build();
    await conquerBf1(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bearer", controller: P1, triggered: true })]);
  });

  test("3. it is a real chain item: P1 then P2 receive priority (P2 may respond) before it resolves", async () => {
    const game = await board(6).build();
    await conquerBf1(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(7); // still 7 while it waits
    expect(game.isOver()).toBe(false);
  });

  test("3–4. on resolution P1 goes 7 → 8 and WINS, having conquered only one of the two battlefields — the conquer-scoring restriction does not apply to points from a triggered ability", async () => {
    const game = await board(6).build();
    await conquerBf1(game);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without Skyfall, Trinity Force's HOLD effect does not fire on a conquer — P1 ends on 7, no chain item, game continues", async () => {
    const game = await board(6, ["tf"]).build();
    expect(game.state("bearer").might).toBe(5);
    await conquerBf1(game);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("nuance (bypassing the restriction): starting at 7, the conquer of a single battlefield scores NOTHING (7 stays 7) — yet the Trinity Force trigger still resolves for the 8th point and the win", async () => {
    const game = await board(7).build();
    await conquerBf1(game);
    expect(game.p1.points()).toBe(7); // conquer action blocked from scoring the final point (not all battlefields conquered)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bearer", triggered: true })]);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
  });
});
