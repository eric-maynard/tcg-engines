/**
 * Ruling 641560d7171ccc28 — Void Seeker (OGN-024 → ogn-024-298) · Fury Action · [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Stupefy (OGN-095 → ogn-095-298) · Mind Reaction · [1] "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: A 5-Might unit takes 4 from Void Seeker and is then reduced by 1 Might with Stupefy. Does it die?
 * A: Yes. After Stupefy resolves the unit is 4 Might with 4 damage marked; the following Cleanup kills units whose damage
 *    meets their Might. Order of the two spells doesn't matter; Stupefy alone can never kill (floor of 1).
 * Rules: 142.4 (lethal damage = damage ≥ Might; there is no separate health), 319/323.5 (Cleanup kills lethally damaged
 *        units), Stupefy's "to a minimum of 1".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const STUPEFY = "ogn-095-298";

/** P1's turn with exactly [4][fury]. P2's 5-Might Brute and 1-Might Wisp at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 1, name: "Wisp" }, "wisp")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling 641560d7171ccc28 — 4 damage then -1 Might on a 5-Might unit is lethal at the next Cleanup", () => {
  test("Void Seeker: the Brute is 5 Might with 4 damage marked — alive (P1 drew 1)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("seeker", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("ruling: then Stupefy (-1) → 4 Might with 4 damage → the Cleanup after Stupefy resolves kills the Brute (owner's trash); P1 drew again", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "brute" });
    await game.settle();
    await game.p1.cast("stupefy", { targets: "brute" });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // still pending on the chain
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p2.trash()).toContain("brute");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.hand()).toHaveLength(2); // drew 1 + 1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the order doesn't matter: Stupefy first (5 → 4), then Void Seeker's 4 is lethal on the spot", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    await game.p1.cast("seeker", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("nuance — Stupefy can't kill on its own: on the 1-Might Wisp it floors at 1 Might, 0 damage, alive", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "wisp" });
    await game.settle();
    expect(game.state("wisp")).toMatchObject({ damage: 0, might: 1, zone: "battlefield-bf1" });
  });
});
