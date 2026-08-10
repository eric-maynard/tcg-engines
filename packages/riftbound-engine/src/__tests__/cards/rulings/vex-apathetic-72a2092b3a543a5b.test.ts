/**
 * Ruling 72a2092b3a543a5b — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · [Deflect]
 *     "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Reflection token (unl-t06) via Mirror Image (UNL-200 → unl-200-219) "…Play a ready Reflection unit token to your base…"
 *   × Sprite token (OGN-274 → ogn-274-298) via Sprite Call (ogn-094-298) "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Q: Can Vex, Apathetic's ability stun tokens?
 * A: Yes — when the effect that makes the token says "PLAY a … token" (Reflection via Mirror Image, Sprite tokens), the token
 *    is played and Vex's trigger stuns it. (An effect that merely "creates"/"puts" a token without "play" would not trigger
 *    her — no such card is in this pool, so that half is not exercised.) The stun is programmatic, not a targeted choice.
 * Rules: 187 (tokens made by a "play" instruction are played), 383 / 419.4.a (play triggers), 355.10.d (no choosing → no Deflect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const MIRROR_IMAGE = "unl-200-219";
const SPRITE_CALL = "ogn-094-298";

const isToken = (game: Game) => (id: string) => game.state(id).isToken;

/** P2's turn; P1's Vex at bf1 (or in base for the control). P2: a 3-Might Model in base, Mirror Image + Sprite Call in hand. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, vexAt, VEX, "vex")
    .unit(P2, "base", { might: 3, name: "Model" }, "model")
    .hand(P2, MIRROR_IMAGE, "mirror")
    .hand(P2, SPRITE_CALL, "call");
}

/** Resolve only the spell `alias` (both pass) and stop with whatever came next still on the chain. */
async function resolveSpellOnly(game: Game, alias: string): Promise<void> {
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === alias); i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf(alias)).toBe("trash");
}

describe("Ruling 72a2092b3a543a5b — Vex, Apathetic stuns unit TOKENS that are 'played'", () => {
  test("Reflection (Mirror Image says 'Play a … token'): the token's arrival puts Vex's trigger on the chain; on resolution the token is stunned and can't move", async () => {
    const game = await board("bf1").build();
    await game.p2.cast("mirror", { targets: "model" });
    await resolveSpellOnly(game, "mirror");
    const tok = game.p2.base().find(isToken(game));
    expect(tok).toBeDefined();
    await game.acceptTriggerOrder();
    expect(game.chain().find((c) => c.cardId === "vex")).toMatchObject({ controller: P1, triggered: true });
    expect(game.state(tok as string).isStunned).toBe(false); // not until the trigger resolves
    // Programmatic selection: P1 is never asked to choose/target the token (no pick prompt for P1).
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.state(tok as string)).toMatchObject({ isStunned: true, isToken: true, name: "Model" });
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect((await game.p2.try((p) => p.move(tok as string, "bf1"))).ok).toBe(false);
    expect(game.state("model").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Sprite (Sprite Call says 'Play a … Sprite unit token'): the Sprite token is stunned and grounded too", async () => {
    const game = await board("bf1").build();
    await game.p2.cast("call");
    await resolveSpellOnly(game, "call");
    const tok = game.p2.base().find(isToken(game));
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isToken: true, might: 3, name: "Sprite" });
    await game.acceptTriggerOrder();
    expect(game.chain().find((c) => c.cardId === "vex")).toMatchObject({ controller: P1, triggered: true });
    await game.settle();
    expect(game.state(tok as string).isStunned).toBe(true);
    expect(game.state(tok as string).grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect((await game.p2.try((p) => p.move(tok as string, "bf1"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: Vex in base ('while I'm at a battlefield' fails) — neither token is stunned", async () => {
    const game = await board("base").build();
    await game.p2.cast("mirror", { targets: "model" });
    await game.settle();
    await game.p2.cast("call");
    await game.settle();
    const toks = game.p2.base().filter(isToken(game));
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t).isStunned).toBe(false);
      expect(game.state(t).grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
    }
    expect(game.chain()).toEqual([]);
  });
});
