/**
 * Ruling 33fdbbaf4c10c2d6 — Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield
 *   "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *
 * Q: When I recycle an active rune for the Sigil, can I keep the Energy I floated off it first?
 * A: Yes. Tap the rune for 1 Energy, then recycle that same (now exhausted) rune for the Sigil. Energy is not
 *    attached to the rune that produced it, so it stays in the pool — until the end of your turn, when pools
 *    empty. Tapping a rune is an [Add] Reaction that nothing can respond to.
 * Rules: 204 / 429.3 (Energy is added to a pool, not held by the rune), 317.2 (the Ending Phase empties pools),
 *        802 (rune abilities; an [Add] ability cannot be responded to).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL_OF_THE_STORM = "ogn-287-298";

/** P1's turn. P2 holds the live Sigil with a 2-Might Guard; P1 has a 6-Might Brute and two ready Fury runes. */
function board() {
  return scenario()
    .victoryScore(8)
    .battlefield("sigil", { controller: P2, def: SIGIL_OF_THE_STORM, inert: false })
    .unit(P2, "sigil", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .rune(P1, "fury", { alias: "r1" })
    .rune(P1, "fury", { alias: "r2" });
}

/** Float 1 Energy off r1, then conquer the Sigil and satisfy its recycle with that same exhausted rune. */
async function floatThenConquer(): Promise<Game> {
  const game = await board().build();
  await game.p1.tapRune("r1");
  expect(game.p1.energy()).toBe(1);
  expect(game.state("r1").isExhausted).toBe(true);
  expect(game.chain()).toEqual([]); // an [Add] ability never goes on the chain
  await game.p1.move("brute", "sigil");
  await game.settle();
  // The Sigil's conquer trigger asks WHICH rune to recycle — P1 names the one already tapped for Energy.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["r1", "r2"]);
  await game.p1.pick("r1");
  await game.settle();
  return game;
}

describe("Ruling 33fdbbaf4c10c2d6 — Energy floated off a rune survives that rune being recycled for the Sigil", () => {
  test("tapping the rune adds Energy with nothing to respond to — the chain stays empty and P1 keeps priority", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling: P1 conquers the Sigil, recycles the already-tapped rune for it, and the floated Energy is still there", async () => {
    const game = await floatThenConquer();
    expect(game.gameState.battlefields.sigil?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(1); // one rune was recycled away
    expect(game.p1.energy()).toBe(1); // …and the Energy it produced stayed in the pool
    expect(game.violations()).toEqual([]);
  });

  test("the recycle really is forced by the Sigil: without conquering there, the rune count is untouched", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    expect(game.p1.runes()).toHaveLength(2);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(2);
  });

  test("…but the floated Energy is not saved for later: the Ending Phase empties the pool", async () => {
    const game = await floatThenConquer();
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
  });
});
