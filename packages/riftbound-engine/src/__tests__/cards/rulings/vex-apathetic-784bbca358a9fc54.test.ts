/**
 * Ruling 784bbca358a9fc54 — Vex, Apathetic (UNL-150 → unl-150-219) · Unit · Chaos · 4 · 4 Might
 *     "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) "When I move from a location, play a 3 [Might] Sprite unit token with
 *     [Temporary] there."   × Sprite token (OGN-274 → ogn-274-298).
 *
 * Q: Does Vex, Apathetic "counter" Lillia's Sprites?
 * A: No counter — Lillia's ability and the token play both resolve. But because the token is PLAYED by an opponent while
 *    Vex is at a battlefield, Vex's trigger fires: the Sprite arrives, then is Stunned and can't move this turn.
 * Rules: 425 (countering negates a card/ability — not what Vex does), 350/419 (a token "played" by an effect is played),
 *        423 (Stun), Vex's trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const LILLIA = "unl-082-219";

/** P2's turn. P1's Vex stands at bf1; P2's Lillia is ready in base; bf2 is open for her to walk to. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, vexAt, VEX, "vex")
    .unit(P2, "base", LILLIA, "lillia");
}

const sprites = (game: Game) => game.p2.units().filter((u) => game.state(u).name === "Sprite");

describe("Ruling 784bbca358a9fc54 — Vex doesn't counter Lillia's Sprite; she stuns it and pins it for the turn", () => {
  test("Lillia moves base → bf2: her trigger goes on the chain and is NOT countered; it resolves and the Sprite token is played at the origin (base)", async () => {
    const game = await board("bf1").build();
    await game.p2.move("lillia", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P2, countered: false, triggered: true })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(sprites(game)).toHaveLength(1); // the token exists — nothing was countered
    const sprite = sprites(game)[0] as string;
    expect(game.locationOf(sprite)).toBe("base");
    expect(game.state(sprite)).toMatchObject({ isToken: true, might: 3 });
    // Vex saw an opponent PLAY a unit while she is at a battlefield → her trigger is now the chain item.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    expect(game.state(sprite).isStunned).toBe(false); // not yet — Vex's trigger hasn't resolved
  });

  test("Vex's trigger resolves: the Sprite stays on the board but is Stunned and can't be moved this turn; Lillia herself is unaffected", async () => {
    const game = await board("bf1").build();
    await game.p2.move("lillia", "bf2");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(sprites(game)).toHaveLength(1);
    const sprite = sprites(game)[0] as string;
    expect(game.zoneOf(sprite)).toBe("base");
    expect(game.state(sprite).isStunned).toBe(true);
    expect(game.state(sprite).grantedKeywords).toContainEqual({ duration: "turn", keyword: "NoMove" });
    expect(game.p2.can("move", sprite)).toBe(false);
    expect(game.locationOf("lillia")).toBe("bf2");
    expect(game.state("lillia").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: Vex in her base (not at a battlefield) — the Sprite is played and is neither stunned nor pinned", async () => {
    const game = await board("base").build();
    await game.p2.move("lillia", "bf2");
    await game.settle();
    expect(sprites(game)).toHaveLength(1);
    const sprite = sprites(game)[0] as string;
    expect(game.state(sprite).isStunned).toBe(false);
    expect(game.state(sprite).grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
  });
});
