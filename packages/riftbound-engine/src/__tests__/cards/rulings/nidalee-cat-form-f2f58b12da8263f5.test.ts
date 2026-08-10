/**
 * Ruling f2f58b12da8263f5 — Nidalee, Cat Form (UNL-114 → unl-114-219) · Body Champion Unit · [3][body] · 4 Might
 *   "[Ambush] When I win a combat, draw 1. (I win if I remain after combat.)"
 *   × Scuttle Crab (UNL-053 → unl-053-219) · Calm Unit · [2] · 0 Might
 *     "When you play me, draw 1. [Deathknell] Choose an opponent. They reveal their hand. You can look at their
 *      facedown cards this turn. Gain 1 XP."
 *
 * Q: Nidalee kills Scuttle Crab in combat — does Nidalee's draw resolve before or after the Crab's Deathknell?
 * A: The Deathknell resolves COMPLETELY first. Combat Resolution processes its tasks in order with a
 *    finalize/pass/resolve window between them: Combat Cleanup kills the Crab (Deathknell pending → chained →
 *    resolved), THEN the combat result is determined and Nidalee's "win a combat" trigger is chained and resolved.
 *    The two are never on the chain together; turn order is irrelevant.
 * Rules: 461.1 (combat cleanup, deaths), 461.2–461.3 (determine result), 808 (Deathknell), 383 (triggers → chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NIDALEE = "unl-114-219";
const SCUTTLE_CRAB = "unl-053-219";
const FILLER = "ogn-175-298";

/** P1's turn. P2 holds bf1 with Scuttle Crab (0). Nidalee (4) ready in P1's base; P1's deck top known; P2 has a hand card. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", NIDALEE, "nidalee")
    .unit(P2, "bf1", SCUTTLE_CRAB, "crab")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P2, FILLER, "p2card");
}

/** Nidalee attacks; both pass Focus → combat damage is dealt (auto procedure). */
async function fight(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("nidalee", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]); // neither unit has attack/defend triggers
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling f2f58b12da8263f5 — Scuttle Crab's Deathknell fully resolves before Nidalee's win-a-combat draw is even chained", () => {
  test("after combat damage: the Crab is dead and ONLY its Deathknell (P2's item) is on the chain — Nidalee's trigger is not there yet, no card drawn, no XP yet", async () => {
    const game = await fight();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crab", controller: P2, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "nidalee")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });

  test("first window: both pass → the Deathknell resolves (P2 gains 1 XP); only THEN is Nidalee's draw trigger chained, alone, still unresolved", async () => {
    const game = await fight();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p2.xp()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nidalee", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "crab")).toBe(false);
    expect(game.p1.hand()).toEqual([]); // not drawn yet — a second pass window exists
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("second window: both pass → Nidalee draws 1; then control is established — Nidalee conquers bf1 for P1", async () => {
    const game = await fight();
    await game.acting().passPriority();
    await game.acting().passPriority(); // Deathknell
    await game.acting().passPriority();
    await game.acting().passPriority(); // Nidalee's draw
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p2.xp()).toBe(1);
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.state("nidalee").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("turn order is irrelevant: the same ordering holds when it is P2's Nidalee attacking P1's Crab on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "base", NIDALEE, "nidalee")
      .unit(P1, "bf1", SCUTTLE_CRAB, "crab")
      .deck(P2, [FILLER, FILLER], ["d1", "d2"])
      .hand(P1, FILLER, "p1card")
      .build();
    await game.p2.move("nidalee", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["crab"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.xp()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["nidalee"]);
    expect(game.p2.hand()).toEqual([]);
    await game.settle();
    expect(game.p2.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
