/**
 * Ruling b28fd78d754b82cc — Caitlyn, Patrolling (OGN-068 → ogn-068-298) · Champion Unit · Calm · 3 · 3 Might
 *   "I must be assigned combat damage last. [Exhaust]: Deal damage equal to my Might to a unit at a battlefield…"
 *   × Lecturing Yordle (OGN-087 → ogn-087-298) · Unit · Mind · 3 · 2 Might · "[Tank] … When you play me, draw 1."
 *
 * Q: When Caitlyn is given [Tank] (e.g. by a "give a unit [Tank] this turn" effect), is she assigned combat
 *    damage first or last, and who decides? And what is the order when she stands beside a Tank unit?
 * A: The assigning opponent (the attacker here) chooses: Caitlyn-with-Tank is assigned either FIRST (Tank)
 *    or LAST (her own text) — never in between.  [Beside a real Tank with no Tank of her own, the printed
 *    order applies: Tank first, plain units, Caitlyn last.]
 * Rules: 465.2.c.3 (lethal before moving on), 465.2.c.6 (obey all assignment requirements), 465.2.c.8
 *        (exclusionary requirements on one unit: the assigner picks which one to satisfy), 815 (Tank).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";
const LECTURING_YORDLE = "ogn-087-298";

/**
 * P2's turn. P1 holds bf1 with Caitlyn (3, given [Tank] this turn) and two plain 2-Might units A and B.
 * P2's Raider (4) attacks from base — 4 damage cannot kill everything, so the assignment ORDER is observable.
 */
function tankedCaitlynBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CAITLYN, "cait", { grantedKeywords: [{ duration: "turn", keyword: "Tank" }] })
    .unit(P1, "bf1", { might: 2, name: "Plain A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "Plain B" }, "b")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

async function toAssignment(build: () => ReturnType<typeof scenario>): Promise<Game> {
  const game = await build().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("Ruling b28fd78d754b82cc — Caitlyn given Tank: the attacker chooses 'first' or 'last'", () => {
  test("premise: Caitlyn has both her printed 'assigned last' text and a granted [Tank]", async () => {
    const game = await tankedCaitlynBoard().build();
    expect(game.state("cait").keywords).toContain("Tank");
    expect(game.state("cait").might).toBe(3);
  });

  test("the ATTACKER (P2) is the one asked to distribute the 4 combat damage over Caitlyn / A / B", async () => {
    const game = await toAssignment(tankedCaitlynBoard);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    const buckets = d?.kind === "distribute" ? d.buckets.map((b) => b.key).sort() : [];
    expect(buckets).toEqual(["a", "b", "cait"]);
  });

  test("option 1 — treat her as Tank: Caitlyn FIRST (3 lethal to her, the last 1 to A) is a legal assignment; Caitlyn dies, A and B live", async () => {
    const game = await toAssignment(tankedCaitlynBoard);
    await game.p2.distribute({ a: 1, cait: 3 });
    await game.settle();
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // took 3 + 2 + 2 = 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("option 2 — honour 'assigned last': A and B lethal FIRST (2 + 2), nothing left for Caitlyn is also legal; A and B die, Caitlyn lives", async () => {
    const game = await toAssignment(tankedCaitlynBoard);
    await game.p2.distribute({ a: 2, b: 2 });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("but NOT in between: A lethal, then a partial 2 on Caitlyn with B untouched satisfies neither requirement and is rejected (465.2.c.8)", async () => {
    const game = await toAssignment(tankedCaitlynBoard);
    const r = await game.p2.try((p) => p.distribute({ a: 2, cait: 2 }));
    expect(r.ok).toBe(false);
    // Still P2's assignment to make.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  });

  test("second question — Caitlyn (no Tank) beside Lecturing Yordle ([Tank]) and a plain unit: the order is forced Yordle → plain → Caitlyn (465.2.c.6); 4 damage kills Yordle and the plain unit, Caitlyn cannot be touched", async () => {
    const board = () =>
      scenario()
        .active(P2)
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", CAITLYN, "cait")
        .unit(P1, "bf1", LECTURING_YORDLE, "yordle")
        .unit(P1, "bf1", { might: 2, name: "Plain A" }, "a")
        .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
    const game = await toAssignment(board);
    // Only ONE legal line exists (Yordle 2, then A 2, nothing reaches Caitlyn), so the engine has no
    // choice to offer P2 — the assignment is forced and combat resolves straight through.
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.seat).toBe(P2);
      expect((await game.p2.try((p) => p.distribute({ cait: 2, yordle: 2 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ a: 2, cait: 2 }))).ok).toBe(false);
      await game.p2.distribute({ a: 2, yordle: 2 });
    }
    await game.settle();
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash"); // 3 + 2 + 2 = 7 ≥ 4
    expect(game.violations()).toEqual([]);
  });
});
