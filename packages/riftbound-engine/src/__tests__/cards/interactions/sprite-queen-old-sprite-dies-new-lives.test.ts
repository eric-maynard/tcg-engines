/**
 * Interaction: Sprite Queen (unl-084-219) · Unit · Mind · 7 · 6 Might
 *     "When you play me or at the start of your Beginning Phase, play a ready 3 [Might] Sprite unit
 *      token with [Temporary] to your base."
 *   × Sprite token (unl-t07) · 3 Might · "[Temporary] (Kill me at the start of your Beginning Phase,
 *     before scoring.)"  — made LAST turn, P1's only unit at bf2
 *
 * Rules: 315.2.a.1 (start-of-Beginning-Phase effects happen in the Beginning Step, before 315.2.b the
 * Scoring Step), 816.1.b / 816.1.c (Temporary = "At the start of this permanent's controller's Beginning
 * Phase, before scoring, kill this"; condition = that phase STARTING), 383.3.d (simultaneous triggers of
 * one controller → that player orders them on the chain), 337.4 (controller of the newest item gets
 * priority), 383.2.c (a trigger condition is evaluated after the inciting event has been processed — an
 * object that did not exist yet cannot have triggered), 190.4.c / 323.6 (no units + Open state → lose
 * control at the next Cleanup), 315.2.b.2 / 469.2 / 470 (Scoring Step: the Turn Player Holds each
 * battlefield they control, once per battlefield).
 *
 * Question: P1 controls bf1 with Sprite Queen and bf2 with ONLY last turn's Sprite token. P1's turn
 * begins. (a) Which abilities trigger at the start of the Beginning Phase; does P1 get an order Decision?
 * (b) In either order, is the NEW Sprite the Queen makes also killed this Beginning Phase? (c) Scoring
 * Step: how many Holds, where, for how many points? (d) Contrast: a second non-Temporary P1 unit at bf2.
 *
 * Expected: (a) two P1 triggers (old Sprite's Temporary + Sprite Queen) fire together → P1 orders them
 * (order Decision listing exactly those two); P1 then P2 get priority. (b) No — the phase-start event was
 * processed before the new token existed; it enters ready in base and dies at P1's NEXT Beginning Phase.
 * (c) Old Sprite dies before scoring; the empty bf2 is lost at the Open-state Cleanup before the Scoring
 * Step → exactly one Hold: bf1, +1. (d) With a Buddy at bf2 control is kept → two Holds, +2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_QUEEN = "unl-084-219";
const SPRITE_TOKEN = "unl-t07";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active and about to end the turn. P1 controls bf1 (Sprite Queen there) and bf2 (only an
 * old Sprite token there, unless `buddy`). P2 has a vanilla unit at home so the board is not degenerate.
 */
