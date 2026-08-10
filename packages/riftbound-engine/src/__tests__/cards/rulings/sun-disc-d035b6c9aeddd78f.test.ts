/**
 * Ruling d035b6c9aeddd78f — Sun Disc (OGN-021 → ogn-021-298) · Gear · [2][fury]
 *   "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Noxus Saboteur (OGN-018 → ogn-018-298) · Unit · [3] · 3 — "Your opponents' [Hidden] cards can't be revealed here."
 *   (Opponent's hidden card: Hidden Blade ogn-213-298, facedown at their battlefield.)
 *
 * Q: Sun Disc exhausted (Legion), Noxus Saboteur played ready and moved into a battlefield — when is the opponent's last
 *    chance to react with a Hidden card?
 * A: When Sun Disc's ability is activated (it goes on the chain). Playing a permanent with no play trigger and moving a
 *    unit create no chain, so the opponent gets no priority after that; then the showdown starts with the Saboteur
 *    there, and their Hidden card can't be revealed at that battlefield.
 * Rules: 419 (activated ability uses the chain), 336–338 (no chain for playing a trigger-less permanent / a standard
 *        move), 340 (showdown), Saboteur's static.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const NOXUS_SABOTEUR = "ogn-018-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn 3 with [4]. Sun Disc ready in P1's base; hand: a 1-cost trigger-less Opener (to turn Legion on) and Noxus
 * Saboteur. P2 holds bf1 with a Guard (2) and a Hidden Blade facedown there (hidden on an earlier turn).
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .gear(P1, SUN_DISC, "disc")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Opener" }, "opener")
    .hand(P1, NOXUS_SABOTEUR, "sab");
}

/** Opener played (Legion live), Sun Disc activated: its ability is on the chain and P1 has passed → P2's window. */
async function discOnChainP2Window(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("opener");
  // A trigger-less permanent: no chain, no window for P2 — straight back to P1's main phase.
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.p1.can("activate", "disc")).toBe(true); // Legion satisfied
  await game.p1.activate("disc");
  expect(game.state("disc").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1 })]);
  await game.p1.passPriority();
  return game;
}

describe("Ruling d035b6c9aeddd78f — the opponent's last Hidden window is Sun Disc's ability; unit play + move open no chain", () => {
  test("Sun Disc's activation IS a chain item: P2 gets priority and could reveal the Hidden Blade right now", async () => {
    const game = await discOnChainP2Window();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "blade")).toBe(true);
  });

  test("after that: Noxus Saboteur is played READY with no trigger → no chain, no P2 window; the move to bf1 opens the showdown directly (P1 has Focus) — again no P2 priority in between", async () => {
    const game = await discOnChainP2Window();
    await game.p2.passPriority(); // P2 lets the ability resolve
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.play("sab");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sab")).toMatchObject({ isReady: true, zone: "base" }); // Sun Disc: enters ready
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // P2 never got priority
    await game.p1.move("sab", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // showdown, attacker's Focus
    expect(game.state("sab").combatRole).toBe("attacker");
  });

  test("…and in that showdown it is too late: with the Saboteur at bf1, P2 (given Focus) cannot reveal the Hidden Blade there", async () => {
    const game = await discOnChainP2Window();
    await game.p2.passPriority();
    await game.p1.play("sab");
    await game.p1.move("sab", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "blade")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "blade")).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
  });
});
