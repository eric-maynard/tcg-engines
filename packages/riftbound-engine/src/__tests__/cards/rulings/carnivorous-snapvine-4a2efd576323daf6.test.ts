/**
 * Ruling 4a2efd576323daf6 — Carnivorous Snapvine (OGN-149 → ogn-149-298) · Unit · Body · [5][body][body] · 6 Might
 *     "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *   × Primal Strength (OGN-154 → ogn-154-298) · ACTION · [4][body] · "Give a unit +7 [Might] this turn."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · [2][mind] · "Give a unit -4 [Might] this turn, to a minimum of 1."
 *   (+ Discipline ogn-058-298 · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1." as the buffing Reaction.)
 *
 * Q: Can you use a Reaction to buff Snapvine's Might before its play ability resolves?
 * A: Yes — the trigger is a chain item; you (and your opponent) may play Reactions in response, which resolve first, so
 *    the damage uses the modified Might. Non-Reaction spells (Primal Strength) cannot be played onto that chain; a
 *    Might-reducing Reaction (Smoke Screen) lowers Snapvine's damage the same way.
 * Rules: 383 (triggered ability on the chain), 336–343 (closed state: Reactions only; LIFO), Might read on resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SNAPVINE = "ogn-149-298";
const PRIMAL_STRENGTH = "ogn-154-298";
const SMOKE_SCREEN = "ogn-093-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn. P2's Brute (7) at P2's bf1. P1: Snapvine, Discipline, Primal Strength in hand; [11] + body×3 (enough for
 * Snapvine + either spell). P2: Smoke Screen with exactly [2][mind].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { body: 3 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Brute" }, "brute")
    .hand(P1, SNAPVINE, "snapvine")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, PRIMAL_STRENGTH, "primal")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** P1 plays Snapvine choosing the Brute; returns with the trigger on the chain and P1 holding priority. */
async function snapvineTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("snapvine");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toEqual(["brute"]); // "an enemy unit at a battlefield"
      await game.p1.pick("brute");
      continue;
    }
    break;
  }
  expect(game.zoneOf("snapvine")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snapvine", controller: P1, targets: ["brute"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.state("snapvine").might).toBe(6);
  return game;
}

describe("Ruling 4a2efd576323daf6 — Reactions in response to Snapvine's trigger change the Might it fights with", () => {
  test("baseline (no responses): 6-Might Snapvine and 7-Might Brute trade — Brute takes 6 and lives, Snapvine takes 7 and dies", async () => {
    const game = await snapvineTrigger();
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.zoneOf("snapvine")).toBe("trash");
  });

  test("P1 may answer the trigger with a REACTION (Discipline +2 on Snapvine) but NOT with the Action Primal Strength; Discipline resolves first, so Snapvine fights at 8: the Brute dies and Snapvine (8) survives 7 damage", async () => {
    const game = await snapvineTrigger();
    expect(game.p1.can("cast", "discipline")).toBe(true);
    expect(game.p1.can("cast", "primal")).toBe(false); // non-Reaction: not onto an open chain
    const r = await game.p1.try((p) => p.cast("primal", { targets: "snapvine" }));
    expect(r.ok).toBe(false);
    await game.p1.cast("discipline", { targets: "snapvine" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapvine", "discipline"]);
    // The opponent also gets to respond before anything resolves.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.passPriority(); // Discipline resolves (LIFO) …
    expect(game.state("snapvine").might).toBe(8);
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapvine"]); // … the trigger is still waiting
    await game.settle(); // … then the trigger resolves with the NEW Might
    expect(game.zoneOf("brute")).toBe("trash"); // took 8 ≥ 7
    expect(game.state("snapvine")).toMatchObject({ damage: 7, might: 8, zone: "base" }); // 7 < 8: survives
    expect(game.violations()).toEqual([]);
  });

  test("the opponent's Reaction works the other way: Smoke Screen (−4) on Snapvine resolves first, so Snapvine deals only 2 to the Brute (and still dies to 7)", async () => {
    const game = await snapvineTrigger();
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "snapvine" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapvine", "smoke"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.state("snapvine").might).toBe(2);
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("snapvine")).toBe("trash");
  });
});
