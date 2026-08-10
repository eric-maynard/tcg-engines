/**
 * Ruling 18858d04ee4df786 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction spell · [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   (+ Cleave ogn-004-298 as an Action-speed witness.)
 *
 * Q: Does Yasuo's "when I attack" trigger resolve before the Showdown proper, and what speeds can be played
 *    in response to it?
 * A: Move Yasuo in → showdown initiated, attack trigger on the chain, attacker has priority. While the trigger is
 *    pending only REACTION-speed cards may be played (you may hold priority and Discipline him first). Both pass →
 *    trigger resolves. Then the attacker has Focus + priority and may play Action OR Reaction cards.
 * Rules: 340/341 (priority on a chain: Reactions only), 347 (Focus in a showdown: Actions allowed), 383.4.e.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const DISCIPLINE = "ogn-058-298";
const CLEAVE = "ogn-004-298";

/** P1's turn. P2 holds bf1 with a 10-Might Wall. Yasuo ready in P1's base; P1 holds Discipline + Cleave with [3]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 10, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, CLEAVE, "cleave")
    .resources(P1, { energy: 3 });
}

/** Yasuo attacks bf1; answer the trigger's target prompt (Wall) if asked; stop at the first action decision. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.seat).toBe(P1);
    if (d.kind === "pick") {
      const opt = d.options.find((o) => (o.card ?? o.key) === "wall");
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 18858d04ee4df786 — responding to Yasuo's attack trigger: Reactions before it resolves, Actions only after", () => {
  test("moving Yasuo into bf1 starts the showdown and puts his attack trigger on the chain; the attacker (P1) has priority first", async () => {
    const game = await yasuoAttacks();
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("wall").damage).toBe(0); // trigger has not resolved
  });

  test("with the trigger pending, P1 may play a REACTION (Discipline) but NOT an ACTION (Cleave)", async () => {
    const game = await yasuoAttacks();
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    const r = await game.p1.try((p) => p.cast("cleave", { targets: "yasuo" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cleave")).toBe("hand");
  });

  test("when P1 passes, P2 gets a chance to respond (priority passes to P2 on the chain) before the trigger resolves", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("wall").damage).toBe(0);
    await game.p2.passPriority(); // both passed → resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
  });

  test("holding priority: Discipline on Yasuo resolves first (6 → 8), then the attack trigger deals 8 to Wall", async () => {
    const game = await yasuoAttacks();
    await game.p1.cast("disc", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "disc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("yasuo").might).toBe(8);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
    await game.acting().passPriority();
    await game.acting().passPriority(); // trigger resolves with current Might
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(8);
  });

  test("after the trigger resolves P1 has Focus and priority in the showdown and may now play an ACTION (Cleave) as well as Reactions", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("cleave", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
