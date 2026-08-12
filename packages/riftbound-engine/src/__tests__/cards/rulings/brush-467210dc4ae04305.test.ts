/**
 * Ruling 467210dc4ae04305 — Brush (UNL-T03 → unl-t03) · Battlefield token
 *   "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
 *    When you score here, you may replace this with the battlefield it replaced."
 *   × Green Father (UNL-195 → unl-195-219, Ivern legend) — the card that makes a Brush in the first place.
 *
 * Q: If I conquer my opponent's Brush, can I keep it a Brush?
 * A: Yes. Conquering makes you its controller, and "you" in "when YOU score here, you may replace this"
 *    is the battlefield's controller — so the choice is now yours and you may simply decline. Nothing
 *    makes a Brush token revert on its own; it stays until its controller swaps it back on a score.
 * Rules: 187.6.c ("you" on a battlefield = its controller), 438 (Replace), 467 (Conquer = gain control),
 *        186 (a token stays until an effect removes it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const STALWART_PORO = "ogn-052-298"; // 2-Might Poro — reads the Brush's +1, so the aura is visible

/**
 * P2 owns the Brush: on P2's turn their Ivern legend turns bf1 into a Brush by conquering it, and their
 * Poro garrisons it. Then it is P1's turn and P1's Champion (5) comes to take it.
 */
async function p2OwnsABrush(): Promise<{ game: Game; slot: string }> {
  const game = await scenario()
    .active(P2)
    .legend(P2, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", STALWART_PORO, "poro")
    .unit(P1, "bf1", { might: 1, name: "Speedbump" }, "bump")
    .unit(P1, "base", { might: 5, name: "Champion" }, "champ")
    .build();
  await game.p2.move("poro", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "gf" } });
  await game.p2.yes(); // replace bf1 with a Brush
  await game.settle();
  const slot = game.locationOf("poro") as string;
  expect(game.state(slot).name).toBe("Brush");
  expect(game.gameState.battlefields[slot]?.controller).toBe(P2);
  return { game, slot };
}

describe("Ruling 467210dc4ae04305 — conquering a Brush lets the new controller keep it a Brush", () => {
  test("premise: P2 controls a Brush token battlefield with their Poro on it (2 + 1 from the Brush)", async () => {
    const { game, slot } = await p2OwnsABrush();
    expect(game.state("poro").might).toBe(3);
    expect(game.battlefields()).toEqual([slot]);
  });

  test("ruling 467210dc4ae04305 — P1's Champion conquers the Brush: P1 becomes its controller, and the swap-back offer is now P1's decision", async () => {
    const { game, slot } = await p2OwnsABrush();
    await game.advanceTurn(); // → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.move("champ", slot);
    const r = await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe(slot);
  });

  test("…and P1 may simply say no: the Brush token stays in play, under P1's control, with the printed battlefield still in banishment", async () => {
    const { game, slot } = await p2OwnsABrush();
    await game.advanceTurn();
    await game.p1.move("champ", slot);
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.battlefields()).toEqual([slot]);
    expect(game.state(slot).name).toBe("Brush");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.cardsAt("banishment").map((c) => game.state(c).name)).toEqual(["bf1"]);
    expect(game.violations()).toEqual([]);
  });

  test("the Brush does not revert on its own — it is still a Brush under P1's control a full turn cycle later", async () => {
    const { game, slot } = await p2OwnsABrush();
    await game.advanceTurn();
    await game.p1.move("champ", slot);
    await game.settle();
    await game.p1.no();
    await game.settle();
    await game.advanceTurn(); // P2
    await game.settle();
    expect(game.state(slot).name).toBe("Brush");
    expect(game.battlefields()).toEqual([slot]);
  });

  test("the other half of the choice is real too: saying YES swaps the Brush back for the battlefield it replaced", async () => {
    const { game, slot } = await p2OwnsABrush();
    await game.advanceTurn();
    await game.p1.move("champ", slot);
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const now = game.locationOf("champ") as string;
    expect(game.state(now).name).toBe("bf1");
    expect(game.cardsAt("banishment").map((c) => game.state(c).name)).not.toContain("bf1");
  });
});
