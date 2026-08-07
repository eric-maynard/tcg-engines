/**
 * Lacerate — ven-127-166 · Spell · Order · 2 energy + [order] · (no timing keyword)
 *
 *   Choose a unit. If it's [Empowered], disempower it. Then kill it if it has 3 [Might] or less.
 *   [Flow] [4][order][order] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Rules: 355.8/355.9.a.1 (ONE target: "a unit" — any unit anywhere; the Empowered test and the 3-Might
 * test are resolution checks, not targeting restrictions), 442 (Disempower: removes the status; on a
 * non-Empowered unit it does nothing — the spell still goes on), 828.1.c (an [Empowered][>] dependent
 * ability is live only WHILE Empowered — so a "+N Might while Empowered" unit shrinks BEFORE the Might
 * check, and a "Deathknell while Empowered" unit that Lacerate kills dies plain), 143 (Might is the
 * effective value: buffs count, damage does not reduce it), 809 (Deflect N taxes the chooser N power),
 * 829 (Flow: trash-only alternate cost [4][order][order], then banish; no timing change), 310.1.a.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The design kill: Frostcoat Mother (3, "+3 while Empowered" = 6) → disempowered to 3 → dies. Contrast
 *     Brutal Hunter (4, +2 = 6) → disempowered to 4 → LIVES, but stays disempowered (Ganking gone).
 *  2. Ordering vs Deathknell: an Empowered Noxian Emissary (2 Might, "[Empowered] Deathknell — two
 *     Recruits") is disempowered FIRST, then killed → it dies un-Empowered → NO tokens. Control: the same
 *     Emissary dying in combat while Empowered does make two Recruits.
 *  3. Threshold edges on plain units: 3 dies, 4 lives untouched (no damage marked either); a 2 buffed to
 *     3 still dies; a 5 carrying 3 damage is still a 5 and lives.
 *  4. Resolution-time check: P2 answers with Discipline (+2) on the 3-Might target → it is a 5 when
 *     Lacerate resolves → survives; Lacerate still goes to the trash.
 *  5. Deflect 2 (Empowered Solari Sunhawk, 3+1): choosing it costs 2 extra power of any domain; paid →
 *     disempowered to 3 → dies.
 *  6. Flow [4][order][order] from the trash → banished; the def currently carries NO Flow keyword at all.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-127-166";
const FROSTCOAT_MOTHER = "ven-032-166"; // 3 Might · [Empowered] I have +3 Might
const BRUTAL_HUNTER = "ven-070-166"; // 4 Might · [Empowered] I have +2 Might and Ganking
const NOXIAN_EMISSARY = "ven-128-166"; // 2 Might · [Empowered] Deathknell — play two 1-Might Recruit tokens to your base
const SOLARI_SUNHAWK = "ven-122-166"; // 3 Might · [Empowered] I have +1 Might and Deflect 2
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));

function withTarget(def: string | { might: number; name?: string }, meta?: Record<string, unknown>, res = { energy: 2, power: { order: 1 } as Record<string, number> }) {
  return scenario().resources(P1, res).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", def, "victim", meta).hand(P1, CARD, "lac");
}

describe("Lacerate (ven-127-166)", () => {
  test("registry payload (spell half): Order spell 2+[order], standard timing; sequence[disempower the chosen unit, if its Might ≤ 3 → kill]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Lacerate" });
    expect(def?.powerCost).toEqual(["order"]);
    expect(def?.timing ?? "standard").toBe("standard");
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          { target: { type: "unit" }, type: "disempower" },
          { condition: { comparison: { lte: 3 }, type: "target-might" }, then: { type: "kill" }, type: "conditional" },
        ],
        type: "sequence",
      },
      type: "spell",
    });
  });

  test.failing("BUG: the hand-authored abilities omit the [Flow] keyword entirely — registry payload must also carry {type: keyword, keyword: Flow, cost: {energy 4, power [order, order]}}", async () => {
    // Expected: abilities = [spell …, {keyword:"Flow", cost:{energy:4, power:["order","order"]}}]. Actual: only the spell ability.
    const def = (await loadDefaultCardPool()).get(CARD);
    const flow = (def?.abilities as { type: string; keyword?: string; cost?: unknown }[] | undefined)?.find((a) => a.type === "keyword" && a.keyword === "Flow");
    expect(flow).toMatchObject({ cost: { energy: 4, power: ["order", "order"] }, keyword: "Flow", type: "keyword" });
  });

  test("cost 2 + [order]; a plain 3-Might unit is killed (→ its owner's trash); Lacerate → my trash; 1 energy or a non-order pip cannot cast; no unit anywhere → not castable", async () => {
    const game = await withTarget({ might: 3, name: "Three" }).build();
    await game.p1.cast("lac", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // on the chain, nothing yet
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.trash()).toContain("victim");
    expect(game.zoneOf("lac")).toBe("trash");
    expect((await withTarget({ might: 3 }, undefined, { energy: 1, power: { order: 3 } }).build()).p1.can("cast", "lac")).toBe(false);
    expect((await withTarget({ might: 3 }, undefined, { energy: 2, power: { fury: 1 } }).build()).p1.can("cast", "lac")).toBe(false);
    expect((await scenario().resources(P1, { energy: 9, power: { order: 3 } }).hand(P1, CARD, "lac").build()).p1.can("cast", "lac")).toBe(false);
  });

  test("threshold: a plain 4-Might unit is a legal choice but survives untouched — no damage, still on bf1, spell still spent to the trash", async () => {
    const game = await withTarget({ might: 4, name: "Four" }).build();
    await game.p1.cast("lac", { targets: "victim" });
    await game.settle();
    expect(game.state("victim")).toMatchObject({ damage: 0, isEmpowered: false, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("lac")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("Might is the EFFECTIVE value: a buffed 2 (= 3) dies; a 5 carrying 3 damage is still a 5 and lives", async () => {
    const buffed = await withTarget({ might: 2, name: "BuffedTwo" }, { buffed: true }).build();
    expect(buffed.state("victim").might).toBe(3);
    await buffed.p1.cast("lac", { targets: "victim" });
    await buffed.settle();
    expect(buffed.zoneOf("victim")).toBe("trash");

    const hurt = await withTarget({ might: 5, name: "HurtFive" }, { damage: 3 }).build();
    expect(hurt.state("victim")).toMatchObject({ damage: 3, might: 5 });
    await hurt.p1.cast("lac", { targets: "victim" });
    await hurt.settle();
    expect(hurt.state("victim")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });

  test("the design kill — Empowered Frostcoat Mother (3 + 3 = 6): disempowered FIRST → back to 3 → killed", async () => {
    const game = await withTarget(FROSTCOAT_MOTHER, { empowered: true }).build();
    expect(game.state("victim")).toMatchObject({ isEmpowered: true, might: 6 });
    await game.p1.cast("lac", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("lac")).toBe("trash");
  });

  test("Empowered Brutal Hunter (4 + 2 = 6): disempowered → 4 → survives, but stays DISempowered (4 Might, no Ganking) — the disempower is not undone", async () => {
    const game = await withTarget(BRUTAL_HUNTER, { empowered: true }).build();
    expect(game.state("victim")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(game.state("victim").keywords).toContain("Ganking");
    await game.p1.cast("lac", { targets: "victim" });
    await game.settle();
    expect(game.state("victim")).toMatchObject({ damage: 0, isEmpowered: false, might: 4, zone: "battlefield-bf1" });
    expect(game.state("victim").keywords).not.toContain("Ganking");
  });

  test("ordering vs [Empowered] Deathknell — Empowered Noxian Emissary (2): disempowered, THEN killed → it dies plain → NO Recruit tokens for P2", async () => {
    const game = await withTarget(NOXIAN_EMISSARY, { empowered: true }).build();
    expect(game.state("victim")).toMatchObject({ isEmpowered: true, might: 2 });
    await game.p1.cast("lac", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(tokensIn(game.p2.base())).toEqual([]);
    expect(tokensIn(game.p1.base())).toEqual([]);
  });

  test("Noxian Emissary's '[Empowered] Deathknell' never fires (while-empowered die trigger yields no tokens), so the ordering test above passes vacuously — control: the same Empowered Emissary dying in COMBAT must leave two 1-Might Recruits in P2's base", async () => {
    // Expected (828.1.c + Deathknell 808): it dies WHILE Empowered → the dependent Deathknell is live → two Recruit tokens in P2's base.
    // Actual: it goes to the trash and no token is created, no prompt, empty chain.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", NOXIAN_EMISSARY, "victim", { empowered: true })
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.p2.answer("base");
      await game.settle();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    const toks = tokensIn(game.p2.base());
    expect(toks).toHaveLength(2);
    expect(game.state(toks[0]!)).toMatchObject({ isToken: true, might: 1, name: "Recruit" });
  });

  test("resolution-time Might check: P2 responds with Discipline (+2) on the 3-Might target → it is a 5 when Lacerate resolves and survives; both spells hit the trash", async () => {
    const game = await withTarget({ might: 3, name: "Three" }).resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("lac", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lac", "disc"]);
    await game.settle();
    expect(game.state("victim")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("lac")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("'a unit' = any unit: my own units and units in either base are offered too; killing my own 1-Might unit works", async () => {
    const game = await withTarget({ might: 3 }).unit(P1, "base", { might: 1, name: "Mine" }, "mine").unit(P2, "base", { might: 2, name: "Home" }, "home").build();
    const offered = game.p1.option("cast", "lac")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["victim"], ["mine"], ["home"]]));
    expect(offered).toHaveLength(3);
    await game.p1.cast("lac", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["lac", "mine"]);
  });

  test("Deflect 2 (Empowered Solari Sunhawk, 3+1 = 4): with only [order] it cannot be chosen; with 2 spare power it can — pays 2 + order + 2, disempowers to 3, kills it", async () => {
    const poor = await withTarget(SOLARI_SUNHAWK, { empowered: true }).build();
    expect(poor.state("victim")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(poor.state("victim").keywords).toContain("Deflect");
    expect((await poor.p1.try((p) => p.cast("lac", { targets: "victim" }))).ok).toBe(false);
    expect(poor.zoneOf("lac")).toBe("hand");

    const rich = await withTarget(SOLARI_SUNHAWK, { empowered: true }, { energy: 2, power: { order: 1, fury: 2 } }).build();
    await rich.p1.cast("lac", { targets: "victim" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    await rich.settle();
    expect(rich.zoneOf("victim")).toBe("trash");
  });

  test("timing (310.1.a): standard speed — not on the opponent's turn, not during a showdown while holding Focus", async () => {
    const opp = await withTarget({ might: 3 }).active(P2).build();
    expect(opp.p1.can("cast", "lac")).toBe(false);
    const sd = await withTarget({ might: 3 }).battlefield("bf2", { controller: null }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").autoProcedures(false).build();
    await sd.p1.move("scout", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("cast", "lac")).toBe(false);
  });

  test.failing("BUG: no Flow keyword in the def, so the trash copy is never offered — Flow [4][order][order] from the trash: castable, pays exactly 4 + 2 order, kills the 3, then Lacerate is BANISHED", async () => {
    // Expected (829): from the trash it is a Flow play for [4][order][order]; after resolving it goes to banishment.
    // Actual: getSpellFlowCost() finds no Flow keyword → not castable from the trash at all.
    const game = await scenario().resources(P1, { energy: 4, power: { order: 2 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "victim").trash(P1, CARD, "lac").build();
    expect(game.p1.can("cast", "lac")).toBe(true);
    await game.p1.cast("lac", { flow: true, targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("lac")).toBe("banishment");
    expect(game.p1.can("cast", "lac")).toBe(false);
  });

  test("Flow negative space holds either way: the trash copy is NOT castable for the base cost (2 + one order) — Flow needs the full [4][order][order]", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "victim").trash(P1, CARD, "lac").build();
    expect(game.p1.can("cast", "lac")).toBe(false);
    expect((await game.p1.try((p) => p.cast("lac", { flow: true, targets: "victim" }))).ok).toBe(false);
    expect(game.zoneOf("lac")).toBe("trash");
  });
});
