/**
 * Interaction: three simultaneous combat deaths across two controllers at Altar of Blood.
 *   Draven, Audacious (sfd-148-221) · Champion Unit · Chaos · 6 + [chaos] · 6 Might
 *     "[Deflect] … The first time I win a combat each turn, you score 1 point.
 *      When I die in combat, choose an opponent. They score 1 point."
 *   × Altar of Blood (unl-206-219) · Battlefield
 *     "If a unit here would die during combat, its controller may pay [rainbow][rainbow][rainbow] to heal
 *      it, exhaust it, and recall it instead."
 *   × Loyal Poro (unl-156-219) · Unit · Order · 3 · 3 Might
 *     "[Deathknell][>] If I didn't die alone, draw 1. (I wasn't alone if there were other friendly units here.)"
 *
 * Rules: 370.1.a.2 (one combat-damage step → simultaneous would-die events), 373 / 373.1 / 373.1.a (each
 * event separate; different controllers → turn order; replacement actions run before the unmodified
 * deaths), 371.2 + 190.6.c ("its controller may pay" → the dying unit's controller controls that optional
 * replacement), 808.1.d.1 (death replaced → the die-trigger never lands / is removed), 808.1.d.3 + 323.4 /
 * 323.5 (Deathknell info is noted at Cleanup step 3a, BEFORE any unit leaves in 3b), 383.2.a.1 (an "if"
 * right after the trigger is part of the condition), 383.3.d.1 (turn player's triggers first), 466.3.d /
 * 466.5.b (nobody left → No Result, battlefield Uncontrolled), 194.1.c / 471.1.a.1 (an effect point is not
 * a Conquer point).
 *
 * Question: 1v1, Victory 8, 2-2, P1's turn. bf1 IS Altar of Blood, held by P2 with Loyal Poro (3) and a
 * vanilla 3-Might V. P1 attacks with Draven (6) alone; both pass. Draven assigns 3/3 (both lethal), the
 * defenders deal 6 (Draven lethal). P1 and P2 each have exactly 3 power floating.
 *   (a) order of the Altar decisions; can P2 save both?  (b) P1 pays for Draven, P2 pays for V: chain
 *   afterwards, Draven's trigger?, Poro's Deathknell "not alone"?, result/control.  (c) nobody pays: chain
 *   bottom→top, FIN vs RES decisions, resolution order, final score.  (d) P1 declines, P2 saves the Poro.
 *
 * Expected: (a) P1 (turn player) is asked first about Draven; then P2 about its units; 3 power buys one
 * save only. (b) Draven and V healed/exhausted/recalled BEFORE the Poro is killed (373.1.a); Draven never hit
 * the trash → no "die in combat" trigger (808.1.d.1); Poro's "didn't die alone" was noted at 3a with V still
 * there → chain = [Poro DK (P2)] → P2 draws 1; No Result, bf1 Uncontrolled, 2-2, both pools 0. (c) all three
 * die; chain = [Draven trigger (P1; the only opponent P2 is auto-chosen, nothing asked), Poro DK (P2)]; LIFO:
 * P2 draws 1, then P2 scores 1 → 2-3; bf1 Uncontrolled. (d) Poro recalled first so its Deathknell never
 * lands (no draw); V dies triggerless; chain = [Draven trigger] → P2 3; P2 pool 0; bf1 Uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const ALTAR_OF_BLOOD = "unl-206-219";
const LOYAL_PORO = "unl-156-219";

/** Victory 8, 2-2, P1's turn. bf1 = live Altar of Blood held by P2's Poro + V; Draven in P1's base; 3 [rainbow] each. */
function board(p2Power = 3) {
  return scenario()
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, 2)
    .resources(P1, { power: { rainbow: 3 } })
    .resources(P2, { power: { rainbow: p2Power } })
    .battlefield("bf1", { controller: P2, def: ALTAR_OF_BLOOD, inert: false })
    .unit(P2, "bf1", LOYAL_PORO, "poro")
    .unit(P2, "bf1", { might: 3, name: "Vanilla V" }, "V")
    .unit(P1, "base", DRAVEN, "draven")
    // 465.2.c — Draven splits 3/3 so both defenders take lethal (settle() would take a legal greedy line
    // too; the script pins the question's exact assignment if the engine asks).
    .script(P1, [{ allocation: { V: 3, poro: 3 }, kind: "distribute" }]);
}

/** Which dying unit the open Altar opt-in is about (the engine's suspended-death marker). */
const askedAbout = (game: Game): string | undefined =>
  (game.gameState as { pendingChoice?: { suspendedDeathCardId?: string } }).pendingChoice?.suspendedDeathCardId;

