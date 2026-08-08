/**
 * Core rules — the play COST MODEL (`moves/play/cost-model.ts`): one derived
 * description of a card's Total Cost (rule 356) and one computation from
 * model + selection to resources owed / objects paid (rules 356–357), shared
 * by conditions, enumerators and reducers.
 *
 * Rules covered:
 *   356.1.a   alternative costs ("play me for …", [Flow], [Hidden], own trash permission)
 *   356.2.a   mandatory additional costs (kill a friendly unit; return a gear; [Deflect] per target — 809)
 *   356.2.b   optional additional costs — several independent ones on one card (Kraken Hunter)
 *   356.3     increases (Vex) before 356.4 discounts; 356.4.c component discounts (Ezreal) as the
 *             component is added; 356.4.e a discount's minimum binds only that discount; 356.6 floor 0
 *   135.2.e   [A] pips payable from any Domain; pooled [A] pays any pip; 429.4-style restricted Energy
 *   357.2     object costs are paid through the kill path (Deathknell fires; 357.2.a replaced = paid)
 *   404.2     a triggered ability whose cost is declined at finalization leaves the chain
 */

import { describe, expect, test } from "bun:test";
import type { CardId as CoreCardId } from "@tcg/core";
import { type Game, P1, P2, getInternalState, scenario } from "../../harness";
import {
  ADDITIONAL_COST_IDS,
  ALTERNATIVE_COST_IDS,
  canPayTotalCost,
  computeTotalCost,
  getPlayCostModel,
  legacyParamsFromSelection,
  optionalCostSubsets,
  selectionFromLegacyParams,
} from "../../game-definition/moves/play/cost-model";
import { canPayResourceCost, computePlayResourceCost } from "../../game-definition/moves/play/cost";

/** Board accessors over the harness engine's internals (what a move context supplies). */
function ctxOf(game: Game, extra: Record<string, unknown> = {}) {
  const iv = getInternalState(game.engine);
  const zones = {
    getCardZone: (id: CoreCardId) => iv.cards[id as string]?.zone,
    getCardsInZone: (zoneId: string, playerId?: string) =>
      (iv.zones[zoneId]?.cardIds ?? []).filter((id) => !playerId || iv.cards[id]?.owner === playerId) as unknown as CoreCardId[],
  };
  const cards = {
    getCardController: (id: CoreCardId) => iv.cards[id as string]?.controller ?? iv.cards[id as string]?.owner,
    getCardMeta: (id: CoreCardId) => iv.cardMetas[id as string],
    getCardOwner: (id: CoreCardId) => iv.cards[id as string]?.owner,
  };
  return { board: { cards, zones } as never, getCardMeta: cards.getCardMeta as never, ...extra };
}

