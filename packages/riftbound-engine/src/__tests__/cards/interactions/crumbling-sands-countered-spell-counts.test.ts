/**
 * Interaction: Crumbling Sands (ven-039-166) — Calm Reaction spell, [1]+[calm]
 *     "Counter a spell if an opponent has played another spell this turn."
 *   × Wind Wall (ogn-064-298) — Calm Reaction spell, [3]+[calm][calm]: "Counter a spell."
 *   × Chemtech Cask (sfd-063-221) — Mind gear, [1]
 *     "When you play a spell on an opponent's turn, you may exhaust me to play a Gold gear token exhausted."
 *   (+ Discipline ogn-058-298 as P2's spells A and B — "[Reaction] Give a unit +2 [Might] this turn.
 *    Draw 1." — and Ravenbloom Student ogn-103-298 "When you play a spell, give me +1 [Might] this
 *    turn" as P2's own play-trigger witness.)
 *
 * Question: P2's turn. P2 plays spell A; P1 (who controls Chemtech Cask) responds with Wind Wall,
 * countering A. Later that turn P2 plays spell B and P1 responds with Crumbling Sands.
 *   (a) Did Chemtech Cask trigger off Wind Wall, and when?
 *   (b) Does countered spell A satisfy Crumbling Sands' "if an opponent has played another spell
 *       this turn" so that B is countered?
 *   Contrast: A NOT countered but P2's only prior spell → same answer; P2 has finalized no other
 *   spell this turn → Sands resolves but counters nothing.
 *
 * Rules:
 *   419.4.a   — "when you play a spell" triggers fire when the spell finishes RESOLVING.
 *   419.4.a.1 / 425.1.b — a countered spell never resolved → play-triggers for it do not fire.
 *   419.4.b   — NON-triggered "has played" checks reference Finalization (Legion / Battering Ram):
 *               a countered spell was still played.
 *   425.1.a   — a countered card does nothing and goes to trash.
 *   383.2.c   — trigger conditions are evaluated after the inciting event is processed.
 *
 * Expected: (a) yes — after Wind Wall resolves (on P2's turn) Cask's trigger goes on the chain; P1
 *   may exhaust Cask for an exhausted Gold token. P2's Ravenbloom trigger for A does NOT fire.
 *   (b) yes — A was finalized, so Sands' condition is true and B is countered (no +2, no draw). Cask
 *   triggers again off Sands if still ready. With no other P2 spell finalized this turn, Sands
 *   resolves with a false condition, B resolves normally, and Sands still counts as played for Cask.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRUMBLING_SANDS = "ven-039-166";
const WIND_WALL = "ogn-064-298";
const CHEMTECH_CASK = "sfd-063-221";
const DISCIPLINE = "ogn-058-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/**
 * P2's turn. P2: Ravenbloom Student (2) in base, Discipline ×2 (A, B) in hand, [4].
 * P1: Chemtech Cask (ready) in base, Wind Wall + Crumbling Sands in hand, [4] + 3 calm (exactly both).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { calm: 3 } })
    .resources(P2, { energy: 4 })
    .unit(P2, "base", RAVENBLOOM_STUDENT, "student")
    .gear(P1, CHEMTECH_CASK, "cask")
    .hand(P1, WIND_WALL, "windwall")
    .hand(P1, CRUMBLING_SANDS, "sands")
    .hand(P2, DISCIPLINE, "discA")
    .hand(P2, DISCIPLINE, "discB");
}

/** P2 casts A at Student and passes; P1 answers with Wind Wall on A; both pass → Wind Wall resolves. */
async function windWallCountersA(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("discA", { targets: "student" });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "windwall")).toBe(true);
  await game.p1.cast("windwall", { targets: "discA" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["discA", "windwall"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Wind Wall resolves → A countered
  return game;
}

/** Answer Cask's "you may exhaust me" prompt and let the (now targetless) trigger resolve. */
async function answerCask(game: Game, accept: boolean): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cask" } });
  await (accept ? game.p1.yes() : game.p1.no());
  // The trigger item (if any remains) resolves once both pass.
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "cask"); i++) {
    await game.acting().passPriority();
  }
}

