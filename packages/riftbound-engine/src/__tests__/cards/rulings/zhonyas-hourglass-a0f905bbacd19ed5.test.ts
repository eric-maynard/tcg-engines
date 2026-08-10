/**
 * Ruling a0f905bbacd19ed5 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: When assigning combat damage to two enemy units, may I pile ALL of it on one and deliberately leave the other
 *    alive (e.g. to force the opponent's Zhonya's onto a specific unit)?
 * A: No. You cannot over-assign damage to a unit while other units still remain to be assigned: once a unit has
 *    lethal assigned you must move on to the next. Only the LAST unit in the assignment order may be overkilled.
 * Rules: 465.2.c.3 (lethal in full before the next unit), 465.2.c.4 (no more than lethal unless no units remain),
 *        372/373 (simultaneous deaths → the replacement's controller picks which one it applies to).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type Distribute = Extract<Decision, { kind: "distribute" }>;

/** P1's turn. P2 holds bf1 with A (3) and B (3) and has a face-up Zhonya's in base; P1 attacks with one unit. */
function board(attackerMight: number) {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Defender B" }, "b")
    .gear(P2, ZHONYAS, "zh")
    .unit(P1, "base", { might: attackerMight, name: "Attacker" }, "atk");
}

async function attackToDamageStep(attackerMight: number): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling a0f905bbacd19ed5 — combat damage can't be over-assigned to one unit while another remains unassigned", () => {
  test("5 damage vs two 3-Might defenders: P1 is asked to assign it; each bucket is 'lethal at 3' — {A:5, B:0} and {A:4, B:1} are both REJECTED (overkill with B still waiting)", async () => {
    const game = await attackToDamageStep(5);
    const d = game.decision() as Distribute;
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    expect(d.buckets.map((b) => [b.card, b.lethal]).sort()).toEqual([
      ["a", 3],
      ["b", 3],
    ]);
    const allOnA = await game.p1.try((p) => p.distribute({ a: 5, b: 0 }));
    expect(allOnA.ok).toBe(false);
    const fourOne = await game.p1.try((p) => p.distribute({ a: 4, b: 1 }));
    expect(fourOne.ok).toBe(false);
    const allOnB = await game.p1.try((p) => p.distribute({ a: 0, b: 5 }));
    expect(allOnB.ok).toBe(false);
    // Nothing was dealt; the same assignment is still being asked.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0);
  });

  test("the legal line is exactly-lethal on the first unit, remainder on the next ({A:3, B:2}): only A would die → Zhonya's saves A (healed, exhausted, recalled), B survives at bf1", async () => {
    const game = await attackToDamageStep(5);
    await game.p1.distribute({ a: 3, b: 2 });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 2 < 3, healed in the combat cleanup
    expect(game.zoneOf("atk")).toBe("trash"); // took 3 + 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("({A:2, B:3} — the other order — is equally legal: then B is the one that would die and gets saved)", async () => {
    const game = await attackToDamageStep(5);
    await game.p1.distribute({ a: 2, b: 3 });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
  });

  test("with 8 damage the excess can only land on the LAST unit: the sole legal assignment kills BOTH simultaneously, so P1 cannot steer the Hourglass — P2 (its controller) chooses which death it replaces", async () => {
    const game = await attackToDamageStep(8);
    // A single legal allocation (3 + 5 / 5 + 3 both kill both) needs no question; if one is asked, only lethal-for-both lines pass.
    if (game.decision()?.kind === "distribute") {
      const lopsided = await game.p1.try((p) => p.distribute({ a: 8, b: 0 }));
      expect(lopsided.ok).toBe(false);
      await game.p1.distribute({ a: 3, b: 5 });
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-assign", source: { cardId: "zh" } });
    expect((d as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card).sort()).toEqual(["a", "b"]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.pick("b");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1"); // 6 < 8
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
