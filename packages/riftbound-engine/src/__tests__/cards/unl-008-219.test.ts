/**
 * Towering Pairofant — unl-008-219 · Unit · Fury · 6 energy (no power) · 6 Might
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   If a unit died this turn, I enter ready.
 *
 * Rules: 803 (Assault N: +N Might only while holding the Attacker designation), 143.4 (units
 * enter exhausted) + 364.3.a/369.3 (a conditional "I enter ready" replaces HOW it enters — it is
 * checked once, as it enters; nothing later readies it), 418 (Die = killed → owner's trash; ANY
 * unit counts — friendly, enemy, token), 317 ("this turn" = the current turn only), 465/466
 * (combat: attacker's summed Might vs defender's; lethal = damage ≥ Might; both can die).
 *
 * Head-judge corner cases for THIS card:
 *  1. Baseline: nobody died this turn → enters EXHAUSTED, and a death later in the same turn does
 *     not retroactively ready it (enter-replacement, not a trigger).
 *  2. "a unit": an ENEMY death (spell kill), a FRIENDLY death (my own unit), and a COMBAT death
 *     earlier this turn all satisfy it.
 *  3. "this turn": a death on the previous turn (mine or theirs) has expired by my next turn.
 *  4. Assault only on offence: attacking a 7-Might defender it hits for 7 (trade); defending
 *     against a 7-Might attacker it hits for only 6 (attacker survives).
 *  5. The tempo line: kill something, drop Pairofant READY, attack immediately the same turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-008-219";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.

/** P1: 7 energy + 1 fury, Pairofant + Hextech Ray in hand; bf1 (P2): Foe 3; bf2 (P1): Ally 2. */
function board(energy = 7) {
  return scenario()
    .resources(P1, { energy, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, CARD, "pf");
}

describe("Towering Pairofant (unl-008-219)", () => {
  test("costs 6 energy (no power); a 6-Might unit with printed Assault; 5 energy is not enough", async () => {
    const game = await board(6).build();
    await game.p1.play("pf", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("pf")).toBe("base");
    expect(game.state("pf")).toMatchObject({ baseMight: 6, might: 6 });
    expect(game.state("pf").keywords).toContain("Assault");
    expect(game.chain()).toHaveLength(0); // no play trigger of any kind
    expect((await board(5).build()).p1.can("play", "pf")).toBe(false);
  });

  test("no unit died this turn → enters EXHAUSTED (143.4); a death LATER this turn does not retroactively ready it (enter-replacement, checked once — 364.3.a)", async () => {
    const game = await board(7).build();
    await game.p1.play("pf", { to: "base" });
    await game.settle();
    expect(game.state("pf").isExhausted).toBe(true);
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("pf").isExhausted).toBe(true);
  });

  test("an ENEMY unit died this turn (Hextech Ray kills the 3-Might Foe) → Pairofant enters READY", async () => {
    const game = await board(7).build();
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    await game.p1.play("pf", { to: "base" });
    await game.settle();
    expect(game.state("pf").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'a unit' includes MY OWN: Hextech Ray on my 2-Might Ally kills it → Pairofant enters ready", async () => {
    const game = await board(7).build();
    await game.p1.cast("ray", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    await game.p1.play("pf", { to: "base" });
    await game.settle();
    expect(game.state("pf").isReady).toBe(true);
  });

  test("a COMBAT death earlier this turn counts: Ally charges into Foe and dies, then Pairofant enters ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "pf")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // 2 damage < 3 Might
    await game.p1.play("pf");
    await game.settle();
    expect(game.state("pf").isReady).toBe(true);
  });

  test("'this turn' expires (317): Foe died on my PREVIOUS turn — a Pairofant played on my next turn enters exhausted", async () => {
    const game = await board(7).runes(P1, "fury", 4).build();
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.tapRunes(6);
    await game.p1.play("pf", { to: "base" });
    await game.settle();
    expect(game.zoneOf("pf")).toBe("base");
    expect(game.state("pf").isExhausted).toBe(true);
  });

  test("the tempo line + Assault: after Foe dies, Pairofant drops READY and attacks a 7-Might Wall the same turn — 6+1 = 7 is lethal to the Wall, and 7 back is lethal to Pairofant (trade)", async () => {
    const game = await board(7).unit(P2, "bf1", { might: 7, name: "Wall" }, "wall").build();
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    await game.p1.play("pf", { to: "base" });
    await game.settle();
    expect(game.state("pf").isReady).toBe(true);
    await game.p1.move("pf", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("pf")).toMatchObject({ combatRole: "attacker", might: 7 });
    expect(game.state("wall").might).toBe(7);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // without Assault (6 < 7) the Wall would have lived
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("Assault is offence-only: DEFENDING against a 7-Might attacker Pairofant deals just 6 (< 7) — the attacker survives (healed by the combat cleanup), Pairofant dies, bf2 falls", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", CARD, "pf")
      .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf2");
    expect(game.state("pf")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf2");
    expect(game.state("bruiser").damage).toBe(0); // 466.1.a.1 — 6 was marked (non-lethal vs 7), then healed
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("Assault also raises the lethal bar while attacking: into a 6-Might Mirror it deals 7 (kill) and the 6 coming back is NOT lethal to a 7-Might attacker → survives, is healed by the combat cleanup (466.1.a.1) BEFORE Assault drops (466.7.a), conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Mirror" }, "mirror")
      .unit(P1, "base", CARD, "pf")
      .build();
    await game.p1.move("pf", "bf1");
    expect(game.state("pf").might).toBe(7);
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    expect(game.zoneOf("pf")).toBe("battlefield-bf1");
    expect(game.state("pf")).toMatchObject({ combatRole: null, damage: 0, might: 6 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    expect(game.zoneOf("pf")).toBe("battlefield-bf1"); // still alive after end-of-turn processing
  });

  test("parsed abilities: Assault 1 + a static enter-ready(self) gated on 'a unit died this turn' (either side — never narrowed to enemy/friendly)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 6, might: 6 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Assault", type: "keyword", value: 1 });
    const enterReady = def?.abilities?.[1] as { type: string; effect: unknown; condition: { type: string; text?: string } };
    expect(enterReady).toMatchObject({ effect: { target: "self", type: "enter-ready" }, type: "static" });
    // The gate is either a structured death check or the verbatim printed clause the engine keys on.
    if (enterReady.condition.type === "custom") {
      expect(enterReady.condition.text).toBe("If a unit died this turn");
    } else {
      expect(JSON.stringify(enterReady.condition)).toMatch(/die|death/i);
      expect(JSON.stringify(enterReady.condition)).not.toMatch(/enemy-died"|friendly-died"/);
    }
  });
});
