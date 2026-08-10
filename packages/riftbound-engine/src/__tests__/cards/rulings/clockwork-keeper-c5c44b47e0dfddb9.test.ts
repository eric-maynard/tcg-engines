/**
 * Ruling c5c44b47e0dfddb9 — Clockwork Keeper (OGN-044 → ogn-044-298) · Unit · Calm · [2] · 2 Might
 *   "You may pay [calm] as an additional cost to play me. When you play me, if you paid the additional cost, draw 1."
 *
 * Q: Can you deny the opponent every reaction window on your turn by only playing permanents without
 *    "when played" triggers and never starting a showdown?
 * A: Yes. Playing trigger-less permanents and moving only to your base / battlefields you already control opens
 *    no chain and no showdown, so the opponent never receives priority. A permanent whose "When you play me…"
 *    trigger goes on the chain DOES open a window. [The ruling's aside that the Keeper's draw is an "as you play"
 *    passive predates the current printed text, which is a "When you play me, if…" trigger — tested as printed:
 *    unpaid ⇒ the intervening-if keeps it off the chain (no window); paid ⇒ a triggered item ⇒ a window.]
 * Rules: 338 (permanents resolve immediately; only triggered abilities create chain items), 340/141 (Standard
 *        Move to a location you control opens nothing), 383.2.a.1 (intervening "if"), 329–331 (priority on a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLOCKWORK_KEEPER = "ogn-044-298";
const VANILLA = { cardType: "unit", energyCost: 2, might: 3, name: "Vanilla Recruit" } as const;
const TRINKET = { cardType: "gear", energyCost: 1, name: "Plain Trinket" } as const;
/** P2's would-be answer: a 1-cost [Reaction] "Deal 1 to a unit". */
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

/** P1's turn. P1 holds bf1 (Holder) and has a Walker in base; P2 holds bf2 and sits on [Reaction] Zap with energy to spare. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 9, power: { calm: 2 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, VANILLA, "vanilla")
    .hand(P1, TRINKET, "trinket")
    .hand(P1, CLOCKWORK_KEEPER, "ck")
    .hand(P2, ZAP, "zap");
}

/** "No window": straight back to P1's open main phase, empty chain, and P2 has no legal action at all. */
function expectNoWindow(game: Game): void {
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.p2.legal()).toEqual([]);
  expect(game.p2.can("cast", "zap")).toBe(false);
}

describe("Ruling c5c44b47e0dfddb9 — trigger-less permanents and uncontested moves give the opponent no reaction window", () => {
  test("a vanilla unit, a plain gear, and a Standard Move to a battlefield P1 already controls: after each, no chain, no showdown, P2 never gets priority", async () => {
    const game = await board().build();
    await game.p1.play("vanilla", { to: "base" });
    expect(game.zoneOf("vanilla")).toBe("base");
    expectNoWindow(game);
    await game.p1.play("trinket");
    expect(game.zoneOf("trinket")).toBe("base");
    expectNoWindow(game);
    await game.p1.move("walker", "bf1");
    expect(game.locationOf("walker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expectNoWindow(game);
    expect(game.violations()).toEqual([]);
  });

  test("Clockwork Keeper WITHOUT the optional [calm]: its 'When you play me, if you paid…' fails the intervening-if, nothing goes on the chain — again no window (and no draw)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("ck", { payOptional: false, to: "base" });
    expect(game.zoneOf("ck")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 2 } });
    expectNoWindow(game);
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
  });

  test("contrast — Clockwork Keeper WITH the [calm] paid: the 'When you play me' trigger becomes a chain item, so once P1 passes P2 DOES get priority and may react (Zap the Keeper) before the draw resolves", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("ck", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ck", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "zap")).toBe(true);
    await game.p2.cast("zap", { targets: "ck" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ck", "zap"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ck")).toMatchObject({ damage: 1, zone: "base" });
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // Keeper left, then drew 1
    expect(game.violations()).toEqual([]);
  });
});
