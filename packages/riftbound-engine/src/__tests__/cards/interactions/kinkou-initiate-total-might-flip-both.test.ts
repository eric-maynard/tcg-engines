/**
 * Interaction: Kinkou Initiate (unl-097-219) · Unit · Body · 3 · 3 Might
 *     "When you play me, draw 1 if your other units have total Might 5 or more."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction — "Give a unit +2 [Might] this turn. Draw 1."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction — "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Shen, Kinkou (ogn-241-298) · Unit · 3 Might — the 3-Might unit at a battlefield that Gust bounces
 *
 * Question: the "if" TRAILS the effect (Loose Cannon templating, 383.2.a.1) — is it sampled at trigger time or at
 * resolution, and can it flip in BOTH directions while the trigger sits on the chain?
 *   (a) FALSE→TRUE: P1's only other unit is a 4-Might unit in base; P1 plays the Initiate, then — holding priority as
 *       controller of the newest item (337.4) — responds to its own play trigger with Discipline on the 4-Might unit (→ 6).
 *   (b) TRUE→FALSE: P1's other units are Shen, Kinkou (3) at bf1 and a 2-Might unit in base (total 5); P1 plays the
 *       Initiate, passes; P2 responds with Gust on Shen (3 Might, at a battlefield → hand).
 *   (c) Control: other units total exactly 5 and nobody responds.
 *
 * Rules: 383.2.a.1 (a conditional NOT immediately after the trigger condition is part of the EFFECT — Loose Cannon),
 * 383.2.b, 383.4.a.2 (play trigger becomes a chain item after the unit enters), 337.4 (controller of the newest item gets
 * priority first), 359.3.e.6 / 359.3.e.10 (an instruction that can't be followed is ignored; the ability still resolved).
 *
 * Expected: the play trigger ALWAYS goes on the chain with no condition snapshot and no targets; the might-sum is read
 * only when the item resolves. (a) chain = [Initiate trigger, Discipline]; Discipline resolves first (+2, draw 1), then
 * the trigger: 6 ≥ 5 → draw 1 more (net +2 cards). (b) chain = [Initiate trigger, Gust]; Gust bounces Shen; trigger
 * resolves with total 2 → no draw; the Initiate stays on the board, the item resolved (not countered) but did nothing.
 * (c) draw 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINKOU_INITIATE = "unl-097-219";
const DISCIPLINE = "ogn-058-298";
const GUST = "ogn-169-298";
const SHEN_KINKOU = "ogn-241-298";

/** (a) P1: a lone 4-Might ally in base, Initiate + Discipline in hand, 3 + 2 energy. */
function boardFalseToTrue() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 4, name: "Big Ally" }, "big")
    .unit(P2, "base", { might: 6, name: "Enemy Six" }, "enemy") // enemy Might never counts
    .hand(P1, KINKOU_INITIATE, "kinkou")
    .hand(P1, DISCIPLINE, "discipline");
}

/** (b) P1: Shen, Kinkou (3) holding bf1 + a 2-Might ally in base (total 5); P2 holds Gust with 1 energy. */
function boardTrueToFalse() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SHEN_KINKOU, "shen")
    .unit(P1, "base", { might: 2, name: "Small Ally" }, "small")
    .unit(P2, "base", { might: 6, name: "Enemy Six" }, "enemy")
    .hand(P1, KINKOU_INITIATE, "kinkou")
    .hand(P2, GUST, "gust");
}

/** (c) P1: other units total exactly 5 (3 + 2 in base), nobody has a response. */
function boardControl() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Three" }, "three")
    .unit(P1, "base", { might: 2, name: "Two" }, "two")
    .unit(P2, "base", { might: 6, name: "Enemy Six" }, "enemy")
    .hand(P1, KINKOU_INITIATE, "kinkou");
}

type RawItem = { cardId: string; triggered?: boolean; targets?: readonly string[]; targetSlots?: readonly unknown[]; effect?: { type?: string; condition?: unknown }; status?: string; countered?: boolean };
const rawChain = (game: Game): RawItem[] => ((game.gameState.interaction?.chain?.items ?? []) as unknown as RawItem[]);
const initiateItem = (game: Game): RawItem | undefined => rawChain(game).find((i) => i.cardId === "kinkou" && i.triggered === true);

