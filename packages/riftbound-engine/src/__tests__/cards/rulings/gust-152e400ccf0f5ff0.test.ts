/**
 * Ruling 152e400ccf0f5ff0 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · Reaction
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Mirror Image (UNL-200 → unl-200-219) · Spell · Mind/Order · [3] + 2 power
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Reflection token (unl-t06): 0-Might unit token.
 *
 * Q: If I Gust the chosen unit in response to Mirror Image, do they still get the token, or does Mirror Image fail?
 * A: They still get it. Spells do as much as they can: LIFO — Gust bounces the unit; Mirror Image then (1) plays the
 *    ready Reflection token to base — fine; (2) "becomes a copy of that unit" — impossible (unit is in hand), skipped;
 *    (3) gives it [Temporary]. Result: a bare 0-Might Reflection with [Temporary], copying nothing.
 * Rules: 359.3.e.5/.6/.11 (skip only the impossible instructions), 187.6 (Reflection token), 816 (Temporary), LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MIRROR_IMAGE = "unl-200-219";

/**
 * P1's turn. P1's 3-Might "Model" stands at P1's bf1 (a Gust-legal unit at a battlefield). P1 holds Mirror Image
 * with [3] + a mind and an order power; P2 holds Gust with exactly [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Model" }, "model")
    .hand(P1, MIRROR_IMAGE, "mi")
    .hand(P2, GUST, "gust");
}

const tokensInP1Base = (game: Game) => game.p1.units("base").filter((id) => game.state(id).isToken);

describe("Ruling 152e400ccf0f5ff0 — Gust on Mirror Image's chosen unit: token still made, copies nothing", () => {
  test("control (no response): Mirror Image resolves fully — a READY token in P1's base that is a 3-Might 'Model' copy with [Temporary]", async () => {
    const game = await board().build();
    await game.p1.cast("mi", { targets: "model" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("mi")).toBe("trash");
    const toks = tokensInP1Base(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3, name: "Model" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.zoneOf("model")).toBe("battlefield-bf1"); // the source is untouched
  });

  test("P2 may Gust the chosen Model in response; Gust sits on top of Mirror Image and resolves first — Model goes back to P1's hand while Mirror Image is still pending", async () => {
    const game = await board().build();
    await game.p1.cast("mi", { targets: "model" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "model" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["mi", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("model")).toBe("hand");
    expect(game.p1.hand()).toContain("model");
    expect(game.chain().map((c) => c.cardId)).toEqual(["mi"]);
    expect(tokensInP1Base(game)).toEqual([]);
  });

  test("Mirror Image then still RESOLVES (no fizzle): P1 gets a ready Reflection token in base with [Temporary] — but it is a bare 0-Might 'Reflection', not a Model copy (359.3.e.6)", async () => {
    const game = await board().build();
    await game.p1.cast("mi", { targets: "model" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "model" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mi")).toBe("trash"); // resolved, not countered
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("model")).toBe("hand");
    const toks = tokensInP1Base(game);
    expect(toks).toHaveLength(1);
    const tok = toks[0] as string;
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 0, name: "Reflection" });
    expect(game.state(tok).baseMight).toBe(0);
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("and [Temporary] is real on the bare token: it dies at the start of P1's next Beginning Phase", async () => {
    const game = await board().build();
    await game.p1.cast("mi", { targets: "model" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "model" });
    await game.settle();
    const tok = tokensInP1Base(game)[0] as string;
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(tok)).toBe("base");
    await game.advanceTurn(); // → P1: Temporary kill
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(tok)).toBe("gone");
  });
});
