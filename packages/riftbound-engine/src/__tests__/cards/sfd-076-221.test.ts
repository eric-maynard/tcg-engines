/**
 * Production Surge — sfd-076-221 · Spell · Mind · 4 energy + [mind] · (no [Action]/[Reaction])
 *
 *   This costs [2] less if you control a Mech.
 *   Play a 3 [Might] Mech unit token to your base.
 *   Draw 1.
 *
 * Rules: 356.4 (discounts are applied while determining Total Cost — the condition is read as
 * the spell is played, "control" = a permanent you control on the board); 356.1 (only the energy
 * component is discounted; the [mind] pip still applies); 155 / 159.2.a.1 (no timing keyword →
 * standard timing: your turn, Open state, empty chain); 143.4 (unit tokens enter exhausted);
 * 187 (tokens: the Mech token is a 3-Might unit with the Mech tag); the two instructions resolve
 * in order as ONE chain item, then the spell goes to trash.
 *
 * Head-judge corner cases considered:
 *   - the discount is conditional on a Mech YOU control: an enemy Mech, or a Mech in hand, must
 *     not discount; a Mech TOKEN made by an earlier Surge does (so Surge #2 costs 2);
 *   - the discount only touches energy — 2 energy but no [mind] is still unaffordable;
 *   - both instructions must happen from one resolution: token AND draw (parser emitted two
 *     separate `spell` abilities — risk that only the first runs);
 *   - the token always lands in base even when you control a battlefield (no destination prompt);
 *   - standard timing: not castable on the opponent's turn or with something on the chain;
 *   - partner statics: Rumble, Scrapper ("Your Mechs have +1 Might") sees the token as a Mech.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-076-221";
const BUBBLE_BOT = "sfd-062-221"; // 3-might unit, Mech tag
const RUMBLE_SCRAPPER = "sfd-089-221"; // "Your Mechs have +1 Might (including me)."
const mechTokens = (ids: string[]) => ids.filter((c) => c.startsWith("token-mech-"));

function board(energy = 4, mind = 1) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .battlefield("bf1", { controller: P1 })
    .hand(P1, CARD, "surge");
}

describe("Production Surge (sfd-076-221)", () => {
  test("full cost without a Mech: 4 energy + 1 mind deducted, spell goes on the chain; 3 energy or no mind → not castable", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "surge")).toBe(true);
    await game.p1.cast("surge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("surge")).toBe("chain");
    expect((await board(3, 1).build()).p1.can("cast", "surge")).toBe(false);
    expect((await board(4, 0).build()).p1.can("cast", "surge")).toBe(false);
    expect((await board(4, 0).resources(P1, { power: { fury: 1 } }).build()).p1.can("cast", "surge")).toBe(false);
  });

  test("resolves into ONE 3-Might Mech unit token in your base, exhausted (143.4), and the spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("surge");
    expect(mechTokens(game.p1.base())).toHaveLength(0); // nothing before resolution
    await game.settle();
    const toks = mechTokens(game.p1.base());
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isToken: true, might: 3, name: "Mech", owner: P1 });
    expect(game.state(toks[0]!).isExhausted).toBe(true);
    expect(mechTokens(game.p1.units("bf1"))).toHaveLength(0); // "to your base", never to a battlefield
    expect(mechTokens(game.p2.base())).toHaveLength(0);
    expect(game.zoneOf("surge")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'Draw 1.' — the caster must draw exactly one card in the same resolution; only the token instruction runs", async () => {
    // Expected: hand = [top of deck], deck −1. Actual: the parser split the text into two `spell`
    // abilities and the engine resolves only the first (create-token), so nothing is drawn.
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    const top = game.p1.deck()[0];
    await game.p1.cast("surge");
    expect(game.chain()).toHaveLength(1); // one chain item carries both instructions
    await game.settle();
    expect(game.p1.hand()).toEqual([top!]);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p2.hand()).toEqual([]);
  });

  test("'This costs [2] less if you control a Mech' — with a friendly Mech on board the spell costs 2 energy + [mind] (356.4)", async () => {
    // Expected: castable with 2 energy + mind, leaving 0/0. Actual: the parser dropped the discount
    // clause entirely (no cost-reduction static in the abilities), so the printed 4 is demanded.
    const game = await board(2, 1).unit(P1, "base", BUBBLE_BOT, "bot").build();
    expect(game.p1.can("cast", "surge")).toBe(true);
    await game.p1.cast("surge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("surge")).toBe("chain");
  });

  test("with a friendly Mech and 4 energy only 2 are spent (discount applies even when the full price is affordable)", async () => {
    // Expected: 4 → 2 remaining. Actual: 0 remaining (no discount).
    const game = await board(4, 1).unit(P1, "bf1", BUBBLE_BOT, "bot").build();
    await game.p1.cast("surge");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
  });

  test("the discount touches energy only: 2 energy with a friendly Mech but NO [mind] is still not castable (356.1)", async () => {
    const game = await board(2, 0).unit(P1, "base", BUBBLE_BOT, "bot").build();
    expect(game.p1.can("cast", "surge")).toBe(false);
  });

  test("negative space: an ENEMY Mech, or a Mech in your hand, gives no discount — 2 energy + mind is not enough", async () => {
    const enemy = await board(2, 1).unit(P2, "base", BUBBLE_BOT, "theirBot").build();
    expect(enemy.p1.can("cast", "surge")).toBe(false);
    const inHand = await board(2, 1).hand(P1, BUBBLE_BOT, "botInHand").build();
    expect(inHand.p1.can("cast", "surge")).toBe(false);
    const r = await inHand.p1.try((p) => p.cast("surge"));
    expect(r.ok).toBe(false);
    expect(inHand.zoneOf("surge")).toBe("hand");
  });

  test("the Mech token from a first Surge is a Mech you control — a second Surge then costs only 2 + [mind]", async () => {
    // Expected: 8 energy / 2 mind → first Surge 4+mind (no Mech yet) → token → second Surge 2+mind → 2 energy left.
    // Actual: second Surge also charges 4 → 0 left.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 2 } })
      .hand(P1, CARD, "surge1")
      .hand(P1, CARD, "surge2")
      .build();
    await game.p1.cast("surge1");
    expect(game.p1.energy()).toBe(4);
    await game.settle();
    expect(mechTokens(game.p1.base())).toHaveLength(1);
    await game.p1.cast("surge2");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
    await game.settle();
    expect(mechTokens(game.p1.base())).toHaveLength(2);
  });

  test("standard timing: not castable on the opponent's turn, nor in response with an item already on the chain", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "surge")).toBe(false);
    // Own turn, but a first Surge is on the chain → the second (standard-speed) one may not be added.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 2 } })
      .hand(P1, CARD, "surge1")
      .hand(P1, CARD, "surge2")
      .build();
    await game.p1.cast("surge1");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "surge2")).toBe(false);
  });

  test("the opponent gets priority before it resolves; nothing happens until both players pass", async () => {
    const game = await board().build();
    await game.p1.cast("surge");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(mechTokens(game.p1.base())).toHaveLength(0);
    expect(game.p1.hand()).toEqual([]);
    await game.p2.passPriority();
    await game.settle();
    expect(mechTokens(game.p1.base())).toHaveLength(1);
    expect(game.zoneOf("surge")).toBe("trash");
  });

  test("partner static: with Rumble, Scrapper on board the Mech token reads 4 Might (3 base +1 'Your Mechs')", async () => {
    const game = await board(4, 1).unit(P1, "base", RUMBLE_SCRAPPER, "rumble").build();
    await game.p1.cast("surge");
    await game.settle();
    const [tok] = mechTokens(game.p1.base());
    expect(tok).toBeDefined();
    expect(game.state(tok!).baseMight).toBe(3);
    expect(game.state(tok!).might).toBe(4);
  });

  test("parsed abilities should cover all three printed clauses — the conditional self cost-reduction is missing", async () => {
    // Expected (cf. Find Your Center ogn-047-298): a `static` self `cost-reduction` of [2] gated on
    // controlling a Mech, plus the token + draw instructions. Actual: only the two spell effects.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 4, powerCost: ["mind"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    const json = JSON.stringify(abilities);
    expect(json).toContain('"type":"create-token"');
    expect(json).toContain('"name":"Mech"');
    expect(json).toContain('"might":3');
    expect(json).toContain('"type":"draw"');
    expect(abilities).toContainEqual(
      expect.objectContaining({
        condition: expect.objectContaining({ type: "control" }),
        effect: expect.objectContaining({ target: "self", type: "cost-reduction" }),
        type: "static",
      }),
    );
  });

  test("parsed abilities (what IS there): a Mech 3-might unit token created in base and a draw 1, no [Action]/[Reaction] timing on the card", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def?.timing).toBe("standard");
    const abilities = (def?.abilities ?? []) as { type?: string; effect?: Record<string, unknown> }[];
    const effects = abilities.flatMap((a) => {
      const e = a.effect as { type?: string; effects?: Record<string, unknown>[] } | undefined;
      return e?.type === "sequence" ? (e.effects ?? []) : e ? [e] : [];
    });
    expect(effects).toContainEqual(expect.objectContaining({ location: "base", token: { might: 3, name: "Mech", type: "unit" }, type: "create-token" }));
    expect(effects).toContainEqual(expect.objectContaining({ amount: 1, type: "draw" }));
  });
});
