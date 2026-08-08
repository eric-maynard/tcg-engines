/**
 * Interaction: Nami, Headstrong (unl-052-219) · Calm champion unit · 3 · 3 Might
 *     "…When I hold, the next time you play a unit this turn, ready it and [Buff] it."
 *   × Sprite Mother (ogn-106-298) · Mind unit · 4 + [mind] · 3 Might
 *     "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × Sprite Call (ogn-094-298) · Mind Action spell · 3
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Question: Nami holds bf1 at the start of P1's turn. Case A — P1's next unit is Sprite Mother: who
 * gets readied + Buffed — Mother, her Sprite token, or both? Case B — P1's next "unit" is instead the
 * Sprite token made by the spell Sprite Call: does a token played by a spell count as "you play a unit"
 * and consume Nami's effect? Does it matter if Nami has left the board by then?
 *
 * Rules: 390.2 (the hold trigger creates a DELAYED TRIGGER keyed to "the next time you play a unit this
 * turn"), 392 (delayed abilities live independently of their source — Nami leaving is irrelevant),
 * 419.4.a + 383.4.a.2 (play triggers fire when the unit is finalized/enters the board; Mother's own play
 * effect triggers at the same moment → 383.3.d: P1 orders the two), 350.2 / 185.2.a (tokens are PLAYED
 * — a unit token entering via Sprite Call is P1 playing a unit), 355.5.b (choices for triggered
 * abilities are made when they trigger, not when the source was played), 701–703 (Buff = +1 Might).
 *
 * Expected: A — Sprite Mother is "the next unit": she ends ready and Buffed (3→4); the delayed trigger
 * is then spent, so the Sprite token her play effect makes afterwards is merely ready (its own text),
 * unbuffed, 3 Might; any later unit this turn enters exhausted/unbuffed. Nami having been bounced first
 * changes nothing. B — the Sprite Call token IS a unit P1 plays: it is readied (redundant) and Buffed
 * (→ 4 Might) and the effect is consumed; a unit played from hand afterwards gets nothing. Sprite Call
 * itself, a spell, never consumes it.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NAMI = "unl-052-219";
const SPRITE_MOTHER = "ogn-106-298";
const SPRITE_CALL = "ogn-094-298";
const GUST = "ogn-169-298"; // Reaction, [1]: return a ≤3-Might unit at a battlefield to hand — to get Nami off the board
const RECRUIT = { cardType: "unit", domain: "calm", energyCost: 1, might: 2, name: "Tide Recruit" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const sprites = (game: Game) =>
  [...game.p1.base(), ...game.p1.units("bf1")].filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");

/** Nami's armed one-shot as the engine stores it (an entry sourced from Nami in activeReplacements). */
const namiPayoffArmed = (game: Game) =>
  ((game.gameState.activeReplacements ?? []) as { sourceCardId?: string }[]).some((e) => e.sourceCardId === "nami");

/** Turn 2, P2 about to end the turn. P1 controls bf1 with Nami standing there; the test cards in hand. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", NAMI, "nami")
    .hand(P1, SPRITE_MOTHER, "sm")
    .hand(P1, SPRITE_CALL, "sc")
    .hand(P1, GUST, "gust")
    .hand(P1, RECRUIT, "r1");
}

/** P2 ends → P1's Beginning Phase: Nami holds (trigger + point) → settle into P1's main with 10 energy + 1 mind. */
async function afterHold(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nami", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the hold point
  await game.p1.do("addResources", { energy: 10, power: { mind: 1 } });
  return game;
}

/** Cast Sprite Call and play its token to `where`, draining the chain around it. */
async function resolveSpriteCall(game: Game, where: "base" | "battlefield-bf1" = "base"): Promise<string> {
  const before = new Set(sprites(game));
  await game.p1.cast("sc");
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(where);
  }
  await game.settle();
  const fresh = sprites(game).filter((id) => !before.has(id));
  expect(fresh).toHaveLength(1);
  return fresh[0]!;
}