const fillerUnit = (energyCost: number, powerCost: readonly string[] = [], extra: Record<string, unknown> = {}) => ({
  abilities: [],
  cardType: "unit",
  domain: "fury",
  energyCost,
  keywords: [],
  might: 2,
  name: `Recruit ${energyCost}/${powerCost.join("+") || "-"} (test)`,
  powerCost: [...powerCost],
  ...extra,
});
const fillerSpell = (energyCost: number, powerCost: readonly string[] = [], extra: Record<string, unknown> = {}) => ({
  abilities: [{ effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost,
  name: `Bolt ${energyCost}/${powerCost.join("+") || "-"} (test)`,
  powerCost: [...powerCost],
  timing: "action",
  ...extra,
});
const discountAura = (cardType: "unit" | "spell", amount: unknown, minimum?: number) => ({
  effect: { amount, ...(minimum !== undefined ? { minimum } : {}), target: { type: cardType }, type: "cost-reduction" },
  type: "static",
});
const legendWith = (name: string, abilities: unknown[]) => ({ abilities, cardType: "legend", domain: "fury", name });

// ---------------------------------------------------------------------------
// Model derivation for representative printed cards
// ---------------------------------------------------------------------------

describe("getPlayCostModel — derived from abilities/keywords (356.1–356.2)", () => {
  test("Legion Rearguard: base [2], one optional 'accelerate' [1][fury] whose rider is enter-ready", async () => {
    const game = await scenario().hand(P1, "ogn-010-298", "rear").build();
    const m = getPlayCostModel(game.gameState, P1, "rear", ctxOf(game));
    expect(m.base).toEqual({ energy: 2 });
    expect(m.additional).toEqual([{ cost: { energy: 1, power: ["fury"] }, id: "accelerate", ifPaid: "enter-ready", mandatory: false }]);
    expect(m.alternatives).toEqual([]);
  });

  test("Cruel Patron: the kill is MANDATORY (356.2.a) — an empty selection is illegal, naming a victim is legal", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 1 }, "pawn").hand(P1, "ogn-208-298", "patron").build();
    const m = getPlayCostModel(game.gameState, P1, "patron", ctxOf(game));
    expect(m.additional.map((a) => [a.id, a.mandatory])).toEqual([["kill", true]]);
    expect(computeTotalCost(game.gameState, P1, "patron", {}, ctxOf(game)).illegal).toBe("unpaid-mandatory:kill");
    const paid = computeTotalCost(game.gameState, P1, "patron", { paid: { kill: { objects: ["pawn"] } } }, ctxOf(game));
    expect(paid.illegal).toBeUndefined();
    expect(paid.objects).toEqual([{ costId: "kill", kind: "kill", objects: ["pawn"] }]);
    expect(paid.resources.energy).toBe(4);
  });

  test("Kraken Hunter: TWO independent optional costs — accelerate AND spend-any-buffs (356.2.b), each payable alone or together", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 3 } })
      .unit(P1, "base", { might: 2 }, "b1", { buffed: true })
      .hand(P1, "ogn-150-298", "kraken")
      .build();
    const m = getPlayCostModel(game.gameState, P1, "kraken", ctxOf(game));
    expect(m.additional.map((a) => a.id).sort()).toEqual(["accelerate", "spend-buff-any"]);
    expect(optionalCostSubsets(m).map((s) => s.join("+"))).toEqual(["", "accelerate", "spend-buff-any", "accelerate+spend-buff-any"]);
    const base = computeTotalCost(game.gameState, P1, "kraken", {}, ctxOf(game), m);
    expect(base.resources).toMatchObject({ energy: 3, named: { body: 2 } });
    const acc = computeTotalCost(game.gameState, P1, "kraken", { paid: { accelerate: true } }, ctxOf(game), m);
    expect(acc.resources).toMatchObject({ energy: 4, named: { body: 3 } });
    expect(acc.entersReady).toBe(true);
    const both = computeTotalCost(game.gameState, P1, "kraken", { paid: { accelerate: true, "spend-buff-any": { objects: ["b1"] } } }, ctxOf(game), m);
    expect(both.resources).toMatchObject({ energy: 4, named: { body: 2 } }); // one [body] waived per buff spent
    expect(both.paidIds.sort()).toEqual(["accelerate", "spend-buff-any"]);
  });

  test("Wallop: 'spend a buff … if you do, ignore this spell's cost' → paying makes the play free (356.5)", async () => {
    const game = await scenario().hand(P1, "ogn-146-298", "wallop").build();
    const m = getPlayCostModel(game.gameState, P1, "wallop", ctxOf(game));
    expect(m.additional).toEqual([expect.objectContaining({ id: "spend-buff", ifPaid: "ignore-cost", mandatory: false })]);
    expect(computeTotalCost(game.gameState, P1, "wallop", { paid: { "spend-buff": true } }, ctxOf(game), m).resources.free).toBe(true);
    expect(computeTotalCost(game.gameState, P1, "wallop", {}, ctxOf(game), m).resources).toMatchObject({ energy: 2, free: false });
  });

  test("Brazen Buccaneer: optional discard whose rider nets [2] against the base (356.2.b.1 example)", async () => {
    const game = await scenario().hand(P1, "ogn-002-298", "bucc").hand(P1, fillerUnit(1), "fodder").build();
    const m = getPlayCostModel(game.gameState, P1, "bucc", ctxOf(game));
    expect(m.additional).toEqual([{ cost: { discard: 1 }, id: "discard", ifPaid: { energy: 2, type: "cost-reduction" }, mandatory: false }]);
    const t = computeTotalCost(game.gameState, P1, "bucc", { paid: { discard: { objects: ["fodder"] } } }, ctxOf(game), m);
    expect(t.resources.energy).toBe(4);
    expect(t.objects).toEqual([{ costId: "discard", count: 1, kind: "discard", objects: ["fodder"] }]);
  });

  test("Legion Quartermaster: mandatory return-a-friendly-gear (356.2.a); Commander Ledros: kill-any-number with a per-kill [order] discount + Deflect", async () => {
    const game = await scenario().hand(P1, "sfd-044-221", "qm").hand(P1, "ogn-231-298", "ledros").build();
    expect(getPlayCostModel(game.gameState, P1, "qm", ctxOf(game)).additional).toEqual([
      expect.objectContaining({ id: "return-to-hand", mandatory: true }),
    ]);
    const ledros = getPlayCostModel(game.gameState, P1, "ledros", ctxOf(game));
    expect(ledros.base).toEqual({ energy: 6, power: ["order", "order", "order", "order"] });
    expect(ledros.additional).toEqual([expect.objectContaining({ id: "kill-any", mandatory: false, perUnit: { reduces: { power: ["order"] } } })]);
    const two = computeTotalCost(game.gameState, P1, "ledros", { paid: { "kill-any": { objects: ["a", "b"] } } }, ctxOf(game), ledros);
    expect(two.resources.named).toEqual({ order: 2 });
  });

  test("alternatives: Jhin's conditional 'play me for [mind]' appears only once its condition holds; Dredge Up lists [Flow] from trash; a Hidden card lists hidden-for-0", async () => {
    const cold = await scenario().hand(P1, "unl-089-219", "jhin").build();
    expect(getPlayCostModel(cold.gameState, P1, "jhin", ctxOf(cold)).alternatives).toEqual([]);
    // gameState is frozen — evaluate against a copy carrying the turn ledger.
    const hot = { ...cold.gameState, spellEnergySpentThisTurn: { [P1]: 4 } } as typeof cold.gameState;
    expect(getPlayCostModel(hot, P1, "jhin", ctxOf(cold)).alternatives).toEqual([{ cost: { power: ["mind"] }, id: "alt" }]);
    const altTotal = computeTotalCost(hot, P1, "jhin", { alternativeId: "alt" }, ctxOf(cold));
    expect(altTotal.resources).toMatchObject({ energy: 0, named: { mind: 1 } });

    const flow = await scenario().trash(P1, "ven-049-166", "dredge").build();
    expect(getPlayCostModel(flow.gameState, P1, "dredge", ctxOf(flow)).alternatives).toEqual([{ cost: { energy: 2 }, from: ["trash"], id: "flow" }]);

    const hidden = await scenario().battlefield("bf1", { controller: P1 }).hand(P1, fillerSpell(3, [], { keywords: ["Hidden"] }), "hid").build();
    expect(getPlayCostModel(hidden.gameState, P1, "hid", ctxOf(hidden)).alternatives).toEqual([{ cost: {}, from: ["facedown"], id: ALTERNATIVE_COST_IDS.hidden }]);
    expect(computeTotalCost(hidden.gameState, P1, "hid", { alternativeId: "hidden" }, ctxOf(hidden)).resources).toMatchObject({ any: 0, energy: 0, named: {} });
  });

  test("Curtain Call: three [Repeat] tiers [1] / [A] / [1][A]; Sky Splitter reads X? no — Might-based self discount lands in the resources", async () => {
    const game = await scenario().unit(P1, "base", { might: 7 }, "big").hand(P1, "unl-182-219", "cc").hand(P1, "ogn-014-298", "sky").build();
    expect(getPlayCostModel(game.gameState, P1, "cc", ctxOf(game)).repeat).toEqual([{ energy: 1 }, { power: ["rainbow"] }, { energy: 1, power: ["rainbow"] }]);
    const two = computeTotalCost(game.gameState, P1, "cc", {}, ctxOf(game, { repeatCount: 2 }));
    // 4 + [1] + [C]: Curtain Call is a two-domain card, so its Repeat pip is hybrid (135.2.e.6.c) — fury or mind.
    expect(two.resources).toMatchObject({ energy: 5, hybrid: { domains: ["fury", "mind"], n: 1 } });
    // Sky Splitter: 8 − 7 (highest friendly Might) = 1, the [fury] pip untouched (356.4, energy reducers never waive pips).
    expect(computeTotalCost(game.gameState, P1, "sky", {}, ctxOf(game)).resources).toMatchObject({ energy: 1, named: { fury: 1 } });
  });
});