describe("Kinkou Initiate — trailing 'if' is read at RESOLUTION and can flip either way on the chain", () => {
  // ── the item itself ─────────────────────────────────────────────────────────────────────────────

  test("the play trigger goes on the chain even while the total is only 4 (no trigger-time gate), FINALIZED with no targets and the condition still INSIDE its effect — nothing was snapshotted or chosen (383.2.a.1 / 383.2.b)", async () => {
    const game = await boardFalseToTrue().build();
    await game.p1.play("kinkou", { to: "base" });
    expect(game.zoneOf("kinkou")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kinkou", controller: P1, triggered: true, type: "ability" })]);
    const item = initiateItem(game);
    expect(item).toBeDefined();
    expect(item?.status).toBe("finalized");
    expect(item?.targets ?? []).toEqual([]);
    expect(item?.targetSlots ?? []).toEqual([]);
    expect(item?.effect).toMatchObject({ condition: { amount: 5, scope: "other-units", type: "total-might-at-least" }, type: "conditional" });
    expect(item).not.toHaveProperty("conditionSnapshot");
    expect(item).not.toHaveProperty("conditionMet");
  });

  test("no player decision is attached to the trigger: after the play the only thing open is P1's own PRIORITY window (337.4 — controller of the newest item), with Discipline castable in it", async () => {
    const game = await boardFalseToTrue().build();
    await game.p1.play("kinkou", { to: "base" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, timing: "ACT" });
    expect(game.p1.can("cast", "discipline")).toBe(true);
    expect(game.p1.can("passPriority")).toBe(true);
  });

  // ── (a) FALSE → TRUE ────────────────────────────────────────────────────────────────────────────

  test("(a) P1 responds to its own trigger with Discipline on the 4-Might ally: chain bottom→top = [Initiate trigger, Discipline]", async () => {
    const game = await boardFalseToTrue().build();
    await game.p1.play("kinkou", { to: "base" });
    await game.p1.cast("discipline", { targets: "big" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["kinkou", "discipline"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "discipline", triggered: false, type: "spell" });
  });

  test("(a) Discipline resolves first (+2 → 6, draw 1), THEN the trigger reads 6 ≥ 5 and draws 1 more: net hand = −Initiate −Discipline +2", async () => {
    const game = await boardFalseToTrue().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.p1.cast("discipline", { targets: "big" });
    // step through (337.4: the caster of the newest item holds priority first): both pass → Discipline resolves; the trigger is still there
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("big").might).toBe(6);
    expect(game.chain().map((i) => i.cardId)).toEqual(["kinkou"]);
    expect(game.p1.hand()).toHaveLength(hand0 - 2 + 1); // Discipline's draw only, so far
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 - 2 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.zoneOf("kinkou")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(a) contrast — nobody responds: the trigger resolves against a total of 4 → no draw (net hand −1)", async () => {
    const game = await boardFalseToTrue().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
  });

  test("(a) contrast — Discipline on the INITIATE itself (3 → 5) does not help: 'your OTHER units' still total 4 → only Discipline's draw (net −2 +1)", async () => {
    const game = await boardFalseToTrue().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.p1.cast("discipline", { targets: "kinkou" });
    await game.settle();
    expect(game.state("kinkou").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(hand0 - 2 + 1);
  });

  // ── (b) TRUE → FALSE ────────────────────────────────────────────────────────────────────────────

  test("(b) total is 5 (Shen 3 @bf1 + 2 in base) when the Initiate is played; P1 passes, P2 Gusts Shen: chain = [Initiate trigger, Gust]", async () => {
    const game = await boardTrueToFalse().build();
    expect(game.state("shen").might + game.state("small").might).toBe(5);
    await game.p1.play("kinkou", { to: "base" });
    expect(initiateItem(game)?.targets ?? []).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options).toEqual([["shen"]]); // only the ≤3 unit AT A BATTLEFIELD
    await game.p2.cast("gust", { targets: "shen" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["kinkou", "gust"]);
  });

  test("(b) Gust resolves first (Shen → owner's hand), then the trigger reads a total of 2 → NO draw; the Initiate is still played and on the board, the item resolved uncountered and the chain is empty (359.3.e.6 / .10)", async () => {
    const game = await boardTrueToFalse().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "shen" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.chain().map((i) => i.cardId)).toEqual(["kinkou"]);
    expect(initiateItem(game)?.countered ?? false).toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kinkou")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // −Initiate, +Shen bounced; NO draw
    expect(game.p1.hand()).toContain("shen");
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — P2 does NOT Gust: total stays 5 → the trigger draws 1 (net hand unchanged: −Initiate +1)", async () => {
    const game = await boardTrueToFalse().build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  // ── (c) control ─────────────────────────────────────────────────────────────────────────────────

  test("(c) other units total exactly 5, nobody responds: the trigger goes on the chain, both pass, P1 draws 1", async () => {
    const game = await boardControl().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.play("kinkou", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kinkou", triggered: true })]);
    expect(initiateItem(game)?.targets ?? []).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
