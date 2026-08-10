/**
 * Ruling 25ca09db4c955be5 — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · Hidden
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *      original location."
 *   × Fight or Flight (OGN-168 → ogn-168-298) — cited as another ability-move ("still useful: an Action, works on
 *     exhausted units").
 *
 * Q: If Tideturner's ability moves another unit, does that unit get exhausted?
 * A: No. Exhausting is the COST of the Standard Move action; a move performed by a card ability is not a Standard
 *    Move and exhausts nothing. A ready unit swapped from a battlefield to base can then still Standard-Move elsewhere.
 * Rules: 446 (Move), 141/619 (Standard Move: exhaust as cost), ability moves ignore standard-move restrictions.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

/** P1's turn. P1 controls bf1 with a READY 3-Might Scout on it; bf2 is P2's and empty. Tideturner in hand with exactly [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .hand(P1, TIDETURNER, "tide");
}

/** Play Tideturner to base, accept its "you may", choose the Scout; drain to the open main phase. */
async function playTideturnerSwappingScout(game: Game): Promise<void> {
  await game.p1.play("tide", { to: "base" });
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d).toMatchObject({ seat: P1, source: { cardId: "tide" } });
      await game.p1.yes();
    } else if (d.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toContain("scout");
      await game.p1.pick("scout");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 25ca09db4c955be5 — a unit moved by Tideturner's ability is not exhausted (not a Standard Move)", () => {
  test("Tideturner (played to base) swaps with the ready Scout at bf1: Tideturner → bf1, Scout → base, and the Scout stays READY", async () => {
    const game = await board().build();
    expect(game.state("scout").isReady).toBe(true);
    await playTideturnerSwappingScout(game);
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").isReady).toBe(true);
    expect(game.state("scout").isExhausted).toBe(false);
    // Neither relocation was a Standard Move.
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the ready Scout, now in base, can immediately take a Standard Move to another battlefield — and THAT exhausts it (the exhaust is the standard move's cost)", async () => {
    const game = await board().build();
    await playTideturnerSwappingScout(game);
    const toBf2 = game.p1.legal().find((o) => o.key === "standardMove:to:bf2");
    const movable = (toBf2?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat();
    expect(movable).toContain("scout");
    await game.p1.move("scout", "bf2");
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1);
  });

  test("it works on an EXHAUSTED unit too (ability moves have no exhaust cost to pay): an exhausted Scout is still swapped to base and stays exhausted — nothing more", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout", { exhausted: true })
      .hand(P1, TIDETURNER, "tide")
      .build();
    await playTideturnerSwappingScout(game);
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").isExhausted).toBe(true);
  });
});
