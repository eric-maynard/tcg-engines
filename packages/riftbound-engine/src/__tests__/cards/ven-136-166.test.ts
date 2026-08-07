/**
 * Ambessa, Respected and Feared — ven-136-166 · Champion Unit (Ambessa) · Order · 5 energy · 5 Might
 *
 *   [Empower] [1][order][order] ([1][order][order]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have [Assault 2]. (+2 [Might] while I'm an attacker.)
 *   [Empowered][>] When I attack, kill an enemy unit here with less Might than me.
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. 827.1.c.1 — [Empower] is an activated chain ability costing exactly 1 energy + 2 ORDER power (an
 *     off-domain pip cannot stand in), your turn / Open state only, off once Empowered.
 *  2. 828.1.c — BOTH dependent abilities are dead text while she is plain: no Assault (5 on attack) and,
 *     crucially, NO attack trigger at all. Empowered: Assault 2 counts only while she is an ATTACKER
 *     (719) — 5 in base / as a defender, 7 when she attacks.
 *  3. "less Might than me" is compared against her CURRENT Might as the trigger resolves — as an attacker
 *     that is 7: a 6 dies, a 7 (equal) or an 8 must not; the kill happens BEFORE combat damage, so killing
 *     the lone defender hands her the battlefield without a fight.
 *  4. It is a mandatory ("kill", no "may") targeted trigger scoped to HERE: enemies at other battlefields
 *     or in a base are never candidates; with two smaller enemies here she picks one; with none smaller
 *     the trigger does nothing and combat proceeds normally.
 *  5. Timing — the trigger is a chain item inside the showdown: the defender may respond (Discipline +2
 *     lifting a 6 to 8) and the re-check on resolution must then spare it. "When I attack" never fires
 *     when she DEFENDS.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-136-166";
const DISCIPLINE = "ogn-058-298"; // Calm Reaction, 2: Give a unit +2 Might this turn. Draw 1.

/** Empowered Ambessa in P1's base; P2 holds bf1 with the given defenders (alias → might). */
function attackBoard(defenders: Record<string, number>, empowered = true) {
  const b = scenario().battlefield("bf1", { controller: P2 }).battlefield("bf2", { controller: P2 });
  for (const [alias, might] of Object.entries(defenders)) {
    b.unit(P2, "bf1", { might, name: alias }, alias);
  }
  return b.unit(P2, "bf2", { might: 1, name: "Far" }, "far").unit(P2, "base", { might: 1, name: "Home" }, "home").unit(P1, "base", CARD, "amb", empowered ? { empowered: true } : undefined);
}

/** Attack bf1 with Ambessa and let everything (trigger, forced picks, combat) resolve. */
async function attack(game: Game): Promise<void> {
  await game.p1.move("amb", "bf1");
  await game.settle();
}

