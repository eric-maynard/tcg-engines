/**
 * Ruling 321d3f7bb1a7d789 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · [2][order] · "Each player kills one of their units."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   (The scrape also lists Cull, sfd-134-221 — an unrelated Equipment sharing the name; not part of the question.)
 *
 * Q: Can you play Cull the Weak while controlling no unit? Can Traveling Merchant move with 0 cards in hand and still draw?
 * A: Yes to both. Cull the Weak needs no friendly unit to be played (each player just kills one of theirs if they have
 *    one). The Merchant's discard cannot be performed with an empty hand, but that does not stop the draw.
 * Rules: 359.3.e.11 (an instruction that cannot be followed is skipped; do the rest), 355.13 / "each player" effects
 *        need no target to be played, 359.3.e (players make their own choice for "their" units).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const SKULKER = "ogn-175-298";

describe("Ruling 321d3f7bb1a7d789 — Cull the Weak with no friendly unit; Traveling Merchant draws on an empty hand", () => {
  test("Cull the Weak is a legal play for a P1 who controls NO unit: it costs [2][order], goes on the chain, and on resolution P2 — who has two units — CHOOSES which of theirs dies; P1 loses nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 3, name: "Big" }, "big")
      .unit(P2, "base", { might: 1, name: "Small" }, "small")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    // "Each player kills one of THEIR units": the choice among P2's units is P2's decision.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect((d as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["big", "small"]);
    await game.p2.pick("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Cull the Weak with NEITHER player controlling a unit is still playable and simply resolves doing nothing", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull").build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Traveling Merchant moved with 0 cards in hand: the move trigger still resolves — nothing to discard, then P1 draws 1 (the known deck top)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
      .deck(P1, [SKULKER, SKULKER], ["top", "next"])
      .build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    await game.settle();
    await game.settle();
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.p1.hand()).toEqual(["top"]); // drew despite the impossible discard
    expect(game.p1.trash()).toEqual([]); // nothing was discarded
    expect(game.p1.deck()[0]).toBe("next");
    expect(game.violations()).toEqual([]);
  });

  test("control: with a card in hand the Merchant discards it first, then draws (hand size unchanged, the old card in the trash)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
      .hand(P1, SKULKER, "held")
      .deck(P1, [SKULKER, SKULKER], ["top", "next"])
      .script(P1, ["held"])
      .build();
    await game.p1.move("merchant", "bf1");
    await game.settle();
    await game.settle();
    expect(game.zoneOf("held")).toBe("trash");
    expect(game.p1.hand()).toEqual(["top"]);
  });
});
