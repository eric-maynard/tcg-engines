/**
 * Interaction: Zilean, Time Mage (unl-086-219) × Sprite Burst (unl-069-219) × Sprite Call (ogn-094-298)
 *
 *   Zilean, Time Mage — Champion Unit · Mind · 5 · 5 Might
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token
 *      and an additional copy of it instead."
 *   Sprite Burst — Spell · Mind · 5 · "Play two ready 3 [Might] Sprite unit tokens with [Temporary]."
 *   Sprite Call — Spell (Action, Hidden) · Mind · 3 · "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Rules: 370.1.a / 370.1.a.2 (each token being played is its own event; the two from one instruction are
 * simultaneous events of one game action), 373 (simultaneous events are handled INDIVIDUALLY for replacement
 * purposes), 371.1 (once each turn = applies to that many EVENTS), 371.2 / 371.2.a / 371.2.b (optional: the
 * controller chooses; a declined offer "has not been applied this turn"), 375 (the replacing event inherits
 * the generating effect's modifications: ready, 3 Might, [Temporary]), 370.1.b, 370.2.
 *
 * Question: Zilean at bf1; P1 resolves Sprite Burst. (a) 3 tokens (one event doubled) or 4 (whole
 * instruction doubled)? (b) are all of them ready 3-Might Temporary Sprites? (c) Sprite Call later the same
 * turn — offered again? (d) P1 DECLINES on Sprite Burst — how many, and is Sprite Call then offered?
 * (e) Zilean in base.
 *
 * Expected: (a) exactly ONE optional offer is applied to ONE of the two play-token events → 3 Sprites, never
 * 4. (b) all three are ready, 3 Might, [Temporary] (375) and all die at P1's next Beginning Phase. (c) already
 * applied this turn → no offer, Sprite Call makes exactly 1. (d) declined → 2 Sprites; 371.2.b: the offer is
 * still live for Sprite Call → accepted → 2 more. (e) no offer at all: 2, then 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const SPRITE_BURST = "unl-069-219";
const SPRITE_CALL = "ogn-094-298";

/**
 * P1's turn. Zilean stands at bf1 (or sits in P1's base); Sprite Burst (5) + Sprite Call (3) in hand with
 * 8 energy. bf1 is UNCONTROLLED by default so the token plays have a single legal destination (base) and
 * the replacement question is isolated from destination prompts; `bf1Controller: P1` is the contrast.
 */
function board(zileanAt: "bf1" | "base" = "bf1", bf1Controller: typeof P1 | null = null) {
  return scenario()
    .resources(P1, { energy: 8 })
    .battlefield("bf1", { controller: bf1Controller })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, zileanAt, ZILEAN, "zilean")
    .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
    .hand(P1, SPRITE_BURST, "burst")
    .hand(P1, SPRITE_CALL, "call");
}

function sprites(game: Game): string[] {
  return game.p1.units().filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");
}

/**
 * Cast `spell`, then drain: every token-destination prompt → "base"; every Zilean "you may" offer →
 * `zilean`. Returns the new Sprite ids and how many Zilean offers were shown.
 */
async function castAndResolve(game: Game, spell: "burst" | "call", zilean: "yes" | "no"): Promise<{ made: string[]; offers: number }> {
  const before = sprites(game);
  let offers = 0;
  await game.p1.cast(spell);
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
      continue;
    }
    if (d?.kind === "yes-no" && d.seat === P1) {
      offers += 1;
      await (zilean === "yes" ? game.p1.yes() : game.p1.no());
      continue;
    }
    break;
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.zoneOf(spell)).toBe("trash");
  return { made: sprites(game).filter((id) => !before.includes(id)), offers };
}

