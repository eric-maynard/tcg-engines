/**
 * Ruling 583d2a09a14e1b4b — Smoke Screen (OGN-093 → ogn-093-298) · Reaction · [2][mind] "Give a unit -4 [Might] this turn, to a
 *   minimum of 1 [Might]."
 *   × Vayne, Hunter (OGN-035 → ogn-035-298) · 2 Might · [Assault 3] …   × Ride the Wind (OGN-173 → ogn-173-298) · Action ·
 *     [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Smoke Screen hits an attacking Vayne (5 → 1). She survives because the defender is removed, then Ride the Wind sends her
 *    into another defended battlefield. What is her Might in the new combat?
 * A: 1. Smoke Screen fixes its reduction at −4 when it resolves and that −4 persists all turn: out of combat she is 2 − 4 = −2
 *    (treated as 0), attacking again she is 2 + 3 − 4 = 1. The modifier is never re-derived, and a ≤0-Might unit does not die
 *    unless it has damage.
 * Rules: 807 (Assault while attacking), "to a minimum of" reductions lock their amount on resolution, 140.x (Might below 0 is
 *        treated as 0), 437 (death needs lethal DAMAGE).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const VAYNE = "ogn-035-298";
const RIDE_THE_WIND = "ogn-173-298";
/** Inline [Action] "Deal 3 to a unit" — how P1 removes the first defender. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * P1's turn: Vayne ready in base, Bolt + Ride the Wind in hand with exactly [3] + chaos. P2 holds bf1 with Lookout (2) and bf2
 * with Sentinel (4), and has Smoke Screen with [2][mind].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VAYNE, "vayne")
    .unit(P2, "bf1", { might: 2, name: "Lookout" }, "lookout")
    .unit(P2, "bf2", { might: 4, name: "Sentinel" }, "sentinel")
    .hand(P1, BOLT, "bolt")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** Resolve the current chain by passing priority around. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.chain()).toEqual([]);
}

/** Vayne attacks bf1 (5); P1 passes Focus; P2 Smoke Screens her (→ 1). Returns with P1 to act in the showdown. */
async function smokedInCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("vayne").might).toBe(2);
  await game.p1.move("vayne", "bf1");
  expect(game.state("vayne")).toMatchObject({ combatRole: "attacker", might: 5 }); // 2 + Assault 3
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("cast", "smoke")).toBe(true);
  await game.p2.cast("smoke", { targets: "vayne" });
  await resolveChain(game);
  expect(game.zoneOf("smoke")).toBe("trash");
  return game;
}

describe("Ruling 583d2a09a14e1b4b — Smoke Screen's −4 is locked in; Vayne re-attacking elsewhere is 2 + 3 − 4 = 1", () => {
  test("Smoke Screen on the 5-Might attacking Vayne snapshots a −4 modifier: she is 1 in this combat", async () => {
    const game = await smokedInCombat();
    expect(game.state("vayne")).toMatchObject({ combatRole: "attacker", might: 1, mightModifier: -4 });
  });

  test("P1 removes the defender (Bolt kills the Lookout): Vayne survives, takes bf1, and — no longer an attacker — sits at 2 − 4, i.e. treated as 0, alive with no damage", async () => {
    const game = await smokedInCombat();
    // Focus comes back around to P1 inside the showdown.
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.p1.can("cast", "bolt")).toBe(true);
    await game.p1.cast("bolt", { targets: "lookout" });
    await resolveChain(game);
    expect(game.zoneOf("lookout")).toBe("trash");
    await game.settle(); // combat closes: no defender left
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no(); // Vayne's "When I conquer, you may pay [1] …" — keep her on the board
        await game.settle();
      }
    }
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("vayne").combatRole).not.toBe("attacker");
    expect(game.state("vayne").mightModifier).toBe(-4); // unchanged: not re-clamped to "minimum 1" now that Assault is off
    expect(Math.max(0, game.state("vayne").might)).toBe(0); // 2 − 4 → below zero, treated as 0
    expect(game.state("vayne").damage).toBe(0);
    expect(game.zoneOf("vayne")).toBe("battlefield-bf1"); // a 0-Might undamaged unit does not die
  });

  test("Ride the Wind then moves her to bf2 (defended by the Sentinel) and readies her: attacker again → 2 + 3 (Assault) − 4 (Smoke Screen) = 1 Might in the new combat", async () => {
    const game = await smokedInCombat();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    await game.p1.cast("bolt", { targets: "lookout" });
    await resolveChain(game);
    await game.settle();
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
        await game.settle();
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { answers: ["bf2"], targets: "vayne" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await resolveChain(game);
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const bf2 = d.options.find((o) => (o.zone ?? o.key).includes("bf2")) ?? d.options[0]!;
        await game.p1.answer({ keys: [bf2.key], kind: "pick" });
      }
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("vayne")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("vayne").combatRole).toBe("attacker");
    expect(game.state("vayne").mightModifier).toBe(-4);
    expect(game.state("vayne").might).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("the −4 lasts exactly this turn: next turn Vayne is back to her printed 2", async () => {
    const game = await smokedInCombat();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    await game.p1.cast("bolt", { targets: "lookout" });
    await resolveChain(game);
    await game.settle();
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
        await game.settle();
      }
    }
    await game.advanceTurn();
    expect(game.state("vayne")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
