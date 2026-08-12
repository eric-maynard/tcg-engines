/**
 * Ruling 594c1da6bc510e86 — Firestorm (OGS-002 → ogs-002-024) · Spell · Fury · [6][fury]
 *   "Deal 3 to all enemy units at a battlefield."
 *
 * Q: Does damage reduce a unit's Might, and what happens when units with damage on them fight each other?
 * A: Damage does NOT reduce Might. Each unit deals combat damage equal to its full Might however much damage it already
 *    carries; a unit dies when the total damage on it reaches its Might. (In the asked scenario everything dies.)
 *    Reconstructed here with: Firestorm on P2's Big (8) + Small (5), then A (7) + B (6) attack — the pre-damaged
 *    defenders still deal 8 + 5 = 13 = exactly A + B, while the attackers only need 5 + 2 more to finish them: all four die.
 * Rules: 437 (damage is marked, Might unchanged), 465.2 (combat damage = Might, dealt simultaneously), 320/437.4 (lethal
 *        = damage ≥ Might), 466.5.b (nobody left → uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIRESTORM = "ogs-002-024";

/** P1's turn: Firestorm + [6][fury]; A (7) and B (6) in base. P2 holds bf1 with Big (8) and Small (5). */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 8, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 5, name: "Small" }, "small")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 7, name: "Unit A" }, "a")
    .unit(P1, "base", { might: 6, name: "Unit B" }, "b")
    .hand(P1, FIRESTORM, "storm");
}

async function stormThenAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("storm", { targets: "bf1" });
  await game.settle();
  await game.p1.move(["a", "b"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  // Combat damage assignment: each side splits its full Might. Answer any assignment prompt precisely.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "distribute") {
      break;
    }
    if (d.seat === P1) {
      expect(d.total).toBe(13); // 7 + 6
      // 465.2.c.3 / 465.2.c.4 — lethal is 5 more on Big and 2 more on Small; the 6 left over may
      // only pile onto ONE of them (the last one served), never be spread across both.
      await game.p1.distribute({ big: 11, small: 2 });
    } else {
      expect(d.total).toBe(13); // 8 + 5 — the damaged defenders still deal their FULL Might
      await game.p2.distribute({ a: 7, b: 6 });
    }
  }
  await game.settle();
  return game;
}

describe("Ruling 594c1da6bc510e86 — damage never lowers Might; pre-damaged units hit at full strength in combat", () => {
  test("Firestorm marks 3 damage on each enemy unit at bf1 and leaves their Might untouched (Big 8, Small 5)", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("big")).toMatchObject({ baseMight: 8, damage: 3, might: 8 });
    expect(game.state("small")).toMatchObject({ baseMight: 5, damage: 3, might: 5 });
    expect(game.state("a").damage).toBe(0);
  });

  test("A (7) + B (6) then attack: the defenders, despite 3 damage each, deal 8 + 5 = 13 — exactly enough to kill both attackers", async () => {
    const game = await stormThenAttack();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("…while the attackers' 13 only had to top up the existing damage (Big needs 5 more, Small 2 more): both defenders die too — everything dies", async () => {
    const game = await stormThenAttack();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect([...game.p1.units("bf1"), ...game.p2.units("bf1")]).toEqual([]);
  });

  test("aftermath: with no unit left on either side nobody wins the combat — bf1 becomes uncontrolled and P1 scores nothing", async () => {
    const game = await stormThenAttack();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: undamaged defenders Bigger (9) + Small (5) deal 14 and kill both attackers, but the attackers' 13 cannot finish a 9 — Bigger survives (healed) and P2 holds; damage on a unit is what makes it easier to kill, not weaker", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 9, name: "Bigger" }, "bigger")
      .unit(P2, "bf1", { might: 5, name: "Small" }, "small")
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 7, name: "Unit A" }, "a")
      .unit(P1, "base", { might: 6, name: "Unit B" }, "b")
      .build();
    await game.p1.move(["a", "b"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "distribute") {
        break;
      }
      await game.seat(d.seat).distribute(d.seat === P1 ? { bigger: 8, small: 5 } : { a: 7, b: 7 });
    }
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("bigger")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 8 < 9, then healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
