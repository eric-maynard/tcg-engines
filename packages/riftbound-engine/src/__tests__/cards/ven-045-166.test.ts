/**
 * Helm of Suppression — ven-045-166 · Gear · Calm · 4 energy + [calm]
 *
 *   [Empower] [4][calm] ([4][calm]: Empower this. Use only if not Empowered.)
 *   Opponents' spells cost [1] more. If this is [Empowered], they cost [1][rainbow] more instead.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. 356.3 — a static cost INCREASE on opponents' SPELLS only: their units/gear are untouched, and the
 *      Helm's controller is never taxed. Affordability must include the tax (1-energy Cleave needs 2).
 *   2. "instead" — Empowered replaces the tax with [1][rainbow] (1 energy + 1 power of any domain); it is
 *      NOT cumulative (+2 energy is wrong, +1 energy alone is no longer enough).
 *   3. 827/151.2 — Empower on a GEAR is an activated ability: own turn, Neutral Open only; costs exactly
 *      4 energy + 1 calm; illegal once Empowered; the state persists across turns (441.1.a).
 *   4. Stacking: two Helms tax +2; an Empowered Helm plus a Deflect unit (Serene Ascetic) makes an enemy
 *      Cleave on her cost 2 energy + 2 power.
 *   5. Gear enters the base ready (only units enter exhausted) and the Helm itself is not Empowered on entry.
 *   6. Parser: only the Empower ability is in the payload — the cost-increase static is missing entirely.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-045-166";
const CLEAVE = "ogn-004-298"; // Fury Action, 1 energy: "Give a unit [Assault 3] this turn."
const ASCETIC = "ven-030-166"; // Serene Ascetic — [Empowered] I have [Deflect] and [Shield 3]

/** P2 to act holding Cleave with the given pool and a unit to aim at; P1 has a Helm (optionally Empowered). */
function p2Casts(pool: { energy: number; power?: Record<string, number> }, empowered: boolean) {
  return scenario()
    .active(P2)
    .resources(P2, pool)
    .gear(P1, CARD, "helm", empowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .hand(P2, CLEAVE, "cleave");
}

describe("Helm of Suppression (ven-045-166)", () => {
  test("costs 4 energy + 1 calm; enters the base as ready, un-Empowered gear; 3+[calm] or 4 without calm is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "helm").build();
    await game.p1.play("helm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("helm")).toMatchObject({ cardType: "gear", isEmpowered: false, isExhausted: false, zone: "base" });
    expect(game.p1.gear()).toEqual(["helm"]);
    expect((await scenario().resources(P1, { energy: 3, power: { calm: 2 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
  });

  test("[Empower] [4][calm]: pays exactly 4 energy + 1 calm, resolves off the chain, and the Helm is Empowered; the ability is then gone ('only if not Empowered')", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 2 } }).gear(P1, CARD, "helm").build();
    await game.p1.activate("helm");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    await game.settle();
    expect(game.state("helm").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "helm")).toBe(false);
    // scenario-placed already-Empowered Helm: same answer, nothing spent on a refused attempt
    const done = await scenario().resources(P1, { energy: 9, power: { calm: 3 } }).gear(P1, CARD, "helm", { empowered: true }).build();
    expect((await done.p1.try((p) => p.activate("helm", 0))).ok).toBe(false);
    expect(done.p1.resources()).toEqual({ energy: 9, power: { calm: 3 } });
  });

  test("Empower is unaffordable with 4 energy but no calm (other power does not substitute) or with 3 energy + calm; and it is not usable on P2's turn (151.2)", async () => {
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 3 } }).gear(P1, CARD, "helm").build()).p1.can("activate", "helm")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { calm: 3 } }).gear(P1, CARD, "helm").build()).p1.can("activate", "helm")).toBe(false);
    const p2turn = await scenario().active(P2).resources(P1, { energy: 4, power: { calm: 1 } }).gear(P1, CARD, "helm").build();
    expect(p2turn.p1.can("activate", "helm")).toBe(false);
  });

  test("un-Empowered Helm — opponents' spells cost [1] more: P2 cannot cast a 1-energy Cleave on exactly 1 energy", async () => {
    // Expected: Cleave costs 2 for P2 → not legal at 1 energy. Actual: the static is not parsed; Cleave is castable for 1.
    const game = await p2Casts({ energy: 1 }, false).build();
    expect(game.p2.can("cast", "cleave")).toBe(false);
    expect((await game.p2.try((p) => p.cast("cleave", { targets: "theirs" }))).ok).toBe(false);
  });

  test("un-Empowered Helm — with 2 energy P2's Cleave is legal and drains BOTH energy (1 printed + 1 tax)", async () => {
    // Expected: pool 2 → 0. Actual: 2 → 1 (no tax applied).
    const game = await p2Casts({ energy: 2 }, false).build();
    await game.p2.cast("cleave", { targets: "theirs" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("theirs").keywords).toContain("Assault"); // the spell itself works normally
  });

  test("Empowered Helm — [1][rainbow] more INSTEAD: 2 energy alone (or even 3) is not enough; 2 energy + 1 power of any domain is, and all of it is spent", async () => {
    // Expected: Cleave costs 2 energy + 1 any-power. Actual: no tax at all — castable for 1 energy.
    const noPower = await p2Casts({ energy: 2 }, true).build();
    expect(noPower.p2.can("cast", "cleave")).toBe(false);
    const threeEnergy = await p2Casts({ energy: 3 }, true).build();
    expect(threeEnergy.p2.can("cast", "cleave")).toBe(false); // "instead": energy cannot stand in for the [rainbow]
    const paid = await p2Casts({ energy: 2, power: { fury: 1 } }, true).build();
    await paid.p2.cast("cleave", { targets: "theirs" });
    expect(paid.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("the Helm never taxes its controller: P1 casts Cleave for exactly 1 energy with an Empowered Helm on board", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, CARD, "helm", { empowered: true }).unit(P1, "base", { might: 2 }, "mine").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "mine" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mine").keywords).toContain("Assault");
  });

  test("only SPELLS are taxed: with an Empowered Helm out, P2 still plays a 2-cost unit for exactly 2 energy and no power", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 2 }).gear(P1, CARD, "helm", { empowered: true }).hand(P2, { might: 2, energyCost: 2, name: "Grunt" }, "grunt").build();
    expect(game.p2.can("play", "grunt")).toBe(true);
    await game.p2.play("grunt");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
  });

  test("two un-Empowered Helms stack — P2's Cleave costs 3 (1 + 1 + 1): illegal at 2 energy, drains 3", async () => {
    // Expected: each Helm is its own static (+1 each). Actual: no tax.
    const two = await p2Casts({ energy: 2 }, false).gear(P1, CARD, "helm2").build();
    expect(two.p2.can("cast", "cleave")).toBe(false);
    const three = await p2Casts({ energy: 3 }, false).gear(P1, CARD, "helm2").build();
    await three.p2.cast("cleave", { targets: "theirs" });
    expect(three.p2.energy()).toBe(0);
  });

  test("Empowered Helm + Empowered Serene Ascetic (Deflect): P2 choosing her with Cleave owes 1+1 energy and 1+1 power — 2 energy + 1 power is refused, 2 + 2 gets through and is fully spent", async () => {
    // Expected: Helm tax [1][rainbow] + Deflect [rainbow] on top of Cleave's [1]. Actual: only Deflect is charged (1 energy + 1 power).
    const short = await scenario().active(P2).resources(P2, { energy: 2, power: { fury: 1 } }).gear(P1, CARD, "helm", { empowered: true }).unit(P1, "base", ASCETIC, "asc", { empowered: true }).hand(P2, CLEAVE, "cleave").build();
    expect(short.state("asc").keywords).toContain("Deflect");
    expect((await short.p2.try((p) => p.cast("cleave", { targets: "asc" }))).ok).toBe(false);
    const enough = await scenario().active(P2).resources(P2, { energy: 2, power: { fury: 2 } }).gear(P1, CARD, "helm", { empowered: true }).unit(P1, "base", ASCETIC, "asc", { empowered: true }).hand(P2, CLEAVE, "cleave").build();
    await enough.p2.cast("cleave", { targets: "asc" });
    expect(enough.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Empowered persists across turns (441.1.a): Empower now, and two turn-advances later the Helm is still Empowered and the ability still unavailable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).gear(P1, CARD, "helm").build();
    await game.p1.activate("helm");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("helm").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("helm")).toMatchObject({ isEmpowered: true, zone: "base" });
    expect(game.p1.can("activate", "helm")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("registry payload — the [4][calm] self-Empower PLUS a static cost-increase on enemy spells (+[1], or +[1][rainbow] while Empowered); today only the Empower ability is present", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "calm", energyCost: 4, name: "Helm of Suppression", powerCost: ["calm"] });
    const abilities = (def?.abilities ?? []) as { type?: string; effect?: { type?: string } }[];
    expect(abilities[0]).toEqual({ cost: { energy: 4, power: ["calm"] }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
    const statics = abilities.filter((a) => a.type === "static");
    expect(statics.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(statics)).toContain("cost-increase");
    expect(JSON.stringify(statics)).toContain("enemy");
  });
});
