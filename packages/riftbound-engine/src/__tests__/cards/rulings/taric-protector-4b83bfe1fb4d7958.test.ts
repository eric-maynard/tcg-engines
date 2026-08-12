/**
 * Ruling 4b83bfe1fb4d7958 — Taric, Protector (OGN-074 → ogn-074-298) · Unit · 4 Might
 *   "[Shield] [Tank] — Other friendly units here have [Shield]."
 *   × Leona, Determined (OGN-238 → ogn-238-298) · Unit · 4 Might · "[Shield] … When I attack, stun an enemy unit here."
 *
 * Q: Does Taric give Leona an EXTRA instance of Shield, so she defends as Shield 2 rather than Shield 1?
 * A: Yes — the Shield values of the two instances add up, so at the same battlefield Leona defends with +2 Might.
 *    Both units must be at the same battlefield; a friendly unit elsewhere gets nothing.
 * Rules: 802 ([Shield] = +N Might while a defender; instances stack), 461 (defender designation), static abilities
 *        with `location: "here"`.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARIC = "ogn-074-298";
const LEONA = "ogn-238-298";

/** P2's turn. P1 holds bf1 with Taric (4) + Leona (4); a Rearguard sits in P1's base. P2 attacks bf1 with a 5-Might Raider. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TARIC, "taric")
    .unit(P1, "bf1", LEONA, "leona")
    .unit(P1, "base", { might: 4, name: "Rearguard" }, "rear")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("leona").combatRole).toBe("defender");
  return game;
}

describe("Ruling 4b83bfe1fb4d7958 — Taric's granted [Shield] stacks with Leona's printed one (Shield 2 while defending)", () => {
  test("out of combat both Shields are present on Leona but neither adds Might", async () => {
    const game = await board().build();
    expect(game.state("leona").keywords).toContain("Shield");
    expect(game.state("leona").grantedKeywords.map((k) => k.keyword)).toContain("Shield");
    expect(game.state("leona").might).toBe(4);
  });

  test("ruling: defending, Leona is 4 + 1 (printed [Shield]) + 1 (Taric's) = 6", async () => {
    const game = await attacked();
    expect(game.state("leona").might).toBe(6);
  });

  test("Taric himself defends at 4 + 1 — he grants [Shield] to OTHER friendly units, not a second one to himself", async () => {
    const game = await attacked();
    expect(game.state("taric").might).toBe(5);
  });

  test("ruling nuance: the friendly unit in base is not 'here', so it gets no [Shield] from Taric", async () => {
    const game = await attacked();
    expect(game.state("rear").grantedKeywords.map((k) => k.keyword)).not.toContain("Shield");
    expect(game.state("rear").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("epilogue: Shield 2 makes Leona (6) out-fight the 5-Might Raider — Taric [Tank] eats the damage and the defence holds", async () => {
    const game = await attacked();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
