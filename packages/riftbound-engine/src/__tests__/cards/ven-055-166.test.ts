/**
 * Applied Researchers — ven-055-166 · Unit · Mind · 4 energy · 4 Might
 *
 *   [Empower] [3] ([3]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] Your spells cost [1][rainbow] less, to a minimum of [1].
 *
 * Head-judge checklist for this card:
 *   1. rule 827.1.c.1 / 145.2 — [Empower] [3] is an ACTIVATED ability of a unit: "[3]: Empower me. Use
 *      only if not Empowered." It uses the chain (377), only in my Main Phase open state (not on the
 *      opponent's turn, not in a showdown), and is not offered again once Empowered (441.1.b).
 *   2. The discount is gated on the Empowered STATE: nothing before empowering; and since no rule
 *      disempowers at end of turn, it keeps working on later turns.
 *   3. "[1][rainbow] less": 1 energy AND one power pip of ANY domain (rainbow) — a fury-cost spell's
 *      pip is waived too; a two-pip spell keeps one pip.
 *   4. rule 356.4.e "to a minimum of [1]": the energy floor is 1 (a 1-cost spell still costs 1, and its
 *      pip is still waived); with Eager Apprentice each discount's minimum binds only itself: 3 → 1,
 *      but 2 → 1 (never 0).
 *   5. rule 356.1.a → 356.4: an alternate "for [cost]" (Flow) is discounted as well: Perfect
 *      Execution's Flow [3][fury] becomes [2].
 *   6. Scope: YOUR spells only — not the opponent's spells, not your units.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-055-166";
const EAGER_APPRENTICE = "ogn-084-298"; // at a battlefield: your spells' energy cost −1, min 1
const PERFECT_EXECUTION = "ven-012-166"; // 3+[fury] spell with [Flow] [3][fury]

/** Inline [Action] "Draw 1" spells so the printed cost is the only variable. */
const spell = (energyCost: number, powerCost: string[] = []) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost,
  name: `Draw ${energyCost}${powerCost.map((p) => `+${p}`).join("")}`,
  powerCost,
  timing: "action",
});

function empowered(pool: { energy?: number; power?: Record<string, number> }) {
  return scenario().resources(P1, pool).unit(P1, "base", CARD, "ar", { empowered: true });
}

