/**
 * Interaction: Guards! (sfd-154-221) · Spell · Order · [3] · [Hidden]
 *     "Play a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it."
 *   × Sprite Call (ogn-094-298) · Spell · Mind · [3] · [Hidden][Action]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   × Rek'Sai, Breacher (sfd-029-221) · Champion Unit · Fury · [3] · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *
 * Board: Guards! hidden at bfX, Sprite Call hidden at bfY, Rek'Sai in P1's base (both battlefields P1's).
 *
 * Questions:
 *  (a) When each hidden spell is flipped, where must its token go — may P1 send it to base or to the OTHER
 *      battlefield?
 *  (b) Does Rek'Sai grant a TOKEN Accelerate at all (a token is played from no zone), and which Power domain
 *      pays the pip?
 *  (c) Sprite Call's token is already told to enter ready — is an Accelerate election still offered on it, and
 *      does paying it do anything?
 *  (d) Guards! offers TWO routes to a ready token: Rek'Sai's Accelerate and its own "you may pay [order] to
 *      ready it". When is each decided and paid, and if P1's only [order] went to the Accelerate election, can
 *      P1 still take the second route?
 *  (e) Rek'Sai absent — what is offered on each token?
 *
 * Rules: 811.1.d.3 (a hidden spell that plays a unit must play it AT that battlefield), 358.5 (a failed check
 * undoes the action), 350.2 / 179 / 185.2.a (tokens are not cards but they ARE played, running the play steps),
 * 805.2 + 805.2.a (Accelerate is an optional ADDITIONAL COST paid as the unit is played, never once it is on the
 * board), 805.1.a.2 (a domainless unit's Power pip is [A] — any domain), 805.5 (having Accelerate is a
 * characteristic of the unit), 805.6 + 805.6.a (paying REPLACES entering exhausted with entering ready — no
 * "becomes ready" trigger ever fires), 355.1.a + 356.2.b.1 + 357.2 (elected in step 2, paid in step 4 of playing
 * the token), 205 + 444.2 (a "you may pay X to Y" printed as a later clause of the spell's own effect is a Pay
 * performed on RESOLUTION, not a cost of playing anything), 143.4 (units otherwise enter exhausted).
 *
 * Answers: (a) each token is nailed to the battlefield its spell was hidden at — bfX for the Sand Soldier, bfY
 * for the Sprite; base and the other battlefield are not legal homes. (b) yes, Rek'Sai grants it, and the pip is
 * [any] — Rek'Sai being Fury is irrelevant to a domainless token. (c) the election should still be offered
 * (805.5) but buying it is a trap — Sprite Call already produces the same "enters ready" result. (d) Accelerate
 * is answered first, inside the token's own play steps and before the token exists; Guards!' [order] is asked
 * afterwards, on the already-landed exhausted token — so one [order] cannot fund both. (e) nothing is offered on
 * either token; the Sprite still enters ready by its own text, the Sand Soldier enters exhausted.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const GUARDS = "sfd-154-221";
const SPRITE_CALL = "ogn-094-298";
const REKSAI = "sfd-029-221";

type Pool = { energy?: number; power?: Record<string, number> };

/**
 * P1's turn 3. P1 controls bfX and bfY (a holder on each); Guards! is face down at bfX and Sprite Call at bfY,
 * both hidden on an earlier turn so either may be revealed for [0]. Rek'Sai sits in the base unless disabled.
 */
function board(opts: { reksai?: boolean; pool?: Pool } = {}) {
  const { reksai = true, pool = { energy: 4, power: { fury: 1, order: 2 } } } = opts;
  const s = scenario()
    .turn(3)
    .resources(P1, pool)
    .battlefield("bfX", { controller: P1 })
    .battlefield("bfY", { controller: P1 })
    .unit(P1, "bfX", { might: 3, name: "Holder X" }, "holderX")
    .unit(P1, "bfY", { might: 3, name: "Holder Y" }, "holderY")
    .facedown(P1, "bfX", GUARDS, "guards")
    .facedown(P1, "bfY", SPRITE_CALL, "sprite");
  return reksai ? s.unit(P1, "base", REKSAI, "reksai") : s;
}

const onBoard = (game: Game, id: string) => game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-");
const sand = (game: Game) => game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => onBoard(game, id));
const sprites = (game: Game) => game.findAll({ name: "Sprite", owner: P1 }).filter((id) => onBoard(game, id));