/** Draven attacks bf1 alone; both pass focus; combat damage is dealt → the first Altar prompt is open. */
async function attack(game: Game): Promise<void> {
  await game.p1.move("draven", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
}

/** Answer the current Altar yes/no for whoever is asked, then settle to the next prompt (or open state). */
async function altar(game: Game, pay: boolean): Promise<void> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", source: { cardId: "bf1", pendingChoiceType: "opt-in" } });
  await (pay ? game.seat(d!.seat).yes() : game.seat(d!.seat).no());
}

describe("(a) surfacing order of the Altar decisions", () => {
  test("after combat damage the FIRST prompt is P1's (turn player, Draven's controller): pay [rainbow]×3 for Draven — payable, and nothing has left bf1 yet (373.1, 371.2, 190.6.c)", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bf1", pendingChoiceType: "opt-in" } });
    expect(askedAbout(game)).toBe("draven");
    expect(game.cardsAt("bf1").sort()).toEqual(["V", "draven", "poro"]);
    expect(game.chain()).toEqual([]); // no die-trigger has landed while the deaths are suspended
    expect(game.p1.power()).toBe(3);
    expect(game.p2.power()).toBe(3);
  });

  test("only after P1 answers is P2 asked — one yes/no per P2 event (Poro, then V), each controlled by P2 (373: each event handled separately)", async () => {
    const game = await board().build();
    await attack(game);
    await altar(game, false);
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(askedAbout(game)).toBe("poro");
    await altar(game, false);
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(askedAbout(game)).toBe("V");
  });

  test("P2 cannot save both with 3 power: paying for the Poro empties P2's pool and V's Altar option is never even payable — V dies", async () => {
    const game = await board().build();
    await attack(game);
    await altar(game, false); // P1 declines
    await game.settle();
    expect(askedAbout(game)).toBe("poro");
    await altar(game, true);
    expect(game.p2.power()).toBe(0);
    await game.settle();
    // no further acceptable Altar prompt for V
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P2 && (d as { canAccept?: boolean }).canAccept !== false).toBe(false);
    await game.settle();
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
  });

  test("contrast: with 6 power P2 is asked twice and CAN save both (each event is its own application, 373)", async () => {
    const game = await board(6).build();
    await attack(game);
    await altar(game, true); // P1 saves Draven
    await game.settle();
    await altar(game, true); // Poro
    await game.settle();
    expect(askedAbout(game)).toBe("V");
    await altar(game, true); // V
    await game.settle();
    expect(game.p2.units("base").sort()).toEqual(["V", "poro"]);
    expect(game.p2.power()).toBe(0);
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect([game.p1.points(), game.p2.points()]).toEqual([2, 2]);
  });
});

