/**
 * Ruling 04c7536f68effc78 — (no card id in the ruling; "Darius's activated ability that generates energy") →
 *   Hand of Noxus (Darius legend, OGN-253 → ogn-253-298)
 *   "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Get the effect if you've played a card this turn.)"
 *
 * Q: Can Darius's ability be used to pay energy costs?
 * A: Yes. Once its Legion condition is met (you have played a card this turn), exhausting Darius ADDS 1 energy to your Rune
 *    Pool — it works like an extra rune. That energy sits in the pool for the rest of the turn and pays any energy cost.
 * Rules: 159–161 (Rune Pool; energy persists until the pool empties at end of turn), 417/[Add] (add resources — can't be
 *        reacted to), 819 (Legion), 429 (paying costs from the pool).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";

const recruit = (name: string, cost: number) => ({ cardType: "unit", energyCost: cost, might: 1, name });

/** P1's turn with the Darius legend READY and exactly [1]: Opener costs 1, Follow-up costs 1 (unaffordable after the Opener). */
function board() {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "darius")
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, recruit("Opener", 1), "opener")
    .hand(P1, recruit("Follow-up", 1), "followup");
}

describe("Ruling 04c7536f68effc78 — Hand of Noxus [Add]s real energy that pays costs (once Legion is on)", () => {
  test("Legion gate: before any card is played this turn the ability is NOT available", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("activate", "darius")).toBe(false);
  });

  test("after playing a card (Opener, pool now 0) the ability is live; activating exhausts Darius and ADDS [1] to the pool at once — no chain item, nothing for P2 to answer", async () => {
    const game = await board().build();
    await game.p1.play("opener");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.p1.can("play", "followup")).toBe(false); // can't afford it yet
    expect(game.p1.can("activate", "darius")).toBe(true);
    await game.p1.activate("darius");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1); // "like an extra rune"
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("that energy PAYS an energy cost: the Follow-up (cost 1) is now playable and playing it drains the pool to 0", async () => {
    const game = await board().build();
    await game.p1.play("opener");
    await game.settle();
    await game.p1.activate("darius");
    expect(game.p1.can("play", "followup")).toBe(true);
    await game.p1.play("followup");
    await game.settle();
    expect(game.zoneOf("followup")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("no need to spend it immediately: the added energy stays in the pool through other actions this turn, and only empties at end of turn", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Walker" }, "walker").battlefield("bf2", { controller: null }).build();
    await game.p1.play("opener");
    await game.settle();
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(1);
    await game.p1.move("walker", "bf2"); // do something else first
    await game.settle();
    await game.settle();
    expect(game.p1.energy()).toBe(1); // still there
    await game.p1.play("followup", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    // And had it not been spent, the pool would empty at end of turn:
    const game2 = await board().build();
    await game2.p1.play("opener");
    await game2.settle();
    await game2.p1.activate("darius");
    expect(game2.p1.energy()).toBe(1);
    await game2.advanceTurn();
    expect(game2.p1.energy()).toBe(0);
  });
});