interface Ask {
  readonly kind: string;
  readonly prompt: string;
  /** "confirm" = the granted-Accelerate election; "opt-in" = Guards!' resolution-time "pay [order]". */
  readonly pct?: string;
  readonly canAccept?: boolean;
  readonly options?: string[];
}

/**
 * Drive the revealed spell to the next open main phase, recording every prompt P1 saw.
 * `accel` answers the Accelerate election, `pay` answers Guards!' "pay [order]", `to` picks a destination.
 */
async function run(game: Game, opts: { accel?: boolean; pay?: boolean; to?: string } = {}): Promise<Ask[]> {
  const log: Ask[] = [];
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "main" || d.context === "showdown") {
        break;
      }
      await game.seat(d.seat).pass();
      continue;
    }
    if (d.kind === "yes-no") {
      log.push({ canAccept: d.canAccept, kind: d.kind, pct: d.source?.pendingChoiceType, prompt: d.prompt });
      const accept = d.source?.pendingChoiceType === "confirm" ? opts.accel === true : opts.pay === true;
      await (accept && d.canAccept !== false ? game.seat(d.seat).yes() : game.seat(d.seat).no());
      continue;
    }
    if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      log.push({ kind: d.kind, options: keys, pct: d.source?.pendingChoiceType, prompt: d.prompt });
      const want = opts.to ?? "battlefield-bfX";
      await game.seat(d.seat).pick(keys.includes(want) ? want : (keys[0] as string));
      continue;
    }
    break;
  }
  return log;
}

