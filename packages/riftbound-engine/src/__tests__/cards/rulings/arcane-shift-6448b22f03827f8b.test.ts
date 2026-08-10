/**
 * Ruling 6448b22f03827f8b — Arcane Shift (SFD-200 → sfd-200-221) · [Action] [3][rainbow] "Banish a friendly unit, then its owner
 *     plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *   × Void Seeker (OGN-024 → ogn-024-298) · [Action] [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: While ATTACKING a battlefield I don't control, my attacker gets Void Seekered; can I Arcane Shift it and replay it back
 *    onto that same battlefield?
 * A: No. The replayed unit is played to your base or a battlefield you CONTROL; the attacker does not control the battlefield
 *    being attacked. (Had you controlled it, it would be a legal destination.)
 * Rules: 340.2 (units are played to base / a battlefield you control), 181 (control), 359.2 (owner chooses where).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const VOID_SEEKER = "ogn-024-298";

/**
 * P1's turn. P2 holds bf1 with a 3-Might Guard; P1 already controls bf2 (Keeper). P1's 5-Might Bruiser is in base ready to
 * attack. P1: Arcane Shift + [3][rainbow]. P2: Void Seeker + [3][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, ARCANE_SHIFT, "shift")
    .hand(P2, VOID_SEEKER, "seeker");
}

type Pick = Extract<Decision, { kind: "pick" }>;

/** Bruiser attacks bf1; P1 passes Focus; P2 Void Seekers the Bruiser (4 damage) and it resolves; Focus returns to P1. */
async function attackedAndSeekered(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("bruiser", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("seeker", { targets: "bruiser" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.state("bruiser").damage).toBe(4);
  expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 casts Arcane Shift [bruiser, guard]; both pass; return the replay destination prompt. */
async function shiftBruiser(game: Game): Promise<Pick> {
  expect(game.p1.can("cast", "shift")).toBe(true);
  await game.p1.cast("shift", { targets: ["bruiser", "guard"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(game.zoneOf("bruiser")).toBe("banishment");
  return d as Pick;
}

describe("Ruling 6448b22f03827f8b — an attacker can't Arcane-Shift its unit back onto the battlefield it is attacking", () => {
  test("the attacker does not control bf1: the replay may go to base or P1's own bf2 — bf1 is not offered and is refused", async () => {
    const game = await attackedAndSeekered();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // attacking ≠ controlling
    const d = await shiftBruiser(game);
    const keys = d.options.map((o) => o.key).sort();
    expect(keys).toEqual(["base", "battlefield-bf2"]);
    expect(keys).not.toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.answer({ keys: ["battlefield-bf1"], kind: "pick" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bruiser")).toBe("banishment");
  });

  test("choosing base: the Bruiser comes back as a fresh (undamaged) unit in base, the Guard takes 3, Arcane Shift is banished — and the attack on bf1 fizzles with no P1 unit left there", async () => {
    const game = await attackedAndSeekered();
    await shiftBruiser(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.zoneOf("guard")).toBe("trash"); // 3 damage on a 3-Might unit
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // nothing of P1's stayed to conquer
    expect(game.violations()).toEqual([]);
  });

  test("contrast: when P1 CONTROLS bf1 (defending there), bf1 IS a legal replay destination", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("shift", { targets: ["bruiser", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = (d as Pick).options.map((o) => o.key);
    expect(keys).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
