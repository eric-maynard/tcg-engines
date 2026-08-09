/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the
 *      rest. Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Viktor, Innovator (ogn-117-298) · Champion Unit · Mind · 4+[mind] · 3 Might — controlled by P2
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × Wind Wall (ogn-064-298) · Reaction spell · Calm · 3+[calm][calm] — "Counter a spell."  (P1's hand)
 *   with P2's banished card = U (vanilla 4-cost / 4-Might unit) or S = Incinerate (ogs-003-024, Action
 *   spell, 2: "Deal 2 to a unit at a battlefield"), and P1's banished card X = a vanilla 3-cost / 3-Might unit.
 *
 * Rules: 354.3 + 303.2.a (plays queued during PF's resolution: next player's first), 337.1 / 337.1.b /
 * 337.2 / 337.4 (pending items are FINALIZED oldest-first before anyone gains priority; a unit resolves at
 * once), 419.4.a (a permanent is "played" when it enters; a spell only when it RESOLVES), 419.4.a.1 + 425.1.b
 * (a countered spell was never played for play-triggers), 419.4.b (…but still counts as a card that player
 * finalized this turn), 383.2.c (a trigger created mid-sequence is appended to the current chain), 350.1 /
 * 350.2 + 185.2.a (playing a token is a play, but a token is not a CARD), 340.1 (LIFO), 355.9.a (S picks its
 * target at finalization — X is not on the board yet), 143.4 (enters exhausted).
 *
 * Q (P1's turn; P2 controls Viktor; P1 casts PF, banishes X; P2 banishes …):
 *   (a) a unit U            → U finalized first and enters → Viktor triggers NOW (before X is placed); after
 *                             X enters the first priority window already holds the Recruit trigger; it
 *                             resolves into ONE Recruit token, which does not re-trigger Viktor.
 *   (b) spell S, unanswered → S finalized (target = Victim), X enters, priority with S alone and NO Viktor
 *                             trigger; passes → S resolves → Viktor triggers on a fresh chain → one token.
 *   (c) spell S + Wind Wall → P1 counters S in that window; WW resolves first; S countered ⇒ never "played"
 *                             ⇒ Viktor never triggers, no token (S still counts for 419.4.b bookkeeping).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const VIKTOR_INNOVATOR = "ogn-117-298";
const WIND_WALL = "ogn-064-298";
const INCINERATE = "ogs-003-024"; // S
const UNIT_U = { cardType: "unit", energyCost: 4, might: 4, name: "Unit U" } as const;
const UNIT_X = { cardType: "unit", energyCost: 3, might: 3, name: "Unit X" } as const;
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

type Variant = "unit" | "spell";

/**
 * P1's turn. P1: 8 energy + [mind] + [calm][calm] → PF (5+[mind]) leaves exactly Wind Wall's 3+[calm][calm].
 * P1 controls bfP1 with a 3-Might "Victim" on it (Incinerate's only legal target). P2: Viktor, Innovator in
 * base, 0 resources (PF ignores Energy; U / Incinerate have no Power cost). X tops P1's deck; U or S tops P2's.
 */
function board(v: Variant) {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 2, mind: 1 } })
    .battlefield("bfP1", { controller: P1 })
    .unit(P1, "bfP1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", VIKTOR_INNOVATOR, "vik")
    .deck(P1, [UNIT_X, FILLER, FILLER, FILLER, FILLER, FILLER], ["x", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [v === "unit" ? UNIT_U : INCINERATE, FILLER, FILLER, FILLER, FILLER, FILLER], ["p2card", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P1, WIND_WALL, "ww");
}

type Pred = (d: Decision | null) => boolean;
const isOpenMain: Pred = (d) => d?.kind === "action" && d.context === "main";
const isChainPriority: Pred = (d) => d?.kind === "action" && d.context === "chain";
const isPickFor = (seat: string, re: RegExp): Pred => (d) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);

/** Cast PF, pass it out, and make both banish picks: P1 → X, then P2 → its top card. */
async function castAndBanish(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2, mind: 0 } });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("x");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("p2card");
}

/**
 * Step the game — passing priority, placing U/X in their controller's base when asked — until `stop`
 * holds (or P1's open main phase). Returns the decision it stopped at.
 */
async function drive(game: Game, stop: Pred, max = 40): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (stop(d) || isOpenMain(d) || !d) {
      break;
    }
    if (d.kind === "pick" && d.semantics === "destination") {
      await game.seat(d.seat).pick("base");
      continue;
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason === "unanswered" && !stop(game.decision())) {
      throw new Error(`unexpected prompt: ${JSON.stringify(r.decision)}`);
    }
  }
  return game.decision();
}

function recruitTokens(game: Game): string[] {
  return game.p2.units().filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");
}

const vikItems = (game: Game) => game.chain().filter((c) => c.cardId === "vik" && c.triggered);

