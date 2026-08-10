/**
 * Ruling 1883423ca39e2682 — Beast Below (SFD-132 → sfd-132-221) · Unit · Chaos · [7]+[chaos][chaos] · 8 Might
 *     "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *   × Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] When an opponent plays a unit while I'm at a
 *     battlefield, [Stun] it. They can't move it this turn."
 *
 * Q: Beast Below is played and its trigger picks Vex (at a battlefield) as the enemy unit; once everything resolves,
 *    is Beast Below stunned and unable to move?
 * A: Yes. Both triggers go on the chain (turn order; LIFO). Vex's resolves → Beast Below is stunned and can't move
 *    this turn; Beast Below's resolves → the friendly unit and Vex go back to hand. Beast Below stays where it was
 *    played (stun doesn't send it home) and keeps the stun / no-move for the turn regardless of order.
 * Rules: 383.3.d (simultaneous triggers, turn order), 336–340 (LIFO), 423.1.b (Stunned), 350.1 (can't-move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BEAST_BELOW = "sfd-132-221";
const VEX = "unl-150-219";

/**
 * P1's turn with [7] + 2 chaos (+1 rainbow for Vex's Deflect). P2's Vex holds bf1; P1 holds bf2 with Pal (2).
 * P1 plays Beast Below to bf2 — Pal is the only "another friendly unit", Vex the only enemy unit.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", VEX, "vex")
    .unit(P1, "bf2", { might: 2, name: "Pal" }, "pal")
    .hand(P1, BEAST_BELOW, "beast");
}

async function playBeast(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("beast", { to: "bf2" });
  expect(game.zoneOf("beast")).toBe("battlefield-bf2");
  return game;
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling 1883423ca39e2682 — Beast Below bouncing Vex is still stunned and pinned by Vex's trigger", () => {
  test("playing Beast Below puts BOTH triggers on the chain in turn order: Beast Below's (P1, naming Pal + Vex) below, Vex's (P2) on top", async () => {
    const game = await playBeast();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "beast", controller: P1, targets: ["pal", "vex"], triggered: true }),
      expect.objectContaining({ cardId: "vex", controller: P2, triggered: true }),
    ]);
    expect(game.state("beast").isStunned).toBe(false); // nothing has resolved yet
  });

  test("Vex's trigger resolves first (LIFO): Beast Below is stunned and gains the can't-move restriction while its own trigger is still pending", async () => {
    const game = await playBeast();
    await passBoth(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["beast"]);
    expect(game.state("beast")).toMatchObject({ isStunned: true, zone: "battlefield-bf2" });
    expect(game.state("beast").keywords).toContain("NoMove");
  });

  test("then Beast Below's trigger resolves: Pal and Vex return to their owners' hands — and Beast Below REMAINS at bf2, still stunned and unable to move this turn", async () => {
    const game = await playBeast();
    await passBoth(game);
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p1.hand()).toContain("pal");
    expect(game.zoneOf("vex")).toBe("hand");
    expect(game.p2.hand()).toContain("vex");
    expect(game.state("beast")).toMatchObject({ isStunned: true, location: "bf2", zone: "battlefield-bf2" });
    expect(game.state("beast").keywords).toContain("NoMove");
    expect(game.p1.can("move")).toBe(false); // no legal move for P1 (Beast Below is its only unit)
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the stun and the movement lock are 'this turn': by P1's next turn Beast Below is unstunned, free of NoMove, and may move", async () => {
    const game = await playBeast();
    await game.settle();
    expect(game.state("beast").isStunned).toBe(true);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("beast")).toMatchObject({ isReady: true, isStunned: false });
    expect(game.state("beast").keywords).not.toContain("NoMove");
    expect(game.p1.can("move")).toBe(true);
  });
});
