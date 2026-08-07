/**
 * Jayce, Man of Progress — sfd-084-221 · Champion Unit (Jayce) · Mind · 4 energy (no power) · 4 Might
 *
 *   When you play me, you may kill a friendly gear. If you do, you may play a gear with Energy cost
 *   no more than [7] from hand this turn, ignoring its Energy cost. (You must still pay its Power
 *   cost.)
 *
 * Rules: 383.4.a (play effect), 383.3.a ("you may" first → opt-in), 355.10.c.1 / 428.1 (the kill is a
 * cost-like instruction inside the effect and is a real kill), 359.3.e ("If you do" — linked
 * instruction only if the kill happened), 137 (Equipment and gear tokens are gear), 185.3.a (a token's
 * cost is 0), 317.2.c ("this turn" expires in the Expiration Step).
 *
 * Judge's corner — trickiest situations for this card:
 *  - Only FRIENDLY gear may be killed (Equipment and a Gold token both qualify); enemy gear never.
 *  - Decline / nothing to kill → no permission at all: a 7-cost gear in hand still costs 7.
 *  - The permission: exactly ONE gear, Energy cost ≤ 7 (7 yes, 8 no), from HAND, THIS turn only, and its
 *    POWER cost must still be paid (0 [mind] → still unplayable even though the energy is waived).
 *  - After the free gear, a second gear the same turn costs its full price again.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-084-221";
const MASK = "ogn-060-298"; // Mask of Foresight — 2-cost calm gear
const LONG_SWORD = "sfd-022-221"; // Equipment (gear subtype)
// Inline gear so the cost edge cases are explicit (7 vs 8 energy, with a [mind] power pip).
const SEVEN = { abilities: [], cardType: "gear", domain: "mind", energyCost: 7, name: "Seven-Cost Contraption", powerCost: ["mind"], rulesText: "" };
const EIGHT = { abilities: [], cardType: "gear", domain: "mind", energyCost: 8, name: "Eight-Cost Contraption", powerCost: ["mind"], rulesText: "" };
const CHEAP = { abilities: [], cardType: "gear", domain: "mind", energyCost: 2, name: "Two-Cost Gizmo", rulesText: "" };

function board(extra: { mind?: number; energy?: number } = {}) {
  return scenario()
    .resources(P1, { energy: extra.energy ?? 4, power: { mind: extra.mind ?? 1 } })
    .gear(P1, MASK, "mask")
    .gear(P1, LONG_SWORD, "sword")
    .gear(P2, MASK, "emask")
    .hand(P1, CARD, "jayce")
    .hand(P1, SEVEN, "seven")
    .hand(P1, EIGHT, "eight")
    .hand(P1, CHEAP, "cheap");
}

/** Play Jayce, accept the opt-in and kill `victim` (handles opt-in asked at finalization or at resolution). */
async function playAndKill(game: Game, victim: string): Promise<void> {
  await game.p1.play("jayce", { to: "base" });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "jayce" } });
  await game.p1.yes();
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(victim);
  }
  await game.settle();
}