describe("Promising Future × Viktor, Innovator × Wind Wall — when is the opponent's card 'played'?", () => {
  // ── common start ──────────────────────────────────────────────────────────────────────────────
  // rule 337.1 / 337.1.b (finalization) — both cards go on the chain as pending plays, next player (P2)
  // first; P2's play needs no decision (one location / one target), so it is finalized straight away and
  // the very next decision point is already P1's destination pick for X, with X still banished.
  test("common: after both picks PF is finished (trash); P2's card — the older pending play — is already finalized (U on the board / S a targeted spell item) while X still waits in banishment for P1's destination; nothing off the token yet", async () => {
    for (const v of ["unit", "spell"] as const) {
      const game = await board(v).build();
      await castAndBanish(game);
      expect(game.zoneOf("pf")).toBe("trash");
      expect(game.zoneOf("x")).toBe("banishment");
      expect(game.zoneOf("p2card")).toBe(v === "unit" ? "base" : "chain");
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual(
        v === "unit"
          ? [["x", P1], ["vik", P2]] // U entered on P1's turn → Viktor's trigger appended behind X's play
          : [["p2card", P2], ["x", P1]], // S kept its slot as a finalized spell item
      );
      expect(vikItems(game)).toHaveLength(v === "unit" ? 1 : 0); // never off P1's Promising Future itself
      expect(recruitTokens(game)).toEqual([]);
      expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1, [P2]: 1 });
      expect(game.turnPlayer()).toBe(P1);
    }
  });

  // ── (a) P2 banished a UNIT ────────────────────────────────────────────────────────────────────
  test("(a) U is finalized first and ENTERS P2's base (exhausted) while X is still banished — that completes 'playing a card on an opponent's turn', so a P2-controlled Viktor trigger is already on the chain when P1 is asked where X goes (337.1.b, 337.2, 419.4.a, 383.2.c)", async () => {
    const game = await board("unit").build();
    await castAndBanish(game);
    const d = await drive(game, isPickFor(P1, /destination/i));
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(game.zoneOf("p2card")).toBe("base");
    expect(game.state("p2card")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    expect(game.zoneOf("x")).toBe("banishment");
    expect(vikItems(game)).toEqual([expect.objectContaining({ cardId: "vik", controller: P2, triggered: true })]);
    expect(recruitTokens(game)).toEqual([]); // the trigger has not resolved
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  // Expected (337.1 / 337.4): pending items are finalized oldest-first BEFORE anyone gains priority, so the
  // very first chain-priority decision after the picks already shows U in P2's base, X in P1's base and
  // the Viktor trigger as the only chain item. Actual: the engine opens "respond to Unit U" / "respond to
  // Unit X" priority windows while those plays are still pending in banishment.
  test("BUG: (a) the FIRST priority window after the picks comes only after both plays are finalized: U and X are on the board and the Recruit trigger is the sole chain item (337.1, 337.4)", async () => {
    const game = await board("unit").build();
    await castAndBanish(game);
    const d = await drive(game, isChainPriority);
    expect(isChainPriority(d)).toBe(true);
    expect(game.zoneOf("p2card")).toBe("base");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vik", controller: P2, triggered: true })]);
  });

  test("(a) once X has entered, the chain holds exactly the one Viktor trigger and both players get priority over it (P2's item → P2 first) before it resolves", async () => {
    const game = await board("unit").build();
    await castAndBanish(game);
    await drive(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vik", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(recruitTokens(game)).toEqual([]);
    await game.p1.passPriority();
    expect(recruitTokens(game)).toHaveLength(1);
  });

  test("(a) resolution: exactly ONE 1-Might Recruit unit TOKEN enters P2's base, exhausted, on P1's turn; playing the token does NOT re-trigger Viktor (a token is not a card, 350.2/185) — chain empty, still one token, P2's cards-played count stays 1", async () => {
    const game = await board("unit").build();
    await castAndBanish(game);
    await drive(game, isOpenMain);
    expect(isOpenMain(game.decision())).toBe(true);
    const toks = recruitTokens(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P2, isExhausted: true, isToken: true, might: 1, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(vikItems(game)).toEqual([]);
    expect(game.p2.base().sort()).toEqual(["p2card", toks[0] as string, "vik"].sort());
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P2 banished a SPELL, nobody answers ───────────────────────────────────────────────────
  test("(b) S (Incinerate) is finalized first: its target is chosen NOW and can only be Victim — X is still banished and never offered — with P2's 0 energy untouched (355.9.a, 356.1.b)", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    let offeredX = false;
    const d = await drive(game, (x) => {
      offeredX ||= x?.kind === "pick" && x.seat === P2 && x.options.some((o) => (o.card ?? o.key) === "x");
      return game.chain().some((c) => c.cardId === "p2card" && !c.triggered && (c.targets?.length ?? 0) > 0);
    });
    expect(d).not.toBeNull();
    expect(offeredX).toBe(false);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "p2card", controller: P2, targets: ["victim"], type: "spell" }));
    expect(game.zoneOf("x")).toBe("banishment");
    expect(game.p2.energy()).toBe(0);
    expect(vikItems(game)).toEqual([]); // finalizing a spell is not playing it
  });

  test("(b) then X is finalized and enters P1's base; at that point S is the ONLY item on the chain and there is still NO Viktor trigger — a spell is 'played' only when it resolves (419.4.a, 350.1)", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await drive(game, isPickFor(P1, /destination/i));
    expect(game.zoneOf("p2card")).toBe("chain");
    await game.p1.pick("base");
    expect(game.zoneOf("x")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p2card", controller: P2, targets: ["victim"], triggered: false })]);
    expect(vikItems(game)).toEqual([]);
    expect(recruitTokens(game)).toEqual([]);
    expect(game.state("victim").damage).toBe(0);
    expect(isChainPriority(game.decision())).toBe(true);
  });

  // Same engine gap as in (a): priority windows are opened over still-pending plays. Expected: the first
  // chain-priority decision after the picks sees S finalized (target locked) AND X already in P1's base.
  test("BUG: (b) the FIRST priority window after the picks has S finalized and X already on the board (337.1, 337.4)", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    const d = await drive(game, isChainPriority);
    expect(isChainPriority(d)).toBe(true);
    expect(game.zoneOf("x")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p2card", targets: ["victim"], triggered: false })]);
  });

  test("(b) everyone passes → S resolves (Victim takes 2, S to P2's trash) → NOW Viktor triggers: a fresh chain holding just the P2 Recruit trigger, with priority to P2 then P1 again", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await drive(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    // Pass S out.
    const d = await drive(game, (x) => isChainPriority(x) && vikItems(game).length > 0);
    expect(game.zoneOf("p2card")).toBe("trash");
    expect(game.p2.trash()).toContain("p2card");
    expect(game.state("victim").damage).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vik", controller: P2, triggered: true })]);
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(recruitTokens(game)).toEqual([]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) end state: one exhausted 1-Might Recruit token in P2's base, Victim at 2 damage, X in P1's base, chain empty — and again no second trigger off the token", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await drive(game, isOpenMain);
    const toks = recruitTokens(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ controller: P2, isExhausted: true, might: 1 });
    expect(game.state("victim").damage).toBe(2);
    expect(game.zoneOf("x")).toBe("base");
    expect(game.zoneOf("p2card")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
    expect(game.p1.hand()).toEqual(["ww"]); // never needed
    expect(game.violations()).toEqual([]);
  });

  // ── (c) P2 banished a SPELL, P1 answers with Wind Wall ────────────────────────────────────────
  /** Drive to P1's first priority at which Wind Wall may target S, and cast it. */
  async function windWallTheSpell(game: Game): Promise<void> {
    const canCounter: Pred = (d) =>
      d?.kind === "action" &&
      d.context === "chain" &&
      d.seat === P1 &&
      (game.p1.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options ?? []).flat().includes("p2card");
    const d = await drive(game, canCounter);
    expect(canCounter(d)).toBe(true);
    await game.p1.cast("ww", { targets: "p2card" });
  }

  test("(c) in the priority window over S, Wind Wall is legal for P1 with S as its (only) spell target; casting it spends exactly 3 + [calm][calm] and stacks WW above S", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await windWallTheSpell(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toContain("p2card");
    expect(ids.at(-1)).toBe("ww"); // newest on top
    expect(game.chain().find((c) => c.cardId === "ww")).toMatchObject({ controller: P1, targets: ["p2card"], type: "spell" });
    expect(vikItems(game)).toEqual([]);
  });

  test("(c) Wind Wall resolves first (LIFO, 340.1) and counters S: both spells end in their owners' trashes and Victim is undamaged", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await windWallTheSpell(game);
    await drive(game, isOpenMain);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["pf", "ww"]));
    expect(game.zoneOf("p2card")).toBe("trash");
    expect(game.p2.trash()).toEqual(["p2card"]);
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("x")).toBe("base"); // X's play is unaffected
  });

  test("(c) a countered spell was never 'played' for play-triggers (419.4.a.1, 425.1.b): Viktor NEVER triggers — no Viktor chain item at any point and no Recruit token", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await windWallTheSpell(game);
    let sawVik = false;
    await drive(game, (d) => {
      sawVik ||= vikItems(game).length > 0;
      return isOpenMain(d);
    });
    expect(sawVik).toBe(false);
    expect(recruitTokens(game)).toEqual([]);
    expect(game.p2.base()).toEqual(["vik"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) …yet S still counts as a card P2 FINALIZED this turn for non-trigger bookkeeping such as Legion (419.4.b): P2's cards-played count is 1 (P1's is 3: PF, WW, X)", async () => {
    const game = await board("spell").build();
    await castAndBanish(game);
    await windWallTheSpell(game);
    await drive(game, isOpenMain);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 3, [P2]: 1 });
  });
});
