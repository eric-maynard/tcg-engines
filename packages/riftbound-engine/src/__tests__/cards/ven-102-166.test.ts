/**
 * Ravenbloom Prefect — ven-102-166 · Unit · Chaos · 3 energy · 3 Might
 *
 *   When an opponent plays a gear, you may banish me to banish it.
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Trigger scope: an OPPONENT playing a GEAR. Your own gear, an opponent's unit or spell, or a
 *     Prefect that is still in hand must never trigger it. Equipment IS gear (208.3) and counts.
 *  2. A gear is a permanent: it never lingers on the chain (359.2) — it is already on the board when
 *     the trigger resolves, so "banish it" pulls it OFF THE BOARD into its owner's banishment
 *     (427 — not a kill, not a discard, no Deathknell).
 *  3. "you may banish me to …": banishing the Prefect is the COST of an optional trigger (383.3.b) —
 *     declining keeps both cards; accepting puts the Prefect in ITS OWNER's banishment (not trash)
 *     and only then banishes the gear. No Prefect on the board → nothing to pay → nothing happens.
 *  4. The gear's own play effect (Poro Snax: "When you play this, draw 1") has already triggered
 *     independently — banishing the Snax does not un-draw the card.
 *  5. One body, one answer: after the Prefect banished itself for gear #1, gear #2 the same turn
 *     meets no Prefect and stays.
 *  6. Plain body otherwise: 3 energy, 3 Might, enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-102-166";
const SEAL_OF_FOCUS = "ogn-081-298"; // Gear · Calm · 0 energy + [calm]
const PORO_SNAX = "sfd-046-221"; // Gear · Calm · 1 energy + [calm] · "When you play this, draw 1."
const DORANS_SHIELD = "sfd-033-221"; // Equipment · Calm · 1 energy
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;

/** P2's turn; P1 has a Prefect in base; P2 holds an inline 1-cost gear. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { calm: 2 } })
    .unit(P1, "base", CARD, "prefect")
    .hand(P2, TRINKET, "trinket");
}

describe("Ravenbloom Prefect (ven-102-166)", () => {
  test("registry payload (trigger half): 3-cost 3-Might Chaos unit with exactly one OPTIONAL triggered ability on an OPPONENT's play-gear", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, might: 3, name: "Ravenbloom Prefect" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ optional: true, trigger: { event: "play-gear", on: "opponent" }, type: "triggered" });
  });

  test("registry payload (effect half) — 'banish me to banish it' should parse to a banish-self cost + banish-the-triggering-gear effect, but it is left as unparsed `raw` text", async () => {
    // Expected: effect.type is a structured banish (self as cost, trigger source as target).
    // Actual: { type: "raw", text: "banish me to banish it." } — a silent no-op at resolution.
    const ability = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect?: { type: string } };
    expect(ability.effect?.type).not.toBe("raw");
    expect(JSON.stringify(ability.effect)).toMatch(/banish/);
  });

  test("body + cost: 3 energy, lands in base exhausted as a 3-Might unit; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "prefect").build();
    await game.p1.play("prefect");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.state("prefect")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "prefect").build()).p1.can("play", "prefect")).toBe(false);
  });

  test("an opponent playing a gear puts the Prefect's triggered ability on the chain (P1's item) with the gear already on the board, and P1 is asked whether to use it", async () => {
    const game = await board().build();
    await game.p2.play("trinket");
    expect(game.zoneOf("trinket")).toBe("base"); // permanents do not linger on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prefect", controller: P1, triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("declining ('you may'): the Prefect stays in base, the gear stays on P2's board, nothing is banished", async () => {
    const game = await board().build();
    await game.p2.play("trinket");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toHaveLength(0);
  });

  test("accepting should banish the Prefect (to P1's banishment, not trash) and banish the played gear off P2's board (427) — the parsed effect is raw text so nothing moves", async () => {
    // Expected: prefect → P1 banishment, trinket → P2 banishment, P2's base empty of gear.
    // Actual: the yes/no is offered but the `raw` effect is a no-op; both cards stay in base.
    const game = await board().build();
    await game.p2.play("trinket");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.p1.banishment()).toContain("prefect");
    expect(game.p1.trash()).not.toContain("prefect");
    expect(game.zoneOf("trinket")).toBe("banishment");
    expect(game.p2.banishment()).toContain("trinket");
    expect(game.p2.gear()).toEqual([]);
  });

  test("BUG: 'banish me' is the trigger's cost (383.3.b) — once P1 opts in, the Prefect is already gone while the ability still waits on the chain for P2's response", async () => {
    // Expected: after P1 accepts, prefect ∈ P1 banishment while the chain item is still pending
    // (P2 has priority) and the trinket is still on the board until resolution.
    // Actual: the opt-in is only asked at resolution and banishes nothing.
    const game = await board().build();
    await game.p2.play("trinket");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    } else {
      await game.settle();
      await game.p1.yes();
    }
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("trinket")).toBe("base");
  });

  test("negative space — YOUR OWN gear: P1 playing a gear with the Prefect out triggers nothing", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "prefect").hand(P1, TRINKET, "mine").build();
    await game.p1.play("mine");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("prefect")).toBe("base");
  });

  test("negative space — not a gear: an opponent playing a UNIT or casting a SPELL triggers nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "prefect")
      .unit(P1, "bf1", { might: 4, name: "Post" }, "post")
      .hand(P2, { energyCost: 2, might: 2, name: "Grunt" }, "grunt")
      .hand(P2, { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 1, name: "Zap", timing: "action" }, "zap")
      .build();
    await game.p2.play("grunt");
    expect((await game.settle()).reason).toBe("open");
    expect(game.chain()).toHaveLength(0);
    await game.p2.cast("zap", { targets: "post" });
    expect(game.chain().every((i) => i.cardId !== "prefect")).toBe(true);
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative space — a Prefect in HAND is not on the board: the opponent's gear resolves with no trigger and no prompt", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).hand(P1, CARD, "prefect").hand(P2, TRINKET, "trinket").build();
    await game.p2.play("trinket");
    expect((await game.settle()).reason).toBe("open");
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("trinket")).toBe("base");
  });

  test("Equipment is gear (208.3): P2 playing Doran's Shield triggers the Prefect just the same", async () => {
    const game = await board().hand(P2, DORANS_SHIELD, "shield").build();
    await game.p2.play("shield");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prefect", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("a real 0-cost gear (Seal of Focus, [calm]) also triggers it; declining leaves the Seal usable on P2's board", async () => {
    const game = await board().hand(P2, SEAL_OF_FOCUS, "seal").build();
    await game.p2.play("seal");
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 1 } });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p2.gear()).toContain("seal");
  });

  test("the gear's own play effect is independent: Poro Snax still draws P2 a card whether or not the Prefect answers (declined here)", async () => {
    const game = await board().hand(P2, PORO_SNAX, "snax").build();
    const handBefore = game.p2.hand().length;
    await game.p2.play("snax");
    // Two triggers from one event: P2's Snax draw and P1's Prefect option.
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["prefect", "snax"]);
    game.script(P1, ["no"]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p2.hand().length).toBe(handBefore - 1 + 1); // played the Snax, drew 1
    expect(game.zoneOf("snax")).toBe("base");
    expect(game.zoneOf("prefect")).toBe("base");
  });

  test("one body pays once — after banishing itself to answer gear #1, a second gear the same turn meets no Prefect: no chain item, no prompt, gear #2 stays", async () => {
    // Expected: trinket banished with the Prefect; the Seal then resolves untouched with no trigger.
    // Actual: the first acceptance banishes nothing, so the Prefect is still around and triggers again.
    const game = await board().hand(P2, SEAL_OF_FOCUS, "seal").build();
    await game.p2.play("trinket");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("banishment");
    await game.p2.play("seal");
    expect(game.chain()).toHaveLength(0);
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("seal")).toBe("base");
  });
});