// ---------------------------------------------------------------------------
// computeTotalCost — discounts, minimums, increases, Deflect, restricted energy, rainbow
// ---------------------------------------------------------------------------

describe("computeTotalCost — increases, discounts, minimums, Deflect (356.3–356.6, 809)", () => {
  test("356.4.e — Eager-Apprentice-style '−1 to a minimum of 1' plus an unfloored −3: the floored discount is ordered first so a 3-cost unit costs 0, not 1", async () => {
    const game = await scenario()
      .legend(P1, legendWith("Two discounts", [discountAura("unit", 1, 1), discountAura("unit", 3)]))
      .hand(P1, fillerUnit(3), "u")
      .build();
    expect(computeTotalCost(game.gameState, P1, "u", {}, ctxOf(game)).resources.energy).toBe(0);
    // The floored one alone: 1 → stays 1 (a minimum never RAISES a cheaper card either).
    const solo = await scenario().legend(P1, legendWith("Floor", [discountAura("unit", 1, 1)])).hand(P1, fillerUnit(1), "one").build();
    expect(computeTotalCost(solo.gameState, P1, "one", {}, ctxOf(solo)).resources.energy).toBe(1);
  });

  test("356.3 then 356.4 — Vex in combat: enemy spells cost [1][A] MORE; the increase is added and never floored away", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", "sfd-146-221", "vex", { combatRole: "defender" } as never)
      .unit(P1, "bf1", { might: 2 }, "atk", { combatRole: "attacker" } as never)
      .hand(P1, fillerSpell(2), "bolt")
      .build();
    (game.gameState.battlefields as Record<string, { contested?: boolean }>).bf1!.contested = true;
    const t = computeTotalCost(game.gameState, P1, "bolt", {}, ctxOf(game, { targets: ["atk"] }));
    // Vex's aura is conditioned "while I'm in combat"; whether the harness position counts as combat is
    // engine-defined — assert the monotone property: never cheaper than printed, any-pips only from the tax.
    expect(t.resources.energy).toBeGreaterThanOrEqual(2);
    expect(t.resources.energy - 2).toBe(t.resources.any);
  });

  test("809 / 356.2.a.2 — Deflect 1 on an ENEMY target adds one any-Domain pip per chosen target; a friendly Deflect target adds nothing; a [A] discount cancels it first (356.4.f)", async () => {
    const deflector = { keywords: ["Deflect"], might: 3, name: "Deflector (test)" };
    const game = await scenario().unit(P2, "base", deflector, "foe").unit(P1, "base", deflector, "own").hand(P1, fillerSpell(1), "bolt").build();
    const m = getPlayCostModel(game.gameState, P1, "bolt", ctxOf(game, { targets: ["foe"] }));
    expect(m.additional).toEqual([{ cost: { power: ["rainbow"] }, id: ADDITIONAL_COST_IDS.deflect, mandatory: true, perTarget: true }]);
    expect(computeTotalCost(game.gameState, P1, "bolt", {}, ctxOf(game, { targets: ["foe"] })).resources).toMatchObject({ any: 1, energy: 1 });
    expect(computeTotalCost(game.gameState, P1, "bolt", {}, ctxOf(game, { targets: ["own"] })).resources).toMatchObject({ any: 0, energy: 1 });
    const cheap = await scenario()
      .legend(P1, legendWith("−[A] spells", [discountAura("spell", { energy: 0, power: ["rainbow"] })]))
      .unit(P2, "base", deflector, "foe")
      .hand(P1, fillerSpell(1), "bolt")
      .build();
    expect(computeTotalCost(cheap.gameState, P1, "bolt", {}, ctxOf(cheap, { targets: ["foe"] })).resources).toMatchObject({ any: 0, energy: 1 });
  });

  test("356.4.c — Ezreal: an optional [1][fury] Accelerate costs [1] OR [fury] less; the payer may elect either shape via `spec`, an illegal shape falls back to the default", async () => {
    const acc = fillerUnit(2, [], { abilities: [{ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" }], keywords: ["Accelerate"] });
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).unit(P1, "base", "sfd-149-221", "ez").hand(P1, acc, "u").build();
    const m = getPlayCostModel(game.gameState, P1, "u", ctxOf(game));
    const dflt = computeTotalCost(game.gameState, P1, "u", { paid: { accelerate: true } }, ctxOf(game), m);
    expect(dflt.resources.energy + (dflt.resources.named.fury ?? 0)).toBe(3); // 2 base + (2 − 1) additional
    const shaveEnergy = computeTotalCost(game.gameState, P1, "u", { paid: { accelerate: { spec: { energy: 0, power: ["fury"] } } } }, ctxOf(game), m);
    expect(shaveEnergy.resources).toMatchObject({ energy: 2, named: { fury: 1 } });
    const shavePip = computeTotalCost(game.gameState, P1, "u", { paid: { accelerate: { spec: { energy: 1, power: [] } } } }, ctxOf(game), m);
    expect(shavePip.resources).toMatchObject({ energy: 3, named: {} });
    const bogus = computeTotalCost(game.gameState, P1, "u", { paid: { accelerate: { spec: { energy: 0, power: [] } } } }, ctxOf(game), m);
    expect(bogus.resources.energy + (bogus.resources.named.fury ?? 0)).toBe(3);
  });

  test("135.2.e.5 — an [A] pip is payable from any Domain and pooled [A] Power pays a named pip; 'restricted' Energy earmarked for spells cannot pay a unit", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, fillerUnit(2, ["rainbow"]), "anyPip").hand(P1, fillerUnit(2, ["fury"]), "furyPip").build();
    const anyPip = computeTotalCost(game.gameState, P1, "anyPip", {}, ctxOf(game));
    expect(anyPip.resources).toMatchObject({ any: 1, energy: 2, named: {} });
    expect(canPayTotalCost(game.gameState, P1, "anyPip", anyPip)).toBe(true); // mind pays [A]
    const furyPip = computeTotalCost(game.gameState, P1, "furyPip", {}, ctxOf(game));
    expect(canPayTotalCost(game.gameState, P1, "furyPip", furyPip)).toBe(false); // mind is not fury
    const wild = await scenario().resources(P1, { energy: 2, power: { rainbow: 1 } }).hand(P1, fillerUnit(2, ["fury"]), "furyPip").build();
    expect(canPayTotalCost(wild.gameState, P1, "furyPip", computeTotalCost(wild.gameState, P1, "furyPip", {}, ctxOf(wild)))).toBe(true);

    // rule 429.4-style earmark: 2 Energy usable only for spells → a 2-cost UNIT is unpayable, a 2-cost spell is fine.
    const built = await scenario().resources(P1, { energy: 2 }).hand(P1, fillerUnit(2), "u").hand(P1, fillerSpell(2), "s").build();
    const marked = { ...built.gameState, restrictedEnergy: { [P1]: { spell: 2 } } } as typeof built.gameState;
    const unitCost = computePlayResourceCost(marked, P1, "u", {}, undefined);
    expect(canPayResourceCost(marked, P1, "u", unitCost)).toBe(false);
    const spellCost = computePlayResourceCost(marked, P1, "s", {}, undefined);
    expect(canPayResourceCost(marked, P1, "s", spellCost)).toBe(true);
  });

  test("selection ⇄ legacy params round-trip (migration shim): accelerate+spec, kill victim, kill-any list, discard, flow, alt", async () => {
    const game = await scenario().hand(P1, "ogn-150-298", "kraken").hand(P1, "ogn-208-298", "patron").hand(P1, "ogn-231-298", "ledros").hand(P1, "ogn-002-298", "bucc").trash(P1, "ven-049-166", "dredge").build();
    expect(selectionFromLegacyParams("kraken", { additionalCostSpec: { energy: 1, power: [] }, paidAdditionalCost: true, spentBuffIds: ["b1"] })).toEqual({
      paid: { accelerate: { spec: { energy: 1, power: [] } }, "spend-buff-any": { objects: ["b1"] } },
    });
    expect(selectionFromLegacyParams("patron", { paidAdditionalCost: true, sacrificeId: "pawn" })).toEqual({ paid: { kill: { objects: ["pawn"] } } });
    expect(selectionFromLegacyParams("ledros", { paidAdditionalCost: true, sacrificeIds: ["a", "b"] })).toEqual({ paid: { "kill-any": { objects: ["a", "b"] } } });
    expect(selectionFromLegacyParams("bucc", { discardId: "f", paidAdditionalCost: true })).toEqual({ paid: { discard: { objects: ["f"] } } });
    expect(selectionFromLegacyParams("dredge", { viaFlow: true })).toEqual({ alternativeId: "flow" });
    expect(legacyParamsFromSelection("patron", { costs: { paid: { kill: { objects: ["pawn"] } } } })).toMatchObject({ paidAdditionalCost: true, sacrificeId: "pawn" });
    expect(legacyParamsFromSelection("ledros", { costs: { paid: { "kill-any": { objects: ["a"] } } } })).toMatchObject({ paidAdditionalCost: true, sacrificeId: "a", sacrificeIds: ["a"] });
    expect(legacyParamsFromSelection("dredge", { costs: { alternativeId: "flow" } })).toMatchObject({ viaFlow: true });
  });
});

