/**
 * Ruling a07c6b97df7477e0 — Noxian Guillotine (OGN-254 → ogn-254-298) · Action [4][rainbow]
 *   "Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "[Hidden] If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *
 * Q: I Guillotine (no Legion) the opponent's 4-Might unit that has a hidden Zhonya's; then my 4-Might unit attacks it. Does
 *    their unit survive?
 * A: It dies. Combat damage is dealt simultaneously; in the Cleanup the lethal damage would kill it but Zhonya's replaces that
 *    one death (recall healed, Zhonya's killed); Guillotine's delayed trigger is finalized in that same Cleanup and then
 *    resolves and kills the unit — Zhonya's is single-use and already gone.
 * Rules: 322/323 (Cleanup: lethal damage kills; pending triggers become chain items), 371–373 (replacement effects, one
 *        event each), Guillotine's delayed triggered kill, 812 (Legion not met: first card of the turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_GUILLOTINE = "ogn-254-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";

/** Turn 3, P1's turn, nothing played yet. P2: 4-Might Victim at P2's bf1 with Zhonya's facedown there. P1: 4-Might Attacker, Guillotine + [4]+1. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .facedown(P2, "bf1", ZHONYAS_HOURGLASS, "zhonya")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "attacker")
    .hand(P1, NOXIAN_GUILLOTINE, "guillotine");
}

/** Guillotine (no Legion) on the Victim; Attacker moves in; P1 passes Focus; P2 reveals Zhonya's; combat resolves. */
async function playItOut(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("guillotine", { targets: "victim" });
  await game.settle();
  expect(game.zoneOf("guillotine")).toBe("trash");
  expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // no Legion: not killed now
  await game.p1.move("attacker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zhonya")).toBe(true);
  await game.p2.reveal("zhonya");
  expect(game.zoneOf("zhonya")).toBe("base"); // gear played from hidden for [0] lands in base, ready to replace a death
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling a07c6b97df7477e0 — Zhonya's saves the Guillotined unit from combat death only; Guillotine's trigger then kills it", () => {
  test("both 4-Might units trade: the Attacker dies, and Zhonya's Hourglass is consumed (killed) replacing the Victim's combat death", async () => {
    const game = await playItOut();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p2.trash()).toContain("zhonya");
    // The Victim did take combat damage this turn — the event Guillotine's delayed trigger keys off.
    expect((game.gameState.damageLog ?? []).some((r) => r.combat && r.target === "victim" && r.amount === 4)).toBe(true);
  });

  // Expected (ruling): after Zhonya's replaces the lethal-damage death (recall, heal, exhaust), Noxian Guillotine's "kill it the
  // next time it takes damage" trigger — finalized in the same Cleanup — resolves and kills the Victim in base; Zhonya's cannot
  // save it twice. Final: Victim in P2's trash.
  // Actual: the engine leaves the Victim alive in P2's base (healed, exhausted) — Guillotine's delayed kill never lands after the
  // Zhonya's replacement.
  test("ruling a07c6b97df7477e0 — engine lets the Zhonya'd unit survive Noxian Guillotine's delayed kill", async () => {
    const game = await playItOut();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.units("base")).toEqual([]);
  });

  test("control — no Guillotine: Zhonya's alone saves the Victim from the 4↔4 trade (recalled to base, healed, exhausted; Zhonya's killed)", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
      .facedown(P2, "bf1", ZHONYAS_HOURGLASS, "zhonya")
      .unit(P1, "base", { might: 4, name: "Attacker" }, "attacker")
      .build();
    await game.p1.move("attacker", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