describe("(b) YES / YES-for-V: P1 saves Draven, P2 declines the Poro and saves V", () => {
  async function branchB(): Promise<Game> {
    const game = await board().build();
    await attack(game);
    await altar(game, true); // P1: Draven
    await game.settle();
    expect(askedAbout(game)).toBe("poro");
    await altar(game, false); // P2: not the Poro
    await game.settle();
    expect(askedAbout(game)).toBe("V");
    await altar(game, true); // P2: V
    return game;
  }

  test("replacements execute before the unmodified death (373.1.a): Draven healed/exhausted in P1's base, V healed/exhausted in P2's base, THEN the Poro is killed → P2's trash", async () => {
    const game = await branchB();
    await game.settle();
    expect(game.state("draven")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("V")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toEqual(["poro"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("Draven was never sent to the trash → his 'When I die in combat' trigger is not on the chain and P2 scores nothing from it (808.1.d.1); scores stay 2-2, both pools 0", async () => {
    const game = await branchB();
    expect(game.chain().some((i) => i.cardId === "draven")).toBe(false);
    await game.settle();
    expect([game.p1.points(), game.p2.points()]).toEqual([2, 2]);
    expect([game.p1.power(), game.p2.power()]).toEqual([0, 0]);
  });

  // Expected: the Poro's Deathknell information is noted at Cleanup step 3a (323.4 / 808.1.d.3) while V is
  // still "here", so "I didn't die alone" is TRUE (condition fixed at trigger time, 383.2.a.1) → the DK lands
  // as P2's only chain item and P2 draws 1. Actual: the engine re-reads "alone" after V's replacement recall
  // has already emptied the battlefield, finds the Poro alone and never puts the Deathknell on the chain.
  test("Loyal Poro's Deathknell lands as [Poro DK (P2)] — V was still here at step 3a → 'didn't die alone' — and P2 draws 1 (323.4, 808.1.d.3, 383.2.a.1)", async () => {
    const game = await branchB();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    const hand = game.p2.hand().length;
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand + 1);
  });

  test("combat result: nobody remains at bf1 → No Result, bf1 becomes UNCONTROLLED, no conquer/score for P1 (466.3.d, 466.5.b); no order decision was ever raised (each player had ≤ 1 item)", async () => {
    const game = await branchB();
    expect(game.decision()?.kind).not.toBe("order");
    await game.settle();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(c) NO / NO: nobody pays — all three die", () => {
  async function branchC(): Promise<Game> {
    const game = await board().build();
    await attack(game);
    await altar(game, false); // P1
    await game.settle();
    await altar(game, false); // P2: Poro
    await game.settle();
    await altar(game, false); // P2: V
    return game;
  }

  test("chain bottom→top = [Draven 'die in combat' (P1, turn player first — 383.3.d.1), Loyal Poro DK (P2; V present at 3a → not alone)]; V adds nothing; all three cards are in their owners' trashes", async () => {
    const game = await branchC();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "draven", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "poro", controller: P2, triggered: true }),
    ]);
    expect(game.p1.trash()).toEqual(["draven"]);
    expect(game.p2.trash().sort()).toEqual(["V", "poro"]);
  });

  test("Draven's 'choose an opponent' is a FINALIZATION choice with exactly one option (P2) → bound without asking; no order decision for anyone; the next decision is plain chain priority", async () => {
    const game = await branchC();
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    expect([game.p1.points(), game.p2.points()]).toEqual([2, 2]); // nothing resolved yet
    expect([game.p1.power(), game.p2.power()]).toEqual([3, 3]); // nothing paid
  });

  test("LIFO: the Poro DK resolves first → P2 draws 1 (score unchanged); then Draven's → P2 scores 1 (an effect point, not a Conquer — 194.1.c, 471.1.a.1) → 2-3", async () => {
    const game = await branchC();
    const hand = game.p2.hand().length;
    // both pass once → top item (Poro DK) resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1 })]);
    expect(game.p2.hand()).toHaveLength(hand + 1);
    expect(game.p2.points()).toBe(2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect([game.p1.points(), game.p2.points()]).toEqual([2, 3]);
    expect(game.p2.hand()).toHaveLength(hand + 1); // exactly one draw
  });

  test("end state: bf1 Uncontrolled and empty, both pools untouched (3/3), game continues in P1's main phase", async () => {
    const game = await branchC();
    await game.settle();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect([game.p1.power(), game.p2.power()]).toEqual([3, 3]);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(d) NO / P2 saves the Poro instead of V", () => {
  async function branchD(): Promise<Game> {
    const game = await board().build();
    await attack(game);
    await altar(game, false); // P1 declines for Draven
    await game.settle();
    expect(askedAbout(game)).toBe("poro");
    await altar(game, true); // P2 pays for the Poro
    return game;
  }

  test("the Poro is healed/exhausted/recalled first (373.1.a) so its Deathknell never lands (808.1.d.1); V dies with no trigger; chain = [Draven trigger (P1)] only", async () => {
    const game = await branchD();
    // V's Altar option is unpayable now (pool 0) → V simply dies with the rest of the batch.
    await game.settle(); // hands back / declines nothing acceptable; resolves through
    expect(game.state("poro")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("V")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("trash");
  });

  test("chain composition right after the batch: only Draven's die-in-combat item (P1) — no Poro item", async () => {
    const game = await branchD();
    // step until a chain exists or the game opens up
    for (let i = 0; i < 4 && game.chain().length === 0 && game.decision()?.kind !== "action"; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
    expect(game.chain().some((i) => i.cardId === "poro")).toBe(false);
  });

  test("outcome: P2 +1 from Draven's trigger (2-3), NO draw for P2 even though the Poro 'would have' been not-alone, P2's pool 0, Poro exhausted in P2's base, bf1 Uncontrolled", async () => {
    const game = await branchD();
    const hand = game.p2.hand().length;
    await game.settle();
    expect([game.p1.points(), game.p2.points()]).toEqual([2, 3]);
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.power()).toBe(0);
    expect(game.p1.power()).toBe(3);
    expect(game.p2.units("base")).toEqual(["poro"]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.trash()).toEqual(["draven"]);
    expect(game.p2.trash()).toEqual(["V"]);
  });
});