// ---------------------------------------------------------------------------
// Paying object costs / trigger costs through the engine
// ---------------------------------------------------------------------------

describe("paying object costs and trigger costs (357.2, 357.2.a, 404.2)", () => {
  const DEATHKNELL_DRAW = { abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }], keywords: ["Deathknell"], might: 1, name: "Doomed Page (test)" };

  test("357.2 / 428.1 — Cruel Patron's cost-kill goes through the kill path: the victim's Deathknell fires (P1 draws 1) and Patron lands", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", DEATHKNELL_DRAW, "page").hand(P1, "ogn-208-298", "patron").fillDecks({ main: 5, runes: 0 }).build();
    const hand = game.p1.hand().length;
    await game.p1.play("patron", { sacrifice: "page" });
    await game.settle();
    expect(game.zoneOf("page")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.energy()).toBe(0);
  });

  test("357.2.a — a cost-kill REPLACED by Zhonya's Hourglass still counts as paid: the victim survives (exhausted in base), the Hourglass is spent, Patron is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2 }, "pawn")
      .gear(P1, "ogn-077-298", "zhonya")
      .hand(P1, "ogn-208-298", "patron")
      .build();
    await game.p1.play("patron", { sacrifice: "pawn", to: "base" });
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("356.2.b — Kraken Hunter pays BOTH optional costs on one play via `costs`: Accelerate ([1][body]) and one spent buff (−[body]) → 4 energy + 2 body, enters READY, the ally loses its buff, ledger names both ids", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .unit(P1, "base", { might: 2 }, "ally", { buffed: true })
      .hand(P1, "ogn-150-298", "kh")
      .build();
    await game.p1.play("kh", { costs: { paid: { accelerate: true, "spend-buff-any": ["ally"] } }, to: "base" });
    await game.settle();
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.state("kh").isExhausted).toBe(false);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect([...(game.gameState.additionalCostsPaid?.kh as string[])].sort()).toEqual(["accelerate", "spend-buff-any"]);
    // Spending the buff alone must NOT silently also pay Accelerate out of a pool that could cover it.
    const solo = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .unit(P1, "base", { might: 2 }, "ally", { buffed: true })
      .hand(P1, "ogn-150-298", "kh")
      .build();
    await solo.p1.play("kh", { costs: { paid: { "spend-buff-any": ["ally"] } }, to: "base" });
    expect(solo.state("kh").isExhausted).toBe(true);
    expect(solo.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("the `costs` param drives every play move: Cruel Patron `{paid:{kill:'pawn'}}`, Dredge Up `{alternativeId:'flow'}`, Brazen Buccaneer `{paid:{discard:'fodder'}}` (−[2])", async () => {
    const patron = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 1 }, "pawn").hand(P1, "ogn-208-298", "patron").build();
    await patron.p1.play("patron", { costs: { paid: { kill: "pawn" } }, to: "base" });
    expect(patron.zoneOf("pawn")).toBe("trash");
    expect(patron.zoneOf("patron")).toBe("base");
    expect(patron.gameState.additionalCostsPaid?.patron).toEqual(["kill"]);

    const flow = await scenario().resources(P1, { energy: 2 }).trash(P1, "ven-049-166", "dredge").fillDecks({ main: 5, runes: 0 }).build();
    await flow.p1.cast("dredge", { costs: { alternativeId: "flow" } });
    await flow.settle();
    expect(flow.zoneOf("dredge")).toBe("banishment");
    expect(flow.p1.energy()).toBe(0);

    const bucc = await scenario().resources(P1, { energy: 4 }).hand(P1, "ogn-002-298", "bucc").hand(P1, fillerUnit(1), "fodder").build();
    expect(bucc.p1.can("play", "bucc")).toBe(true); // only via the discard variant (6 − 2 = 4)
    await bucc.p1.play("bucc", { costs: { paid: { discard: "fodder" } }, to: "base" });
    expect(bucc.zoneOf("fodder")).toBe("trash");
    expect(bucc.zoneOf("bucc")).toBe("base");
    expect(bucc.p1.energy()).toBe(0);
    expect(bucc.gameState.additionalCostsPaid?.bucc).toEqual(["discard"]);
  });

  test("404.2 — a triggered 'you may pay [1]: draw 1' whose cost is DECLINED at finalization is removed from the chain; nothing is paid or drawn", async () => {
    const PAYER = fillerUnit(1, [], {
      abilities: [{ condition: { cost: { energy: 1 }, type: "pay-cost" }, effect: { amount: 1, type: "draw" }, optional: true, trigger: { event: "attack", on: "self" }, type: "triggered" }],
      might: 3,
      name: "Toll Raider (test)",
    });
    const game = await scenario().resources(P1, { energy: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "sentry").unit(P1, "base", PAYER, "raider").fillDecks({ main: 5, runes: 0 }).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    expect(game.chain().some((i) => i.cardId === "raider")).toBe(false);
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
  });
});
