/**
 * Ruling 0dc48face0fcaf4f — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · [3][fury] · [Action]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Volibear, Imposing (ogn-158-298) · 10 Might · [Shield 3] [Tank]
 *
 * Q: Does a unit heal after a chain resolves — will Volibear heal between two Void Seekers?
 * A: No. Units heal only at the end of combat and at end of turn. The Cleanup after a chain item resolves handles
 *    deaths and starting showdowns, not healing — so damage from separate chains accumulates.
 * Rules: 322–323 (Cleanup: no heal step), 466.1.a (combat cleanup heals), 317.2 (end-of-turn heal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const VOLIBEAR_IMPOSING = "ogn-158-298";

/** P1's turn with two Void Seekers' worth of resources; P2's Volibear (10) holds bf1. */
function board() {
  return scenario()
    .turn(5)
    .resources(P1, { energy: 9, power: { fury: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VOLIBEAR_IMPOSING, "voli")
    .hand(P1, VOID_SEEKER, "vs1")
    .hand(P1, VOID_SEEKER, "vs2")
    .hand(P1, VOID_SEEKER, "vs3");
}

describe("Ruling 0dc48face0fcaf4f — no healing between chains: two Void Seekers stack 8 damage on Volibear", () => {
  test("first Void Seeker resolves as its own chain: Volibear has 4 damage marked, the chain is empty (Cleanup ran) and the damage is still there", async () => {
    const game = await board().build();
    await game.p1.cast("vs1", { targets: "voli" });
    await game.settle();
    expect(game.zoneOf("vs1")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("voli")).toMatchObject({ damage: 4, might: 10, zone: "battlefield-bf1" });
  });

  test("second Void Seeker on a NEW chain: no heal happened in between — Volibear now carries 4 + 4 = 8 (and P1 drew twice)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("vs1", { targets: "voli" });
    await game.settle();
    await game.p1.cast("vs2", { targets: "voli" });
    await game.settle();
    expect(game.state("voli")).toMatchObject({ damage: 8, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 2 + 2);
    expect(game.violations()).toEqual([]);
  });

  test("(so a third one is lethal: 12 ≥ 10 — accumulated damage kills)", async () => {
    const game = await board().build();
    for (const vs of ["vs1", "vs2", "vs3"]) {
      await game.p1.cast(vs, { targets: "voli" });
      await game.settle();
    }
    expect(game.zoneOf("voli")).toBe("trash");
  });

  test("healing does come at end of turn: after two Seekers (8 marked) the turn ends and Volibear is clean on P2's turn", async () => {
    const game = await board().build();
    await game.p1.cast("vs1", { targets: "voli" });
    await game.settle();
    await game.p1.cast("vs2", { targets: "voli" });
    await game.settle();
    expect(game.state("voli").damage).toBe(8);
    await game.advanceTurn();
    expect(game.state("voli")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.trace().expiration[0]?.healed).toContain("voli");
  });
});
