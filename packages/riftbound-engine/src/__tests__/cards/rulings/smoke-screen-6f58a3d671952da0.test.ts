/**
 * Ruling 6f58a3d671952da0 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] "Give a unit -4 [Might] this turn, to a
 *     minimum of 1 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Opponent Smoke Screens; I respond with Discipline. After Discipline resolves, can I still Defy the Smoke Screen?
 * A: Yes. After Discipline resolves, every player must pass priority again before Smoke Screen resolves — in that new round
 *    of priority you may play Defy and counter it.
 * Rules: 336–338 (after each resolution priority is given again; an item resolves only when all pass in succession), 425.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

/**
 * P1's (the opponent's) turn. P2's 5-Might Champion sits at P2's bf1. P1: Smoke Screen + [2][mind]. P2: Discipline + Defy in
 * hand with [3][calm] (2 for Discipline, 1+calm for Defy) and a known deck top.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Champion" }, "champ")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .deck(P2, ["ogn-175-298"], ["drawn"]);
}

/** Smoke Screen on the Champion → P2 answers with Discipline on it → both pass once → Discipline (top) resolves. */
async function disciplineResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("smoke", { targets: "champ" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("disc", { targets: "champ" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["smoke", "disc"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Discipline resolves
  expect(game.zoneOf("disc")).toBe("trash");
  expect(game.state("champ").might).toBe(7); // 5 + 2
  expect(game.p2.hand()).toContain("drawn");
  return game;
}

describe("Ruling 6f58a3d671952da0 — after Discipline resolves there is a fresh priority round to Defy the Smoke Screen", () => {
  test("Smoke Screen does NOT resolve right behind Discipline: it is still alone on the chain and priority is handed out again", async () => {
    const game = await disciplineResolved();
    expect(game.chain().map((c) => c.cardId)).toEqual(["smoke"]);
    expect(game.zoneOf("smoke")).toBe("chain");
    expect(game.state("champ").might).toBe(7); // no -4 yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("in that round P2 gets priority (after P1 if P1 is first) and Defy is legal on Smoke Screen ([2] + one power ≤ [4]/[rainbow])", async () => {
    const game = await disciplineResolved();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["smoke"]); // one pass did not resolve it
    expect(game.p2.can("cast", "defy")).toBe(true);
    const offered = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["smoke"]);
  });

  test("Defy counters Smoke Screen: the Champion keeps its 7 (5 + Discipline's 2), Smoke Screen goes to the trash having done nothing", async () => {
    const game = await disciplineResolved();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("defy", { targets: "smoke" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["smoke", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("champ")).toMatchObject({ might: 7, mightModifier: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P2 lets the new round go by (both pass again), Smoke Screen resolves: 7 − 4 = 3", async () => {
    const game = await disciplineResolved();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("champ").might).toBe(3);
  });
});
