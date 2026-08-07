/**
 * Interaction: Mystic Reversal (ogn-080-298) · Spell (Reaction) · Calm · 4 + [calm][calm][calm]
 *     "Gain control of a spell. You may make new choices for it."
 *   × Deadly Flourish (unl-073-219) · Spell · Mind · 4
 *     "Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token exhausted."
 *   × Void Seeker (ogn-024-298) · Spell (Action) · Fury · 3 + [fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Question: P1 plays Deadly Flourish on P2's unit B; P2 responds with Mystic Reversal and gains control
 * of it. (a) P2 declines new choices — does B (now friendly to the spell's controller) still take 3? Is
 * the "when it dies this turn" delayed trigger created, and whose trash does the card go to? (b) P2
 * re-chooses P1's unit A — what happens and who would get the Gold? (c) Same line with Void Seeker,
 * choices unchanged: does B take 4, and who draws?
 *
 * Rules: 359.3.e.2 / 359.3.e.4 ("enemy" is re-checked at resolution relative to the spell's controller —
 * "no longer a legal target if it is no longer an enemy"), 359.3.f.4 (second example: the stolen item
 * mistargets unless new choices are made), 359.3.e.5 (illegal target unaffected), 359.3.e.14.a /
 * 359.3.e.16 (a linked later instruction / delayed ability on an ignored target is not generated),
 * 359.3.d (a resolved spell goes to its OWNER's trash), 392 (a delayed trigger belongs to the spell's
 * controller at resolution).
 *
 * Expected: (a) mistarget — B takes 0, no delayed trigger exists (B dying later this turn yields no Gold
 * for anyone), Deadly Flourish → P1's trash. (b) A is enemy to P2 → A takes 3 and dies (3 Might) → P2
 * plays the Gold token exhausted; card → P1's trash. (c) Void Seeker has no enemy clause: B takes 4 and
 * the CONTROLLER (P2) draws 1; Void Seeker → P1's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const DEADLY_FLOURISH = "unl-073-219";
const VOID_SEEKER = "ogn-024-298";
/** 0-cost action spell "Deal 5 to a unit" — finishes B off later in the turn for the delayed-trigger facet. */
const FINISHER = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Finisher",
  timing: "action",
};

const golds = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P1's turn. A (P1, 3 Might, base) · B (P2, 5 Might, at bf1). P1 can afford either spell; P2 exactly affords Mystic Reversal. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Unit A" }, "a")
    .unit(P2, "bf1", { might: 5, name: "Unit B" }, "b")
    .hand(P1, DEADLY_FLOURISH, "df")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, FINISHER, "finisher")
    .hand(P2, MYSTIC_REVERSAL, "mr");
}

/** P1 casts `spell` on B, passes; P2 answers with Mystic Reversal; everyone passes until only the stolen spell remains on the chain. */
async function stolen(spell: "df" | "vs"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast(spell, { targets: "b" });
  await game.p1.passPriority();
  await game.p2.cast("mr");
  expect(game.chain().map((c) => c.cardId)).toEqual([spell, "mr"]);
  while (game.chain().some((c) => c.cardId === "mr") && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  return game;
}

/** Answer P2's optional "new choices" prompt (if the engine offers one): keep the old target, or switch to `to`. */
async function newChoices(game: Game, to?: string): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (!d || d.seat !== P2 || d.kind === "action") {
      break;
    }
    offered = true;
    if (d.kind === "yes-no") {
      await (to ? game.p2.yes() : game.p2.no());
    } else if (d.kind === "pick") {
      if (to) {
        await game.p2.pick(to);
      } else if (d.allowDecline) {
        await game.p2.decline();
      } else {
        await game.p2.pick(d.options.find((o) => o.card === "b" || o.key === "b")?.key ?? d.options[0]!.key);
      }
    } else {
      break;
    }
  }
  return offered;
}