function board(opts: { buddy?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", SPRITE_QUEEN, "queen")
    .unit(P1, "bf2", SPRITE_TOKEN, "oldSprite")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2Home");
  return opts.buddy ? b.unit(P1, "bf2", { might: 2, name: "Buddy" }, "buddy") : b;
}

/** P2 ends the turn → P1's Beginning Phase starts; returns with the trigger-order offer (if any) still pending. */
async function p1TurnBegins(opts: { buddy?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.endTurn();
  return game;
}

/**
 * Answer the order offer. "queenFirst" = Queen's item on TOP (resolves first: new token exists before the
 * old one dies); "spriteFirst" = old Sprite's Temporary on TOP (old dies first, then the token is made).
 */
async function orderTriggers(game: Game, resolvesFirst: "queenFirst" | "spriteFirst"): Promise<void> {
  const d = game.decision();
  expect(d?.kind).toBe("order");
  if (d?.kind !== "order") {
    return;
  }
  const q = d.items.find((i) => i.card === "queen")!.key;
  const s = d.items.find((i) => i.card === "oldSprite")!.key;
  // first key = bottom, last key = top (resolves first)
  await game.p1.order(resolvesFirst === "queenFirst" ? [s, q] : [q, s]);
}

/** Both players pass priority once → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

const sprites = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Sprite");
const newSprite = (game: Game) => sprites(game).find((u) => u !== "oldSprite");

describe("Sprite Queen × last turn's Temporary Sprite — old one dies before scoring, new one lives", () => {
  // ── (a) what triggers, who orders, who has priority ───────────────────────────────────────

  test("(a) at the start of P1's Beginning Phase exactly two P1-controlled triggers fire together — old Sprite's [Temporary] and Sprite Queen's — and P1 is offered their ORDER (383.3.d); nothing has resolved yet", async () => {
    const game = await p1TurnBegins();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card) : [];
    expect(items.sort()).toEqual(["oldSprite", "queen"]);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    // Beginning Step, before scoring: nothing has happened yet.
    expect(game.zoneOf("oldSprite")).toBe("battlefield-bf2");
    expect(sprites(game)).toEqual(["oldSprite"]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]);
  });

  test("(a) once ordered, the controller of the newest item — P1 — holds priority (337.4); after P1 passes, P2 gets priority on the chain before anything resolves", async () => {
    const game = await p1TurnBegins();
    await orderTriggers(game, "spriteFirst");
    expect(game.chain().map((c) => c.cardId)).toEqual(["queen", "oldSprite"]); // bottom → top
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.has("oldSprite")).toBe(true);
  });

  // ── (b) order 1: Sprite Queen resolves first (new token exists BEFORE the old one dies) ────────

  test("(b) Queen-first: the new Sprite token enters P1's BASE ready, 3 Might, with Temporary while the old Sprite's kill is still on the chain …", async () => {
    const game = await p1TurnBegins();
    await orderTriggers(game, "queenFirst");
    expect(game.chain().at(-1)?.cardId).toBe("queen");
    await resolveTop(game);
    const tok = newSprite(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(tok!).keywords).toContain("Temporary");
    expect(game.chain().map((c) => c.cardId)).toEqual(["oldSprite"]);
    expect(game.has("oldSprite")).toBe(true);
    expect(game.phase()).toBe("beginning");
  });

  test("(b) Queen-first: … then the old Sprite is killed (token ceases to exist) and the NEW Sprite is NOT killed this Beginning Phase — its Temporary never triggered (383.2.c: the phase-start event predates it); it is still in base, ready, in P1's main phase", async () => {
    const game = await p1TurnBegins();
    await orderTriggers(game, "queenFirst");
    await resolveTop(game); // Queen → token
    const tok = newSprite(game)!;
    await resolveTop(game); // Temporary → old Sprite dies
    expect(game.has("oldSprite")).toBe(false);
    expect(game.zoneOf("oldSprite")).toBe("gone");
    expect(game.chain()).toEqual([]); // no third (new-token Temporary) item was ever added
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has(tok)).toBe(true);
    expect(game.state(tok)).toMatchObject({ isReady: true, location: "base" });
    expect(sprites(game)).toEqual([tok]);
  });

  // ── (b) order 2: old Sprite's Temporary resolves first ────────────────────────────────────

  test("(b) Sprite-first: the old Sprite dies while the Queen's item is still pending — Closed state, so bf2 control is NOT yet lost (190.4.c) — then the new token is made; it too survives into P1's main phase", async () => {
    const game = await p1TurnBegins();
    await orderTriggers(game, "spriteFirst");
    expect(game.chain().at(-1)?.cardId).toBe("oldSprite");
    await resolveTop(game); // old Sprite dies
    expect(game.has("oldSprite")).toBe(false);
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["queen"]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // chain not empty → no Open-state cleanup yet
    expect(sprites(game)).toEqual([]);
    await resolveTop(game); // Queen → token
    const tok = newSprite(game)!;
    expect(game.state(tok)).toMatchObject({ isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has(tok)).toBe(true);
    expect(sprites(game)).toEqual([tok]);
  });

  test("(b) the new Sprite dies at the start of P1's NEXT Beginning Phase (reminder text: 'next Beginning Phase') — alive all through P2's turn, gone by P1's following main phase (where the Queen has made yet another one)", async () => {
    const game = await p1TurnBegins();
    await orderTriggers(game, "queenFirst");
    await game.settle();
    const tok = newSprite(game)!;
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(tok)).toBe(true);
    await game.advanceTurn(); // → P1: Temporary on `tok` + Queen again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(tok)).toBe(false);
    expect(game.zoneOf(tok)).toBe("gone");
    const third = newSprite(game);
    expect(third).toBeDefined();
    expect(third).not.toBe(tok);
  });

  // ── (c) Scoring Step: one Hold only ───────────────────────────────────────────────────────

  for (const order of ["queenFirst", "spriteFirst"] as const) {
    test(`(c) ${order}: with the chain empty the Open-state Cleanup strips P1's control of the now-empty bf2 BEFORE the Scoring Step (323.6) → exactly one Hold: bf1 for +1; bf2 scores nothing (315.2.b.2, 469.2)`, async () => {
      const game = await p1TurnBegins();
      await orderTriggers(game, order);
      await resolveTop(game);
      await resolveTop(game);
      expect(game.chain()).toEqual([]);
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.phase()).toBe("main");
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
      expect(game.gameState.battlefields.bf2?.controller).toBe(null);
      expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual(["bf1"]);
      expect(game.gameState.scoredThisTurn?.[P2] ?? []).toEqual([]);
      expect(game.p1.points()).toBe(1);
      expect(game.p2.points()).toBe(0);
      expect(game.violations()).toEqual([]);
    });
  }

  // ── (d) contrast: a non-Temporary Buddy keeps bf2 ─────────────────────────────────────────

  test("(d) with a non-Temporary Buddy also at bf2: the same two triggers fire, the old Sprite still dies and a new one is still made, but bf2 stays P1's (190.4.a) → two Holds {bf1,+1} {bf2,+1} = 2 points", async () => {
    const game = await p1TurnBegins({ buddy: true });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d?.kind === "order" ? d.items.map((i) => i.card) : []).sort()).toEqual(["oldSprite", "queen"]);
    await game.acceptTriggerOrder();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.has("oldSprite")).toBe(false);
    expect(game.p1.units("bf2")).toEqual(["buddy"]);
    const tok = newSprite(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ isReady: true, location: "base", might: 3 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect([...(game.gameState.scoredThisTurn?.[P1] ?? [])].sort()).toEqual(["bf1", "bf2"]);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
