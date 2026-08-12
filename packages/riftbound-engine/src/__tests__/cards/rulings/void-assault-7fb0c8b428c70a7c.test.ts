/**
 * Ruling 7fb0c8b428c70a7c — Void Assault (UNL-202 → unl-202-219) · Spell · Body/Chaos · [2][rainbow]
 *   "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't control, you're
 *    the attacker.)"
 *
 * Q: Void Assault drags one of my units and one enemy unit to the same battlefield. Who is the attacker?
 * A: I am. My unit moves FIRST, so mine is what applies Contested to the battlefield; the enemy unit arriving
 *    afterwards is the defender. The reminder text on the card says so outright.
 * Rules: 445 (the player who applies Contested is the attacker), 344 (Contested ⇒ showdown), sequencing of the
 *        two moves is the printed order.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";

/** P1's turn with exactly [2][rainbow]; bf1 is uncontrolled and empty, both bodies start in their bases. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 4, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 4, name: "Theirs" }, "theirs")
    .hand(P1, VOID_ASSAULT, "va");
}

async function cast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("va", { answers: ["bf1", "bf1"], targets: ["mine", "theirs"] });
  // resolve the spell only — a full settle would run the combat both 4-Might bodies lose
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling 7fb0c8b428c70a7c — Void Assault: the caster's unit moves first, so the caster is the attacker", () => {
  test("both units end up at the same battlefield", async () => {
    const game = await cast();
    expect(game.locationOf("mine")).toBe("bf1");
    expect(game.locationOf("theirs")).toBe("bf1");
    expect(game.zoneOf("va")).toBe("trash");
  });

  test("the caster's unit is the ATTACKER — it is what applied Contested", async () => {
    const game = await cast();
    expect(game.state("mine").combatRole).toBe("attacker");
  });

  test("…and the enemy unit that arrived second is the DEFENDER (FAQ #10026)", async () => {
    const game = await cast();
    expect(game.state("theirs").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });

  test("the showdown that follows is a real combat between them — and P1 is the one attacking into bf1", async () => {
    const game = await cast();
    expect(game.decision()).toMatchObject({ context: "showdown" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash"); // 4 vs 4, both fall
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});
