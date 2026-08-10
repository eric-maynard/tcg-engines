/**
 * Ruling 008cbc02cb3f781c — Challenge (OGN-128 → ogn-128-298) · Body Action spell · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Draven, Audacious (SFD-148 → sfd-148-221) · 6-Might champion unit
 *   "The first time I win a combat each turn, you score 1 point. When I die in combat, …"
 *
 * Q: Does Challenge constitute a combat for the purposes of Draven, Audacious?
 * A: No. Challenge is just a spell making two units deal damage to each other; it opens no showdown,
 *    assigns no Attacker/Defender designation and so is never a combat Draven can "win". Killing the
 *    enemy unit with Challenge scores nothing.
 * Rules: 459–466 (Combat only arises from a Contested battlefield / showdown; 466.3 combat result),
 *        190.4.c, 423/437 (spell damage is not combat damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DRAVEN = "sfd-148-221";

/** P1's turn. Draven (6) at P1's bf1; a 3-Might enemy at P2's bf2. P1 holds Challenge with exactly [2][body]. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 0)
    .points(P2, 0)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", DRAVEN, "draven")
    .unit(P2, "bf2", { might: 3, name: "Grunt" }, "grunt")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 008cbc02cb3f781c — Challenge is not a combat for Draven, Audacious", () => {
  test("Challenge resolves: Draven (6) and the Grunt (3) damage each other — Grunt dies, Draven takes 3", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["draven", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    // No showdown / no combat designations while the spell is pending.
    expect(game.state("draven").combatRole).toBeNull();
    expect(game.state("grunt").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.state("draven").damage).toBe(3);
  });

  test("no combat happened: Draven's 'win a combat' trigger never hits the chain and P1 scores NO point", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["draven", "grunt"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Challenge resolves
    expect(game.zoneOf("grunt")).toBe("trash");
    // Nothing of Draven's was triggered by the kill.
    expect(game.chain().some((c) => c.cardId === "draven")).toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // bf2 was never contested and P1 did not conquer it (no P1 unit there).
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.state("draven").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Draven actually WINNING a combat at bf2 does score P1 a point (the trigger exists — Challenge just isn't a combat)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 0)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", DRAVEN, "draven")
      .unit(P2, "bf2", { might: 3, name: "Grunt" }, "grunt")
      .build();
    await game.p1.move("draven", "bf2");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    // 1 (won a combat) + 1 (conquer bf2).
    expect(game.p1.points()).toBe(2);
  });
});
