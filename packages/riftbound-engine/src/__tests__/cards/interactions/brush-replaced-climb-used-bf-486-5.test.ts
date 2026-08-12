/**
 * Interaction: which battlefield is "used" for the rest of a Match when the one that was PRESENTED
 * was replaced by a token before the game ended.
 *
 *   Green Father     (unl-195-219) — legend, "When you conquer or hold, you may exhaust me to
 *                                     replace that battlefield with a Brush battlefield token."
 *   Aspirant's Climb (ogn-276-298) — battlefield, "Increase the points needed to win the game by 1."
 *   Brush            (unl-t03)     — the battlefield TOKEN Green Father makes.
 *
 * Bo3 game 1: P1 presents Aspirant's Climb (Victory Score 9), P2 presents a plain battlefield. P1
 * holds at the Climb for its 8th point, exhausts Green Father to replace it with Brush — the Victory
 * Score falls back to 8 and P1 wins on points. Question: for 486.5, which battlefield is "used" and
 * removed for the rest of the match — the presented Climb, or the Brush token that was in play when
 * the game ended? May P1 present the Climb again in game 2? Is P2's battlefield removed too? And the
 * no-side: what if nobody won game 1?
 *
 * Rules: 486.5 / 486.5.a / 486.6 (used battlefields leave a decided game's match; a drawn game
 * removes nothing), 438 (Replace — the token takes the replaced object's SLOT), 187.9 (tokens),
 * 194.3.a (Victory Score), 172, 485.3 (the mode default of 8).
 *
 * The cross-layer trap this pins down: `apps/riftbound-app/server/match.ts startNextGame` derives
 * usedBattlefields by scanning the ENGINE's end-of-game `state.battlefields` for ids shaped
 * `${pid}-bf-<defId>`, and the engine's own `startNextGame` move records `Object.keys(battlefields)`.
 * Both only stay correct because rule 438.1 has the token take over the replaced card's SLOT — same
 * id — so the ids below are deliberately spelled the way the app spells them.
 */
import { describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import type { RiftboundMoves } from "../../../game-definition/moves";
import type { HarnessEngine } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const CLIMB = "ogn-276-298";

/** The app's id shape: `${playerId}-bf-${defId}` (server/match.ts reads the defId back out of it). */
const P1_BF = `${P1}-bf-${CLIMB}`;
const P2_BF = `${P2}-bf-ogn-294-298`;

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/** P1 holds at its own Aspirant's Climb on its next turn, with Green Father ready to replace it. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield(P1_BF, { controller: P1, owner: P1, def: CLIMB, inert: false })
    .battlefield(P2_BF, { controller: P2, owner: P2 })
    .unit(P1, P1_BF, { might: 2, name: "Holder" }, "holder")
    .unit(P2, P2_BF, { might: 2, name: "Blocker" }, "blocker")
    .legend(P1, GREEN_FATHER, "father")
    .points(P1, 7)
    // the two battlefields each seat set aside at setup, available for game 2
    .card("p1SpareA", { def: { cardType: "battlefield", name: "P1 Spare A" }, owner: P1, zone: "hand" })
    .card("p1SpareB", { def: { cardType: "battlefield", name: "P1 Spare B" }, owner: P1, zone: "hand" })
    .card("p2SpareA", { def: { cardType: "battlefield", name: "P2 Spare A" }, owner: P2, zone: "hand" })
    .card("p2SpareB", { def: { cardType: "battlefield", name: "P2 Spare B" }, owner: P2, zone: "hand" });
}

/** Drive game 1 to its end: P1 holds for its 8th point, replaces the Climb with Brush, and wins. */
async function playGameOne(replace: boolean) {
  const game = await board().build();
  await game.p2.endTurn();
  // "When you conquer or hold, you may exhaust me…" — the opt-in lands at finalization.
  expect(game.decision()?.seat).toBe(P1);
  expect(game.p1.points()).toBe(8);
  expect(game.isOver()).toBe(false); // Aspirant's Climb has the Victory Score at 9
  if (replace) {
    await game.p1.yes();
  } else {
    await game.p1.no();
  }
  await game.settle();
  return game;
}

describe("Green Father's Brush replacing Aspirant's Climb × 486.5 'used battlefields'", () => {
  test("the replacement takes over the SLOT (438.1): same battlefield id, now a Brush TOKEN; the Climb card waits in banishment (438.5)", async () => {
    const game = await playGameOne(true);
    expect(Object.keys(game.gameState.battlefields)).toEqual([P1_BF, P2_BF]);
    const slot = game.state(P1_BF);
    expect(slot.name).toBe("Brush");
    expect(slot.isToken).toBe(true);
    expect(game.p1.banishment().some((id) => id.startsWith("replaced-"))).toBe(true);
    expect(game.state("father").isExhausted).toBe(true);
  });

  test("the Victory Score falls back to the mode default and P1 wins game 1 on points (194.3.a / 485.3)", async () => {
    const game = await playGameOne(true);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.gameState.victoryScore).toBe(8);
    // Control: decline the replacement and 8 points is not yet a win — the Climb still says 9.
    const declined = await playGameOne(false);
    expect(declined.isOver()).toBe(false);
    expect(declined.p1.points()).toBe(8);
  });

  test("486.5 / 486.6 — the PRESENTED battlefields are what leave the match: both seats', by their presented ids, and never a token id", async () => {
    const game = await playGameOne(true);
    expect(mv(game.engine, "startNextGame", P1).success).toBe(true);
    const used = game.gameState.match?.usedBattlefields ?? [];
    expect(used).toContain(P1_BF); // Aspirant's Climb, as presented
    expect(used).toContain(P2_BF); // P2's battlefield goes too
    expect(used).toHaveLength(2);
    // 187.9 — the Brush token was never presented and simply ceases to exist with the game; because
    // 438.1 gave it the Climb's slot it contributes no id of its own.
    expect(used.some((id) => id.startsWith("replaced-") || id.includes("t03"))).toBe(false);
    expect(game.gameState.match?.results).toEqual([{ winner: P1 }]);
    expect(game.gameState.match?.gameNumber).toBe(2);
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);
  });

  test("the app's id-shaped derivation agrees: scanning the end-of-game battlefields for `${pid}-bf-` yields ogn-276-298 for P1", async () => {
    const game = await playGameOne(true);
    // This mirrors apps/riftbound-app/server/match.ts startNextGame verbatim.
    const engineBfs = Object.keys(game.gameState.battlefields);
    const usedDefIds = (pid: string) =>
      engineBfs.filter((id) => id.startsWith(`${pid}-bf-`)).map((id) => id.slice(`${pid}-bf-`.length));
    expect(usedDefIds(P1)).toEqual([CLIMB]);
    expect(usedDefIds(P2)).toEqual(["ogn-294-298"]);
  });

  test("game 2: neither seat may present the battlefield it used — P1 must pick one of its two set-aside battlefields", async () => {
    const game = await playGameOne(true);
    expect(mv(game.engine, "startNextGame", P1).success).toBe(true);
    expect(game.gameState.status).toBe("setup");
    // MUST NOT: Aspirant's Climb leaking back into game 2 because a token stood in its slot.
    expect(mv(game.engine, "selectBattlefield", P1, { battlefieldId: P1_BF, discardIds: [] }).success).toBe(false);
    expect(mv(game.engine, "selectBattlefield", P2, { battlefieldId: P2_BF, discardIds: [] }).success).toBe(false);
    // …and neither may present the other seat's card (486.5 / 485.5).
    expect(mv(game.engine, "selectBattlefield", P1, { battlefieldId: "p2SpareA", discardIds: [] }).success).toBe(false);
    expect(mv(game.engine, "selectBattlefield", P1, { battlefieldId: "p1SpareA", discardIds: ["p1SpareB"] }).success).toBe(true);
    expect(mv(game.engine, "selectBattlefield", P2, { battlefieldId: "p2SpareB", discardIds: ["p2SpareA"] }).success).toBe(true);
    expect(Object.keys(game.gameState.battlefields)).toEqual(["p1SpareA", "p2SpareB"]);
    // 194.3.a — nothing left raises it, so game 2 runs at the mode default of 8.
    expect(game.gameState.victoryScore).toBe(8);
  });

  test("486.5.a — a game nobody won removes nothing: usedBattlefields stays empty for BOTH seats and the same battlefields may be re-presented", async () => {
    const game = await playGameOne(true);
    // `drawn` is how a no-winner result reaches the move (486.5.a).
    expect(mv(game.engine, "startNextGame", P1, { drawn: true }).success).toBe(true);
    expect(game.gameState.match?.results).toEqual([{ drawn: true }]);
    expect(game.gameState.match?.usedBattlefields).toEqual([]);
    expect(mv(game.engine, "selectBattlefield", P1, { battlefieldId: P1_BF, discardIds: [] }).success).toBe(true);
    expect(mv(game.engine, "selectBattlefield", P2, { battlefieldId: P2_BF, discardIds: [] }).success).toBe(true);
    // No loser exists, so turn order for the next game is rolled for, not chosen (the app layer must
    // skip its loser-chooses path the same way).
    expect(game.gameState.setup?.step).toBe("rollForFirst");
    expect(game.gameState.setup?.rollWinner).toBeUndefined();
  });
});
