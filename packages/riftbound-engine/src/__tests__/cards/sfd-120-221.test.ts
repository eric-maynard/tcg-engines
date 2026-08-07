/**
 * Sivir, Ambitious — sfd-120-221 · Champion Unit (Sivir) · Body · 6 energy + [body][body][body] · 7 Might
 *
 *   [Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or Ability.)
 *   When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you may
 *   deal that much to an enemy unit.
 *
 * Rules: 809 (Deflect X — spells AND abilities an OPPONENT controls that target her cost X more power,
 * of any domain, as a mandatory additional cost; her controller is untaxed), 465.2.c (the attacker
 * assigns its summed Might among enemy units; "excess" = assigned beyond the defenders' lethal
 * thresholds, summed over all of them), 383.4.c / 469.1 (conquer effect; needs Sivir present),
 * "after an attack" (walking onto an empty battlefield is a conquer without an attack), 383.3.a.3
 * (a later "you may" is decided on resolution), "that much" = the excess amount, "an enemy unit" =
 * any enemy unit anywhere (not just here — the defenders are usually dead).
 *
 * Judge's corner — trickiest situations for this card:
 *  - Threshold arithmetic: 7 into a 2-Might defender = 5 excess (fires, deals 5); 7 into 3 = 4 (nothing);
 *    7 into 1 = 6 (deals 6: a 7-Might unit survives with 6, a 6-Might one dies); 7 into 1+1 = 5 (fires).
 *  - Empty-battlefield conquer, dying in the attack, or winning on defence → never fires.
 *  - "you may": declining deals nothing but the conquer stands.
 *  - Deflect taxes the opponent's targeted ACTIVATED abilities too (Orb of Regret), not only spells;
 *    the extra 2 may be paid with power of any domain; Sivir's own controller pays nothing extra.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-120-221";
const CLEAVE = "ogn-004-298"; // 1-energy Fury spell: "Give a unit [Assault 3] this turn."
const ORB = "ogn-090-298"; // Orb of Regret — gear: [Exhaust]: Give a unit -1 [Might] this turn (min 1).

/** Sivir in P1's base; P2 holds bf1 with the given defenders and keeps a 7-Might and a 5-Might unit at home. */
function raid(...defenders: number[]) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "sivir")
    .unit(P2, "base", { might: 7, name: "BigHome" }, "bighome")
    .unit(P2, "base", { might: 5, name: "MidHome" }, "midhome");
  defenders.forEach((m, i) => b.unit(P2, "bf1", { might: m, name: `Def${i}` }, `def${i}`));
  return b;
}

