/**
 * Ruling f5e54f30e9e264b8 — Warwick, Hunter (OGN-159 → ogn-159-298) · Body · [6] · 5 Might · "I enter ready. When I attack, kill
 *     all damaged enemy units here."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · Body · [1] · "Deal 1 to all units at battlefields."
 *
 * Q: Can Warwick split his 5 combat damage 1-1-1-1-1 across five defenders (to set up his kill-damaged ability), or must he
 *    assign lethal damage to one unit before moving to the next?
 * A: He must assign lethal to a unit before assigning to the next one; 1 apiece is illegal. To exploit "kill all damaged enemy
 *    units here" pre-damage them — e.g. Flurry of Blades before the move, or after the move but before his "when I attack"
 *    trigger resolves (it resolves on the showdown's initial chain, well before the Combat Damage Step).
 * Rules: 465.2.c.3 (lethal in full before the next unit), 465.2.c.4, 344/383 (attack trigger on the initial chain), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const FLURRY = "ogn-133-298";

const PACK = ["d1", "d2", "d3", "d4", "d5"] as const;

/** P1's turn. P2 holds bf1 with five 2-Might Hounds; Warwick ready in P1's base; Flurry of Blades in hand with exactly [1]. */
function board() {
  let s = scenario().resources(P1, { energy: 1 }).battlefield("bf1", { controller: P2 });
  for (const id of PACK) {
    s = s.unit(P2, "bf1", { might: 2, name: `Hound ${id}` }, id);
  }
  return s.unit(P1, "base", WARWICK, "ww").hand(P1, FLURRY, "flurry");
}

/** Pass priority/focus for whoever is asked until something other than a chain/showdown pass window shows up. */
async function passUntilPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

/** Warwick attacks bf1; his trigger (nothing damaged → kills nothing) resolves; everyone passes to the Combat Damage Step. */
async function toAssignment(game: Game): Promise<DistributeDecision> {
  await game.p1.move("ww", "bf1");
  expect(game.state("ww").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
  const d = await passUntilPrompt(game);
  expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
  return d as DistributeDecision;
}

describe("Ruling f5e54f30e9e264b8 — Warwick can't sprinkle 1 damage on each defender; pre-damage them so his attack trigger kills them", () => {
  test("Combat Damage Step: P1 assigns Warwick's 5 among the five Hounds — each bucket's lethal threshold is 2 (its Might)", async () => {
    const game = await board().build();
    const d = await toAssignment(game);
    expect(d.buckets.map((b) => b.card ?? b.key).toSorted()).toEqual([...PACK]);
    expect(d.buckets.every((b) => b.lethal === 2)).toBe(true);
    // Nothing was damaged when the trigger resolved, so nothing died to it.
    expect(PACK.every((id) => game.zoneOf(id) === "battlefield-bf1")).toBe(true);
  });

  test("1-1-1-1-1 is NOT a legal assignment (465.2.c.3): the engine refuses it and nothing is dealt", async () => {
    const game = await board().build();
    await toAssignment(game);
    const r = await game.p1.try((p) => p.distribute({ d1: 1, d2: 1, d3: 1, d4: 1, d5: 1 }));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    expect(PACK.every((id) => game.state(id).damage === 0)).toBe(true);
  });

  test("nor may two units be left non-lethal (1 to d1, 1 to d2, 3 to d3): still refused", async () => {
    const game = await board().build();
    await toAssignment(game);
    expect((await game.p1.try((p) => p.distribute({ d1: 1, d2: 1, d3: 3 }))).ok).toBe(false);
  });

  test("legal: lethal to d1 (2), lethal to d2 (2), the last 1 on d3 → d1 and d2 die, d3 survives (healed), Warwick takes 10 and dies; P2 keeps bf1", async () => {
    const game = await board().build();
    await toAssignment(game);
    await game.p1.distribute({ d1: 2, d2: 2, d3: 1 });
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.state("d3")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("d4")).toBe("battlefield-bf1");
    expect(game.zoneOf("d5")).toBe("battlefield-bf1");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance A — pre-damage BEFORE the move: Flurry of Blades first (every Hound at 1 damage), then Warwick attacks and his trigger kills all five; no defenders remain → he conquers", async () => {
    const game = await board().build();
    await game.p1.cast("flurry");
    await game.settle();
    expect(PACK.every((id) => game.state(id).damage === 1)).toBe(true);
    await game.p1.move("ww", "bf1");
    await game.settle();
    expect(PACK.every((id) => game.zoneOf(id) === "trash")).toBe(true);
    expect(game.state("ww")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("nuance B — pre-damage AFTER the move but before the trigger resolves: with Warwick's 'when I attack' on the chain P1 (priority) casts Flurry; LIFO: Flurry resolves first, then the trigger kills every (now damaged) Hound", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "flurry")).toBe(true);
    await game.p1.cast("flurry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "flurry"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flurry resolves: 1 to every unit at a battlefield (Warwick included)
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(PACK.every((id) => game.state(id).damage === 1)).toBe(true);
    expect(game.state("ww").damage).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick's trigger: kill all damaged enemy units here
    expect(PACK.every((id) => game.zoneOf(id) === "trash")).toBe(true);
    expect(game.zoneOf("ww")).toBe("battlefield-bf1"); // "enemy" units only
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
