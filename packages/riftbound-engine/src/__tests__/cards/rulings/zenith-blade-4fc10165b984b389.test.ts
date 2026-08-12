/**
 * Ruling 4fc10165b984b389 — Zenith Blade (OGN-262 → ogn-262-298) · [Action] · [3][rainbow][rainbow]
 *   "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *
 * Q: I use Zenith Blade defensively when my opponent attacks, and neither unit dies in the combat. Do I
 *    score the battlefield?
 * A: It depends what you already had. If they moved onto an EMPTY battlefield and you drop a unit in with
 *    Zenith Blade, the stunned attacker deals no damage, wins nothing and is recalled — you are left there
 *    alone, so you conquer it and score. If you ALREADY controlled the battlefield they attacked, you
 *    successfully defended it but gained no control, so there is no conquer and no point.
 * Rules: 466 (a stunned unit deals no combat damage; an attacker who wins nothing is recalled), 467 / 190.4
 *        (Conquer = gaining control of a battlefield you did not control), 423.1.b (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";

/** P2's turn: their Raider (3) marches on bf1; P1 holds Zenith Blade with exactly [3] + 2 rainbow. The defenders are deliberately too small to kill it — the stun is what decides the fight. */
function board(bf1Controller: typeof P1 | null) {
  const s = scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: bf1Controller })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 1, name: "Backup" }, "backup")
    .hand(P1, ZENITH_BLADE, "zb");
  return bf1Controller === P1 ? s.unit(P1, "bf1", { might: 1, name: "Holder" }, "holder") : s;
}

/** P2 marches on bf1; P1 takes focus and answers with Zenith Blade (stun the Raider, move Backup in). */
async function defendWithZenithBlade(bf1Controller: typeof P1 | null): Promise<Game> {
  const game = await board(bf1Controller).build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("zb", { targets: ["raider", "backup"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1"); // "that enemy unit's battlefield" — the only destination
  }
  expect(game.state("raider").isStunned).toBe(true);
  expect(game.locationOf("backup")).toBe("bf1");
  await game.settle();
  return game;
}

describe("Ruling 4fc10165b984b389 — Zenith Blade on defence scores only when you did not already hold the place", () => {
  test("ruling 4fc10165b984b389 (case 1) — they marched onto an EMPTY battlefield: the stunned attacker deals nothing, is recalled, and P1's Backup is left holding it — a conquer worth a point", async () => {
    const game = await defendWithZenithBlade(null);
    expect(game.state("raider")).toMatchObject({ isStunned: true, location: "base" }); // won nothing ⇒ recalled
    expect(game.state("backup")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("ruling 4fc10165b984b389 (case 2) — P1 ALREADY controlled the battlefield: the same defence works, but there is nothing to conquer, so no point", async () => {
    const game = await defendWithZenithBlade(P1);
    expect(game.state("raider")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.locationOf("backup")).toBe("bf1");
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("neither unit dies in either line — the stun, not damage, is what wins it", async () => {
    const empty = await defendWithZenithBlade(null);
    expect(empty.zoneOf("raider")).toBe("base");
    expect(empty.zoneOf("backup")).toBe("battlefield-bf1");
    const held = await defendWithZenithBlade(P1);
    expect(held.zoneOf("raider")).toBe("base");
    expect(held.zoneOf("backup")).toBe("battlefield-bf1");
    expect(held.zoneOf("holder")).toBe("battlefield-bf1");
  });

  test("without Zenith Blade the empty battlefield is simply theirs: P2 conquers and scores", async () => {
    const game = await board(null).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });
});