describe("Sivir, Ambitious (sfd-120-221)", () => {
  test("cost: 6 energy + 3 body; 7-Might champion with Deflect, enters exhausted; 2 body or 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 3 } }).hand(P1, CARD, "sivir").build();
    await game.p1.play("sivir");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.state("sivir")).toMatchObject({ baseMight: 7, isExhausted: true, might: 7 });
    expect(game.state("sivir").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 6, power: { body: 2 } }).hand(P1, CARD, "sivir").build()).p1.can("play", "sivir")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { body: 4 } }).hand(P1, CARD, "sivir").build()).p1.can("play", "sivir")).toBe(false);
  });

  test("[Deflect 2] vs an opponent's spell: not targetable without 2 spare power; with it, the 2 is paid on top of the spell's cost", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "sivir")
      .unit(P2, "base", { might: 3 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    const targets = () => game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets()).toEqual([["theirs"]]);
    await game.p2.do("addResources", { power: { calm: 2 } }); // any domain pays Deflect (809.1.c.1)
    expect(targets()).toEqual(expect.arrayContaining([["sivir"], ["theirs"]]));
    await game.p2.cast("cleave", { targets: "sivir" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("sivir").keywords).toContain("Assault");
  });

  test("[Deflect] never taxes Sivir's own controller", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "sivir").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "sivir" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("sivir").keywords).toContain("Assault");
  });

  test("[Deflect 2] also taxes an opponent's targeted ACTIVATED ability (809.1.c) — Orb of Regret can't pick her without 2 power, and pays it when it does", async () => {
    // Expected: with 0 power P2's Orb cannot choose Sivir; with 2 rainbow it can and the 2 is spent.
    // Actual: the ability targets her freely and no power is deducted.
    const broke = await scenario().active(P2).unit(P1, "base", CARD, "sivir").unit(P1, "base", { might: 3 }, "plain").gear(P2, ORB, "orb").build();
    const offered = broke.p2.option("activate", "orb")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const t = await broke.p2.try((p) => p.activate("orb", 0, { targets: "sivir" }));
    expect(offered.some((o) => JSON.stringify(o).includes("sivir")) && t.ok).toBe(false);

    const rich = await scenario().active(P2).resources(P2, { power: { rainbow: 2 } }).unit(P1, "base", CARD, "sivir").gear(P2, ORB, "orb").build();
    await rich.p2.activate("orb", 0, { targets: "sivir" });
    expect(rich.p2.power()).toBe(0);
    await rich.settle();
    expect(rich.state("sivir").might).toBe(6);
  });

  test("7 into a 2-Might defender (5 excess) → conquer, then 'you may deal that much': 5 damage to ANY enemy unit — MidHome (5) dies", async () => {
    // Expected: opt-in → pick among bighome/midhome (def0 is dead) → 5 damage kills the 5-Might unit.
    // Actual: the prompt appears but the `excess-damage` variable resolves to 0 — nothing is dealt.
    const game = await raid(2).build();
    await game.p1.move("sivir", "bf1");
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" } });
    await game.p1.yes();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["bighome", "midhome"]);
    await game.p1.pick("midhome");
    await game.settle();
    expect(game.zoneOf("midhome")).toBe("trash");
    expect(game.state("bighome").damage).toBe(0);
  });

  test("'that much' scales with the excess: 7 into a 1-Might defender = 6 → BigHome (7) survives with exactly 6 damage", async () => {
    const game = await raid(1).build();
    await game.p1.move("sivir", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.p1.pick("bighome");
    await game.settle();
    expect(game.zoneOf("bighome")).toBe("base");
    expect(game.state("bighome").damage).toBe(6);
  });

  test("excess is summed over all defenders: 7 into two 1-Might units = 5 excess → 5 damage kills MidHome", async () => {
    const game = await raid(1, 1).build();
    await game.p1.move("sivir", "bf1");
    // First-option policy: answers any damage-assignment prompt, accepts the opt-in, picks bighome (listed first).
    await game.settle({ policy: "first" });
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.zoneOf("def1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("bighome").damage).toBe(5);
    expect(game.zoneOf("midhome")).toBe("base");
  });

  test("below the threshold — 7 into a 3-Might defender is only 4 excess: conquer point, but NO prompt and no damage", async () => {
    // Expected: straight back to P1's main phase after the conquer. Actual: the condition is not
    // evaluated (hand-authored as a unit count), so the opt-in is offered on every conquer.
    const game = await raid(3).build();
    await game.p1.move("sivir", "bf1");
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'after an attack' — walking onto an EMPTY enemy battlefield conquers (1 point) but there was no attack and 0 excess: no prompt", async () => {
    const game = await raid().build();
    await game.p1.move("sivir", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'you may': declining after a 5-excess conquer deals nothing; the conquer and its point stand", async () => {
    const game = await raid(2).build();
    await game.p1.move("sivir", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("bighome").damage).toBe(0);
    expect(game.zoneOf("midhome")).toBe("base");
  });

  test("no conquer, no trigger: dying into an 8-Might defender, or winning as the DEFENDER, asks nothing", async () => {
    const dies = await raid(8).build();
    await dies.p1.move("sivir", "bf1");
    await dies.settle();
    expect(dies.zoneOf("sivir")).toBe("trash");
    expect(dies.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(dies.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const defends = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "sivir")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 5, name: "MidHome" }, "midhome")
      .build();
    await defends.p2.move("raider", "bf1"); // 7 assigned to a 1-Might attacker = 6 "excess", but no conquer
    await defends.settle();
    expect(defends.zoneOf("raider")).toBe("trash");
    expect(defends.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(defends.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(defends.state("midhome").damage).toBe(0);
  });

  test("ability payload shape — Deflect 2 + optional self-conquer trigger gated on 'after an attack' and '≥5 excess damage', dealing a variable amount to an enemy unit", async () => {
    // Actual: hand-authored condition is `count` of units with keyword "excess-damage" (a unit count, not
    // a damage amount) and the trigger carries no "after an attack" qualifier.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 6, isChampion: true, might: 7, tags: ["Sivir"] });
    expect(def?.powerCost).toEqual(["body", "body", "body"]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Deflect", type: "keyword", value: 2 });
    expect(abilities[1]).toMatchObject({
      effect: { target: { controller: "enemy", type: "unit" }, type: "damage" },
      optional: true,
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
    const trig = abilities[1] as { condition?: { type?: string; comparison?: unknown }; effect?: { amount?: unknown }; trigger?: unknown };
    expect(typeof trig.effect?.amount).toBe("object"); // a variable, not a literal
    expect(JSON.stringify(trig.condition)).toContain("5");
    expect(trig.condition?.type).not.toBe("count"); // excess DAMAGE, not a count of units
    expect(JSON.stringify(trig.trigger)).toMatch(/attack/i); // "after an attack"
  });
});
