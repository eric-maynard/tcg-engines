/**
 * Morgana, Vindictive — ven-017-166 · Champion Unit (Morgana) · Fury · 5 energy + [fury] · 5 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play me, deal damage to a unit equal to the damage marked on it.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. 822.1.b — Ambush is TWO permissions: an extra LOCATION (any battlefield where you control units,
 *      even one you don't control / are attacking) and [Reaction] TIMING only while being played there.
 *      In a Reaction window the base and unit-less battlefields are NOT legal destinations.
 *   2. 310.1.a — Reaction is timing, not a right to act in the opponent's Neutral Open State: with no
 *      chain and no showdown on P2's turn Morgana cannot be played at all.
 *   3. Windows that DO work for P1 on P2's turn: a showdown after Focus passes (she joins the combat as a
 *      defender, exhausted but defending needs no readiness) and a chain where P1 holds priority.
 *   4. On P1's own attack she can be ambushed INTO the contested battlefield and fights as an attacker.
 *   5. The play trigger doubles marked damage, computed once from the target's damage at resolution:
 *      3 marked on a 6-Might unit → lethal; 3 on a 7 → 6, survives; 0 marked → deals 0, nothing happens.
 *   6. Parser: the trigger's effect is `{ type: "raw" }` — the damage clause is not implemented.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-017-166";
const SLOW_BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Slow Bolt",
} as const;

const COST = { energy: 5, power: { fury: 1 } } as const;

/** P2 to act with a 4-Might raider; P1 holds bf1 with a 2-Might Pal, bf2 is empty and P1's; Morgana in P1's hand, paid for. */
function p2Turn() {
  return scenario()
    .active(P2)
    .resources(P1, COST)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, CARD, "morg");
}