describe("Guards! / Sprite Call flipped face up under Rek'Sai — where the tokens land and who is offered Accelerate", () => {
  // ── (a) the hidden battlefield owns the token ─────────────────────────────────────────────────

  test("(a) with nothing to elect, each flipped spell nails its token to ITS battlefield: Sand Soldier → bfX, Sprite → bfY; neither is ever asked about base or the other battlefield (811.1.d.3)", async () => {
    const guardsGame = await board({ reksai: false }).build();
    await guardsGame.p1.reveal("guards");
    const guardsLog = await run(guardsGame, {});
    expect(guardsLog.filter((a) => a.kind === "pick")).toEqual([]); // no destination question at all
    expect(sand(guardsGame)).toHaveLength(1);
    expect(guardsGame.zoneOf(sand(guardsGame)[0] as string)).toBe("battlefield-bfX");
    expect(guardsGame.p1.units("base")).toEqual([]);
    expect(guardsGame.p1.units("bfY")).toEqual(["holderY"]);
    expect(guardsGame.zoneOf("guards")).toBe("trash");

    const spriteGame = await board({ reksai: false }).build();
    await spriteGame.p1.reveal("sprite");
    const spriteLog = await run(spriteGame, {});
    expect(spriteLog).toEqual([]); // nothing whatsoever is asked
    expect(sprites(spriteGame)).toHaveLength(1);
    expect(spriteGame.zoneOf(sprites(spriteGame)[0] as string)).toBe("battlefield-bfY");
    expect(spriteGame.p1.units("base")).toEqual([]);
    expect(spriteGame.p1.units("bfX")).toEqual(["holderX"]);
    expect(spriteGame.violations()).toEqual([]);
  });

  test("(a) Sprite Call under Rek'Sai still lands its Sprite at bfY — the hidden battlefield lock survives the champion being out", async () => {
    const game = await board().build();
    await game.p1.reveal("sprite");
    const log = await run(game, {});
    expect(log.filter((a) => a.kind === "pick")).toEqual([]);
    expect(sprites(game)).toHaveLength(1);
    expect(game.zoneOf(sprites(game)[0] as string)).toBe("battlefield-bfY");
    expect(game.p1.units("base")).toEqual(["reksai"]);
  });

  // Expected (811.1.d.3 / 358.5): the flipped Guards! must play its Sand Soldier AT bfX. If a destination is
  // asked at all it may list only "battlefield-bfX", and a raw pick naming "base" is refused with the state
  // untouched. Actual: once Rek'Sai's Accelerate election re-enters the token effect from its prompt, the
  // hidden-battlefield context is lost — P1 is offered base / bfX / bfY and "base" is accepted, so the Sand
  // Soldier is legally teleported off the battlefield it was sworn to defend.
  test("with Rek'Sai out, the granted-Accelerate election does NOT unlock the Sand Soldier's destination — it stays nailed to bfX, base and bfY are never offered (811.1.d.3, 358.5)", async () => {
    const game = await board().build();
    await game.p1.reveal("guards");
    const log = await run(game, { accel: false, to: "base" });
    for (const ask of log.filter((a) => a.kind === "pick")) {
      expect(ask.options).toEqual(["battlefield-bfX"]); // never "base", never "battlefield-bfY"
    }
    expect(sand(game)).toHaveLength(1);
    expect(game.zoneOf(sand(game)[0] as string)).toBe("battlefield-bfX");
    expect(game.p1.units("base")).toEqual(["reksai"]);
  });

  // ── (b) Rek'Sai does grant a token Accelerate, priced [1][any] ────────────────────────────────

  test("(b) a token is PLAYED from no zone (350.2 / 185.2.a), so Rek'Sai's 'played from anywhere other than a player's hand' licenses it: the election is raised as part of the token's play — before any Sand Soldier exists (805.2.a) and before a pip is spent", async () => {
    const game = await board().build();
    await game.p1.reveal("guards");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.kind === "yes-no" && d.canAccept).toBe(true);
    expect(d?.prompt).toContain("Accelerate");
    expect(d?.prompt).toContain("[any]"); // 805.1.a.2 — the pip is any Domain, not Rek'Sai's Fury
    expect(game.findAll({ name: "Sand Soldier" })).toEqual([]); // the token has not entered yet
    expect(game.zoneOf("guards")).toBe("chain");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } }); // nothing charged yet
  });

  test("(b) the token is domainless (185.3.b) so the pip is [A]: with ONLY off-domain Power in the pool (calm, while Rek'Sai is Fury) the election is still payable — [1] + the calm buys it and the Sand Soldier enters READY (805.1.a.2, 805.6)", async () => {
    const game = await board({ pool: { energy: 2, power: { calm: 1 } } }).build();
    expect(game.state("reksai").domains).toEqual(["fury"]);
    await game.p1.reveal("guards");
    const log = await run(game, { accel: true });
    expect(log.find((a) => a.pct === "confirm")?.canAccept).toBe(true);
    const [tok] = sand(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).domains).toEqual([]);
    expect(game.state(tok as string).isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0 } });
  });

  // ── (c) Sprite Call's token — an election that buys nothing ───────────────────────────────────

  test("(c) Sprite Call's token enters READY by its own text with [Temporary], 3 Might and no domain, and the pool is untouched", async () => {
    const game = await board().build();
    await game.p1.reveal("sprite");
    await run(game, {});
    const [tok] = sprites(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({
      baseMight: 3,
      controller: P1,
      isReady: true,
      isToken: true,
      keywords: ["Temporary"],
      owner: P1,
      zone: "battlefield-bfY",
    });
    expect(game.state(tok as string).domains).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } });
  });

  // Expected (805.2 / 805.5): the Sprite token is played from no zone too, so Rek'Sai grants it Accelerate and
  // having Accelerate is a CHARACTERISTIC of that unit — the election must be offered, priced [1][any], exactly
  // like the Sand Soldier's. It is a trap (805.6 replaces "enters exhausted" with "enters ready", which Sprite
  // Call's own "play a READY token" already delivers), but a trap the player gets to decline, not one the engine
  // decides for them. Actual: `create-token` suppresses the offer whenever the token already enters ready, so
  // nothing at all is asked and the [1][any] is never even quoted.
  test("(c) the Accelerate election IS offered on Sprite Call's token because Rek'Sai grants it — a ready-entering token still HAS Accelerate (805.2, 805.5)", async () => {
    const game = await board().build();
    await game.p1.reveal("sprite");
    const log = await run(game, { accel: false });
    expect(log.map((a) => a.pct)).toContain("confirm");
    expect(log.find((a) => a.pct === "confirm")?.prompt).toContain("[any]");
  });

  // ── (d) two routes to a ready Sand Soldier, decided at different times ────────────────────────

  test("(d) the two routes sit in different processes: Accelerate is answered while the token is still being played, Guards!' [order] only afterwards — at that second prompt the Sand Soldier is already on bfX and EXHAUSTED (143.4, 205, 444.2)", async () => {
    const game = await board().build();
    await game.p1.reveal("guards");
    await game.settle();
    // 1st question: the Accelerate election (355.1.a, step 2 of playing the token). Decline it.
    expect(game.decision()?.source?.pendingChoiceType).toBe("confirm");
    expect(game.findAll({ name: "Sand Soldier" })).toEqual([]);
    await game.p1.no();
    await game.settle();
    // (the stray destination question here is the 811.1.d.3 bug above; answer it with the lawful battlefield)
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfX");
      await game.settle();
    }
    // 2nd question: Guards!' own later clause — a Pay on RESOLUTION, asked of a token that has ALREADY entered.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.pendingChoiceType).toBe("opt-in");
    const [tok] = sand(game);
    expect(tok).toBeDefined();
    expect(game.zoneOf(tok as string)).toBe("battlefield-bfX");
    expect(game.state(tok as string).isExhausted).toBe(true); // it entered exhausted; the pay would READY it
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } });
    // Declining costs nothing: 444.2 — an unpaid Pay simply makes the linked instruction not execute.
    await game.p1.no();
    await game.settle();
    expect(game.state(tok as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } });
    expect(game.zoneOf("guards")).toBe("trash");
  });

  test("(d) spending the only [order] on the Accelerate pip closes the second route: with [1] + one [order] in the pool, accepting Accelerate empties it and Guards!' resolution-time pay is no longer acceptable (444.2; DESIGN manual pay — nothing is auto-tapped and no Add sub-step exists)", async () => {
    const game = await board({ pool: { energy: 1, power: { order: 1 } } }).build();
    await game.p1.reveal("guards");
    const log = await run(game, { accel: true, pay: true });
    expect(log.find((a) => a.pct === "confirm")?.canAccept).toBe(true);
    const optIn = log.find((a) => a.pct === "opt-in");
    if (optIn !== undefined) {
      expect(optIn.canAccept).toBe(false); // asked, but unaffordable — the pool is empty
    }
    const [tok] = sand(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isReady).toBe(true); // ready from the Accelerate, not the [order]
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("(d) Accelerate is genuinely optional and genuinely priced: declining it with [1] + [order] in the pool leaves BOTH resources in the pool and the token exhausted (355.1.a, 143.4)", async () => {
    const game = await board({ pool: { energy: 1, power: { order: 1 } } }).build();
    await game.p1.reveal("guards");
    await run(game, { accel: false, pay: false });
    const [tok] = sand(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
  });

  // Expected (205 / 444.2 / 354.2): declining Accelerate and keeping the [order] for the resolution-time pay is
  // the strictly cheaper route to the same ready Sand Soldier — [order] alone, with the [1] energy left over.
  // The player pays, so the linked instruction ("ready it", "it" = the token this instruction just played)
  // executes. Actual on the FACEDOWN path only: the prompt is attributed to Guards! itself rather than to the
  // token, the [order] is spent, and nothing is readied — the payment is burned. (Cast from HAND the same clause
  // works, so the pending-value binding is lost when the hidden path skips the destination step.)
  test("on the revealed-from-facedown path Guards!' 'pay [order] to ready it' readies the Sand Soldier it just played (205, 444.2)", async () => {
    const game = await board({ pool: { energy: 1, power: { order: 1 } } }).build();
    await game.p1.reveal("guards");
    const log = await run(game, { accel: false, pay: true });
    const [tok] = sand(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string).isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
    expect(log.find((a) => a.pct === "opt-in")?.prompt).toContain("Sand Soldier");
  });

  // ── (e) Rek'Sai absent ───────────────────────────────────────────────────────────────────────

  test("(e) with no Rek'Sai nothing is elected on either token: Sprite Call asks nothing and its Sprite still enters ready; Guards! asks only its own [order] and its Sand Soldier enters EXHAUSTED when that is declined (143.4)", async () => {
    const spriteGame = await board({ reksai: false }).build();
    await spriteGame.p1.reveal("sprite");
    const spriteLog = await run(spriteGame, { accel: true, pay: true });
    expect(spriteLog).toEqual([]);
    expect(spriteGame.state(sprites(spriteGame)[0] as string).isReady).toBe(true);
    expect(spriteGame.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } });

    const guardsGame = await board({ reksai: false }).build();
    await guardsGame.p1.reveal("guards");
    const guardsLog = await run(guardsGame, { accel: true, pay: false });
    expect(guardsLog.map((a) => a.pct)).toEqual(["opt-in"]); // no Accelerate election anywhere
    const [tok] = sand(guardsGame);
    expect(tok).toBeDefined();
    expect(guardsGame.state(tok as string).isExhausted).toBe(true);
    expect(guardsGame.state(tok as string).keywords).not.toContain("Accelerate");
    expect(guardsGame.state(tok as string).grantedKeywords).toEqual([]);
    expect(guardsGame.p1.resources()).toEqual({ energy: 4, power: { fury: 1, order: 2 } });
    expect(guardsGame.violations()).toEqual([]);
  });
});
