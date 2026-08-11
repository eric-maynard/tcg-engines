/**
 * Interaction: Mystic Reversal (ogn-080-298) · Reaction spell · Calm · 4 + [calm]×3
 *     "Gain control of a spell. You may make new choices for it."
 *   × Onslaught (ven-081-166) · Spell · Body · 4 — "Give a unit +6 [Might] this turn. [Flow] [4]"
 *   × Ravenbloom Student (ogn-103-298) · 2 · 2 Might — "When you play a spell, give me +1 [Might] this turn." (one per side)
 *   × Wind Wall (ogn-064-298) · Reaction · 3 + [calm][calm] — "Counter a spell."
 *
 * Rules: 829.1.b.2 (a Flowed spell is an ordinary spell on the chain — only its origin zone differed), 751 / 753 (new
 * choices: any legal value for "a unit"; 811.1.d's here-lock rides only on plays from facedown), 425.1.c analog + the
 * Reversal rulings (control change never re-runs the cost pipeline — P1's Flow [4] stays paid, P2 pays only Reversal),
 * 829.1.b.1 / 390.3.a (Flow's "then banish it" is a delayed replacement on THIS chain item: leaving the chain after
 * finalization, not by its own text ⇒ banish instead — whoever controls it, resolved OR countered), 108.6 / 127.1
 * (banished to its OWNER's banishment), 157 / 359.3.d (no rider ⇒ owner's trash), 419.4.a (a "when you play a spell"
 * trigger fires on completion-by-resolution for the controller AT THAT TIME), 425.1.a.1 / 425.1.b (countered: no
 * effect, no play-triggers), 419.4.b / 812.1.c (Legion-style checks key off Finalization).
 *
 * Question: P1's turn, Open state; each side has a Ravenbloom Student. P1 Flows Onslaught from the trash at P1's Student;
 * P2 answers with Mystic Reversal and re-targets P2's unit K.
 *  (a) Legal object for Reversal? Free re-target (no origin lock)? Does P2 pay anything for Onslaught?
 *  (b) After resolving under P2: P2's trash, P1's trash (Flow-able again?) or banishment — whose?
 *  (c) Which Student(s) get +1 and how often; whose Legion / play count does Onslaught feed?
 *  (d) Contrast: Wind Wall on the Flowed Onslaught — destination? Reversal on a HAND-cast Onslaught — destination?
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const ONSLAUGHT = "ven-081-166";
const STUDENT = "ogn-103-298";
const WIND_WALL = "ogn-064-298";

/**
 * P1's turn. P1: Student s1 (base), 8 energy (Flow [4] twice over), Onslaught in the trash (or hand). P2: Student s2
 * (base), 3-Might K holding bf1, Mystic Reversal + Wind Wall in hand with 7 energy + calm×5 (either one, exactly priced).
 */
