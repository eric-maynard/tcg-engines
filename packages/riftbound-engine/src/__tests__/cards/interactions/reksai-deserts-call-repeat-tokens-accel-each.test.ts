/**
 * Interaction: Rek'Sai, Breacher (sfd-029-221) · Champion Unit · Fury · 3 · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   × Desert's Call (sfd-031-221) · Spell · Calm · 2
 *     "[Repeat] [2] — Play a 2 [Might] Sand Soldier unit token."
 *   (+ watchers for (a): Ravenbloom Student ogn-103-298 "When you play a spell, +1 Might this turn";
 *      Pridestalker unl-183-219 "When you play a unit, give a unit +1 Might this turn"; Wind Wall ogn-064-298 for (e).)
 *
 * Rules: 820.1.d.1 (Repeat — the CR's own Desert's Call example: the instruction executes twice), 820.3.a
 * (still ONE spell played once), 350.2 / 185.2.a (tokens are PLAYED, following the play steps), 419.3.a/b
 * (a play during resolution is a Limited Play with all normal steps), 355.1.a + 805.1.a/805.2 (Accelerate =
 * optional additional [1][C] elected and paid AS the unit is played), 805.1.a.2 + 185.3.b (a domainless
 * token's [C] may be ANY domain — the granting Rek'Sai being Fury is irrelevant), 805.6 (paid → enters READY),
 * 143.4 (otherwise exhausted), 429.3 (Add reactions usable at each payment), 425.1.a/425.1.c.1 (countered:
 * nothing happens, no refund incl. Repeat), 419.4.b (a countered card was still Finalized → counts for Legion).
 *
 * Question: P1's turn, Rek'Sai in base, Desert's Call cast paying Repeat; pool afterwards 1 energy + 1 CALM.
 *   (a) How many chain items / spell plays vs how many unit plays?  (b) Does each token get its own Accelerate
 *   election mid-resolution, and what power domain does a domainless token need?  (c) With 1 energy + 1 calm:
 *   accelerate exactly one token → one READY, one EXHAUSTED, pool empty?  (d) Rek'Sai absent → both exhausted,
 *   no prompt.  (e) Wind Wall counters Desert's Call → tokens? refund?
 *
 * Expected: (a) one item, one spell play (Student +1 once), two token plays (Pridestalker triggers twice).
 * (b)/(c) yes — two independent elections during resolution; any-domain power; first token READY for [1][calm],
 * second cannot pay → EXHAUSTED; pool 0/0. (d) both exhausted, nothing asked, 1+1 left. (e) zero tokens, no
 * elections, 4 energy gone for good, Desert's Call + Wind Wall to trash, P1's finalized-card count still 1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REKSAI = "sfd-029-221";
const DESERTS_CALL = "sfd-031-221";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const PRIDESTALKER = "unl-183-219";
const WIND_WALL = "ogn-064-298"; // 3 + [calm][calm], Reaction: Counter a spell.

/** P1's turn-2 main phase: Desert's Call in hand, 5 energy + 1 calm (→ 1 + 1 calm after [2]+Repeat[2]); Rek'Sai in base unless disabled. */
function board(opts: { reksai?: boolean; pool?: { energy: number; power: Record<string, number> } } = {}) {
  const { reksai = true, pool = { energy: 5, power: { calm: 1 } } } = opts;
  const s = scenario().resources(P1, pool).hand(P1, DESERTS_CALL, "call");
  return reksai ? s.unit(P1, "base", REKSAI, "reksai") : s;
}

const soldiers = (game: Game) =>
  game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-"));

/** Is `d` a mid-resolution opt-in addressed to P1 (the Accelerate election of a token being played)? */
function isOptIn(d: Decision | null): boolean {
  return d !== null && d.seat === P1 && (d.kind === "yes-no" || (d.kind === "pick" && d.allowDecline));
}

/** Answer the current opt-in: accept (pay) or decline. */
async function answerOptIn(game: Game, accept: boolean): Promise<void> {
  const d = game.decision();
  if (d?.kind === "yes-no") {
    await game.p1.answer(accept);
  } else if (d?.kind === "pick") {
    await (accept ? game.p1.pick(d.options[0]?.key as string) : game.p1.decline());
  }
}

