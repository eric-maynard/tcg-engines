/**
 * Ruling 1e33a1a5d7eb3001 — Blue Sentinel (UNL-087 → unl-087-219) · 4 Might "[Shield 2] Your hold effects for holding
 *   here trigger an additional time. When I hold, [Add] [rainbow] at the start of your next Main Phase."
 *   × Grove of the God-Willow (OGN-280 → ogn-280-298) · Battlefield "When you hold here, draw 1."
 *
 * Q: Does Blue Sentinel's "double hold" give an additional POINT for holding?
 * A: No. Holding scores exactly one point (a player may only score once per battlefield per turn); Blue Sentinel
 *    only makes hold EFFECTS — triggered abilities such as the Grove's draw and its own [Add] — trigger twice.
 * Rules: 465 (score once per battlefield per turn), 383.4.d (hold effects), 466 (hold scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLUE_SENTINEL = "unl-087-219";
const GROVE = "ogn-280-298";

/** End of P2's turn. P1 controls the Grove with `holder` standing there → P1 holds it at the start of P1's turn. */
function aboutToHold(holder: "sentinel" | "vanilla") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 0)
    .points(P2, 0)
    .battlefield("grove", { controller: P1, def: GROVE, inert: false })
    .battlefield("bf2", { controller: null });
  return holder === "sentinel"
    ? s.unit(P1, "grove", BLUE_SENTINEL, "sentinel")
    : s.unit(P1, "grove", { might: 4, name: "Plain Holder" }, "holder");
}

/** P2 ends the turn; drain P1's Beginning Phase into P1's open main phase. Returns cards drawn beyond the rule-515 draw. */
async function holdAndSettle(holder: "sentinel" | "vanilla"): Promise<{ game: Game; extraDraws: number }> {
  const game = await aboutToHold(holder).build();
  const handBefore = game.p1.hand().length;
  await game.p2.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  return { extraDraws: game.p1.hand().length - handBefore - 1, game }; // −1: the normal Draw Phase card
}

describe("Ruling 1e33a1a5d7eb3001 — Blue Sentinel doubles hold EFFECTS, never the hold POINT", () => {
  test("control: a vanilla unit holding the Grove → 1 point and ONE Grove draw", async () => {
    const { game, extraDraws } = await holdAndSettle("vanilla");
    expect(game.p1.points()).toBe(1);
    expect(extraDraws).toBe(1);
  });

  test("Blue Sentinel holding the Grove: still exactly ONE point for the hold (465 — once per battlefield per turn)", async () => {
    const game = await aboutToHold("sentinel").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // no second point appeared while the doubled effects resolved
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual(["grove"]);
  });

  test("…while the Grove's hold effect triggers TWICE → P1 draws 2 off the Grove (plus the normal draw)", async () => {
    const game = await aboutToHold("sentinel").build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.chain().filter((c) => c.cardId === "grove" && c.triggered && c.controller === P1)).toHaveLength(2);
    await game.settle();
    expect(game.p1.hand().length - handBefore - 1).toBe(2);
    expect(game.p1.points()).toBe(1);
  });

  test("…and Blue Sentinel's own 'When I hold, [Add] [rainbow]' also fires twice → 2 rainbow at the start of the Main Phase; total points still 1", async () => {
    const { game } = await holdAndSettle("sentinel");
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
