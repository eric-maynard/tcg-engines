/**
 * Ruling e29da7f167fdd6a9 — Charm (OGN-043 → ogn-043-298) · spell · [1][calm] · "Move an enemy unit."
 *
 * Q: Charming an enemy unit into a battlefield I control — does it arrive ready, does it start a showdown, and
 *    does its controller score if it wins?
 * A: A move by a card effect never changes the unit's ready/exhausted state (only a STANDARD move costs an exhaust).
 *    The arriving unit contests my battlefield, so its controller is the ATTACKER, and if they win the combat they
 *    establish control and Conquer — scoring a point.
 * Nuance: Charm has no [Action]/[Reaction], so it can only be played in your own open main phase, never in a showdown.
 * Rules: 344/345 (moves; only a standard move exhausts), 187.3.a.1 (arrival applies Contested), 466.5.d (win ⇒ Conquer), 419.2 (timing keywords).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bf1 with a 1-Might guard; P2's 5-Might Puppet sits ready in its base. */
function board(puppetMeta: Record<string, unknown> = {}) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 5, name: "Puppet" }, "puppet", puppetMeta)
    .hand(P1, CHARM, "charm")
    .resources(P1, { energy: 1, power: { calm: 1 } });
}

/** P1 Charms the Puppet onto its own battlefield. */
async function charmIn(puppetMeta: Record<string, unknown> = {}): Promise<Game> {
  const game = await board(puppetMeta).build();
  await game.p1.cast("charm", { answers: ["bf1"], targets: "puppet" });
  await game.acting().passPriority();
  await game.acting().passPriority(); // Charm resolves; the showdown it opened is now live
  return game;
}

describe("Ruling e29da7f167fdd6a9 — a Charmed unit keeps its state, attacks the battlefield it lands on, and scores for its own controller", () => {
  test("a READY unit arrives ready — an effect move is not a standard move and costs no exhaust", async () => {
    const game = await charmIn();
    expect(game.locationOf("puppet")).toBe("bf1");
    expect(game.state("puppet")).toMatchObject({ controller: P2, isExhausted: false, isReady: true });
  });

  test("an EXHAUSTED unit arrives exhausted — the state is carried over unchanged, not reset", async () => {
    const game = await charmIn({ exhausted: true });
    expect(game.locationOf("puppet")).toBe("bf1");
    expect(game.state("puppet")).toMatchObject({ isExhausted: true, isReady: false });
  });

  test("the arrival contests P1's battlefield and makes the Charmed unit's controller the ATTACKER", async () => {
    const game = await charmIn();
    expect(game.state("puppet").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("if the Charmed unit wins the combat, ITS controller conquers and scores the point", async () => {
    const game = await charmIn();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("puppet")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Charm carries no [Action], so it cannot be played inside a showdown", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 1, name: "Defender" }, "defender")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CHARM, "charm")
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .build();
    expect(game.p1.can("cast", "charm")).toBe(true); // legal in the open main phase
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "charm")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("charm", { targets: "defender" }));
    expect(attempt.ok).toBe(false);
  });
});
