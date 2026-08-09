/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind] · Action
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the
 *      rest. Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Ravenbloom Student (ogn-103-298) · Unit · Mind · 2 · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."   — copy A on the board, copy B flipped by PF
 *   × Incinerate (ogs-003-024) · Spell · Fury · 2 · Action — "Deal 2 to a unit at a battlefield."  (P2's flip)
 *
 * Rules: 354.2 / 354.3 + 303.2.a (plays instructed during a resolution become Pending — next player's
 * first — and wait for the resolving spell to finish), 419.4.a + 383.2.c ("when you play a spell"
 * triggers only once the spell has RESOLVED, i.e. after both plays are already queued → the trigger is
 * appended third), 337.1 / 337.1.a / 337.1.b / 337.3 / 337.4 (all Pending items are finalized oldest-first
 * and nobody gets priority until none is pending), 337.2 + 143.4 (a finalized unit resolves at once and
 * enters exhausted), 355.5 / 355.9.a / 355.15 (Incinerate's target is a unit ON THE BOARD, locked when
 * Incinerate is finalized — a still-Pending Student B is not a unit), 384.2 / 365.1 (B's own trigger
 * cannot see PF: B was not on the board when PF resolved), 340.1 (newest resolves first: A's +1 before
 * Incinerate's damage), 419.3 / 419.3.b / 312.1.b.1 (an instructed play ignores Action timing/priority),
 * 356.1.b.2 (Energy zeroed; Incinerate has no Power cost → free).
 *
 * Q: P1's turn; Student A (2) at P1's bf1; P2's Bystander at bf2. P1 casts PF, banishes Student B; P2
 * banishes Incinerate.
 *  (a) chain oldest→newest = [Incinerate (P2), Student B (P1), A's +1 (P1)], finalized in that order.
 *  (b) P2 finalizing Incinerate may NOT choose B (still pending) — only A / Bystander.
 *  (c) B gets no +1 for PF; A gets exactly one.
 *  (d) first priority window only after all three are finalized (B already on the board); resolution
 *      A+1 (A = 3) then Incinerate 2 → A survives with 2 damage; heals at end of turn.
 *  (e) Incinerate's [Action] tag and 2 Energy are irrelevant — it is free and legal here.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const INCINERATE = "ogs-003-024";
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

/**
 * P1's turn 2, nothing played yet. P1: 9 energy + [mind] (PF leaves exactly 4). P2: 2 energy that must
 * stay untouched. Student A at P1's bf1; P2's 2-Might Bystander at P2's bf2 (a second legal Incinerate
 * target so the choice is actually presented). Student B tops P1's deck, Incinerate tops P2's.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "studentA")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander")
    .deck(P1, [RAVENBLOOM_STUDENT, FILLER, FILLER, FILLER, FILLER, FILLER], ["studentB", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [INCINERATE, FILLER, FILLER, FILLER, FILLER, FILLER], ["incinerate", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const chainIds = (game: Game): string[] => game.chain().map((c) => c.cardId);
const keysOf = (d: Decision | null): string[] => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);
const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Step (passes / forced answers only) until `pred` holds for the current decision. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 40): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return game.decision();
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

/** Cast PF, let it resolve, P1 banishes Student B, P2 (seeing that) banishes Incinerate. Stops right after P2's pick. */
async function castAndFlip(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
  await until(game, isPickFor(P1, /banish/i));
  await game.p1.pick("studentB");
  expect(game.zoneOf("studentB")).toBe("banishment");
  await until(game, isPickFor(P2, /banish/i));
  await game.p2.pick("incinerate");
}

/** Drive the two instructed plays: P2 aims Incinerate at Student A, P1 puts Student B at bf1. Stops at the next chain priority window. */
async function finalizeBoth(game: Game): Promise<void> {
  await until(game, isPickFor(P2, /target/i));
  await game.p2.pick("studentA");
  await until(game, isPickFor(P1, /destination/i));
  await game.p1.pick("battlefield-bf1");
  await until(game, isChainPriority);
}

describe("Promising Future × Ravenbloom Student (board + flipped) × flipped Incinerate — pending-play ordering", () => {
  // ── (a) order on the chain ─────────────────────────────────────────────────────────────────────

  // Expected (419.4.a, 383.2.c): "when you play a spell" is satisfied only when PF has RESOLVED; while
  // the players are still making PF's banish picks PF is mid-resolution, so A's trigger cannot be on the
  // chain yet. Actual: the engine puts A's +1 trigger on the chain as PF starts resolving — it is already
  // there during the banish picks.
  test("BUG: (a) Student A's trigger is not on the chain while PF is still resolving (during the banish picks) — PF is 'played' only once it has resolved (419.4.a)", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    expect(chainIds(game)).toEqual(["pf"]); // casting alone triggers nothing
    await until(game, isPickFor(P1, /banish/i));
    expect(chainIds(game)).not.toContain("studentA");
    await game.p1.pick("studentB");
    await until(game, isPickFor(P2, /banish/i));
    expect(chainIds(game)).not.toContain("studentA");
  });

  // Expected (354.2/354.3, 303.2.a, 419.4.a, 337.1.b): after the picks the chain reads oldest→newest
  // [Incinerate (P2, next player), Student B (P1), A's +1 (appended when PF finished)], and the first
  // thing anyone is asked is P2 finalizing Incinerate (its target). Actual: [A's +1, Student B,
  // Incinerate] — the trigger is oldest and the turn player's play is queued before the next player's.
  test("BUG: (a) after both picks the chain is [Incinerate, Student B, A's +1] oldest→newest, and P2 — controller of the oldest pending item — is immediately asked to finalize Incinerate (337.1, 337.1.b)", async () => {
    const game = await board().build();
    await castAndFlip(game);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["incinerate", P2],
      ["studentB", P1],
      ["studentA", P1],
    ]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.prompt : "").toMatch(/target/i);
  });

  test("(a) finalization order as observed: P2 is asked for Incinerate's target BEFORE P1 is asked where Student B goes; B then enters bf1 exhausted and resolves at once (337.1.b, 337.2, 143.4)", async () => {
    const game = await board().build();
    await castAndFlip(game);
    let p1PlacedFirst = false;
    await until(game, (d) => {
      p1PlacedFirst ||= isPickFor(P1, /destination/i)(d);
      return isPickFor(P2, /target/i)(d);
    });
    expect(p1PlacedFirst).toBe(false);
    expect(game.zoneOf("studentB")).toBe("banishment"); // still waiting behind Incinerate
    await game.p2.pick("studentA");
    const dest = await until(game, isPickFor(P1, /destination/i));
    expect(keysOf(dest).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("studentB")).toBe("battlefield-bf1");
    expect(game.state("studentB")).toMatchObject({ controller: P1, isExhausted: true });
    expect(chainIds(game)).not.toContain("studentB"); // a unit resolves immediately, never lingers on the chain
    expect(game.p1.energy()).toBe(4); // B's 2 Energy ignored
  });

  // ── (b) Incinerate cannot wait for Student B ───────────────────────────────────────────────────

  test("(b) when P2 finalizes Incinerate, Student B is still a pending item in banishment — only units on the board at a battlefield are offered (A, Bystander); B is absent and rejected (355.5, 355.9.a, 355.15)", async () => {
    const game = await board().build();
    await castAndFlip(game);
    const d = await until(game, isPickFor(P2, /target/i));
    expect(game.zoneOf("studentB")).toBe("banishment");
    expect(keysOf(d).sort()).toEqual(["bystander", "studentA"]);
    expect(keysOf(d)).not.toContain("studentB");
    expect((await game.p2.try((p) => p.pick("studentB"))).ok).toBe(false);
    await game.p2.pick("studentA");
    expect(game.chain().find((c) => c.cardId === "incinerate")).toMatchObject({ controller: P2, targets: ["studentA"], triggered: false });
  });

  // ── (c) who gets +1 ────────────────────────────────────────────────────────────────────────────

  test("(c) Student B gets NO +1 for Promising Future (it was not on the board when PF resolved — 384.2, 365.1): once placed it is a plain 2-Might unit and no B trigger is ever on the chain; A has exactly one trigger", async () => {
    const game = await board().build();
    await castAndFlip(game);
    await finalizeBoth(game);
    expect(game.zoneOf("studentB")).toBe("battlefield-bf1");
    expect(game.state("studentB")).toMatchObject({ baseMight: 2, might: 2 });
    expect(game.chain().filter((c) => c.cardId === "studentB")).toEqual([]);
    expect(game.chain().filter((c) => c.cardId === "studentA" && c.triggered)).toHaveLength(1);
    await until(game, isOpenMain);
    expect(game.state("studentB").might).toBe(2);
  });

  // ── (d) priority and resolution order ──────────────────────────────────────────────────────────

  // Expected (337.1.a, 337.3, 337.4): finalizing does not pass priority; with items still Pending the game
  // keeps finalizing. The first Reaction window after the picks therefore opens with Student B already on
  // the board and Incinerate already aimed. Actual: P2 is handed priority ("respond to Incinerate")
  // right after the picks, while Incinerate and Student B are both still un-finalized in banishment.
  test("BUG: (d) nobody receives priority until every pending item is finalized — the first chain priority after the picks sees B on the board and Incinerate targeted, chain = [Incinerate, A's +1] (337.1.a, 337.3, 337.4)", async () => {
    const game = await board().script(P2, ["studentA"]).script(P1, ["battlefield-bf1"]).build();
    await castAndFlip(game);
    await until(game, isChainPriority);
    expect(game.zoneOf("studentB")).toBe("battlefield-bf1");
    expect(game.zoneOf("incinerate")).toBe("chain");
    expect(game.chain().map((c) => [c.cardId, c.targets ?? null])).toEqual([
      ["incinerate", ["studentA"]],
      ["studentA", null],
    ]);
  });

  // Expected (340.1): A's +1 is the NEWEST item → resolves first (A = 3 Might); Incinerate then deals 2 to a
  // 3-Might unit → A survives at bf1 with 2 damage; Incinerate → P2's trash. Actual: the engine queued A's
  // trigger first (oldest), so Incinerate resolves first, deals 2 to a 2-Might A and kills it.
  test("BUG: (d) resolution is newest-first: A's +1 resolves (A = 3), THEN Incinerate deals 2 → A survives at bf1 with 2 damage (340.1)", async () => {
    const game = await board().build();
    await castAndFlip(game);
    await finalizeBoth(game);
    await until(game, isOpenMain);
    expect(game.zoneOf("incinerate")).toBe("trash");
    expect(game.p2.trash()).toContain("incinerate");
    expect(game.zoneOf("studentA")).toBe("battlefield-bf1");
    expect(game.state("studentA")).toMatchObject({ damage: 2, might: 3 });
    expect(game.p1.units("bf1").sort()).toEqual(["studentA", "studentB"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Expected: damage heals at end of turn before "this turn" bonuses lapse → A is a healthy 2-Might unit on
  // P2's turn. Actual: A already died (see above).
  test("BUG: (d) A lives on: at end of turn its 2 damage heals and the +1 expires — on P2's turn A is at bf1 with 2 Might and 0 damage", async () => {
    const game = await board().build();
    await castAndFlip(game);
    await finalizeBoth(game);
    await until(game, isOpenMain);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("studentA")).toBe("battlefield-bf1");
    expect(game.state("studentA")).toMatchObject({ damage: 0, might: 2 });
  });

  // ── (e) timing / cost of the flipped Incinerate ────────────────────────────────────────────────

  test("(e) Incinerate's [Action] timing and 2 Energy don't matter: P2 plays it on P1's turn outside any showdown as instructed, pays nothing (P2 stays at 2 energy), and it really resolves — 2 damage dealt, card in P2's trash (419.3.b, 312.1.b.1, 356.1.b.2)", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    await castAndFlip(game);
    expect(game.p2.energy()).toBe(2);
    await finalizeBoth(game);
    expect(game.p2.energy()).toBe(2); // finalized for free
    expect(game.zoneOf("incinerate")).toBe("chain");
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 }); // PF + B; Incinerate
    await until(game, isOpenMain);
    expect(game.p2.energy()).toBe(2);
    expect(game.zoneOf("incinerate")).toBe("trash");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    // Its 2 damage landed on Student A one way or the other (kills a 2-Might A / marks a 3-Might A).
    const a = game.zoneOf("studentA");
    expect(a === "trash" || game.state("studentA").damage === 2).toBe(true);
    expect(game.state("bystander").damage).toBe(0);
  });
});
