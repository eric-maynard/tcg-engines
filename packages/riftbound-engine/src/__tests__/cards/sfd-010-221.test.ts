/**
 * Void Drone — sfd-010-221 · Unit · Fury · 3 energy · 3 Might
 *
 *   I cost [2] less to play from anywhere other than your hand.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. The discount is a self static gated on the play's ORIGIN zone (rule 356.4): from hand it is a
 *     plain 3-cost unit; from trash / banishment / deck it costs [1]. It must never leak onto a
 *     hand play, and it must never apply to OTHER cards played from the trash.
 *  2. Rule 206 — anything that asks "what does this cost" (Glasc Mixologist's "no more than [3]",
 *     Defy-style checks) sees the PRINTED 3, not the discounted 1.
 *  3. Stacking with another reduction (Void Rush: "play it, reducing its cost by [2]") — 3-2-2
 *     floors at 0; energy can never go negative / be refunded.
 *  4. Affordability is evaluated with the discount already applied: with exactly 1 energy the
 *     trash play (via a "you may play cards from your trash" grant) is legal while the hand play
 *     of an identical copy is not.
 *  5. "Ignoring its cost" plays from trash (The Harrowing) make the discount moot — nothing is
 *     paid either way and the Drone still lands as a 3-Might unit, exhausted.
 *  6. Parser contract: the engine only honours `{ type:"cost-reduction", target:"self",
 *     whenPlayedFrom:"not-hand" }` (see Drag Under sfd-164-221); a free-text `scope` is a silent
 *     mis-parse.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, scenario } from "../../harness";

const CARD = "sfd-010-221";
const HARROWING = "ogn-198-298"; // Play a unit from your trash, ignoring its Energy cost. 6 + [chaos][chaos]
const VOID_RUSH = "sfd-188-221"; // Reveal top 2, may banish one then play it reducing its cost by [2]. 2 + [rainbow]
/** Endless Riches–style permanent (ven-022-166): "You may play cards from your trash." */
const TRASH_GRANT = {
  abilities: [{ effect: { from: "trash", type: "play-permission" }, type: "static" }],
  cardType: "gear",
  domain: "fury",
  energyCost: 1,
  name: "Test Trash Grant",
  rulesText: "You may play cards from your trash.",
};

describe("Void Drone (sfd-010-221)", () => {
  test("from hand it is a plain 3-cost, 3-Might unit: pays the full [3], enters the base exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "drone").build();
    expect(game.state("drone").energyCost).toBe(3);
    await game.p1.play("drone");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("drone")).toBe("base");
    expect(game.state("drone")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("negative space: the discount never applies to a hand play — 2 energy is one short, 1 energy is not close", async () => {
    const two = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "drone").build();
    expect(two.p1.can("play", "drone")).toBe(false);
    const one = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "drone").build();
    expect(one.p1.can("play", "drone")).toBe(false);
  });

  // BUG — expected: energy 3 → 2 (the [2] self-discount applies to a trash play, rule 356.4).
  // Actual: the full printed 3 is charged; the engine only honours `whenPlayedFrom:"not-hand"` and
  // only on a [Flow] play, while the parser emitted a free-text `scope` for this card.
  test.failing("BUG: Void Drone played from the trash is charged the full [3] — the 'from anywhere other than your hand' discount is never applied (rule 356.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .gear(P1, TRASH_GRANT, "riches")
      .trash(P1, CARD, "drone")
      .build();
    expect(game.p1.can("play", "drone")).toBe(true);
    await game.p1.play("drone");
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.zoneOf("drone")).toBe("base");
    expect(game.state("drone").isExhausted).toBe(true);
  });

  // BUG — expected: the trash copy is offered at 1 energy (discounted cost 1). Actual: not offered.
  test.failing("BUG: with 1 energy a trash-play of Void Drone should be legal at its discounted cost of [1], but it is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P1, TRASH_GRANT, "riches")
      .trash(P1, CARD, "binned")
      .hand(P1, CARD, "held")
      .build();
    expect(game.p1.can("play", "held")).toBe(false);
    expect(game.p1.can("play", "binned")).toBe(true);
    await game.p1.play("binned");
    expect(game.p1.energy()).toBe(0);
  });

  test("the discount is SELF-only: a vanilla 3-cost unit played from the trash under the same grant still costs 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .gear(P1, TRASH_GRANT, "riches")
      .base(P1, CARD, "droneOnBoard")
      .trash(P1, "ogn-175-298", "skulker")
      .build();
    await game.p1.play("skulker");
    expect(game.p1.energy()).toBe(0);
  });

  test("rule 206: the printed cost stays 3 wherever the card is (trash / board), so '≤ 3'-cost filters still see 3", async () => {
    const game = await scenario().trash(P1, CARD, "binned").base(P1, CARD, "onBoard").build();
    expect(game.state("binned").energyCost).toBe(3);
    expect(game.state("onBoard").energyCost).toBe(3);
  });

  test("The Harrowing (ignoring Energy cost) brings it back for nothing beyond the spell's own cost; it lands as a 3-Might unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .trash(P1, CARD, "drone")
      .hand(P1, HARROWING, "har")
      .build();
    const askedUpFront = game.p1.option("cast", "har")?.fields.some((f) => f.arg === "targets" && f.required);
    await game.p1.cast("har", askedUpFront ? { targets: "drone" } : {});
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("drone");
      await game.settle();
    }
    expect(game.zoneOf("drone")).toBe("base");
    expect(game.state("drone").might).toBe(3);
    expect(game.p1.energy()).toBe(0);
  });

  // BUG — expected: Void Rush castable for 2+[rainbow]; banishing + playing the Drone costs 0 more.
  // Actual: Void Rush is never offered (its "banish one [revealed card]" step is gated as if it
  // needed a board target at play time), so the stacked-discount floor cannot be exercised.
  test.failing("BUG: Void Rush (sfd-188-221) is never castable, so the Drone's stacked 3−2−2 → 0 (floored, no refund) deck play cannot happen", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .deck(P1, [CARD, "ogn-175-298"], ["drone", "second"])
      .hand(P1, VOID_RUSH, "rush")
      .build();
    await game.p1.cast("rush");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    // "You may banish one, then play it": pick the Drone from the two revealed cards.
    for (let i = 0; i < 6 && game.decision()?.kind !== "action"; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        const key = d.options.find((o) => o.card === "drone")?.key ?? d.options.find((o) => o.key === "base")?.key ?? d.options[0]?.key;
        await game.p1.pick(key as string);
      } else if (d?.kind === "yes-no") {
        await game.p1.yes();
      }
      await game.settle();
    }
    expect(game.locationOf("drone")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("second")).toBe("hand"); // "Draw any you didn't banish."
  });

  // BUG — expected `{ by: 2, whenPlayedFrom: "not-hand" }` (Drag Under's hand-authored shape, the only
  // one cost.ts reads). Actual: `{ reduction: ":rb_energy_2:", scope: "to play from anywhere other than your hand" }`.
  test("parser emits the whenPlayedFrom:'not-hand' gate for 'from anywhere other than your hand'", async () => {
    const pool = await loadDefaultCardPool();
    const abilities = (pool.get(CARD)?.abilities ?? []) as { type: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { target: "self", type: "cost-reduction", whenPlayedFrom: "not-hand" }, type: "static" });
    const e = abilities[0]?.effect ?? {};
    const amount = [e.by, e.amount, e.reduction].find((v) => v === 2 || (typeof v === "object" && v !== null && (v as { energy?: number }).energy === 2));
    expect(amount).toBeDefined();
  });
});
