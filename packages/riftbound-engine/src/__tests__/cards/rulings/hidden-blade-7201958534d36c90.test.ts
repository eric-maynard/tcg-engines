/**
 * Ruling 7201958534d36c90 — Hidden Blade (OGN-213 → ogn-213-298) [Hidden][Action] · 2 + [order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Retreat (OGN-104 → ogn-104-298) [Reaction] · 1 "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: Hidden Blade is played on a unit; its controller responds with Retreat. The unit won't be killed — does its
 *    controller still draw 2?
 * A: No. Once Retreat has returned the unit to hand, Hidden Blade's target is gone; "its controller" cannot be
 *    established, so no draw happens.
 * Rules: 340 (LIFO), 359.3.f.2 (illegal/missing target at resolution → that instruction and dependent ones are skipped),
 *        124 (the card in hand is a new object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RETREAT = "ogn-104-298";

/** P1's turn with 2 + [order]. P2 holds bf1 with Mark (3); Retreat (1) in hand; known deck top d1, d2, d3. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Mark" }, "mark")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, RETREAT, "retreat")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function bladeThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "mark" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("retreat", { targets: "mark" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
  return game;
}

describe("Ruling 7201958534d36c90 — Retreat in response: Hidden Blade kills nothing and nobody draws", () => {
  test("Retreat resolves first (LIFO): Mark → P2's hand, P2 channels 1 exhausted rune; Hidden Blade still waits on the chain", async () => {
    const game = await bladeThenRetreat();
    const runesBefore = game.p2.runes().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("mark")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runesBefore + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("Hidden Blade then resolves with its target gone: no kill, and P2 (nor P1) draws NOTHING — deck top untouched", async () => {
    const game = await bladeThenRetreat();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("hand");
    expect(game.p2.hand()).toEqual(["mark"]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.trash()).toEqual(["retreat"]);
    expect(game.violations()).toEqual([]);
  });

  test("control — no Retreat: Mark is killed and its controller P2 draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "mark" });
    await game.settle();
    expect(game.zoneOf("mark")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "retreat"]);
  });
});