describe("Desert's Call with Repeat under Rek'Sai — one spell, two token plays, an Accelerate election for each", () => {
  // ── (a) one spell, two plays ──────────────────────────────────────────────────────────────────

  test("(a) paying [2] + Repeat [2]: exactly ONE Desert's Call item on the chain, pool 5/1calm → 1/1calm, P1's cards-played count is 1 (820.3.a)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "call")?.fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
    await game.p1.cast("call", { repeat: 1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("(a) on resolution the 'play a Sand Soldier' instruction runs twice (820.1.d.1): two separate 2-Might domainless unit TOKENS under P1's control in the base; the spell goes to trash", async () => {
    const game = await board({ reksai: false }).build();
    await game.p1.cast("call", { repeat: 1 });
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    for (const s of made) {
      expect(game.state(s)).toMatchObject({ cardType: "unit", controller: P1, domains: [], isToken: true, might: 2, owner: P1, zone: "base" });
    }
    expect(made[0]).not.toBe(made[1]);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // tokens are not cards; the spell was the one card played
  });

  test("(a) watchers agree: 'when you play a spell' (Ravenbloom Student) sees ONE spell → +1 once; 'when you play a unit' (Pridestalker) sees TWO token plays → two triggers → +2 when both are pointed at Rek'Sai", async () => {
    const game = await board().unit(P1, "base", RAVENBLOOM_STUDENT, "student").unit(P1, "base", PRIDESTALKER, "pride").build();
    await game.p1.cast("call", { repeat: 1 });
    let prideTriggers = 0;
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "pride") {
        prideTriggers += 1;
        await game.p1.pick("reksai");
      } else if (isOptIn(d)) {
        await answerOptIn(game, false); // not the subject here
      } else {
        break;
      }
    }
    expect(prideTriggers).toBe(2);
    expect(game.state("student")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("reksai")).toMatchObject({ baseMight: 3, might: 5, mightModifier: 2 });
    expect(soldiers(game)).toHaveLength(2);
  });

  test("(b) premises: the tokens have NO domain (185.3.b) while Rek'Sai is Fury — so a token's Accelerate power pip is [any] (805.1.a.2), payable with the CALM in the pool", async () => {
    const game = await board().build();
    expect(game.state("reksai").domains).toEqual(["fury"]);
    expect(game.state("reksai").keywords).toEqual(expect.arrayContaining(["Accelerate", "Assault"]));
    await game.p1.cast("call", { repeat: 1 });
    await game.settle({ policy: (d) => (isOptIn(d) ? (d.kind === "yes-no" ? false : "decline") : undefined) });
    for (const s of soldiers(game)) {
      expect(game.state(s).domains).toEqual([]);
    }
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.power("calm")).toBe(1);
  });

  // ── (b)/(c) an election per token ─────────────────────────────────────────────────────────────

  // Expected (419.3.b, 805.1.a/805.2, 355.1.a): each Sand Soldier is PLAYED (from no hand) so Rek'Sai grants it
  // Accelerate; in that token's own play steps — i.e. DURING Desert's Call's resolution, after both players
  // passed — P1 is asked whether to pay the optional [1][any]. Actual: no election is ever offered; resolution
  // runs straight through and both tokens enter exhausted with the 1 energy + 1 calm untouched.
  test("(b) with Rek'Sai out, resolving Desert's Call pauses at the FIRST token's play to offer P1 the Accelerate election before any token is on the board (805.2, 419.3.b)", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isOptIn(game.decision())).toBe(true);
    expect(soldiers(game)).toHaveLength(0); // first token not yet entered — the election is part of ITS play
    expect(game.zoneOf("call")).toBe("chain");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // nothing paid until P1 elects
  });

  // Expected (805.6, 805.1.a.2, 143.4): accepting for the first token spends [1] + the CALM power (any domain is
  // fine for a domainless token) and that token enters READY; the first play completes before the second
  // begins; the second token, with an empty pool, cannot elect (no prompt, or a canAccept:false one) and enters
  // EXHAUSTED. End: two soldiers, one ready + one exhausted, pool 0/0. Actual: both exhausted, pool 1/1calm.
  test("(c) 1 energy + 1 calm buys exactly ONE Accelerate: first token READY (paid with off-domain calm), second EXHAUSTED, pool empty (805.6, 805.1.a.2, 143.4)", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (!isOptIn(d)) {
        break;
      }
      // Accept whenever paying is possible; an unpayable second election (404.2) is declined.
      await answerOptIn(game, !(d?.kind === "yes-no" && d.canAccept === false));
    }
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    expect(made.map((s) => game.state(s).isReady).sort()).toEqual([false, true]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // Expected: the two elections are independent — P1 may decline the FIRST and pay for the SECOND instead
  // (P1 chooses which token is the ready one). Actual: no elections at all.
  test("(c) the elections are independent — declining the first and paying for the second also yields one exhausted + one ready, pool empty", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    let asked = 0;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || !isOptIn(game.decision())) {
        break;
      }
      asked += 1;
      await answerOptIn(game, asked === 2);
      if (asked === 1) {
        // first token declined → it is on the board exhausted before the second play begins
        expect(soldiers(game).map((s) => game.state(s).isExhausted)).toEqual([true]);
      }
    }
    expect(asked).toBe(2);
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    expect(made.map((s) => game.state(s).isReady).sort()).toEqual([false, true]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // Expected: with 2 energy + 2 calm left after the cast (pool 6/2calm) BOTH tokens can be accelerated → both
  // READY, pool 0/0. Actual: both exhausted, 2/2calm left.
  test("(c') with 2 energy + 2 calm spare, both tokens are accelerated and enter READY; pool empty", async () => {
    const game = await board({ pool: { energy: 6, power: { calm: 2 } } }).build();
    await game.p1.cast("call", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 2 } });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || !isOptIn(game.decision())) {
        break;
      }
      await answerOptIn(game, true);
    }
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    expect(made.every((s) => game.state(s).isReady)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ── (d) no Rek'Sai ────────────────────────────────────────────────────────────────────────────

  test("(d) Rek'Sai absent: tokens have no Accelerate — resolution asks P1 nothing, both Sand Soldiers enter EXHAUSTED, the spare 1 energy + 1 calm is untouched (143.4)", async () => {
    const game = await board({ reksai: false }).build();
    await game.p1.cast("call", { repeat: 1 });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    expect(made.every((s) => game.state(s).isExhausted)).toBe(true);
    expect(made.every((s) => !game.state(s).keywords.includes("Accelerate"))).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("(d') Rek'Sai's grant is play-time only (805.3): once on the board the tokens carry no Accelerate keyword and Rek'Sai herself (already in play) never offers one either", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    await game.settle({ policy: (d) => (isOptIn(d) ? (d.kind === "yes-no" ? false : "decline") : undefined) });
    for (const s of soldiers(game)) {
      expect(game.state(s).grantedKeywords.map((k) => k.keyword)).not.toContain("Accelerate");
    }
    expect(game.p1.legal().some((o) => o.card === "reksai" && (o.verb === "activate" || o.verb === "play"))).toBe(false);
  });

  // ── (e) countered ─────────────────────────────────────────────────────────────────────────────

  test("(e) P2 Wind Walls Desert's Call in the response window: both spells to trash, ZERO tokens, no election ever arises, P1's [2]+Repeat[2] are NOT refunded (1/1calm left), and the finalized-card count P1's Legion reads is still 1 (425.1.a/c.1, 419.4.b)", async () => {
    const game = await board().resources(P2, { energy: 3, power: { calm: 2 } }).hand(P2, WIND_WALL, "ww").build();
    await game.p1.cast("call", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options).toEqual([["call"]]);
    await game.p2.cast("ww", { targets: "call" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["call", "ww"]);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // nobody was asked anything on the way
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(soldiers(game)).toEqual([]);
    expect(game.findAll({ name: "Sand Soldier" })).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
