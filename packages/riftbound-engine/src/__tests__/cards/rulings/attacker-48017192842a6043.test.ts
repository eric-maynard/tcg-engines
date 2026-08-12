/**
 * Ruling 48017192842a6043 — (a unit dragged onto a battlefield I control is the ATTACKER; no specific card)
 *   Stand-in: Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit."
 *
 * Q: When I move an enemy unit to a battlefield I control, does that make the enemy unit the attacker?
 * A: Yes. The unit that arrives at a battlefield it does not control contests it, and that arrival is what
 *    designates it the Attacker — no matter whose card or turn caused the move. (Moving a unit onto an empty,
 *    uncontrolled battlefield instead is a non-combat showdown with no designations at all.)
 * Rules: 344.2 (an arriving unit applies Contested), 464.2.c (Combat designates the contesting units Attackers
 *        and the controller's units Defenders), 464.2.c.3 (no designations without an opposing unit).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bfMine with a Warden (5); bfOpen is empty. P2's Wanderer (3) idles in base. P1 has Charm. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bfMine", { controller: P1 })
    .unit(P1, "bfMine", { might: 5, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 3, name: "Wanderer" }, "wanderer")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 48017192842a6043 — charming an enemy unit onto my own battlefield makes IT the attacker", () => {
  test("the arriving enemy unit contests my battlefield and is designated Attacker; my unit there is the Defender — on MY turn, off MY card", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "wanderer" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves; the Wanderer arrives and the combat is staged
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("wanderer")).toBe("bfMine");
    expect(game.gameState.battlefields.bfMine?.contested).toBe(true);
    expect(game.state("wanderer").combatRole).toBe("attacker");
    expect(game.state("warden").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
  });

  test("the combat then runs with those roles: my 5-Might Defender kills the 3-Might Attacker and I keep the battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "wanderer" });
    await game.settle();
    for (let i = 0; i < 6 && game.decision()?.context === "showdown"; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.zoneOf("wanderer")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("battlefield-bfMine");
    expect(game.gameState.battlefields.bfMine).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0); // defending is not a Conquer
    expect(game.violations()).toEqual([]);
  });

  test("contrast — charmed onto an EMPTY uncontrolled battlefield there is no opposing unit, so no designation is made at all", async () => {
    const game = await board().battlefield("bfOpen", { controller: null }).build();
    await game.p1.cast("charm", { targets: "wanderer", answers: ["battlefield-bfOpen"] });
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("bfOpen");
    expect(game.state("wanderer").combatRole).toBeNull();
  });
});
