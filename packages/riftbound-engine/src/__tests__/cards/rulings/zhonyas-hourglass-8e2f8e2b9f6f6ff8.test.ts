/**
 * Ruling 8e2f8e2b9f6f6ff8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Thousand-Tailed Watcher (ogn-116-298) "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1."
 *   × Deadbloom Predator (ogn-161-298) · 8 Might · [Deflect]
 *
 * Q: Watcher's -3 has been applied to Deadbloom (8 → 5); Zhonya's then saves it. Does it recall at 8 or at 5?
 * A: The recalled Deadbloom never left the board, so every effect on it remains — it is the same object with the
 *    Watcher modifier still applied (printed 8, currently 5 until the turn ends). [The scraped headline says "8
 *    (retaining the buff from Watcher)", which contradicts its own rationale; we assert the rationale: effects stay.]
 * Rules: 372/373 (die replacement), Zhonya's recall "isn't a move" — no zone change ⇒ no new object (124), "this
 *        turn" modifiers expire only in the Expiration Step (317.2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const WATCHER = "ogn-116-298";
const DEADBLOOM = "ogn-161-298";

/** P1's turn. P2: Deadbloom (8) holding bf1, Zhonya's face up in base. P1: Watcher in hand (7 + [mind]) and a 6-Might Brute. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DEADBLOOM, "dead")
    .gear(P2, ZHONYAS, "zh")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P1, WATCHER, "watcher");
}

/** Watcher shrinks Deadbloom to 5; the 6-Might Brute attacks; combat would kill Deadbloom → Zhonya's saves it. */
async function watcherThenLethalCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("dead").might).toBe(8);
  await game.p1.play("watcher");
  await game.settle();
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.state("dead")).toMatchObject({ baseMight: 8, might: 5 });
  await game.p1.move("brute", "bf1");
  await game.settle();
  return game;
}

describe("Ruling 8e2f8e2b9f6f6ff8 — a unit recalled by Zhonya's keeps every effect on it (Watcher's -3 included)", () => {
  test("combat: Brute's 6 is lethal to the shrunken (5) Deadbloom → the Hourglass dies instead; Deadbloom is healed, exhausted and recalled to P2's base", async () => {
    const game = await watcherThenLethalCombat();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("dead")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // took 5 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("it never left the board, so the Watcher modifier is STILL on it: printed 8, current Might 5 (mightModifier -3) after the recall", async () => {
    const game = await watcherThenLethalCombat();
    expect(game.state("dead")).toMatchObject({ baseMight: 8, might: 5, mightModifier: -3, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("…and like any 'this turn' effect it lapses in the Expiration Step: on P2's turn Deadbloom is back to 8", async () => {
    const game = await watcherThenLethalCombat();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("dead")).toMatchObject({ baseMight: 8, might: 8, mightModifier: 0, zone: "base" });
  });
});
