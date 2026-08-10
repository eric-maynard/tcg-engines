/**
 * Ruling 618f4a8d1f229e0e — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I Hidden-Blade my OWN unit (to draw 2), but the opponent Gusts it back to my hand in response — do I still draw?
 * A: No. When Hidden Blade resolves the unit is in hand: not on the board, not at a battlefield, so it is no longer a
 *    legal target and Hidden Blade cannot ascertain "its controller" — no kill, no draw.
 * Rules: 359.3.f.2 (target legality re-checked on resolution), 359.3.e.12 (object gone → null characteristics), LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const GUST = "ogn-169-298";

/** P1's turn. P1's Pawn (2) at P1's bf1; P1: Hidden Blade + exactly [2]+order, 3 known cards on top of deck. P2: Gust + exactly [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 4, name: "Onlooker" }, "onlooker")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, GUST, "gust");
}

async function bladeThenGust(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "pawn" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "pawn" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "gust"]);
}

describe("Ruling 618f4a8d1f229e0e — Gusting the Hidden Blade target to hand denies the draw", () => {
  test("Gust resolves first (LIFO): the Pawn is in P1's hand while Hidden Blade is still on the chain", async () => {
    const game = await board().build();
    await bladeThenGust(game);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "gust"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("Hidden Blade then resolves against a unit that is no longer on the board: nothing is killed and P1 does NOT draw 2", async () => {
    const game = await board().build();
    await bladeThenGust(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("hand"); // not killed — it stays in hand
    expect(game.p1.trash()).not.toContain("pawn");
    expect(game.p1.hand().sort()).toEqual(["pawn"]); // no d1/d2 drawn
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.hand()).toEqual([]); // nobody else draws either
    expect(game.violations()).toEqual([]);
  });

  test("control: without Gust, Hidden Blade kills P1's own Pawn and P1 (its controller) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });
});
