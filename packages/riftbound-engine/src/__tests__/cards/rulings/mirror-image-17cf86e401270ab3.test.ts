/**
 * Ruling 17cf86e401270ab3 — Mirror Image (UNL-200 → unl-200-219, Spell, 3 + [rainbow][rainbow])
 *   "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Vex, Apathetic (unl-150-219, 4 Might) "When an opponent plays a unit while I'm at a battlefield, [Stun] it.
 *     They can't move it this turn."
 *   × Reflection token (unl-t06)
 *
 * Q: Does the Reflection token get stunned if the enemy Vex, Apathetic is at a battlefield?
 * A: Yes. Mirror Image says "PLAY a … token", so the token is played — Vex's "when an opponent plays a unit"
 *    triggers and stuns it (and it can't be moved this turn).
 * Rules: 187 (tokens put onto the board by a "play" instruction are played), 383/419.4.a (play-a-unit triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const VEX = "unl-150-219";

/** P1's turn. P2's Vex stands at P2's bf1 (or in base for the contrast). P1: a 3-Might Model in base to copy. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, vexAt, VEX, "vex")
    .unit(P1, "base", { might: 3, name: "Model" }, "model")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Cast Mirror Image on the Model, resolve everything, return the Reflection's id. */
async function reflect(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "model" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return fresh[0]!;
}

describe("Ruling 17cf86e401270ab3 — the Reflection is PLAYED, so an enemy Vex at a battlefield stuns it", () => {
  test("Vex at a battlefield: the Reflection (a copy of Model, in P1's base) is Stunned and can't be moved this turn", async () => {
    const game = await board("bf1").build();
    const tok = await reflect(game);
    expect(game.state(tok)).toMatchObject({
      controller: P1,
      name: "Model",
      might: 3,
      zone: "base",
    });
    expect(game.state(tok).isStunned).toBe(true);
    // "They can't move it this turn": the standard move to the open bf2 is not offered for the token.
    expect((await game.p1.try((p) => p.move(tok, "bf2"))).ok).toBe(false);
    expect(game.state("model").isStunned).toBe(false); // only the PLAYED unit is stunned
    expect((await game.p1.try((p) => p.move("model", "bf2"))).ok).toBe(true); // the original still moves freely
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Vex in her BASE ('while I'm at a battlefield' false) → the Reflection is not stunned and may move", async () => {
    const game = await board("base").build();
    const tok = await reflect(game);
    expect(game.state(tok).isStunned).toBe(false);
    expect(game.state(tok).isReady).toBe(true); // "Play a READY Reflection"
    expect((await game.p1.try((p) => p.move(tok, "bf2"))).ok).toBe(true);
    expect(game.locationOf(tok)).toBe("bf2");
  });
});