function board(from: "trash" | "hand" = "trash") {
  const s = scenario()
    .resources(P1, { energy: 8 })
    .resources(P2, { energy: 7, power: { calm: 5 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", STUDENT, "s1")
    .unit(P2, "base", STUDENT, "s2")
    .unit(P2, "bf1", { might: 3, name: "Unit K" }, "k")
    .hand(P2, MYSTIC_REVERSAL, "mr")
    .hand(P2, WIND_WALL, "ww");
  return from === "trash" ? s.trash(P1, ONSLAUGHT, "ons") : s.hand(P1, ONSLAUGHT, "ons");
}

/** P1 plays Onslaught (Flow if it is in the trash) at s1 and passes; P2 casts Mystic Reversal on it; both pass until
 *  Reversal has resolved → returns P2's "new choices" prompt for the stolen Onslaught. */
async function reversed(game: Game): Promise<PickDecision> {
  const viaFlow = game.zoneOf("ons") === "trash";
  await game.p1.cast("ons", viaFlow ? { flow: true, targets: "s1" } : { targets: "s1" });
  expect(game.p1.energy()).toBe(4);
  await game.p1.passPriority();
  await game.p2.cast("mr");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ons", "mr"]);
  while (game.chain().some((c) => c.cardId === "mr") && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "ons", pendingChoiceType: "new-choices" } });
  return d as PickDecision;
}

describe("Mystic Reversal steals a FLOWED Onslaught — free re-target, still banished (owner's pile), triggers for the new controller", () => {
  // ── (a) legal object, free re-target, no second payment ─────────────────────────────────

  test("(a) a Flow-from-trash Onslaught is simply 'a spell' on the chain (829.1.b.2): it is Mystic Reversal's offered target, Reversal resolves first (LIFO) and P2 now CONTROLS the Onslaught item", async () => {
    const game = await board().build();
    await game.p1.cast("ons", { flow: true, targets: "s1" });
    await game.p1.passPriority();
    const field = game.p2.option("cast", "mr")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["ons"]]);
    await game.p2.cast("mr");
    while (game.chain().some((c) => c.cardId === "mr") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("mr")).toBe("trash");
    expect(game.chain()[0]).toMatchObject({ cardId: "ons", controller: P2, targets: ["s1"] });
  });

  test("(a) 'you may make new choices' (751/753): P2 is offered EVERY unit — s1 (current), s2 and K; no origin/here-lock applies to a Flowed spell — and may keep (decline) instead", async () => {
    const game = await board().build();
    const d = await reversed(game);
    expect(d.allowDecline).toBe(true);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["k", "s1", "s2"]);
    expect(d.options.find((o) => (o.card ?? o.key) === "s1")?.current).toBe(true);
    expect(d.newChoices).toMatchObject({ grantedBy: "mr", slot: { current: ["s1"], kind: "target" } });
    await game.p2.pick("k");
    expect(game.chain()[0]).toMatchObject({ cardId: "ons", controller: P2, targets: ["k"] });
  });

  test("(a) costs: P1's Flow [4] stays paid (8 → 4) and is never re-run; P2 pays ONLY Mystic Reversal (7/5 → 3/2) — nothing for Onslaught, nothing for re-choosing (755)", async () => {
    const game = await board().build();
    await reversed(game);
    await game.p2.pick("k");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });

  // ── (b) destination: OWNER's banishment ─────────────────────────────────────────────────

  test("(b) after resolving under P2's control the Flowed Onslaught is BANISHED — into P1's (the owner's) banishment; it is in neither trash and P2's banishment is empty (829.1.b.1 / 390.3.a / 108.6)", async () => {
    const game = await board().build();
    await reversed(game);
    await game.p2.pick("k");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.state("ons").owner).toBe(P1);
    expect(game.p1.banishment()).toEqual(["ons"]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual(["mr"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) … so it can never be Flowed again: back in P1's open main phase with 4 energy (exactly Flow [4]) the card is not castable", async () => {
    const game = await board().build();
    await reversed(game);
    await game.p2.pick("k");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("cast", "ons")).toBe(false);
    expect((await game.p1.try((p) => p.cast("ons", { flow: true, targets: "s1" }))).ok).toBe(false);
  });

  test("(b) same destination when P2 KEEPS the original choice: s1 gets the +6, card still → P1's banishment", async () => {
    const game = await board().build();
    await reversed(game);
    await game.p2.decline(); // keep s1
    await game.settle();
    expect(game.state("s1").might).toBe(2 + 6);
    expect(game.state("k").might).toBe(3);
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["ons"]);
  });

  // ── (c) Student triggers / play counts ──────────────────────────────────────────────────

  test("(c) K gets +6 (9); P2's Student gets +1 for Mystic Reversal resolving AND +1 for the stolen Onslaught resolving under P2 (419.4.a: controller at completion) → 4; P1's Student gets NOTHING → stays 2", async () => {
    const game = await board().build();
    const d = await reversed(game);
    // Reversal has resolved: its own "when you play a spell" trigger for s2 is already queued above the stolen item
    expect(game.chain().map((c) => c.cardId)).toEqual(["ons", "s2"]);
    expect(d.seat).toBe(P2);
    await game.p2.pick("k");
    await game.settle();
    expect(game.state("k").might).toBe(3 + 6);
    expect(game.state("k").mightModifier).toBe(6);
    expect(game.state("s2").might).toBe(2 + 2);
    expect(game.state("s1").might).toBe(2);
    expect(game.state("s1").mightModifier).toBe(0);
  });

  // RULING-CONFLICT: the expected answer reads CR 419.4.b / 812.1.c literally (P1 FINALIZED Onslaught ⇒ P1's Legion-style
  // play count keeps it, as for a Defy counter). riftjudge 63b57fcabb4818c7 ("spells affected by Mystic Reversal do not
  // count as played for Legion") is what the engine follows for CONTROL CHANGES specifically (green ruling test
  // rulings/darius-trifarian-63b57fcabb4818c7; `plays-this-turn.ts unnotePlayThisTurn`), while counters keep the tally per
  // the CR's own Defy example — the CR example covers counters only, so the ruling is treated as filling the gap. Assert
  // the engine's adjudicated model: the stolen play is struck from P1's count; P2 is credited for Reversal only.
  test("(c) play counts (Legion bookkeeping): P2 = 1 (finalized Mystic Reversal); the stolen Onslaught is struck from P1's tally (→ 0) per ruling 63b57fcabb4818c7 — unlike a counter, see (d)", async () => {
    const game = await board().build();
    await game.p1.cast("ons", { flow: true, targets: "s1" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // finalized by P1
    await game.p1.passPriority();
    await game.p2.cast("mr");
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(1);
    while (game.chain().some((c) => c.cardId === "mr") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    await game.p2.pick("k");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(1); // Reversal; the stolen item is not a P2 "play"
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  });

  // ── (d) contrasts ───────────────────────────────────────────────────────────────────────

  test("(d) Wind Wall counters the Flowed Onslaught: it would go to the trash (425.1.a.1) but Flow's replacement BANISHES it instead → P1's banishment; no +6 anywhere; NO Student trigger for Onslaught (425.1.b) — only P2's Student +1 for Wind Wall itself; P1's [4] unrefunded and P1's play count stays 1 (419.4.b)", async () => {
    const game = await board().build();
    await game.p1.cast("ons", { flow: true, targets: "s1" });
    await game.p1.passPriority();
    expect(game.p2.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options).toEqual([["ons"]]);
    await game.p2.cast("ww");
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["ons"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("s1").might).toBe(2);
    expect(game.state("k").might).toBe(3);
    expect(game.state("s2").might).toBe(3); // +1: P2's own Wind Wall resolved
    expect(game.p1.energy()).toBe(4); // 425.1.c
    expect(game.p1.can("cast", "ons")).toBe(false); // banished, not in the trash
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // a COUNTERED play still counts as finalized
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Reversal on a HAND-cast Onslaught (base cost 4): no Flow rider exists → after resolving under P2 (K +6, s2 +2) the card goes to its OWNER's — P1's — TRASH (157 / 359.3.d), not P2's, not banishment", async () => {
    const game = await board("hand").build();
    expect(game.p1.option("cast", "ons")?.variants.every((v) => (v.params as { viaFlow?: boolean }).viaFlow !== true)).toBe(true);
    const d = await reversed(game);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["k", "s1", "s2"]);
    await game.p2.pick("k");
    await game.settle();
    expect(game.state("k").might).toBe(9);
    expect(game.state("s2").might).toBe(4);
    expect(game.state("s1").might).toBe(2);
    expect(game.zoneOf("ons")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ons"]);
    expect(game.p2.trash()).toEqual(["mr"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(d) … where P1 (still P1's turn, 4 energy left) CAN now Flow it for [4]: it resolves under P1 this time (s1 +6 and s1's own +1 → 9) and is THEN banished", async () => {
    const game = await board("hand").build();
    await reversed(game);
    await game.p2.pick("k");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ons")).toBe(true);
    expect(game.p1.option("cast", "ons")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("ons", { flow: true, targets: "s1" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("s1").might).toBe(2 + 6 + 1);
    expect(game.state("s2").might).toBe(4); // nothing more for P2
    expect(game.zoneOf("ons")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["ons"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