/** From an open P2 main phase: P2 casts B at Student, passes; P1 answers with Crumbling Sands on B; both pass. */
async function sandsAnswersB(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  await game.p2.cast("discB", { targets: "student" });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "sands")).toBe(true);
  await game.p1.cast("sands", { targets: "discB" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["discB", "sands"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Crumbling Sands resolves
}

describe("Crumbling Sands × Wind Wall × Chemtech Cask — does a countered spell count as 'played'?", () => {
  // ── (a) Wind Wall counters A; Cask triggers on Wind Wall's resolution ─────────────────

  test("(a) Wind Wall counters A: A does nothing (Student not +2, P2 draws nothing) and both spells go to trash (425.1.a)", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("discA", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.cast("windwall", { targets: "discA" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("discA")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.state("student").might).toBe(2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // A left the hand, no "Draw 1"
  });

  test("(a) Cask does NOT trigger when Wind Wall is finalized — only the two spells are on the chain while it waits (419.4.a)", async () => {
    const game = await board().build();
    await game.p2.cast("discA", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.cast("windwall", { targets: "discA" });
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline", "Wind Wall"]);
    expect(game.chain().some((c) => c.triggered)).toBe(false);
    expect(game.state("cask").isExhausted).toBe(false);
  });

  test("(a) when Wind Wall RESOLVES (on P2's turn) Cask's trigger goes on the chain and asks P1 'you may exhaust me' (419.4.a, 383.2.c)", async () => {
    const game = await windWallCountersA();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cask", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("(a) accepting: Cask becomes exhausted and P1 gets a Gold gear token that enters EXHAUSTED", async () => {
    const game = await windWallCountersA();
    await answerCask(game, true);
    expect(game.state("cask").isExhausted).toBe(true);
    const gear = game.p1.gear();
    expect(gear).toHaveLength(2);
    const gold = gear.find((g) => g !== "cask") as string;
    expect(game.state(gold)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) P2's own 'when you play a spell' trigger (Ravenbloom Student) does NOT fire for countered A — Student stays 2, no P2 trigger ever hits the chain (419.4.a.1, 425.1.b)", async () => {
    const game = await windWallCountersA();
    expect(game.chain().every((c) => c.controller === P1)).toBe(true); // only Cask's trigger
    await answerCask(game, false);
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").mightModifier).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(a)/(b) bridge: countered A still counts as a spell P2 PLAYED (finalized) this turn for non-triggered checks (419.4.b)", async () => {
    const game = await windWallCountersA();
    await answerCask(game, false);
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // Wind Wall
  });

  // ── (b) Crumbling Sands vs B after countered A ────────────────────────────────────────

  test("(b) Crumbling Sands is a legal [1]+[calm] response to B and offers B as its target", async () => {
    const game = await windWallCountersA();
    await answerCask(game, false);
    await game.p2.cast("discB", { targets: "student" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sands")).toBe(true);
    const field = game.p1.option("cast", "sands")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["discB"]]);
    await game.p1.cast("sands", { targets: "discB" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(b) countered A satisfies 'an opponent has played another spell this turn' → B is COUNTERED: B to trash, Student not +2, P2 draws nothing (419.4.b)", async () => {
    const game = await windWallCountersA();
    await answerCask(game, true); // Cask now exhausted → no second prompt to answer
    const p2Hand = game.p2.hand().length;
    await sandsAnswersB(game);
    expect(game.zoneOf("sands")).toBe("trash");
    expect(game.zoneOf("discB")).toBe("trash");
    expect(game.state("student").might).toBe(2); // neither Discipline's +2 nor Student's own +1
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(2); // A and B both finalized
    expect(game.violations()).toEqual([]);
  });

  test("(b) if Cask was kept READY the first time, it triggers AGAIN when Crumbling Sands resolves and can make the Gold token then", async () => {
    const game = await windWallCountersA();
    await answerCask(game, false);
    expect(game.state("cask").isExhausted).toBe(false);
    await sandsAnswersB(game);
    expect(game.zoneOf("discB")).toBe("trash"); // B already countered by the time Cask asks
    await answerCask(game, true);
    expect(game.state("cask").isExhausted).toBe(true);
    expect(game.p1.gear()).toHaveLength(2);
    expect(game.state("student").might).toBe(2);
  });

  // ── contrast 1: A resolved UNcountered — still "another spell" ────────────────────────

  test("contrast: P1 lets A resolve (Student 2→4→5 with its own trigger, P2 draws) — A is still 'another spell played', so Sands counters B all the same", async () => {
    const game = await board().build();
    await game.p2.cast("discA", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // A resolves: +2, draw 1, then Student's play-trigger +1
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("student").might).toBe(5);
    const p2Hand = game.p2.hand().length;
    await sandsAnswersB(game);
    expect(game.zoneOf("discB")).toBe("trash");
    expect(game.state("student").might).toBe(5); // no further +2 / +1
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    // Cask triggers off Sands (P1's first spell this turn, on P2's turn).
    await answerCask(game, true);
    expect(game.state("cask").isExhausted).toBe(true);
  });

  // ── contrast 2: B is P2's FIRST spell — condition false ───────────────────────────────

  test("contrast: with no other P2 spell finalized this turn, Sands is still castable at B but resolves countering NOTHING — B stays on the chain, then resolves (+2, draw 1, Student trigger +1 → 5)", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await sandsAnswersB(game);
    expect(game.zoneOf("sands")).toBe("trash");
    expect(game.zoneOf("discB")).toBe("chain"); // NOT countered
    // Sands nevertheless resolved → it was "played" → Cask triggers (on top of B).
    expect(game.chain().map((c) => c.cardId)).toEqual(["discB", "cask"]);
    await answerCask(game, true);
    expect(game.state("cask").isExhausted).toBe(true);
    expect(game.p1.gear()).toHaveLength(2);
    // Now B resolves normally, then Student's own play-trigger.
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("discB")).toBe("trash");
    expect(game.state("student").might).toBe(5);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: 'ANOTHER spell' excludes the spell being countered — Sands at P2's first spell (A) counters nothing; a second Sands at B later that turn does, because A now counts", async () => {
    // P2 casts A; P1 responds with Sands #1: P2 has played only A itself → condition false, A resolves.
    // Then P2 casts B; P1 responds with Sands #2: A is "another spell" P2 played → B is countered.
    const game = await board().hand(P1, CRUMBLING_SANDS, "sands2").resources(P1, { energy: 2, power: { calm: 2 } }).build();
    await game.p2.cast("discA", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.cast("sands", { targets: "discA" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sands")).toBe("trash");
    expect(game.zoneOf("discA")).toBe("chain"); // A was P2's only spell → not countered
    await answerCask(game, false);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("discA")).toBe("trash");
    expect(game.state("student").might).toBe(5);
    // Second exchange: now A counts as "another spell" P2 played → sands2 DOES counter B.
    await game.p2.cast("discB", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.cast("sands2", { targets: "discB" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("discB")).toBe("trash");
    expect(game.state("student").might).toBe(5);
  });
});