async function playAndResolveOn(target: string, targetMight: number, marked: number) {
  const game = await scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: targetMight, name: "Victim" }, target, marked > 0 ? { damage: marked } : undefined)
    .unit(P2, "bf1", { might: 3, name: "Clean" }, "clean")
    .hand(P1, CARD, "morg")
    .build();
  expect(game.state(target).damage).toBe(marked);
  await game.p1.play("morg", { to: "base" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
  return game;
}

describe("Morgana, Vindictive (ven-017-166)", () => {
  test("costs 5 energy + 1 fury; a 5-Might Fury champion unit with Ambush that enters the base exhausted; 4+[fury] or 5 without fury is not enough", async () => {
    const game = await scenario().resources(P1, COST).hand(P1, CARD, "morg").build();
    await game.p1.play("morg", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle({ policy: "first" });
    expect(game.state("morg")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5, zone: "base" });
    expect(game.state("morg").keywords).toContain("Ambush");
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
  });

  test("When you play me: the play trigger goes on the chain under P1's control", async () => {
    const game = await scenario().resources(P1, COST).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 6 }, "victim", { damage: 3 }).hand(P1, CARD, "morg").build();
    await game.p1.play("morg", { to: "base" });
    expect(game.zoneOf("morg")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "morg", controller: P1, triggered: true })]);
  });

  test("deals damage equal to the damage marked — a 6-Might unit carrying 3 takes 3 more (6 ≥ 6) and dies; the undamaged neighbour is untouched", async () => {
    // Expected: Victim → trash, Clean unharmed. Actual: the trigger's effect is parsed as `raw` and does nothing.
    const game = await playAndResolveOn("victim", 6, 3);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("clean")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("morg")).toBe("base");
  });

  test("the amount is read once from the target — 3 marked on a 7-Might unit becomes exactly 6 (not lethal, not re-doubled)", async () => {
    // Expected: 3 + 3 = 6 damage, unit stays at bf1. Actual: raw effect, damage stays 3.
    const game = await playAndResolveOn("victim", 7, 3);
    expect(game.state("victim")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
  });

  test("an undamaged unit is a legal choice but is dealt 0 — nothing changes and Morgana still enters", async () => {
    const game = await playAndResolveOn("victim", 2, 0);
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("clean")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("morg")).toBe("base");
    expect(game.chain()).toHaveLength(0);
  });

  test("310.1.a — on P2's turn in a Neutral Open State (no chain, no showdown) Morgana cannot be played anywhere, Ambush or not", async () => {
    const game = await p2Turn().build();
    expect(game.p1.can("play", "morg")).toBe(false);
    expect((await game.p1.try((p) => p.play("morg", { to: "bf1" }))).ok).toBe(false);
    expect(game.zoneOf("morg")).toBe("hand");
  });

  test("[Ambush] as a Reaction in P2's attack showdown: after Focus passes P1 plays her to bf1 (full 5+[fury] paid), she defends exhausted, 2+5 kills the 4-Might raider and P1 keeps bf1", async () => {
    const game = await p2Turn().build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("play", "morg")).toBe(false); // P2 holds Focus first
    await game.p2.passFocus();
    const to = game.p1.option("playUnit", "morg")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to.map(String).map((z) => z.replace("battlefield-", ""))).toEqual(["bf1"]); // not base, not the unit-less bf2
    expect((await game.p1.try((p) => p.play("morg", { to: "base" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("morg", { to: "bf2" }))).ok).toBe(false);
    await game.p1.play("morg", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("morg")).toMatchObject({ combatRole: "defender", isExhausted: true, zone: "battlefield-bf1" });
    await game.settle({ policy: "first" }); // trigger target (if asked) → anything; then combat
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 5
    expect(game.zoneOf("morg")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Ambush] on a chain during P2's turn: P2 casts a slow spell, P1 (holding priority) ambushes Morgana to bf1 in response — legal only there", async () => {
    const game = await p2Turn().hand(P2, SLOW_BOLT, "bolt").build();
    await game.p2.cast("bolt", { targets: "pal" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "morg")).toBe(true);
    expect((await game.p1.try((p) => p.play("morg", { to: "base" }))).ok).toBe(false);
    await game.p1.play("morg", { to: "bf1" });
    expect(game.zoneOf("morg")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(expect.arrayContaining(["bolt", "morg"]));
    await game.settle({ policy: "first" });
    expect(game.state("pal").damage).toBe(1); // the bolt still resolved afterwards
    expect(game.locationOf("morg")).toBe("bf1");
  });

  test("[Ambush] into your OWN attack: Pal (2) attacks P2's bf1 held by a 6-Might Brute; with Focus P1 ambushes Morgana there — she is an attacker, 2+5 ≥ 6 kills the Brute", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, CARD, "morg")
      .build();
    expect(game.p1.option("playUnit", "morg")?.fields.find((f) => f.arg === "to")?.options?.map(String)).toEqual(["base"]); // no units at bf1 yet
    await game.p1.move("pal", "bf1");
    await game.p1.play("morg", { to: "bf1" }); // showdown open, P1 has Focus, P1 has a unit there
    expect(game.state("morg")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("brute")).toBe("trash");
    // The Brute's 6 back must be assigned lethal-first (465.2.c.3): Pal (2) then 4 into Morgana, or 5 into Morgana then 1 — either way at least one attacker survives and conquers.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("own turn, Neutral Open: standard destinations only (base, the controlled empty bf2) — P2's bf1 with no friendly unit there is NOT an Ambush destination (822.1.b)", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 6 }, "brute")
      .hand(P1, CARD, "morg")
      .build();
    const to = (game.p1.option("playUnit", "morg")?.fields.find((f) => f.arg === "to")?.options ?? []).map(String).map((z) => z.replace("battlefield-", ""));
    expect(new Set(to)).toEqual(new Set(["base", "bf2"]));
    expect((await game.p1.try((p) => p.play("morg", { to: "bf1" }))).ok).toBe(false);
  });

  test("registry payload — [Ambush] keyword plus ONE play-self trigger whose effect is a DAMAGE effect keyed to the target's marked damage (today the effect is `raw`)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, isChampion: true, might: 5, name: "Morgana, Vindictive", powerCost: ["fury"], tags: ["Morgana"] });
    const abilities = (def?.abilities ?? []) as { type?: string; keyword?: string; trigger?: { event?: string }; effect?: { type?: string } }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Ambush", type: "keyword" });
    expect(abilities[1]).toMatchObject({ trigger: { event: "play-self" }, type: "triggered" });
    expect(abilities[1]?.effect?.type).toBe("damage");
    // "equal to the damage marked on it" is a dynamic amount, never a printed number
    expect(typeof (abilities[1]?.effect as { amount?: unknown } | undefined)?.amount).not.toBe("number");
    expect((abilities[1]?.effect as { amount?: unknown } | undefined)?.amount).toBeDefined();
  });
});
