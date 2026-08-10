/**
 * Ruling 0c60b02cd1baa7fb — Flash (OGS-011 → ogs-011-024) · Reaction · 2 · "Move up to 2 friendly units to base."
 *   × Traveling Merchant (ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *
 * Q: Can Flash be cast on units already in base, and does that trigger move abilities like Traveling
 *    Merchant's?
 * A: Casting is legal ("up to 2 friendly units" — a base unit is a valid choice), but a unit already at the
 *    destination doesn't move, so "When I move" abilities do NOT trigger.
 * Rules: 446.1 (a move is a change of location on the board), 355.4 (Flash names its destination — no
 *        destination is chosen), 383 (trigger needs the event to actually occur).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const TRAVELING_MERCHANT = "ogn-185-298";

function board(merchantAt: "base" | "bf1") {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, merchantAt, TRAVELING_MERCHANT, "merchant")
    .hand(P1, FLASH, "flash")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk"); // discard fodder
}

async function passWhileOnChain(game: Game, card: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !game.chain().some((c) => c.cardId === card)) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 0c60b02cd1baa7fb — Flash on a unit already in base is legal but is not a move", () => {
  test("ruling 0c60b02cd1baa7fb — Merchant in BASE is a legal Flash target; Flash resolves, Merchant stays put, and its 'When I move' does NOT trigger (no discard, no draw)", async () => {
    const game = await board("base").build();
    const targets = (game.p1.option("cast", "flash")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(targets).toContainEqual(["merchant"]); // a base unit is offered
    const deck = game.p1.deck().length;
    await game.p1.cast("flash", { targets: "merchant" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("flash")).toBe("chain");
    await passWhileOnChain(game, "flash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("merchant")).toBe("base");
    // No move happened ⇒ nothing triggered: chain empty, straight back to the open main phase, hand/deck intact.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.p1.trash()).toEqual(["flash"]);
    expect(game.p1.deck()).toHaveLength(deck);
  });

  test("contrast — Merchant at bf1 flashed home DOES move: its trigger goes on the chain and resolves (Junk discarded, 1 card drawn)", async () => {
    const game = await board("bf1").build();
    const deck = game.p1.deck().length;
    await game.p1.cast("flash", { targets: "merchant" });
    await passWhileOnChain(game, "flash");
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    await passWhileOnChain(game, "merchant");
    // "discard 1" with a single card in hand is forced; settle takes it.
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["flash", "junk"]);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.hand()).not.toContain("junk");
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("mixed pair — Flash on [base Merchant-like unit, bf1 unit]: only the bf1 unit moves; the base Merchant still doesn't trigger", async () => {
    const game = await board("base").unit(P1, "bf1", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.cast("flash", { targets: ["merchant", "scout"] });
    await passWhileOnChain(game, "flash");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
