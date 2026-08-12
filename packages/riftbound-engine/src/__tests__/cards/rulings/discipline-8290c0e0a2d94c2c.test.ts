/**
 * Ruling 8290c0e0a2d94c2c — Discipline (OGN-058 → ogn-058-298) · Spell · [2] · Reaction
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · [7][mind] ·
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: My 3-Might unit is hit by the Watcher's -3 and I then Discipline it for +2. What is its final Might?
 * A: 3. The Watcher's reduction is a ONE-TIME modification applied at resolution — capped there by the printed
 *    "to a minimum of 1 [Might]", i.e. it can only take a 3-Might unit down by 2 — and it does not keep clamping
 *    afterwards. The later +2 simply adds on top: 3 − 2 + 2 = 3.
 *    (The ruling's headline says 3; its own step-by-step bullet says 2 because it treats the reduction as a full
 *     −3 to zero, which contradicts the card's printed minimum. The headline is what is asserted here.)
 * Rules: 421.2 (a "give ±N Might this turn" effect writes a modifier once, when it resolves),
 *        421.4 (a printed minimum caps the reduction as it is applied, it is not a standing floor).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";

/** P2's turn with exactly [7][mind] for the Watcher; P1 holds bf1 with a plain 3-Might Brute and has Discipline + [2].
 *  P2's Raider then attacks, which is what opens P1's window to react. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, THOUSAND_TAILED_WATCHER, "watcher")
    .hand(P1, DISCIPLINE, "disc");
}

describe("Ruling 8290c0e0a2d94c2c — the Watcher's reduction is a one-off modifier; Discipline adds on top", () => {
  test("premise: the Brute starts at its printed 3 Might with no modifier", async () => {
    const game = await board().build();
    expect(game.state("brute")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
  });

  test("the Watcher resolves: the Brute drops to the printed floor of 1 — the recorded modifier is −2, not −3, because the minimum caps it AS IT IS APPLIED", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    expect(game.state("brute")).toMatchObject({ baseMight: 3, might: 1, mightModifier: -2 });
  });

  test("ruling: Discipline's +2 then adds to that one-off modifier — the Brute ends at 3 Might (3 − 2 + 2), the reduction does not keep applying", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    await game.p2.move("raider", "bf1"); // the attack is what gives P1 a window for a Reaction
    await game.p2.passFocus();
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "brute" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brute")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("consequence in the fight it was cast for: back at 3 the Brute survives nothing-in-particular but is no longer a 1-Might pushover — it trades damage with the 4-Might Raider at 3", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 4 ≥ 3
    expect(game.state("raider").damage).toBe(0); // survivors are healed, but it took the Brute's 3, not 1
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
  });

  test("without Discipline the same Brute is a 1-Might unit for the rest of the turn", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    expect(game.state("brute").might).toBe(1);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
  });
});
