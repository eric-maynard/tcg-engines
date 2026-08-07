/**
 * Dropboarder — sfd-072-221 · Unit · Mind · 4 energy · 4 Might
 *
 *   When you play me, if you control two or more gear, ready me.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "When you play me, IF …" — the if-clause sits immediately after the condition, so it is part
 *     of the TRIGGER CONDITION (383.2.a.1): with < 2 gear the ability never goes on the chain at
 *     all; with ≥ 2 it is put on the chain and is NOT re-checked on resolution (Sona example) — a
 *     gear killed in response does not stop the ready.
 *  2. Threshold edges: 0 / 1 gear → stays exhausted; exactly 2 → ready; 3 → ready.
 *  3. "you control": the opponent's gear never count, however many they have.
 *  4. Gear tokens (Gold) are gear; a unit is not gear.
 *  5. Units enter exhausted (play rule); the payoff of readying is acting the same turn — play to
 *     base, ready, then march onto an open battlefield and conquer it.
 *  6. Played directly to a controlled battlefield it readies there just the same.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-072-221";
const ORB = "ogn-090-298"; // Orb of Regret — 1-cost Mind gear
const CASK = "sfd-063-221"; // Chemtech Cask — 1-cost Mind gear
const GOLD = "sfd-t03"; // Gold gear token
const WRENCH = { cardType: "gear", domain: "mind", energyCost: 1, name: "Wrench" }; // vanilla inline gear
/** Brittle Steel–style (ven-003-166) fast gear removal: "[Reaction] Kill a gear." */
const SHATTER = {
  abilities: [{ effect: { target: { type: "gear" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Shatter",
  rulesText: "[Reaction] Kill a gear.",
  timing: "reaction",
};

function withGear(mine: number, theirs = 0) {
  const b = scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "drop");
  for (let i = 0; i < mine; i++) {
    b.gear(P1, WRENCH, `g${i}`);
  }
  for (let i = 0; i < theirs; i++) {
    b.gear(P2, WRENCH, `t${i}`);
  }
  return b;
}

describe("Dropboarder (sfd-072-221)", () => {
  test("costs 4 energy; a 4-Might unit; with two gear the play trigger goes on the chain and readies it in the base", async () => {
    const game = await withGear(0).gear(P1, ORB, "orb").gear(P1, CASK, "cask").build();
    await game.p1.play("drop");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("drop")).toBe("base");
    expect(game.state("drop").isExhausted).toBe(true); // enters exhausted; the trigger is still pending
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drop", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("drop")).toMatchObject({ isReady: true, might: 4 });
    expect(game.violations()).toEqual([]);
    const short = await withGear(2).resources(P1, { energy: 3, power: { mind: 2 } }).build();
    expect(short.p1.can("play", "drop")).toBe(false);
  });

  test("exactly one gear: the condition is part of the trigger (383.2.a.1) — nothing goes on the chain and it stays exhausted", async () => {
    const game = await withGear(1).build();
    await game.p1.play("drop");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("drop").isExhausted).toBe(true);
  });

  test("zero gear: stays exhausted", async () => {
    const game = await withGear(0).build();
    await game.p1.play("drop");
    await game.settle();
    expect(game.state("drop").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
  });

  test("'you control': one of yours plus three of the opponent's is still one — stays exhausted", async () => {
    const game = await withGear(1, 3).build();
    await game.p1.play("drop");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("drop").isExhausted).toBe(true);
  });

  test("three gear (more than two) readies it too", async () => {
    const game = await withGear(3).build();
    await game.p1.play("drop");
    await game.settle();
    expect(game.state("drop").isReady).toBe(true);
  });

  test("a Gold gear TOKEN counts as gear; another unit does not", async () => {
    const tokens = await withGear(0).gear(P1, GOLD, "gold1").gear(P1, GOLD, "gold2").build();
    await tokens.p1.play("drop");
    await tokens.settle();
    expect(tokens.state("drop").isReady).toBe(true);
    const units = await withGear(1).unit(P1, "base", { might: 2 }, "buddy").unit(P1, "base", { might: 2 }, "pal").build();
    await units.p1.play("drop");
    await units.settle();
    expect(units.state("drop").isExhausted).toBe(true);
  });

  test("not re-checked on resolution: the opponent kills a gear in response (down to one) and Dropboarder still readies", async () => {
    const game = await withGear(2).resources(P2, { energy: 1 }).hand(P2, SHATTER, "shatter").build();
    await game.p1.play("drop");
    expect(game.chain().map((c) => c.name)).toEqual(["Dropboarder"]);
    await game.p1.passPriority();
    await game.p2.cast("shatter", { targets: "g0" });
    expect(game.chain().map((c) => c.name)).toEqual(["Dropboarder", "Test Shatter"]);
    await game.settle(); // Shatter resolves first (LIFO), then the ready
    expect(game.zoneOf("g0")).toBe("trash");
    expect(game.p1.gear()).toEqual(["g1"]);
    expect(game.state("drop").isReady).toBe(true);
  });

  test("played straight to a battlefield you control, it readies there", async () => {
    const game = await withGear(2).battlefield("bf1", { controller: P1 }).build();
    expect(game.p1.option("play", "drop")?.fields.find((f) => f.arg === "to")?.options).toEqual(["base", "battlefield-bf1"]);
    await game.p1.play("drop", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("drop")).toBe("battlefield-bf1");
    expect(game.state("drop").isReady).toBe(true);
  });

  test("the payoff: play → ready → move onto an open battlefield the same turn and conquer it for a point", async () => {
    const game = await withGear(2).battlefield("bf1", { controller: null }).build();
    expect(game.p1.points()).toBe(0);
    await game.p1.play("drop");
    await game.settle();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("drop", "bf1");
    await game.settle();
    expect(game.zoneOf("drop")).toBe("battlefield-bf1");
    expect(game.state("drop").isExhausted).toBe(true); // moving exhausts
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space for the payoff: with one gear it is exhausted and cannot move this turn", async () => {
    const game = await withGear(1).battlefield("bf1", { controller: null }).build();
    await game.p1.play("drop");
    await game.settle();
    const r = await game.p1.try((p) => p.move("drop", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("drop")).toBe("base");
  });

  test("parsed ability: a play-self trigger whose CONDITION is 'control ≥ 2 friendly gear' and whose effect readies self", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ energyCost: 4, might: 4 });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { target: { controller: "friendly", quantity: { atLeast: 2 }, type: "gear" }, type: "control" },
      effect: { target: "self", type: "ready" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });
});
