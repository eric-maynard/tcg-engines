/**
 * Jayce, Man of Progress — ven-175-166 · Champion Unit (Jayce) · Mind · 4 energy (no power) · 4 Might
 *
 *   When you play me, you may kill a friendly gear. If you do, you may play a gear with Energy cost no
 *   more than [7] from hand this turn, ignoring its Energy cost.
 *
 * (VEN reprint of sfd-084-221 without the "(You must still pay its Power cost.)" reminder — reminder text
 * has no rules weight, so 356.4-style cost replacement still waives ENERGY only.)
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. 383.3.a — "you may" leads the effect: the opt-in is made for the whole ability; declining (or having
 *     no friendly gear to kill) yields NO permission — a 7-drop in hand still costs 7.
 *  2. "friendly gear" is CONTROL-based (108.2): a gear you control but an opponent OWNS is a legal kill and
 *     goes to its OWNER's trash; an enemy-controlled gear is never offered. The kill is real (428.1).
 *  3. "If you do" (359.3.e linked instruction) → a one-shot permission: exactly ONE gear, printed Energy
 *     cost ≤ 7 (7 yes / 8 no), from HAND, THIS turn (317.2.c expiry), Energy waived but POWER still due.
 *  4. "When you play me" also fires when he is played from the Champion Zone.
 *  5. Partner — Forgotten Relic (5-cost gear): the free play is still a PLAY, so the Relic's own
 *     "When you play this, [Burn 1]" must trigger off it.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-175-166";
const MASK = "ogn-060-298"; // Mask of Foresight — Calm gear, 2
const BALLISTA = "ogn-017-298"; // Iron Ballista — Fury gear, 3
const RELIC = "ven-108-166"; // Forgotten Relic — Chaos gear, 5: When you play this or at start of your Beginning Phase, [Burn 1]. …
const SEVEN = { abilities: [], cardType: "gear", domain: "mind", energyCost: 7, name: "Seven-Cost Apparatus", powerCost: ["mind"], rulesText: "" } as const;
const EIGHT = { abilities: [], cardType: "gear", domain: "mind", energyCost: 8, name: "Eight-Cost Apparatus", rulesText: "" } as const;
const CHEAP = { abilities: [], cardType: "gear", domain: "mind", energyCost: 2, name: "Two-Cost Gizmo", rulesText: "" } as const;

function board(pool: { energy?: number; mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: pool.energy ?? 4, power: { mind: pool.mind ?? 1 } })
    .gear(P1, MASK, "mask")
    .gear(P1, BALLISTA, "ballista")
    .gear(P2, MASK, "emask")
    .hand(P1, CARD, "jayce")
    .hand(P1, SEVEN, "seven")
    .hand(P1, EIGHT, "eight")
    .hand(P1, CHEAP, "cheap");
}

/** Play Jayce (4), accept the opt-in and kill `victim`. */
async function playAndKill(game: Game, victim = "mask"): Promise<void> {
  await game.p1.play("jayce");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "jayce" } });
  await game.p1.yes();
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(victim);
    await game.settle();
  }
  expect(game.zoneOf(victim)).toBe("trash");
}

