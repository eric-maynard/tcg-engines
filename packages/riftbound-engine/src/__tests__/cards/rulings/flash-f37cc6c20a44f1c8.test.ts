/**
 * Ruling f37cc6c20a44f1c8 — Flash (OGS-011 → ogs-011-024) · [Reaction] · 2 · "Move up to 2 friendly units to base."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   (× Portal Rescue / The Syren / Unforgiven cited only for their "its base" templating.)
 *
 * Q: In 2v2, can Flash target a TEAMMATE's unit, and where does it go?
 * A: Yes — a teammate's unit is friendly. "To base" means each moved unit's OWN controller's base: your unit to your base,
 *    the teammate's unit to THEIR base (never the caster's). It is a real move, so "when I move" abilities such as
 *    Traveling Merchant's trigger.
 * Rules: 489.8.e / 740.1.a (teammate objects are friendly), 141 (a unit's base = its controller's), 449 (move to base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const FLASH = "ogs-011-024";
const TRAVELING_MERCHANT = "ogn-185-298";

/**
 * 2v2 (P1+P3 vs P2+P4), P1's turn with exactly Flash's [2]. P1's Own (2) at bf1 (P1's); teammate P3's Traveling Merchant at
 * bf2 (P3's) with one card in hand to discard and a known deck top; opponent P2's Foe in P2's base. The builder has no team
 * knob, so the 489.2 team map is seeded onto the built state (setup only).
 */
async function teamBoard(): Promise<Game> {
  const game = await scenario({ players: 4 })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P3 })
    .unit(P1, "bf1", { might: 2, name: "Own" }, "own")
    .unit(P3, "bf2", TRAVELING_MERCHANT, "merchant")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P3, { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" }, "fodder")
    .deck(P3, ["ogn-175-298"], ["p3top"])
    .hand(P1, FLASH, "flash")
    .build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

/** The distinct unit ids Flash may name (its "up to 2" field lists subsets). */
const offered = (game: Game) => [
  ...new Set((game.p1.option("cast", "flash")?.fields.find((f) => f.name === "targets")?.options ?? []).flatMap((o) => (Array.isArray(o) ? o : [o]) as string[])),
];

/** Pass priority round the table until `card` (default: everything) has left the chain (answers nothing else). */
async function passAll(game: Game, card?: string): Promise<void> {
  for (let i = 0; i < 16 && (card ? game.chain().some((c) => c.cardId === card) : game.chain().length > 0); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling f37cc6c20a44f1c8 — Flash on a teammate's unit (2v2): legal, and each unit goes to ITS controller's base", () => {
  test("teammate P3's Merchant is offered as a friendly target alongside P1's Own; the opponent's Foe is not (489.8.e)", async () => {
    const game = await teamBoard();
    expect(offered(game).sort()).toEqual(["merchant", "own"]);
    expect(offered(game)).not.toContain("foe");
    expect((await game.p1.try((p) => p.cast("flash", { targets: ["own", "merchant"] }))).ok).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["own", "merchant"] })]);
  });

  test("Flash resolves: Own → P1's base, the Merchant → P3's base (NOT the caster's) — still owned and controlled by P3", async () => {
    const game = await teamBoard();
    await game.p1.cast("flash", { targets: ["own", "merchant"] });
    await passAll(game); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("own")).toMatchObject({ controller: P1, location: "base", owner: P1 });
    expect(game.p1.base()).toContain("own");
    expect(game.state("merchant")).toMatchObject({ controller: P3, location: "base", owner: P3 });
    expect(game.seat(P3).base()).toContain("merchant");
    expect(game.p1.base()).not.toContain("merchant");
  });

  test("it is a real move: Traveling Merchant's 'When I move' triggers for P3 (its controller) — P3 discards 1 then draws 1", async () => {
    const game = await teamBoard();
    await game.p1.cast("flash", { targets: ["own", "merchant"] });
    await passAll(game, "flash"); // Flash resolves → Merchant trigger goes on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P3, triggered: true })]);
    await passAll(game); // the trigger resolves → P3 picks the discard
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P3, source: { cardId: "merchant" } });
    await game.seat(P3).pick("fodder");
    await game.settle();
    expect(game.seat(P3).trash()).toContain("fodder");
    expect(game.seat(P3).hand()).toEqual(["p3top"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Flashing ONLY the teammate's unit is legal too, and it alone goes home to P3's base", async () => {
    const game = await teamBoard();
    await game.p1.cast("flash", { targets: ["merchant"] });
    await passAll(game);
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.seat(P3).base()).toContain("merchant");
    expect(game.locationOf("own")).toBe("bf1");
  });
});