describe("Mystic Reversal steals Deadly Flourish / Void Seeker — 'enemy' is relative to the new controller", () => {
  test("setup: Mystic Reversal resolves first (LIFO) and P2 now controls the Deadly Flourish chain item; both players paid in full", async () => {
    const game = await stolen("df");
    expect(game.zoneOf("mr")).toBe("trash");
    expect(game.p2.trash()).toContain("mr");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "df", controller: P2 })]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ---- (a) choices unchanged ------------------------------------------------------------------------

  // Expected (359.3.e.2/e.4, 359.3.f.4): with P2 as controller, B is no longer an ENEMY unit → the spell
  // mistargets and B takes nothing. Actual: B is dealt 3 — the enemy check is not re-evaluated against
  // the new controller at resolution.
  test("(a) declining new choices — B is now friendly to the controller, so Deadly Flourish mistargets and B takes 0 (359.3.e.4)", async () => {
    const game = await stolen("df");
    await newChoices(game); // decline if asked
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
  });

  test("(a) the resolved card goes to its OWNER's trash — P1's, not P2's (359.3.d); A is untouched", async () => {
    const game = await stolen("df");
    await newChoices(game);
    await game.settle();
    expect(game.zoneOf("df")).toBe("trash");
    expect(game.state("df").owner).toBe(P1);
    expect(game.p1.trash()).toContain("df");
    expect(game.p2.trash()).not.toContain("df");
    expect(game.state("a").damage).toBe(0);
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
  });

  // Expected (359.3.e.14.a / 359.3.e.16): the delayed "when it dies this turn" ability is linked to the
  // illegal target and is never generated — B dying later this turn gives NOBODY a Gold token.
  // Actual: B took the 3 (see above) and carries the delayed trigger, so finishing it off mints a Gold.
  test("(a) no delayed trigger is created on a mistarget — B dying later this turn yields no Gold for either player (359.3.e.16)", async () => {
    const game = await stolen("df");
    await newChoices(game);
    await game.settle();
    await game.p1.cast("finisher", { targets: "b" });
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash");
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
  });

  // ---- (b) P2 re-targets to A -----------------------------------------------------------------------

  // Expected ("You may make new choices for it"): P2 is offered a re-choice whose legal set is computed
  // for the NEW controller — P1's unit A is an enemy unit to P2 and must be selectable. Actual: no
  // new-choices prompt is surfaced for Deadly Flourish at all.
  test("(b) P2 is offered new choices for the stolen Deadly Flourish, with P1's unit A as a legal (enemy) pick", async () => {
    const game = await stolen("df");
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["pick", "yes-no"]).toContain(d?.kind as string);
    if (d?.kind === "yes-no") {
      await game.p2.yes();
    }
    const pick = game.decision();
    expect(pick?.kind).toBe("pick");
    const offered = pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("a");
    expect(offered).not.toContain("b"); // B is friendly to P2 now — not an "enemy unit"
  });

  // Expected: re-targeted to A → A (3 Might) takes 3 and dies; the delayed trigger is P2's (controller at
  // resolution, 392) → P2 plays one exhausted Gold token; B untouched; card still to P1's trash.
  // Actual: cannot re-target (see above) — B takes 3 instead and A lives.
  test("(b) re-targeted to A: A takes 3 and dies, P2 (the spell's controller) gets the exhausted Gold token, card → P1's trash", async () => {
    const game = await stolen("df");
    const offered = await newChoices(game, "a");
    expect(offered).toBe(true);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b").damage).toBe(0);
    const g = golds(game, "p2");
    expect(g).toHaveLength(1);
    expect(game.state(g[0]!)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true });
    expect(golds(game, "p1")).toEqual([]);
    expect(game.p1.trash()).toContain("df");
  });

  // ---- (c) Void Seeker: no enemy clause -------------------------------------------------------------

  test("(c) Void Seeker stolen with choices unchanged: 'a unit at a battlefield' has no enemy clause — B still takes 4", async () => {
    const game = await stolen("vs");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P2 })]);
    await newChoices(game);
    await game.settle();
    expect(game.state("b").damage).toBe(4);
    expect(game.zoneOf("b")).toBe("battlefield-bf1"); // 5 Might survives 4
  });

  test("(c) 'Draw 1' is performed by the spell's CONTROLLER at resolution — P2 draws, P1 does not", async () => {
    const game = await stolen("vs");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await newChoices(game);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });

  test("(c) Void Seeker still goes to its owner P1's trash; P1 paid 3 energy + 1 fury for it", async () => {
    const game = await stolen("vs");
    await newChoices(game);
    await game.settle();
    expect(game.p1.trash()).toContain("vs");
    expect(game.p2.trash()).toEqual(["mr"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
