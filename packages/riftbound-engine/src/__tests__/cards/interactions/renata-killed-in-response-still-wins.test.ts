/**
 * Interaction: Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 Might
 *     "[1][mind]: Draw 1.  [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.
 *      Use my abilities only while I'm at a battlefield."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3+[fury] · [Action] — "Deal 4 to a unit at a battlefield. Draw 1."
 *   × a Reaction-speed 4-damage source in P2's hand (inline "Chem Bolt": [Reaction] Deal 4 to a unit at a
 *     battlefield) — Void Seeker itself is only [Action] and cannot be played on P1's turn outside a showdown.
 *
 * Rules: 319.3/319.4/319.5 (a Cleanup after an item is added as Pending, after it is Finalized, and after
 * an item leaves the chain), 320/323.1 + 472 (Cleanup task 1: a player at ≥ Victory Score and ahead wins —
 * the game ends there), 323.5 (lethally damaged units die in the Cleanup), 340.1 (LIFO resolution),
 * 359.3.e.12 (an effect that references no object is never "null" because its source left), 398–404 (an
 * activated ability's restrictions and costs are checked/paid at activation; once finalized it is a chain
 * item independent of its source), 471.1.a.1 (a non-Conquer point is never Final-Point restricted).
 *
 * Question: 1v1 to 8, P1 on 7, P1's turn, Neutral Open. Renata (4) is P1's unit at bf1. P1 pays
 * [4][mind]×4 + Exhaust and activates "Score 1 point". P2 responds with a Reaction that deals 4 to Renata.
 *   (a) Renata dies in the Cleanup after the Reaction resolves — does the already-finalized ability still
 *       resolve and score?  → YES.
 *   (b) When does P1 win — at the Cleanup after the ability leaves the chain (323.1); not Final-Point blocked.
 *   (c) Contrast: Renata in base / already dead when P1 has priority → the ability cannot be activated at all.
 *   (d) The winning Cleanup ends the game at task 1: nothing after it matters (no further decision exists).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENATA = "sfd-088-221";
const VOID_SEEKER = "ogn-024-298";
const SCORE = 1; // ability index of "[4][mind]×4, [Exhaust]: Score 1 point"

/** P2's Reaction-speed 4-damage source (the "Flurry-equivalent" the question allows). */
const CHEM_BOLT = {
  abilities: [
    {
      effect: { amount: 4, target: { location: "battlefield", type: "unit" }, type: "damage" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Chem Bolt",
  rulesText: "[Reaction]\nDeal 4 to a unit at a battlefield.",
  timing: "reaction",
} as const;

function board(where: "bf1" | "base" = "bf1") {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 0)
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .resources(P2, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, where, RENATA, "renata")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P2, CHEM_BOLT, "bolt")
    .hand(P2, VOID_SEEKER, "voidSeeker");
}

/** P1 activates Score, passes; P2 responds with the bolt on Renata. Chain = [renata ability, bolt]. */
async function activateAndRespond(game: Game): Promise<void> {
  await game.p1.activate("renata", SCORE);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("bolt", { targets: "renata" });
}

describe("Renata's Score ability, Renata killed in response — the finalized ability still wins the game", () => {
  test("activation: cost paid and Renata exhausted at once (398–404); the ability is P1's finalized chain item and P1 holds priority (319.3/319.4 Cleanups are no-ops at 7 < 8)", async () => {
    const game = await board().build();
    await game.p1.activate("renata", SCORE);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("renata").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    expect(game.gameState.interaction?.chain?.items.map((i) => i.status ?? "finalized")).toEqual(["finalized"]);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2's response window: Void Seeker ([Action]) is NOT playable on P1's turn in a Neutral Closed state, the Reaction bolt IS", async () => {
    const game = await board().build();
    await game.p1.activate("renata", SCORE);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "voidSeeker")).toBe(false);
    await expect(game.p2.cast("voidSeeker", { targets: "renata" })).rejects.toThrow();
    expect(game.p2.can("cast", "bolt")).toBe(true);
  });

  test("after P2 responds the chain is [Renata ability (P1), bolt (P2)] oldest→newest and P2 (controller of the newest item) holds priority", async () => {
    const game = await board().build();
    await activateAndRespond(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "renata", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "bolt", controller: P2, triggered: false }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) LIFO (340.1): the bolt resolves first — Renata takes 4 = lethal and dies in that Cleanup (323.5) — P1 still on 7, game NOT over, Renata's ability STILL on the chain", async () => {
    const game = await board().build();
    await activateAndRespond(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // bolt resolves
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("renata")).toBe("trash");
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    // 340.4 — controller of the new newest item (P1) gets priority.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a)+(b) the source-less ability resolves anyway ('Score 1 point' names no object, 359.3.e.12): P1 → 8, and the Cleanup after it leaves the chain (319.5 → 323.1/472) makes P1 the winner — a non-Conquer point is not Final-Point restricted (471.1.a.1)", async () => {
    const game = await board().build();
    await activateAndRespond(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // bolt resolves, Renata dies
    await game.p1.passPriority();
    await game.p2.passPriority(); // Renata's ability resolves
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.zoneOf("renata")).toBe("trash"); // she did not need to survive
  });

  test("(d) the winning Cleanup stops at task 1: no decision remains for anyone, settle() reports game-over, no invariant violations", async () => {
    const game = await board().build();
    await activateAndRespond(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("game-over");
    expect(game.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the win is not instantaneous on activation nor on the bolt's resolution: P1 is at 7 and the game is live at every window before the ability itself resolves", async () => {
    const game = await board().build();
    await game.p1.activate("renata", SCORE);
    expect([game.p1.points(), game.isOver()]).toEqual([7, false]); // after Pending+Finalize cleanups
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "renata" });
    expect([game.p1.points(), game.isOver()]).toEqual([7, false]); // after bolt added/finalized
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect([game.p1.points(), game.isOver()]).toEqual([7, false]); // after bolt left the chain
    await game.p1.passPriority();
    expect([game.p1.points(), game.isOver()]).toEqual([7, false]); // one pass is not a resolution
    await game.p2.passPriority();
    expect([game.p1.points(), game.isOver()]).toEqual([8, true]);
  });

  // ── (c) NO side ────────────────────────────────────────────────────────────────────────────

  test("(c) Renata in the BASE with full resources: 'only while I'm at a battlefield' fails at Check Legality — no activate option, activate() throws, P1 stays on 7", async () => {
    const game = await board("base").build();
    expect(game.p1.legal().filter((o) => o.card === "renata" && o.verb === "activate")).toEqual([]);
    expect(game.p1.can("activate", "renata")).toBe(false);
    await expect(game.p1.activate("renata", SCORE)).rejects.toThrow();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(c) Renata already in the trash when P1 has priority: nothing to activate, no point", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .battlefield("bf1", { controller: P1 })
      .trash(P1, RENATA, "renata")
      .build();
    expect(game.p1.can("activate", "renata")).toBe(false);
    await expect(game.p1.activate("renata", SCORE)).rejects.toThrow();
    expect(game.p1.points()).toBe(7);
  });
});
