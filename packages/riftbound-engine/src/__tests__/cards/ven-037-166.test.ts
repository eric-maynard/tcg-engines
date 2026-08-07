/**
 * Tomb-Raider Barbara — ven-037-166 · Unit · Calm · 4 energy · 4 Might
 *
 *   When you play me, if you control 7 or more runes, choose an enemy gear. If it's [Empowered],
 *   disempower it. Otherwise, kill it.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "if you control 7 or more runes" sits IMMEDIATELY after the trigger condition, so it is part of
 *      the condition (383.2.a.1): with 6 runes the ability never reaches the chain; with 7 it does —
 *      ready or exhausted runes both count (they are controlled either way). Boundary 6 vs 7.
 *   2. "an ENEMY gear": friendly gear is never a legal choice; Equipment is gear (150.4); with no
 *      enemy gear the trigger resolves doing nothing and Barbara still lands.
 *   3. Branch on the chosen gear's state AT RESOLUTION: Empowered → disempower only (it stays on the
 *      board, 442.1); not Empowered → kill (owner's trash). The chooser may deliberately pick the
 *      Empowered one to spare a kill, or the plain one to destroy it.
 *   4. Kill consequences belong to the gear's owner: killing Scrapheap ("When this is … killed, draw
 *      1") hands the OPPONENT a card.
 *   5. Cost 4, no power; permanents skip the chain — only the trigger is respondable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-037-166";
const ORB = "ogn-090-298"; // Orb of Regret — gear, 1 energy
const SCRAPHEAP = "ogn-182-298"; // gear: "When this is played, discarded, or killed, draw 1."
const BLADE = "ven-011-166"; // Pendulum Blade — Equipment (gear)

function board(runes: number, opts: { exhausted?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 4 })
    .runes(P1, "calm", runes, opts)
    .gear(P2, ORB, "orb")
    .gear(P1, ORB, "myOrb")
    .hand(P1, CARD, "barb");
}

describe("Tomb-Raider Barbara (ven-037-166)", () => {
  test("card data: 4-cost Calm unit, 4 Might, one play-self triggered ability", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 4, might: 4 });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ trigger: { event: "play-self" }, type: "triggered" });
  });

  test("the trigger's effect must be structured (7+-runes condition, choose enemy gear, empowered ? disempower : kill) — not raw text", async () => {
    // Expected: a rune-count condition (≥7, controller) and a conditional effect over target { type: gear, controller: enemy }
    // with disempower / kill branches. Actual: effect is { type: "raw", text: "…" } so nothing resolves.
    const def = (await loadDefaultCardPool()).get(CARD);
    const ability = (def?.abilities as Record<string, unknown>[])[0] as { effect?: { type?: string }; condition?: unknown };
    expect(ability.effect?.type).not.toBe("raw");
    expect(JSON.stringify(ability)).toContain("disempower");
    expect(JSON.stringify(ability)).toContain("kill");
    expect(JSON.stringify(ability)).toMatch(/"enemy"|"opponent"/);
  });

  test("cost: 4 energy, no power; Barbara is on the board (exhausted, 4 Might) as soon as the play completes; 3 energy is not enough", async () => {
    const game = await board(7).build();
    await game.p1.play("barb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("barb")).toBe("base");
    await game.settle();
    expect(game.state("barb")).toMatchObject({ isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { calm: 3 } }).hand(P1, CARD, "barb").build();
    expect(poor.p1.can("play", "barb")).toBe(false);
  });

  test("7 runes: the play trigger goes on the chain (P2 may respond before any gear is touched)", async () => {
    const game = await board(7).build();
    await game.p1.play("barb");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "barb", controller: P1, triggered: true })]);
    expect(game.zoneOf("orb")).toBe("base");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
  });

  test("6 runes — the 'if you control 7 or more runes' rider is part of the trigger condition (383.2.a.1): nothing is put on the chain and no gear is touched", async () => {
    // Expected: chain stays empty after the play. Actual: the trigger is queued regardless of rune count.
    const game = await board(6).build();
    await game.p1.play("barb");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.zoneOf("myOrb")).toBe("base");
  });

  test("6 runes (observable today): whatever is queued, the enemy gear survives untouched and un-disempowered", async () => {
    const game = await board(6).build();
    await game.p1.play("barb");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.zoneOf("myOrb")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
  });

  test("7 runes, one non-Empowered enemy gear → it is KILLED (to its owner's trash); the friendly gear is never offered", async () => {
    // Expected: after both pass, either a pick offering only `orb` or an auto-resolution; orb ends in P2's trash, myOrb untouched.
    // Actual: the raw effect resolves as a no-op.
    const game = await board(7).build();
    await game.p1.play("barb");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card)).toEqual(["orb"]);
      await game.p1.pick("orb");
      await game.settle();
    }
    expect(game.zoneOf("orb")).toBe("trash");
    expect(game.p2.trash()).toContain("orb");
    expect(game.zoneOf("myOrb")).toBe("base");
  });

  test("7 EXHAUSTED runes still count as controlled — the enemy gear is killed all the same", async () => {
    // Expected: rune state is irrelevant to "control". Actual: no-op effect.
    const game = await board(7, { exhausted: true }).build();
    expect(game.p1.runes({ ready: false })).toHaveLength(7);
    await game.p1.play("barb");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("orb")).toBe("trash");
  });

  test("the chosen enemy gear is [Empowered] → it is DISEMPOWERED, not killed (442.1) — stays in P2's base", async () => {
    // Expected: orb remains on the board with isEmpowered false. Actual: stays Empowered (no-op).
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .runes(P1, "calm", 8)
      .gear(P2, ORB, "orb", { empowered: true })
      .hand(P1, CARD, "barb")
      .build();
    expect(game.state("orb").isEmpowered).toBe(true);
    await game.p1.play("barb");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.state("orb").isEmpowered).toBe(false);
  });

  test("two enemy gear (one Empowered, one not): P1 CHOOSES — picking the plain Scrapheap kills it and its owner P2 draws 1; the Empowered Orb is left alone", async () => {
    // Expected: a pick over exactly {orb, heap}; choosing heap → heap in P2's trash, P2 hand +1, orb still Empowered on board.
    // Actual: no prompt, nothing happens.
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .runes(P1, "calm", 7)
      .gear(P2, ORB, "orb", { empowered: true })
      .gear(P2, SCRAPHEAP, "heap")
      .gear(P1, BLADE, "myBlade")
      .hand(P1, CARD, "barb")
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p1.play("barb");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(new Set(d?.kind === "pick" ? d.options.map((o) => o.card) : [])).toEqual(new Set(["orb", "heap"]));
    await game.p1.pick("heap");
    await game.settle();
    expect(game.zoneOf("heap")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Scrapheap's "when killed, draw 1" pays out to ITS controller
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.state("orb").isEmpowered).toBe(true);
  });

  test("enemy EQUIPMENT is gear too (150.4) — a lone unattached Pendulum Blade is a legal choice and is killed", async () => {
    // Expected: blade → P2's trash. Actual: no-op.
    const game = await scenario().resources(P1, { energy: 4 }).runes(P1, "calm", 7).gear(P2, BLADE, "blade").hand(P1, CARD, "barb").build();
    await game.p1.play("barb");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("no enemy gear at all (only units / friendly gear): the trigger resolves harmlessly — Barbara lands, nothing else changes, no prompt is left hanging", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .runes(P1, "calm", 9)
      .gear(P1, ORB, "myOrb")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
      .hand(P1, CARD, "barb")
      .build();
    await game.p1.play("barb");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("barb")).toBe("base");
    expect(game.zoneOf("myOrb")).toBe("base");
    expect(game.zoneOf("by")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("opponent's runes do not count: P2 controlling 7 runes does not satisfy P1's condition (enemy gear survives even under a permissive policy)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .runes(P1, "calm", 2)
      .runes(P2, "fury", 7)
      .gear(P2, ORB, "orb")
      .hand(P1, CARD, "barb")
      .build();
    await game.p1.play("barb");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.state("orb").isEmpowered).toBe(false);
  });
});