describe("Applied Researchers (ven-055-166)", () => {
  test("registry payload: activated Empower [3] (not-empowered restriction) + while-empowered cost-reduction static on friendly spells", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 4 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { energy: 3 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { target: { controller: "friendly", type: "spell" }, type: "cost-reduction" },
      type: "static",
    });
    const eff = (def?.abilities?.[1] as { effect: { by: string; minimum: string } }).effect;
    expect(eff.by).toMatch(/energy_1/);
    expect(eff.by).toMatch(/rainbow/);
    expect(eff.minimum).toMatch(/energy_1/);
  });

  test("cost: 4 energy for a 4-Might unit that is NOT empowered on entry; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ar").build();
    await game.p1.play("ar");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ar")).toBe("base");
    expect(game.state("ar")).toMatchObject({ isEmpowered: false, might: 4 });
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ar").build()).p1.can("play", "ar")).toBe(false);
  });

  test("[Empower] [3]: pays 3, goes on the chain (opponent gets priority), resolves → Empowered; then no longer offered (441.1.b)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", CARD, "ar").build();
    expect(game.p1.can("activate", "ar")).toBe(true);
    await game.p1.activate("ar");
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ar", controller: P1, triggered: false })]);
    expect(game.state("ar").isEmpowered).toBe(false); // not until it resolves
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(game.state("ar").isExhausted).toBe(false); // no exhaust in the cost
    await game.p1.do("addResources", { energy: 3 });
    expect(game.p1.can("activate", "ar")).toBe(false);
  });

  test("Empower is unaffordable at 2 energy, and (rule 145.2) unusable on the opponent's turn or during a showdown", async () => {
    expect((await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ar").build()).p1.can("activate", "ar")).toBe(false);
    const opp = await scenario().active(P2).resources(P1, { energy: 6 }).unit(P1, "base", CARD, "ar").build();
    expect(opp.p1.can("activate", "ar")).toBe(false);
    const sd = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "ar")
      .unit(P1, "base", { might: 1 }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "ar")).toBe(false);
  });

  test("NOT empowered: no discount — a 3+[mind] spell needs the full 3 energy and the mind pip", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", CARD, "ar").hand(P1, spell(3, ["mind"]), "s").build();
    expect(game.p1.can("cast", "s")).toBe(false);
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.cast("s");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("Empowered: a 3+[mind] spell costs 2 energy and NO pip", async () => {
    const game = await empowered({ energy: 2 }).hand(P1, spell(3, ["mind"]), "s").build();
    expect(game.p1.can("cast", "s")).toBe(true);
    await game.p1.cast("s");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("s")).toBe("trash");
  });

  test("[rainbow] waives a pip of ANY domain (2+[fury] → 1); a two-pip spell keeps one pip (3+[calm][calm] → 2+[calm])", async () => {
    const fury = await empowered({ energy: 1 }).hand(P1, spell(2, ["fury"]), "s").build();
    await fury.p1.cast("s");
    expect(fury.p1.resources()).toEqual({ energy: 0, power: {} });

    const onePip = await empowered({ energy: 2, power: { calm: 1 } }).hand(P1, spell(3, ["calm", "calm"]), "s").build();
    await onePip.p1.cast("s");
    expect(onePip.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const noPip = await empowered({ energy: 3 }).hand(P1, spell(3, ["calm", "calm"]), "s").build();
    expect(noPip.p1.can("cast", "s")).toBe(false);
  });

  test("'to a minimum of [1]': a 1+[mind] spell still costs 1 energy (pip waived); a plain 1-cost spell costs 1; 0 energy cannot cast either", async () => {
    const a = await empowered({ energy: 1 }).hand(P1, spell(1, ["mind"]), "s").build();
    await a.p1.cast("s");
    expect(a.p1.resources()).toEqual({ energy: 0, power: {} });
    const b = await empowered({ energy: 1 }).hand(P1, spell(1), "s").build();
    await b.p1.cast("s");
    expect(b.p1.energy()).toBe(0);
    const broke = await empowered({ energy: 0, power: { mind: 3 } }).hand(P1, spell(1, ["mind"]), "s").hand(P1, spell(1), "t").build();
    expect(broke.p1.can("cast", "s")).toBe(false);
    expect(broke.p1.can("cast", "t")).toBe(false);
  });

  test("scope: the OPPONENT's spells are not discounted, and my UNITS are not discounted", async () => {
    const opp = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", CARD, "ar", { empowered: true })
      .hand(P2, spell(3, ["mind"]), "theirs")
      .build();
    expect(opp.p2.can("cast", "theirs")).toBe(false);
    await opp.p2.do("addResources", { energy: 1 });
    await opp.p2.cast("theirs");
    expect(opp.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });

    const unit = await empowered({ energy: 2 }).hand(P1, { cardType: "unit", domain: "mind", energyCost: 3, might: 2, name: "Lab Intern", powerCost: ["mind"] }, "u").build();
    expect(unit.p1.can("play", "u")).toBe(false);
  });

  test("Empowered persists across turns (nothing disempowers at end of turn) — the discount still applies on my next turn", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "ar").hand(P1, spell(3, ["mind"]), "s").build();
    await game.p1.activate("ar");
    await game.settle();
    expect(game.state("ar").isEmpowered).toBe(true);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (channels 2 runes, pool starts empty)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(game.p1.can("cast", "s")).toBe(false); // 0 energy floating
    await game.p1.tapRunes(2);
    expect(game.p1.resources().energy).toBe(2);
    await game.p1.cast("s"); // 3+[mind] for exactly 2 energy, no pip
    expect(game.p1.energy()).toBe(0);
  });

  test("rule 356.4.e with Eager Apprentice at a battlefield: 3-cost → 1 (each floor binds only its own discount) but 2-cost → 1, never 0", async () => {
    const three = await empowered({ energy: 1 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", EAGER_APPRENTICE, "ea").hand(P1, spell(3), "s").build();
    expect(three.p1.can("cast", "s")).toBe(true);
    await three.p1.cast("s");
    expect(three.p1.energy()).toBe(0);

    const two = await empowered({ energy: 1 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", EAGER_APPRENTICE, "ea").hand(P1, spell(2), "s").build();
    await two.p1.cast("s");
    expect(two.p1.energy()).toBe(0); // paid 1, not 0
    const zero = await empowered({ energy: 0 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", EAGER_APPRENTICE, "ea").hand(P1, spell(2), "s").build();
    expect(zero.p1.can("cast", "s")).toBe(false);
  });

  test("rule 356.1.a → 356.4: a Flow play is 'my spell' too — Perfect Execution Flows from the trash for [2] instead of [3][fury]", async () => {
    const game = await empowered({ energy: 2 })
      .unit(P1, "base", { might: 3 }, "ally", { exhausted: true })
      .trash(P1, PERFECT_EXECUTION, "pe")
      .build();
    expect(game.p1.can("cast", "pe")).toBe(true);
    await game.p1.cast("pe", { flow: true, targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
    expect(game.zoneOf("pe")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