describe("Jayce, Man of Progress (ven-175-166)", () => {
  test("registry payload: an OPTIONAL play-self trigger whose effect kills a FRIENDLY GEAR", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, isChampion: true, might: 4, name: "Jayce, Man of Progress", tags: ["Jayce"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ optional: true, trigger: { event: "play-self" }, type: "triggered" });
    const json = JSON.stringify(abilities[0]);
    expect(json).toContain('"kill"');
    expect(json).toContain('"gear"');
    expect(json).toContain('"friendly"');
  });

  test("registry payload should also encode the 'If you do' rider — one gear ≤ [7] from hand this turn, Energy cost ignored", async () => {
    // Expected (cf. the hand-authored sfd-084-221): a linked follow-up carrying maxEnergyCost 7 + ignoreEnergyCost, duration this turn.
    // Actual: abilities[0].effect = { type: "kill", target: friendly gear } and nothing else.
    const def = (await loadDefaultCardPool()).get(CARD);
    const json = JSON.stringify(def?.abilities ?? []);
    expect(json).toMatch(/"(?:maxEnergyCost|lte|max)":\s*7/);
    expect(json).toMatch(/ignoreEnergyCost|ignor|waive/i);
  });

  test("cost: 4 energy, no power — a 4-Might champion unit that enters exhausted; 3 energy (with mind power) is short", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "jayce").build();
    await game.p1.play("jayce");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.state("jayce")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 3 } }).hand(P1, CARD, "jayce").build()).p1.can("play", "jayce")).toBe(false);
  });

  test("When you play me: a triggered chain item; on 'yes' only FRIENDLY gear is offered and the pick is really killed (board → trash), the rest untouched", async () => {
    const game = await board().build();
    await game.p1.play("jayce");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jayce", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? [...d.options.map((o) => o.card)].sort() : []).toEqual(["ballista", "mask"]);
    await game.p1.pick("ballista");
    await game.settle();
    expect(game.zoneOf("ballista")).toBe("trash");
    expect(game.zoneOf("mask")).toBe("base");
    expect(game.zoneOf("emask")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
    expect(game.violations()).toEqual([]);
  });

  test("'you may' — declining kills nothing and grants nothing: every gear in hand keeps its full price", async () => {
    const game = await board().build();
    await game.p1.play("jayce");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect([...game.p1.gear()].sort()).toEqual(["ballista", "mask"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "seven")).toBe(false);
    expect(game.p1.can("play", "cheap")).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("no friendly gear at all (only the opponent's): nothing can be killed, the enemy gear survives, no permission", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .gear(P2, MASK, "emask")
      .hand(P1, CARD, "jayce")
      .hand(P1, SEVEN, "seven")
      .build();
    await game.p1.play("jayce");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no") {
      await (d.canAccept === false ? game.p1.no() : game.p1.yes());
      await game.settle();
    }
    if (game.decision()?.kind === "pick") {
      const pd = game.decision();
      expect(pd?.kind === "pick" ? pd.options.map((o) => o.card) : []).not.toContain("emask");
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("emask")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.can("play", "seven")).toBe(false);
  });

  test("'friendly' is control, not ownership: a gear P1 controls but P2 OWNS is a legal kill and lands in its OWNER's trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .card("stolen", { controller: P1, def: MASK, owner: P2, zone: "base" })
      .gear(P2, MASK, "emask")
      .hand(P1, CARD, "jayce")
      .build();
    expect(game.p1.gear()).toEqual(["stolen"]);
    await game.p1.play("jayce");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("stolen");
      await game.settle();
    }
    expect(game.zoneOf("stolen")).toBe("trash");
    expect(game.p2.trash()).toContain("stolen");
    expect(game.p1.trash()).not.toContain("stolen");
    expect(game.zoneOf("emask")).toBe("base");
  });

  test("played from the Champion Zone is still 'When you play me': costs 4, lands in base, and the same opt-in trigger appears", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, MASK, "mask").champion(P1, CARD, "jayce").build();
    await game.p1.playChampion("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("jayce")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jayce", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "jayce" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("mask")).toBe("trash"); // single candidate → forced
  });

  test("If you do — a gear costing exactly 7 becomes playable from hand at 0 energy, paying ONLY its [mind] power; an 8-cost gear is never covered", async () => {
    // Expected: after the kill, `seven` (7 + [mind]) is legal with {energy 0, mind 1}; playing it spends just the mind; `eight` stays illegal.
    // Actual: no permission is installed — `seven` is not playable.
    const game = await board().build();
    await playAndKill(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "eight")).toBe(false);
    expect(game.p1.can("play", "seven")).toBe(true);
    await game.p1.play("seven");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("seven")).toBe("base");
  });

  test("Energy is ignored but POWER is not — with 0 [mind] the waived 7-drop stays illegal; adding exactly 1 [mind] (and no energy) makes it legal", async () => {
    // Actual: never legal, with or without the mind (no waiver exists).
    const game = await board({ mind: 0 }).build();
    await playAndKill(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.can("play", "seven")).toBe(false);
    await game.p1.do("addResources", { power: { mind: 1 } });
    expect(game.p1.can("play", "seven")).toBe(true);
  });

  test("'a gear' — exactly ONE free play: after the free 7-drop the 2-cost gizmo needs real energy again", async () => {
    const game = await board().build();
    await playAndKill(game);
    await game.p1.play("seven");
    await game.settle();
    expect(game.zoneOf("seven")).toBe("base");
    expect(game.p1.can("play", "cheap")).toBe(false);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.play("cheap");
    expect(game.p1.energy()).toBe(0);
  });

  test("'this turn' — unused, the permission lapses: free during this turn, full 7 energy on P1's next turn", async () => {
    const game = await board({ mind: 1 }).build();
    await playAndKill(game);
    expect(game.p1.can("play", "seven")).toBe(true);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { mind: 1 } });
    expect(game.p1.can("play", "seven")).toBe(false); // pool was emptied; 2 fresh rune-energy < 7
    await game.p1.do("addResources", { energy: 7 });
    expect(game.p1.can("play", "seven")).toBe(true);
    await game.p1.play("seven");
    expect(game.p1.energy()).toBeLessThanOrEqual(2); // paid the real 7 out of 7 + (≤2 from runes)
  });

  test("partner — Forgotten Relic (5) played for free off the permission is still a PLAY: its own 'When you play this, [Burn 1]' triggers and burns P1's top card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .gear(P1, MASK, "mask")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["top", "second"])
      .hand(P1, CARD, "jayce")
      .hand(P1, RELIC, "relic")
      .build();
    await playAndKill(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "relic")).toBe(true);
    await game.p1.play("relic");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("relic")).toBe("base");
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.p1.deck()[0]).toBe("second");
  });
});
