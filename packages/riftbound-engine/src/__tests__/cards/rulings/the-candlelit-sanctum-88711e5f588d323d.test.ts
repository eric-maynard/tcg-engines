/**
 * Ruling 88711e5f588d323d — The Candlelit Sanctum (OGN-291 → ogn-291-298) · Battlefield
 *   "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them.
 *    Put those you don't back in any order."
 *
 * Q: Conquering the Sanctum while already on 7 points — does the point/draw happen before or after looking at the
 *    top two cards?
 * A: Before. The Conquer resolves completely first (including the Final-Point handling that turns the 8th point
 *    into a card draw); only then does the Sanctum's trigger go on the chain and show you the top two.
 * Rules: 466.5.d (Establishing Control conquers), 448.1.b.2 (a Final Point from a Conquer becomes a draw unless
 *        every battlefield was scored this turn), 383 (the "when you conquer" trigger fires afterwards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_CANDLELIT_SANCTUM = "ogn-291-298";
const FODDER = { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" } as const;

/** P1's turn on 7 of 8 points. P2 holds bfA (so not every battlefield is scored); the Sanctum is empty. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .points(P1, 7)
    .victoryScore(8)
    .battlefield("bfA", { controller: P2 })
    .battlefield("sanctum", { controller: null, def: THE_CANDLELIT_SANCTUM, inert: false })
    .unit(P2, "bfA", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Pilgrim" }, "pilgrim")
    .deck(P1, [FODDER, FODDER], ["top1", "top2"]);
}

/** Conquer the Sanctum and stop at the look prompt. */
async function conquer(): Promise<{ game: Game; handBefore: number }> {
  const game = await board().build();
  const handBefore = game.p1.hand().length;
  await game.p1.move("pilgrim", "sanctum");
  await game.settle();
  return { game, handBefore };
}

describe("Ruling 88711e5f588d323d — the Conquer (point or its Final-Point draw) completes before the look", () => {
  test("the Conquer itself lands: P1 controls the Sanctum", async () => {
    const { game } = await conquer();
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(game.locationOf("pilgrim")).toBe("sanctum");
  });

  test("at 7 points with bfA unscored the 8th point is refused and becomes a draw — and it has already happened", async () => {
    const { game, handBefore } = await conquer();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });

  test("only THEN is the Sanctum's look offered — and it no longer sees the card the Conquer's draw took", async () => {
    const { game } = await conquer();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    // The strongest possible read of the ordering: top1 is already IN HAND, so the look starts from top2.
    expect(game.zoneOf("top1")).toBe("hand");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toContain("top2");
    expect(offered).not.toContain("top1");
    expect(offered).toHaveLength(2);
  });

  test("answering the look does not change the score", async () => {
    const { game } = await conquer();
    await game.p1.pick("top2");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
