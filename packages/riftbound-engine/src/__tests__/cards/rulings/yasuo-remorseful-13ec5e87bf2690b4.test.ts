/**
 * Ruling 13ec5e87bf2690b4 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · [6] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction spell · [2] "Give a unit -4 [Might] this turn, to a
 *     minimum of 1 [Might]."
 *
 * Q: Yasuo's attack trigger is on the chain; the opponent responds with Smoke Screen on Yasuo. Does the
 *    trigger deal his original Might (6) or his reduced Might (2)?
 * A: His CURRENT Might on resolution — 2. Only targets/choices are locked when an ability goes on the
 *    chain, not variable values like Might. Sequence: Yasuo attacks → trigger on chain → Smoke Screen
 *    resolves first (LIFO) → Yasuo is 2 → trigger resolves for 2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P1's turn. bf1 is P2's with a 7-Might Wall (survives either 6 or 2). Yasuo ready in P1's base. P2: Smoke Screen + [2][mind]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P2, { energy: 2, power: { mind: 1 } });
}

/** Yasuo attacks bf1; answer the trigger's target prompt (Wall) if asked; stop at the first priority window. */
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

describe("Ruling 13ec5e87bf2690b4 — Yasuo's attack trigger uses his Might at RESOLUTION (after Smoke Screen)", () => {
  test("Yasuo attacking puts his 'when I attack' trigger on the chain (Wall undamaged so far) and a priority window opens", async () => {
    const game = await yasuoAttacks();
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("baseline: with no response the trigger deals Yasuo's full 6 to Wall", async () => {
    const game = await yasuoAttacks();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
  });

  test("P2 responds with Smoke Screen on Yasuo; it resolves first and Yasuo drops to 2 Might while his trigger waits", async () => {
    const game = await yasuoAttacks();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "smoke"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Smoke Screen resolves
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("yasuo").might).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
  });

  test("the trigger then resolves dealing 2 (current Might), not 6 (Might when it triggered)", async () => {
    const game = await yasuoAttacks();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("smoke", { targets: "yasuo" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("yasuo").might).toBe(2);
    expect(game.state("wall").damage).toBe(2);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
