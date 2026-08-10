/**
 * Ruling 8fb36d6c8c488ea1 — Arachnoid Horror (UNL-117 → unl-117-219) · Unit · Body · 6+[body] · 6 Might
 *     "[Hunt 2] I can be played to an occupied battlefield if an enemy unit is alone there. Friendly units can be …"
 *   × Wuju Master (Yi legend, UNL-191 → unl-191-219) "[Level 6] Your units have +1 [Might]. [Level 11] Your units enter ready."
 *
 * Q: With Wuju Master already at Level 11, does an Arachnoid Horror played DIRECTLY to a battlefield enter ready?
 * A: Yes. "Your units enter ready" is a continuous (passive) effect that is already active, so it modifies how the unit
 *    enters — wherever it is played — and the Horror arrives ready (and, at Level 6+, with +1 Might).
 * Rules: 824 ([Level N] gates read XP continuously), 522 (passive abilities apply as the permanent enters), 359.2.c (units
 *        normally enter exhausted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ARACHNOID_HORROR = "unl-117-219";
const WUJU_MASTER = "unl-191-219";

/** P1 (Wuju Master at `xp`) with exactly 6+[body]; P1 controls bf1 (Holder there); P2's lone Sentinel (3) holds bf2. */
function board(xp: number) {
  return scenario()
    .legend(P1, WUJU_MASTER, "yi")
    .xp(P1, xp)
    .resources(P1, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Sentinel" }, "sentinel")
    .hand(P1, ARACHNOID_HORROR, "horror");
}

describe("Ruling 8fb36d6c8c488ea1 — at Level 11 an Arachnoid Horror played straight to a battlefield enters READY", () => {
  test("Level 11 (11 XP): played directly to my battlefield bf1 → on the board ready, 7 Might (6 + Level-6 bonus); nothing was put on the chain for the legend", async () => {
    const game = await board(11).build();
    expect(game.state("holder").might).toBe(2); // Level 6 passive already live
    const to = game.p1.option("playUnit", "horror")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-bf1");
    await game.p1.play("horror", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("horror")).toBe("battlefield-bf1");
    expect(game.state("horror")).toMatchObject({ baseMight: 6, isExhausted: false, isReady: true, might: 7 });
    expect(game.chain().some((c) => c.cardId === "yi")).toBe(false);
    await game.settle();
    expect(game.state("horror").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Level 11: played directly to the ENEMY battlefield bf2 via its own text (a lone enemy unit there) → it also arrives ready (7 Might) and a combat showdown opens with P1 attacking", async () => {
    const game = await board(11).build();
    const to = game.p1.option("playUnit", "horror")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-bf2");
    await game.p1.play("horror", { to: "bf2" });
    expect(game.zoneOf("horror")).toBe("battlefield-bf2");
    expect(game.state("horror")).toMatchObject({ isReady: true });
    expect(game.state("horror").might).toBeGreaterThanOrEqual(7);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("contrast — Level 6 only (6 XP): the same play to bf1 enters EXHAUSTED (still 7 Might from the Level-6 bonus)", async () => {
    const game = await board(6).build();
    await game.p1.play("horror", { to: "bf1" });
    expect(game.zoneOf("horror")).toBe("battlefield-bf1");
    expect(game.state("horror")).toMatchObject({ isExhausted: true, might: 7 });
  });

  test("contrast — 0 XP: enters exhausted at its printed 6", async () => {
    const game = await board(0).build();
    await game.p1.play("horror", { to: "bf1" });
    expect(game.state("horror")).toMatchObject({ isExhausted: true, might: 6 });
  });
});