describe("Nami, Headstrong's hold payoff × Sprite Mother × Sprite Call — what is 'the next time you play a unit'", () => {
  test("setup: Nami's hold trigger resolves in P1's Beginning Phase, scores the hold point and arms a one-shot 'next unit you play this turn' effect", async () => {
    const game = await afterHold();
    expect(game.locationOf("nami")).toBe("bf1");
    expect(namiPayoffArmed(game)).toBe(true);
    expect(game.state("nami")).toMatchObject({ isBuffed: false, might: 3 }); // Nami herself gets nothing
  });

  // ── Case A: Sprite Mother is the next unit ──────────────────────────────────────────────

  test("A: Sprite Mother played next ends READY and BUFFED (3 → 4 Might)", async () => {
    const game = await afterHold();
    await game.p1.play("sm", { to: "base" });
    await game.settle();
    expect(game.zoneOf("sm")).toBe("base");
    expect(game.state("sm")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    expect(game.p1.resources().power.mind).toBe(0); // paid 4 + [mind]
    expect(game.p1.energy()).toBe(6);
  });

  test("A: the Sprite token from Mother's play effect comes AFTER Mother consumed the one-shot — it is ready by its own text but NOT buffed (3 Might), exactly one token, 'here' in base", async () => {
    const game = await afterHold();
    await game.p1.play("sm", { to: "base" });
    expect(game.chain().some((c) => c.cardId === "sm" && c.triggered)).toBe(true); // Mother's play effect
    await game.settle();
    const toks = sprites(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isBuffed: false, isReady: true, might: 3, zone: "base" });
    expect(game.state(toks[0]!).keywords).toContain("Temporary");
    expect(namiPayoffArmed(game)).toBe(false); // spent on Mother
  });

  test("A: it was a one-shot — a further unit played from hand later this turn enters exhausted and unbuffed", async () => {
    const game = await afterHold();
    await game.p1.play("sm", { to: "base" });
    await game.settle();
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  });

  test.failing("BUG: A: the payoff is a delayed TRIGGERED ability (390.2) — playing Sprite Mother makes TWO triggered items pending (Nami's delayed trigger + Mother's play effect, ordered by P1 per 383.3.d) and Mother sits exhausted/unbuffed until Nami's item resolves", async () => {
    // Expected: right after the play, either an order offer for P1 or a chain holding both triggered
    // items (one sourced from Nami), with Sprite Mother still exhausted and unbuffed.
    // Actual: the engine models it as an enters-ready replacement — Mother is ready+buffed instantly and
    // only her own play effect is on the chain.
    const game = await afterHold();
    await game.p1.play("sm", { to: "base" });
    const d = game.decision();
    const orderOffered = d?.kind === "order" && d.seat === P1 && d.items.length === 2;
    const bothOnChain = game.chain().filter((c) => c.triggered).length === 2 && game.chain().some((c) => c.cardId === "nami");
    expect(orderOffered || bothOnChain).toBe(true);
    expect(game.state("sm")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3 });
    await game.settle();
    expect(game.state("sm")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
  });

  test("A: Nami leaving the board first is irrelevant (392) — P1 Gusts their own Nami back to hand, then Sprite Mother still enters ready + buffed", async () => {
    const game = await afterHold();
    await game.p1.cast("gust", { targets: "nami" });
    await game.settle();
    expect(game.zoneOf("nami")).toBe("hand");
    expect(namiPayoffArmed(game)).toBe(true); // the delayed ability outlives its source
    await game.p1.play("sm", { to: "base" });
    await game.settle();
    expect(game.state("sm")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    const toks = sprites(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ isBuffed: false, might: 3 });
  });

  // ── Case B: the Sprite Call token is the next unit ──────────────────────────────────────

  test("B: Sprite Call itself is a SPELL — casting it (and it sitting on the chain) does not consume the 'next unit' effect", async () => {
    const game = await afterHold();
    await game.p1.cast("sc");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", triggered: false })]);
    expect(namiPayoffArmed(game)).toBe(true);
    expect(game.p1.energy()).toBe(7); // paid 3
  });

  test("B: the Sprite token Sprite Call plays IS 'you play a unit' (350.2, 185.2.a) — Nami's effect fires on it: ready (redundant) and BUFFED → 4 Might, and the one-shot is consumed", async () => {
    const game = await afterHold();
    const tok = await resolveSpriteCall(game, "base");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.state(tok)).toMatchObject({ controller: P1, isBuffed: true, isReady: true, might: 4 });
    expect(namiPayoffArmed(game)).toBe(false);
  });

  test("B: because the token consumed it, a unit P1 plays from hand later that turn gets NO bonus — Tide Recruit enters exhausted, unbuffed, 2 Might", async () => {
    const game = await afterHold();
    await resolveSpriteCall(game, "base");
    await game.p1.play("r1", { to: "base" });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  });

  test("B: the token is a real 3-Might [Temporary] Sprite unit under P1's control, played ready by Sprite Call's own text (so 'ready it' is redundant either way)", async () => {
    const game = await afterHold();
    const tok = await resolveSpriteCall(game, "battlefield-bf1");
    expect(game.state(tok)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isReady: true, isToken: true, zone: "battlefield-bf1" });
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });
});