describe("Zilean × Sprite Burst — the once-per-turn copy attaches to ONE play-token event (3, not 4)", () => {
  // ── (a) per event, not per instruction ─────────────────────────────────────────────────────

  test("(a) Zilean at bf1, P1 accepts: Sprite Burst yields exactly 3 Sprites (one of the two events doubled), from a single offer (370.1.a.2, 373, 371.1)", async () => {
    const game = await board().build();
    const { made, offers } = await castAndResolve(game, "burst", "yes");
    expect(offers).toBe(1);
    expect(made).toHaveLength(3);
    expect(sprites(game)).toHaveLength(3);
    expect(game.p1.energy()).toBe(3); // only Sprite Burst's 5 was spent
    expect(game.violations()).toEqual([]);
  });

  // ── (b) the extra copy inherits ready / 3 Might / Temporary ────────────────────────────────

  test("(b) all three Sprites are READY, 3 Might, P1's, and carry [Temporary] — the extra copy is not a plain exhausted token (375)", async () => {
    const game = await board().build();
    const { made } = await castAndResolve(game, "burst", "yes");
    expect(made).toHaveLength(3);
    for (const t of made) {
      expect(game.state(t)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isReady: true, isToken: true, might: 3, owner: P1, zone: "base" });
      expect(game.state(t).keywords).toContain("Temporary");
    }
  });

  test("(b) …and all three die together at the start of P1's next Beginning Phase (Temporary inherited), surviving P2's turn", async () => {
    const game = await board().build();
    const { made } = await castAndResolve(game, "burst", "yes");
    expect(made).toHaveLength(3);
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(sprites(game)).toHaveLength(3);
    await game.advanceTurn(); // → P1: Temporary kills them before scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game)).toHaveLength(0);
    for (const t of made) {
      expect(game.zoneOf(t)).toBe("gone");
    }
  });

  // ── (c) once each turn ─────────────────────────────────────────────────────────────────────

  test("(c) after applying it on Sprite Burst, Sprite Call the same turn gets NO offer and makes exactly 1 Sprite (371.1) — 4 total", async () => {
    const game = await board().build();
    const first = await castAndResolve(game, "burst", "yes");
    expect(first.made).toHaveLength(3);
    const second = await castAndResolve(game, "call", "yes");
    expect(second.offers).toBe(0);
    expect(second.made).toHaveLength(1);
    expect(sprites(game)).toHaveLength(4);
    expect(game.p1.energy()).toBe(0);
  });

  // ── (d) declined → not applied → still live ────────────────────────────────────────────────

  test("(d) P1 declines every offer on Sprite Burst: exactly 2 Sprites", async () => {
    const game = await board().build();
    const { made, offers } = await castAndResolve(game, "burst", "no");
    expect(offers).toBeGreaterThanOrEqual(1); // it WAS offered (371.2.a)
    expect(made).toHaveLength(2);
    for (const t of made) {
      expect(game.state(t)).toMatchObject({ isReady: true, might: 3 });
      expect(game.state(t).keywords).toContain("Temporary");
    }
  });

  test("(d) …and because a declined replacement 'has not been applied this turn' (371.2.b), Sprite Call is offered Zilean again: accept → 2 Sprites (4 total)", async () => {
    const game = await board().build();
    const first = await castAndResolve(game, "burst", "no");
    expect(first.made).toHaveLength(2);
    const second = await castAndResolve(game, "call", "yes");
    expect(second.offers).toBe(1);
    expect(second.made).toHaveLength(2);
    for (const t of second.made) {
      expect(game.state(t)).toMatchObject({ isReady: true, isToken: true, might: 3 });
      expect(game.state(t).keywords).toContain("Temporary");
    }
    expect(sprites(game)).toHaveLength(4);
  });

  // ── (e) condition false ────────────────────────────────────────────────────────────────────

  test("(e) Zilean in base: 'while I'm at a battlefield' is false — no offer on either spell; Sprite Burst = 2, Sprite Call = 1", async () => {
    const game = await board("base").build();
    const first = await castAndResolve(game, "burst", "yes");
    expect(first.offers).toBe(0);
    expect(first.made).toHaveLength(2);
    const second = await castAndResolve(game, "call", "yes");
    expect(second.offers).toBe(0);
    expect(second.made).toHaveLength(1);
    expect(sprites(game)).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });

  // ── contrast: P1 also CONTROLS bf1 (each token additionally asks base | bf1) ───────────────
  // Expected: the destination prompts change nothing about the replacement — one Zilean offer, 3 Sprites.
  // Actual: whenever a token play also parks a choose-destination prompt the engine never surfaces
  // Zilean's "you may" offer at all (0 offers, 2 Sprites) — the 'no-offer' bug.
  test("with P1 controlling bf1 (destination prompt per token) Zilean's offer must still appear once and yield 3 Sprites (371.2.a, 373); engine skips the offer entirely", async () => {
    const game = await board("bf1", P1).build();
    const { made, offers } = await castAndResolve(game, "burst", "yes");
    expect(offers).toBe(1);
    expect(made).toHaveLength(3);
  });
});
