/**
 * Ruling 7f487db21be75acf — Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7][mind] · 7 Might "When you play me, give enemy units -3 [Might] this turn,
 *     to a minimum of 1 [Might]."
 *
 * Q: Falling Star leaves a unit with "3 HP" (6 Might, 3 damage); Thousand-Tailed is played later the same turn. Does it die?
 * A: Yes. The Watcher drops it to 3 Might while 3 damage is still marked → damage ≥ Might → it dies. Only works in the same turn
 *    with no combat in between (otherwise the damage would have healed).
 * Rules: 142.2.a (lethal check: marked damage ≥ current Might), 317.2 / 443.4 (damage heals at end of turn / after combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const WATCHER = "ogn-116-298";

/** P1's turn: [9] + [fury][fury] + [mind]. P2 holds bf1 with a 6-Might Brute and a 7-Might Giant. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 2, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 7, name: "Giant" }, "giant")
    .hand(P1, FALLING_STAR, "star")
    .hand(P1, WATCHER, "watcher");
}

/** Falling Star: one 3 at the Brute, the other 3 at the Giant. */
async function starHitsBrute(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("star", { targets: ["brute", "giant"] });
  await game.settle();
  expect(game.zoneOf("star")).toBe("trash");
  return game;
}

describe("Ruling 7f487db21be75acf — Falling Star damage + a later Watcher the same turn kills a 6-Might unit", () => {
  test("after Falling Star the Brute is 6 Might carrying 3 damage ('3 HP left') — alive; the Giant 7 with 3", async () => {
    const game = await starHitsBrute();
    expect(game.state("brute")).toMatchObject({ damage: 3, might: 6, zone: "battlefield-bf1" });
    expect(game.state("giant")).toMatchObject({ damage: 3, might: 7, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Thousand-Tailed played afterwards (same turn): its trigger resolves → Brute 6→3 Might with 3 damage ⇒ dies; Giant 7→4 with 3 damage survives", async () => {
    const game = await starHitsBrute();
    await game.p1.play("watcher");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // not until the trigger resolves
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("giant")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: NOT the same turn — the damage heals at end of turn, so a Watcher on P1's next turn merely shrinks the Brute (6→3, 0 damage) and it lives", async () => {
    const game = await starHitsBrute();
    await game.advanceTurn(); // → P2
    expect(game.state("brute").damage).toBe(0);
    await game.advanceTurn(); // → P1 again (pools were emptied; refill for the Watcher)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 7, power: { mind: 1 } });
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
  });
});
