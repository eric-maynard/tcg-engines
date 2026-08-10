/**
 * Ruling 8c58fe8521a128de — Singularity (OGN-105 → ogn-105-298) · Spell · Mind · 6+[mind][mind] · Action
 *     "Deal 6 to each of up to two units."
 *   × Janna, Savior (SFD-053 → sfd-053-221) · Champion · [Reaction] "When you play me, heal your units here, then move up
 *     to one enemy unit from here to its base."
 *   (+ Fight or Flight ogn-168-298 / Retreat ogn-104-298 as the "move it" / "bounce it" responses.)
 *
 * Q: Can you save a unit targeted by Singularity by moving it to a different board zone?
 * A: No. Singularity says "a unit", not "a unit at a battlefield", so it tracks the target to base and still deals 6.
 *    Only leaving the board (hand, death) breaks the targeting. Janna, Savior can't save your own unit — she moves ENEMY
 *    units; her heal resolves before Singularity's damage, but if 6 is still lethal the unit dies.
 * Rules: 359.3.f (target legality re-checked on resolution against the printed requirement only), 124 (zone change →
 *        new object), 355.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const JANNA_SAVIOR = "sfd-053-221";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // [Hidden] [Action] Move a unit from a battlefield to its base.
const RETREAT = "ogn-104-298"; // [Reaction] Return a friendly unit to its owner's hand …

/** P1's turn with exactly 6+[mind][mind]; P2's X (4) sits at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "X" }, "x")
    .hand(P1, SINGULARITY, "sing");
}

async function singularityAtX(game: Game): Promise<void> {
  await game.p1.cast("sing", { targets: ["x"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", controller: P1, targets: ["x"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

async function passChain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 8c58fe8521a128de — moving Singularity's target to base does not save it", () => {
  test("P2 flips a hidden Fight or Flight in response and moves X home to base; Singularity still resolves on X there — 6 ≥ 4, X dies", async () => {
    const game = await board().facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof").build();
    await singularityAtX(game);
    await game.p2.reveal("fof", { answers: ["x"] });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("x");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves first (LIFO)
    expect(game.zoneOf("x")).toBe("base"); // moved to a different BOARD zone…
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["x"] })]); // …still Singularity's target
    await passChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — leaving the board DOES break it: P2 Retreats X to hand in response; Singularity resolves doing nothing to it", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, RETREAT, "retreat").build();
    await singularityAtX(game);
    await game.p2.cast("retreat", { targets: "x" });
    await passChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toContain("x");
    expect(game.zoneOf("sing")).toBe("trash");
  });

  test("Janna, Savior can't rescue P2's OWN unit: played as a Reaction to bf1, her 'move up to one ENEMY unit' offers only P1's Intruder (never X); she heals X first, but Singularity's 6 is still lethal to a 5-Might X", async () => {
    // X is a damaged 5 (2 damage on it) so the heal is observable and 6 is still ≥ 5.
    const real = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "X" }, "x", { damage: 2 })
      .unit(P1, "bf1", { might: 2, name: "Intruder" }, "intruder")
      .hand(P2, JANNA_SAVIOR, "janna")
      .hand(P1, SINGULARITY, "sing")
      .build();
    await singularityAtX(real);
    expect(real.p2.can("play", "janna")).toBe(true); // [Reaction] unit, playable in response
    await real.p2.play("janna", { to: "bf1" });
    const d = real.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, targeting: "up-to" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["intruder"]); // X is not an enemy unit to Janna
    await real.p2.decline(); // move nobody
    expect(real.chain().map((c) => c.cardId)).toEqual(["sing", "janna"]);
    await real.p2.passPriority();
    await real.p1.passPriority(); // Janna's trigger resolves first: heal
    expect(real.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await passChain(real);
    expect(real.chain()).toEqual([]);
    expect(real.zoneOf("x")).toBe("trash"); // 6 ≥ 5 even after the heal
    expect(real.zoneOf("janna")).toBe("battlefield-bf1");
    expect(real.violations()).toEqual([]);
  });
});
