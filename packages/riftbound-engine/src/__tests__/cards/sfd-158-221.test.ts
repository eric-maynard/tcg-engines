/**
 * Sandshifter — sfd-158-221 · Unit · Order · 5 energy + [order][order] · 6 might
 *
 *   When you play me, kill an enemy unit with 3 [Might] or less.
 *
 * Rules: 383.4.a (Play Effects trigger when the permanent is played, incl. "plays it" via an
 * effect), 383.3 + 355.5.b (a triggered ability is finalized like an activated one — its target is
 * chosen when it is put on the chain, not on resolution), 359.3.e.2/.5 (a target that no longer
 * meets "3 Might or less" or "enemy" on resolution is unaffected), 355.9.b (targeting restrictions:
 * ENEMY + Might ≤ 3, evaluated on effective Might — 700s: buffs, equipment, this-turn modifiers),
 * no "may" → mandatory when a legal target exists; no legal target → the instruction is ignored and
 * Sandshifter still enters (359.3.e.6/.7). Killed cards go to their owner's trash.
 *
 * Head-judge corner cases for THIS card:
 *   1. Threshold on EFFECTIVE Might: a printed-2 wearing B.F. Sword (+3 = 5) is not a target; a
 *      printed-5 under Defiant Dance's -2 (= 3) IS, and dies.
 *   2. Location-agnostic: enemy units in their base and at battlefields are both offered; friendly
 *      ≤3 units and Sandshifter itself never are; the pick cannot be declined.
 *   3. No legal target (only 4+ enemies, or only friendly smalls) → no prompt, nothing dies.
 *   4. Response window: P2 reacts to the trigger with Discipline (+2) on their only small unit →
 *      on resolution it is 5 Might → nothing is killed (359.3.e.5).
 *   5. Timing (355.5.b): the target must be named when the trigger goes on the chain, BEFORE P2
 *      gets priority — so P2 knows what to protect.
 *   6. Kill semantics: victim's Deathknell (Watchful Sentry) fires for ITS controller; the victim
 *      lands in its owner's trash; Arcane Shift replaying Sandshifter re-triggers the kill.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-158-221";
const BF_SWORD = "sfd-161-221"; // Equipment, +3
const DEFIANT_DANCE = "sfd-196-221"; // Reaction 1+[rainbow]: a unit +2 this turn, another unit -2 this turn
const DISCIPLINE = "ogn-058-298"; // Reaction 2: give a unit +2 this turn, draw 1
const WATCHFUL_SENTRY = "ogn-096-298"; // 1-might unit, Deathknell — draw 1
const ARCANE_SHIFT = "sfd-200-221"; // Action 3+[rainbow]: banish friendly unit, owner replays it free; 3 to enemy at bf; banish this

const COST = { energy: 5, power: { order: 2 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "AtBf" }, "atbf")
    .unit(P2, "base", { might: 2, name: "InBase" }, "inbase")
    .unit(P2, "base", { might: 4, name: "Big" }, "big")
    .unit(P1, "base", { might: 1, name: "MySmall" }, "mysmall")
    .hand(P1, CARD, "ss");
}

describe("Sandshifter (sfd-158-221)", () => {
  test("registry payload: 5 + [order][order], 6 might; one play-self trigger that kills an ENEMY unit with might ≤ 3 (not optional)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, might: 6, name: "Sandshifter" });
    expect(def?.powerCost).toEqual(["order", "order"]);
    expect(def?.abilities).toEqual([
      {
        effect: { target: { controller: "enemy", filter: { might: { lte: 3 } }, type: "unit" }, type: "kill" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
    expect(JSON.stringify(def?.abilities)).not.toMatch(/optional|may/);
  });

  test("cost: exactly 5 energy + 2 order; enters exhausted at 6; 4 energy or 1 order is not enough", async () => {
    const game = await scenario().resources(P1, COST).hand(P1, CARD, "ss").build();
    await game.p1.play("ss");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.state("ss")).toMatchObject({ isExhausted: true, might: 6 });
    expect((await scenario().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, CARD, "ss").build()).p1.can("play", "ss")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "ss").build()).p1.can("play", "ss")).toBe(false);
  });

  test("on play the trigger goes on the chain; the pick offers exactly the enemy ≤3 units (base AND battlefield), is mandatory, and kills the chosen one into its owner's trash", async () => {
    const game = await board().build();
    await game.p1.play("ss");
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ss", controller: P1, triggered: true })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["atbf", "inbase"]);
    expect((await game.p1.try((p) => p.pick("big"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("mysmall"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    await game.p1.pick("atbf");
    await game.settle();
    expect(game.zoneOf("atbf")).toBe("trash");
    expect(game.p2.trash()).toEqual(["atbf"]);
    expect(game.zoneOf("inbase")).toBe("base");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.zoneOf("mysmall")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("no legal target (enemy units are all 4+; my own 1-might doesn't count) → no prompt, nobody dies, Sandshifter still enters", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .unit(P2, "base", { might: 4, name: "Big" }, "big")
      .unit(P1, "base", { might: 1, name: "MySmall" }, "mysmall")
      .hand(P1, CARD, "ss")
      .build();
    await game.p1.play("ss");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.zoneOf("mysmall")).toBe("base");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("'3 [Might] or less' is EFFECTIVE Might (718.4) — an enemy printed-2 wearing B.F. Sword (+3 → 5) must not be a legal target", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .unit(P2, "base", { might: 2, name: "Knight" }, "knight", { equippedWith: ["sword"] })
      .gear(P2, BF_SWORD, "sword", { attachedTo: "knight" })
      .unit(P2, "base", { might: 3, name: "Bare" }, "bare")
      .hand(P1, CARD, "ss")
      .build();
    expect(game.state("knight").might).toBe(5);
    await game.p1.play("ss");
    // "bare" is the ONLY unit at 3 or less once the Sword is counted, so the kill is
    // forced without a prompt (same convention as the Watchful Sentry case below).
    await game.settle();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.zoneOf("bare")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("base");
  });

  test("multi-step: Defiant Dance first (-2 on an enemy 5 → 3 this turn), then Sandshifter kills that now-legal unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 2, rainbow: 1 } })
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 1, name: "MySmall" }, "mysmall")
      .hand(P1, DEFIANT_DANCE, "dance")
      .hand(P1, CARD, "ss")
      .build();
    await game.p1.cast("dance", { targets: ["mysmall", "brute"] });
    await game.settle();
    expect(game.state("brute").might).toBe(3);
    await game.p1.play("ss", { answers: ["brute"] });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
  });

  test("359.3.e.5 response: P2 reacts to the trigger with Discipline (+2) on their only small unit → it is 5 on resolution and survives; nothing else dies", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .resources(P2, { energy: 2 })
      .unit(P2, "base", { might: 3, name: "Target" }, "tgt")
      .unit(P1, "base", { might: 1, name: "MySmall" }, "mysmall")
      .hand(P1, CARD, "ss")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p1.play("ss");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ss"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc", { targets: "tgt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ss", "disc"]);
    await game.settle();
    expect(game.state("tgt").might).toBe(5);
    expect(game.zoneOf("tgt")).toBe("base");
    expect(game.zoneOf("mysmall")).toBe("base");
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.p2.hand()).toHaveLength(1); // Discipline's draw
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: 355.5.b / 383.3 — the kill target must be chosen as the trigger is put on the chain, before P2 receives priority", async () => {
    // Expected: right after play(ss) P1 is asked to pick the target (inbase | atbf) while the item is
    // still pending; only then does anyone get priority, so P2 can respond knowing the victim.
    // Actual: the chain item is finalized target-less; the pick only appears on resolution (timing RES).
    const game = await board().build();
    await game.p1.play("ss");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["atbf", "inbase"]);
    await game.p1.pick("inbase");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ss"]);
    expect(game.zoneOf("inbase")).toBe("base"); // not dead yet — still on the chain
    await game.settle();
    expect(game.zoneOf("inbase")).toBe("trash");
  });

  test.failing("BUG: with the target locked at finalization, P2 pumping THAT unit (Discipline → 4) makes it illegal on resolution and NOTHING dies — the other small enemy is not a fallback", async () => {
    // Expected: P1 names inbase; P2 Disciplines inbase (2→4); on resolution inbase is illegal → no kill;
    // atbf (3) was never chosen and survives. Actual: choice happens on resolution, so the harness'
    // scripted "inbase" is rejected and atbf is force-killed instead.
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.play("ss", { answers: ["inbase"] });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("disc", { targets: "inbase" });
    await game.settle();
    expect(game.state("inbase").might).toBe(4);
    expect(game.zoneOf("inbase")).toBe("base");
    expect(game.zoneOf("atbf")).toBe("battlefield-bf1");
    expect(game.p2.trash()).toEqual(["disc"]);
  });

  test("kill semantics: killing P2's Watchful Sentry (1) sends it to P2's trash and ITS Deathknell draws P2 — not P1 — a card", async () => {
    const game = await scenario().resources(P1, COST).unit(P2, "base", WATCHFUL_SENTRY, "sentry").hand(P1, CARD, "ss").build();
    const p2Deck = game.p2.deck().length;
    await game.p1.play("ss");
    await game.settle(); // single legal target → forced pick; Deathknell then resolves
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("sentry").owner).toBe(P2);
    expect(game.p2.trash()).toContain("sentry");
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("'enemy' is relative to the controller: P2's own Sandshifter (on P2's turn) may only kill P1's small units", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, COST)
      .unit(P2, "base", { might: 1, name: "P2Small" }, "p2small")
      .unit(P1, "base", { might: 3, name: "P1Small" }, "p1small")
      .unit(P1, "base", { might: 6, name: "P1Big" }, "p1big")
      .hand(P2, CARD, "ss")
      .build();
    await game.p2.play("ss");
    await game.settle(); // only p1small qualifies → forced
    expect(game.zoneOf("p1small")).toBe("trash");
    expect(game.p1.trash()).toEqual(["p1small"]);
    expect(game.zoneOf("p2small")).toBe("base");
    expect(game.zoneOf("p1big")).toBe("base");
  });

  test("Arcane Shift replays Sandshifter ('its owner plays it') → the play trigger fires AGAIN and kills a second small enemy; 3 damage to the bf unit; spell banished", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Tank" }, "tank")
      .unit(P2, "base", { might: 2, name: "Small" }, "small")
      .unit(P1, "base", CARD, "ss")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["ss", "tank"] });
    game.script(P1, ["base", "small"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.state("ss").isExhausted).toBe(true);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("tank").damage).toBe(3);
    expect(game.zoneOf("tank")).toBe("battlefield-bf1");
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.energy()).toBe(0); // replay ignored the 5+[order][order]
  });
});