describe("Jayce, Man of Progress (sfd-084-221)", () => {
  test("cost: 4 energy, no power; 4-Might champion, enters exhausted; unaffordable at 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "jayce").build();
    await game.p1.play("jayce");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("jayce")).toBe("base");
    expect(game.state("jayce")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { mind: 3 } }).hand(P1, CARD, "jayce").build();
    expect(poor.p1.can("play", "jayce")).toBe(false);
  });

  test("When you play me: a triggered item goes on the chain; accepting offers ONLY friendly gear (incl. Equipment), and the pick is killed", async () => {
    const game = await board().build();
    await game.p1.play("jayce");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jayce", controller: P1, triggered: true })]);
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["mask", "sword"]);
    await game.p1.pick("mask");
    await game.settle();
    expect(game.zoneOf("mask")).toBe("trash");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.zoneOf("emask")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
  });

  test("'you may': declining kills nothing and grants nothing — the 7-cost gear stays unplayable at 0 energy", async () => {
    const game = await board().build();
    await game.p1.play("jayce");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.p1.gear().sort()).toEqual(["mask", "sword"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "seven")).toBe(false);
  });

  test("no friendly gear on board (only the opponent's): nothing can be killed, the enemy gear is untouched, no permission", async () => {
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
      // An opt-in may still be shown; accepting must not be able to touch enemy gear.
      if (d.canAccept !== false) {
        await game.p1.yes();
      } else {
        await game.p1.no();
      }
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("emask")).toBe("base");
    expect(game.p1.can("play", "seven")).toBe(false);
  });

  test("a Gold gear TOKEN is a friendly gear: it can be the kill (and simply ceases to exist)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", "sfd-069-221", "poro") // Plundering Poro: conquer → Gold token
      .hand(P1, CARD, "jayce")
      .build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    const gold = game.p1.gear().find((id) => game.state(id).name === "Gold") as string;
    expect(gold).toBeDefined();
    await playAndKill(game, gold);
    expect(game.p1.gear().filter((id) => game.has(id) && game.state(id).name === "Gold")).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
  });

  test("If you do — a gear costing exactly 7 is playable from hand for 0 energy, paying only its [mind] power", async () => {
    // Expected: after the kill, "seven" (7 energy + [mind]) is legal with 0 energy / 1 mind and playing
    // it spends just the mind. Actual: only the kill clause is parsed; no cost waiver exists.
    const game = await board().build();
    await playAndKill(game, "mask");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "seven")).toBe(true);
    await game.p1.play("seven");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("seven")).toBe("base");
  });

  test("'no more than [7]': an 8-cost gear is never covered — still unplayable at 0 energy after the kill", async () => {
    const game = await board().build();
    await playAndKill(game, "mask");
    expect(game.p1.can("play", "eight")).toBe(false);
  });

  test("'You must still pay its Power cost': with no [mind] left the waived 7-cost gear is still unplayable", async () => {
    const game = await board({ mind: 0 }).build();
    await playAndKill(game, "mask");
    expect(game.p1.power()).toBe(0);
    expect(game.p1.can("play", "seven")).toBe(false);
  });

  test("'a gear' — only ONE free play: after the free 7-drop, the 2-cost gizmo needs real energy again", async () => {
    const game = await board().build();
    await playAndKill(game, "mask");
    await game.p1.play("seven");
    await game.settle();
    expect(game.zoneOf("seven")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "cheap")).toBe(false);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.play("cheap");
    expect(game.p1.energy()).toBe(0);
  });

  test("'this turn' — unused, the permission lapses: free now, full 7 energy on your next turn", async () => {
    const game = await board({ mind: 2 }).build();
    await playAndKill(game, "mask");
    expect(game.p1.can("play", "seven")).toBe(true); // waived this turn
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    // New turn: pool emptied at end of turn (317.2.d); give exactly the power but not the energy.
    await game.p1.do("addResources", { power: { mind: 1 } });
    expect(game.p1.can("play", "seven")).toBe(false);
    await game.p1.do("addResources", { energy: 7 });
    expect(game.p1.can("play", "seven")).toBe(true);
    await game.p1.play("seven");
    expect(game.p1.energy()).toBe(0);
  });

  test("parsed ability shape — optional play-self trigger: kill friendly gear, THEN a linked 'ignore energy cost ≤7 gear from hand this turn' rider", async () => {
    // Actual: abilities = [{ optional kill friendly gear }] with no linked follow-up at all.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, isChampion: true, might: 4, tags: ["Jayce"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toMatchObject({ optional: true, trigger: { event: "play-self" }, type: "triggered" });
    const json = JSON.stringify(abilities);
    expect(json).toContain('"kill"');
    expect(json).toContain('"gear"');
    expect(json).toContain('"friendly"');
    // The "If you do" rider must be represented somewhere (cost cap 7, from hand, this turn).
    expect(json).toMatch(/"(?:maxEnergyCost|energyCost|lte|max)":\s*7|no more than/);
    expect(json).toMatch(/ignor|waive|free|without-paying|costOverride/i);
  });
});