describe("Ambessa, Respected and Feared (ven-136-166)", () => {
  test("registry payload: activated {1 + order,order} empower-self; while-empowered Assault 2 grant; while-empowered attack trigger that kills an ENEMY unit HERE", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, isChampion: true, might: 5, tags: ["Ambessa"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toMatchObject({
      cost: { energy: 1, power: ["order", "order"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(abilities[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { keyword: "Assault", type: "grant-keyword", value: 2 },
      type: "static",
    });
    expect(abilities[2]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { target: { controller: "enemy", location: "here", type: "unit" }, type: "kill" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
    expect(abilities[2].optional).not.toBe(true); // "kill", not "you may kill"
  });

  test("registry payload — the kill target must carry the 'with less Might than me' restriction", async () => {
    // Expected: the target descriptor compares the candidate's Might (<) against the source's Might.
    // Actual: target = { type: "unit", controller: "enemy", location: "here" } — any enemy here qualifies.
    const def = (await loadDefaultCardPool()).get(CARD);
    const kill = JSON.stringify(((def?.abilities ?? []) as Record<string, unknown>[])[2]);
    expect(kill).toMatch(/less|"lt"|lessThan|source-might|self-might|mightLessThan/i);
  });

  test("[Empower] costs exactly 1 energy + 2 ORDER power, is a non-triggered chain item, and resolves into Empowered with Assault 2 (still 5 Might in base)", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 1, order: 2 } }).unit(P1, "base", CARD, "amb").build();
    expect(game.state("amb").keywords).not.toContain("Assault");
    await game.p1.activate("amb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "amb", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("amb")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("amb").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
    expect(game.p1.can("activate", "amb")).toBe(false);
  });

  test("negative space — [Empower] is not offered with 1 order + off-domain power, with 0 energy, when already Empowered, or on the opponent's turn", async () => {
    expect((await scenario().resources(P1, { energy: 1, power: { fury: 3, order: 1 } }).unit(P1, "base", CARD, "amb").build()).p1.can("activate", "amb")).toBe(false);
    expect((await scenario().resources(P1, { energy: 0, power: { order: 3 } }).unit(P1, "base", CARD, "amb").build()).p1.can("activate", "amb")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { order: 2 } }).unit(P1, "base", CARD, "amb", { empowered: true }).build()).p1.can("activate", "amb")).toBe(false);
    expect((await scenario().active(P2).resources(P1, { energy: 1, power: { order: 2 } }).unit(P1, "base", CARD, "amb").build()).p1.can("activate", "amb")).toBe(false);
  });

  test("cost to play: 5 energy, no power; enters exhausted, plain (no Assault); 4 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "amb").build();
    await game.p1.play("amb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("amb")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 5, zone: "base" });
    expect(game.state("amb").keywords).toEqual([]);
    expect((await scenario().resources(P1, { energy: 4, power: { order: 3 } }).hand(P1, CARD, "amb").build()).p1.can("play", "amb")).toBe(false);
  });

  test("PLAIN Ambessa attacking: no trigger goes on the chain and no Assault — 5 vs 4 kills the defender by combat damage only", async () => {
    const game = await attackBoard({ small: 4 }, false).build();
    await game.p1.move("amb", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("amb")).toMatchObject({ combatRole: "attacker", might: 5 });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    // 143.3.b.2 — combat damage is healed in the Combat Cleanup, so she stands at bf1 unmarked.
    expect(game.state("amb")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.points()).toBe(1);
  });

  test("EMPOWERED attack: she is 7 as an attacker, the trigger is a chain item, and a lone 6-Might defender is killed BEFORE combat — she conquers without a fight", async () => {
    const game = await attackBoard({ six: 6 }).build();
    await game.p1.move("amb", "bf1");
    expect(game.state("amb")).toMatchObject({ combatRole: "attacker", might: 7 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "amb", controller: P1, triggered: true })]);
    expect(game.zoneOf("six")).toBe("battlefield-bf1"); // nothing dies before resolution
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.state("amb")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // "here" only: the enemies at bf2 and in base were never touched.
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("two smaller enemies here: she must pick exactly one to kill (only units HERE are offered), then fights the other — 7 vs 3 → conquers", async () => {
    const game = await attackBoard({ four: 4, three: 3 }).build();
    await game.p1.move("amb", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect([...offered].sort()).toEqual(["four", "three"]);
    await game.p1.pick("four");
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.zoneOf("three")).toBe("trash"); // combat damage
    expect(game.zoneOf("amb")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'less Might than me' — with a 4 and an 8 here only the 4 is a legal kill; the 8 survives the trigger and then wins the combat (7 vs 8)", async () => {
    // Expected: forced single candidate (small) → killed; big (8) stays; combat 7 v 8 → Ambessa dies, big takes 7 (survives), no conquer.
    // Actual: the prompt offers BOTH small and big — the Might comparison is not applied.
    const game = await attackBoard({ big: 8, small: 4 }).build();
    await attack(game);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).not.toContain("big");
      await game.p1.pick("small");
      await game.settle();
    }
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("amb")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("EQUAL Might is not 'less' — a 7-Might defender is not killed by the trigger; the 7-vs-7 combat then trades both units and nobody scores", async () => {
    // Actual: the 7 is killed by the trigger and Ambessa conquers an empty battlefield.
    const game = await attackBoard({ seven: 7 }).build();
    await attack(game);
    if (game.decision()?.kind === "pick") {
      expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).not.toContain("seven");
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("amb")).toBe("trash");
    expect(game.zoneOf("seven")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    // rule 466.5.b — both sides wiped: no units remain here, so the battlefield becomes Uncontrolled.
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
  });

  test("the defender may respond — Discipline lifts the lone 6 to 8 while the trigger is on the chain; on resolution it is no longer 'less than me' and survives, then beats her 8 vs 7", async () => {
    // Actual: the re-check never happens (no Might filter) — the 8 is killed anyway and she conquers.
    const game = await attackBoard({ six: 6 }).resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.move("amb", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "six" });
    expect(game.chain()).toHaveLength(2);
    await game.settle(); // Discipline resolves first (LIFO) → six is 8 → trigger resolves → combat
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.has("six") && game.zoneOf("six")).toBe("battlefield-bf1");
    expect(game.zoneOf("amb")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("'When I ATTACK' — as a DEFENDER nothing triggers and Assault does not apply: a 6-Might attacker kills the Empowered (5) Ambessa", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "amb", { empowered: true })
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("amb")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("amb")).toBe("trash"); // 6 ≥ 5: no Assault on defence
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // took 5 < 6, healed in the Combat Cleanup (143.3.b.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("multi-step: Empower in base (1 + order,order) → same turn attack a lone 6 → trigger kills it → conquer; next turn she is still Empowered (5 in base-might terms) and [Empower] stays off", async () => {
    const game = await attackBoard({ six: 6 }, false).resources(P1, { energy: 1, power: { order: 2 } }).build();
    await game.p1.activate("amb");
    await game.settle();
    expect(game.state("amb")).toMatchObject({ isEmpowered: true, isReady: true });
    await attack(game);
    expect(game.zoneOf("six")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("amb")).toMatchObject({ combatRole: null, isEmpowered: true, might: 5, zone: "battlefield-bf1" });
    await game.p1.do("addResources", { energy: 1, power: { order: 2 } });
    expect(game.p1.can("activate", "amb")).toBe(false);
  });
});
