/**
 * Ruling 26a7f296c8fb728d — Pyke, Returned (UNL-145 → unl-145-219) · Unit · Chaos · 3 · [Hidden] [Backline] …
 *   × Block (OGN-057 → ogn-057-298) [Hidden][Action] "Give a unit [Shield 3] and [Tank] this turn."
 *
 * Q: Pyke has Backline (assigned combat damage last). Block gives him Tank (assigned first). Which applies?
 * A: They conflict, so the player ASSIGNING the combat damage (the opponent) chooses which one to honour: treat Pyke as
 *    Tank (damage him before the other defenders) or as Backline (after them) — one or the other, never neither.
 * Rules: 465.2.c (combat damage assignment; Tank first / Backline last), 460.2.c.7-style exclusionary conflicts →
 *        assigner picks.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE = "unl-145-219";
const BLOCK = "ogn-057-298";

type Distribute = Extract<Decision, { kind: "distribute" }>;

/** P2's turn. P1 holds bf1 with Pyke (3, Backline) + a plain 3-Might Guard; Block in hand (2). P2's 4-Might Raider in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PYKE, "pyke")
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BLOCK, "block");
}

/** Raider attacks; P2 passes Focus; P1 Blocks Pyke (Shield 3 + Tank); both pass Focus → P2 must assign 4 combat damage. */
async function toDamageAssignment(game: Game): Promise<Distribute> {
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("block", { targets: "pyke" });
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.state("pyke").keywords).toEqual(expect.arrayContaining(["Backline", "Tank", "Shield"]));
  expect(game.state("pyke").might).toBe(6); // 3 + Shield 3 as a defender
  while (game.decision()?.kind === "action") {
    await game.acting().passFocus();
  }
  const d = game.decision();
  expect(d?.kind).toBe("distribute");
  expect(d?.seat).toBe(P2); // the ATTACKER assigns — and therefore chooses
  return d as Distribute;
}

describe("Ruling 26a7f296c8fb728d — Pyke with both Backline and Tank: the damage assigner picks which applies", () => {
  test("after Block, Pyke has Backline AND Tank; the Raider's 4 damage is P2's to assign between Guard (lethal 3) and Pyke (lethal 6)", async () => {
    const game = await board().build();
    const d = await toDamageAssignment(game);
    expect(d.total).toBe(4);
    expect(d.buckets.map((b) => `${b.key}:${b.lethal}`).sort()).toEqual(["guard:3", "pyke:6"]);
  });

  test("P2 may treat Pyke as BACKLINE: Guard takes lethal first (3), the remaining 1 goes to Pyke → Guard dies, Pyke survives", async () => {
    const game = await board().build();
    await toDamageAssignment(game);
    await game.p2.distribute({ guard: 3, pyke: 1 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 6 + 3 back at it
    expect(game.violations()).toEqual([]);
  });

  test("P2 may instead treat Pyke as TANK: all 4 must go to Pyke first (not lethal vs 6) → nobody on P1's side dies", async () => {
    const game = await board().build();
    await toDamageAssignment(game);
    await game.p2.distribute({ guard: 0, pyke: 4 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("but not NEITHER: an assignment honouring neither keyword (2 to each — Guard not lethal before Pyke, Pyke not first) is rejected", async () => {
    const game = await board().build();
    await toDamageAssignment(game);
    const r = await game.p2.try((p) => p.distribute({ guard: 2, pyke: 2 }));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 }); // still waiting for a legal line
  });
});
