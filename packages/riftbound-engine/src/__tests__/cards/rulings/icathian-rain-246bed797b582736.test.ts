/**
 * Ruling 246bed797b582736 — Icathian Rain (OGN-248 → ogn-248-298, 7 + [rainbow]×3) "Deal 2 to a unit." ×6
 *   × Hidden Blade (ogn-213-298, [Hidden] Action) "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: I cast Icathian Rain spreading the instances over my unit and the opponent's; they respond by flipping Hidden Blade
 *    on their OWN unit. When Rain resolves, must all 6 instances hit my unit?
 * A: Yes. Hidden Blade resolves first and their unit dies; when Rain resolves, each "Deal 2 to a unit" must go to a
 *    remaining legal unit — with only your unit left on the board, all six (12 damage) land on it.
 * Rules: 340.1 (LIFO), 355.14 (each instance needs a legal unit at resolution; the only legal one must be used).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn 3 (the Blade was hidden on an earlier turn). P2's Theirs (8) at P2's bf1 with Hidden Blade face down there;
 * P1's Mine (13 — survives 12) at P1's bf2. P1 has exactly 7 + three rainbow. Known P2 deck for the draw-2.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 8, name: "Theirs" }, "theirs")
    .unit(P1, "bf2", { might: 13, name: "Mine" }, "mine")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2a", "p2b", "p2c"])
    .hand(P1, ICATHIAN_RAIN, "rain");
}

/** P1 casts Rain 3×Theirs / 3×Mine; P1 passes; P2 flips Hidden Blade on their own Theirs. */
async function rainThenBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rain", { targets: ["theirs", "theirs", "theirs", "mine", "mine", "mine"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([
    expect.objectContaining({
      cardId: "rain",
      targets: ["theirs", "theirs", "theirs", "mine", "mine", "mine"],
    }),
  ]);
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "blade")).toBe(true); // hidden on an earlier turn → may react with it for [0]
  await game.p2.reveal("blade");
  if (game.decision()?.kind === "pick") {
    expect(game.decision()?.seat).toBe(P2);
    await game.p2.pick("theirs"); // their OWN unit
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rain", "blade"]);
  return game;
}

describe("Ruling 246bed797b582736 — Icathian Rain × Hidden Blade: instances aimed at the dead unit are ignored (CR 359.3.e)", () => {
  test("control: unanswered, the 3/3 split deals 6 to Theirs and 6 to Mine", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ["theirs", "theirs", "theirs", "mine", "mine", "mine"] });
    await game.settle();
    expect(game.state("theirs").damage).toBe(6);
    expect(game.state("mine").damage).toBe(6);
  });

  test("Hidden Blade resolves first: Theirs dies (P2, its controller, draws 2) while Rain is still on the chain and Mine is untouched", async () => {
    const game = await rainThenBlade();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Blade resolves
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.hand()).toEqual(["p2a", "p2b"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rain"]);
    expect(game.state("mine").damage).toBe(0);
  });

  // RULING-CONFLICT: riftjudge 246bed797b582736 says every instance must find a legal unit at resolution, so all six are
  // forced onto Mine (12). CR 359.3.e.5 / 359.3.e.7 / 359.3.e.9 say the opposite for a target CHOSEN at play time: an
  // instance whose chosen unit is no longer legal is simply not executed, and 355.15 bars substituting a newcomer — only an
  // instance the caster never got to choose for looks for a target on resolution. Riftjudge 765ca7d6661ac13f (the same
  // "Deal N to a unit" ×N shape, answered with the same Hidden Blade) agrees with the CR, so the engine follows the CR.
  test("Rain then resolves with Theirs dead: the three instances aimed at it are ignored, never re-aimed at Mine → Mine takes only its own 6", async () => {
    const game = await rainThenBlade();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("mine").damage).toBe(6);
    expect(game.zoneOf("mine")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });
});
