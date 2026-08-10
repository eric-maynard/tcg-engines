/**
 * Ruling bf8125564b53bf58 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · 2 · 2 Might
 *     "When I move, discard 1, then draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · Spell · Chaos · 1 · Reaction "Return a unit at a battlefield with 3 Might or less to
 *     its owner's hand."
 *
 * Q: If the Merchant is removed (Gusted to hand) in response to its move trigger, does the trigger still resolve — and can
 *    I discard the Merchant itself from hand to it?
 * A: Yes and yes. Triggers resolve even if their source is gone. Move → trigger on the chain → Gust it to hand in
 *    response → trigger resolves → discard the Merchant from hand, then draw 1.
 * Rules: 383 (triggered ability is an independent chain item), 359 (resolves without its source), 340 (LIFO), 446 (move
 *        is immediate — the Merchant is at the battlefield and Gust-able).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const GUST = "ogn-169-298";

/** P1's turn: Merchant ready in base, Gust + a Junk unit in hand, exactly [1]; known deck top d1. bf1 is empty and uncontrolled. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, GUST, "gust")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Move the Merchant to bf1 (trigger on the chain), then P1 Gusts its own Merchant in response and Gust resolves. */
async function moveThenGustSelf(game: Game): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.locationOf("merchant")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(offered).toContain("merchant"); // it is a ≤3-Might unit AT a battlefield
  await game.p1.cast("gust", { targets: "merchant" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Gust resolves (LIFO)
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.zoneOf("merchant")).toBe("hand");
}

describe("Ruling bf8125564b53bf58 — a Gusted Merchant's move trigger still resolves, and the Merchant can be discarded to it", () => {
  test("after Gust resolves the Merchant is in P1's hand but its trigger is STILL on the chain (source gone, item remains)", async () => {
    const game = await board().build();
    await moveThenGustSelf(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.p1.hand().sort()).toEqual(["junk", "merchant"]);
  });

  test("the trigger resolves: P1 is asked to discard 1 and the Merchant itself is a legal pick; discarding it then draws d1", async () => {
    const game = await board().build();
    await moveThenGustSelf(game);
    // Both pass → the trigger resolves and asks P1 what to discard.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "merchant" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["junk", "merchant"]);
    await game.p1.pick("merchant");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("merchant")).toBe("trash"); // discarded from hand to its own trigger
    expect(game.p1.hand().sort()).toEqual(["d1", "junk"]); // then drew 1
    // The Merchant never stayed at bf1: no showdown, bf1 still uncontrolled.
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: the trigger resolves with the Merchant still at bf1 (discard Junk, draw d1) and P1 then takes the empty bf1", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("junk");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "gust"]);
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
