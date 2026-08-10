/**
 * Ruling f46f05b29632f4ba — "Master Yi, Wuju Bladesman" legend × Rengar, Trophy Hunter (UNL-120 → unl-120-219)
 *   The ruling is filed under Wuju Master (UNL-191 → unl-191-219), but the "defends" passive it discusses is the Yi legend
 *   Wuju Bladesman "While a friendly unit defends alone, it gets +2 [Might]" — in our pool ogs-019-024.
 *   Rengar (6 Might): "[Ambush] · I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: Opponent moves a unit into an EMPTY battlefield. I play Rengar there as a Reaction. Is Rengar a defender, and does he
 *    get Yi's "when I defend" benefit?
 * A: Yes, Rengar is a Defender — the mover applied Contested and is the Attacker, so my unit arriving there is a Defender.
 *    Yi's ability is a PASSIVE, not a trigger: nothing goes on the chain; as long as Rengar is my only unit there the +2
 *    simply applies to him, automatically and immediately.
 * Rules: 464.2.c.2/464.2.c.3.a (Defender = the player who did not apply Contested; late arrivals get the designation in the
 *        next Cleanup), 316.8.b.1.a / 323.14 (a non-combat showdown becomes a Combat showdown), 364 (passives don't use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_BLADESMAN = "ogs-019-024";
const RENGAR = "unl-120-219";

/** P2's turn. bf1 is empty and uncontrolled. P1: Yi legend, Rengar in hand, [5] + body. P2: a 3-Might Scout in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, RENGAR, "rengar")
    .resources(P1, { energy: 5, power: { body: 1 } });
}

/** Scout walks into empty bf1 (non-combat showdown, P2 has Focus); P2 passes; P1 ambushes Rengar in. */
async function rengarAmbushesTheScout(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("play", "rengar")).toBe(true);
  await game.p1.play("rengar", { to: "bf1" });
  return game;
}

describe("Ruling f46f05b29632f4ba — Rengar ambushed into a freshly-contested empty battlefield is a Defender; Yi's +2 is a passive that just applies", () => {
  test("Rengar may be played as a Reaction to bf1 (enemy units there, none of mine) during the showdown, and lands there", async () => {
    const game = await rengarAmbushesTheScout();
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("designations: the Scout (mover, applied Contested) is the Attacker; Rengar is the DEFENDER (464.2.c.2 / 464.2.c.3.a)", async () => {
    const game = await rengarAmbushesTheScout();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
  });

  test("Yi's ability is a passive: NO triggered item is put on the chain for Rengar, yet — defending alone — he is immediately 8 Might (6 + 2)", async () => {
    const game = await rengarAmbushesTheScout();
    expect(game.chain().filter((i) => i.triggered)).toEqual([]);
    expect(game.state("rengar")).toMatchObject({ baseMight: 6, might: 8 });
  });

  test("the combat then resolves with the bonus: Rengar (8) kills the Scout (3), survives, and P1 holds bf1 as the defender", async () => {
    const game = await rengarAmbushesTheScout();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    // Out of combat the passive no longer applies.
    expect(game.state("rengar").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });
});
