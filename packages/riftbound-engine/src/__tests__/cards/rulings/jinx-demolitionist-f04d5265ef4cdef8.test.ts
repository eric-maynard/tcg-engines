/**
 * Ruling f04d5265ef4cdef8 — Jinx, Demolitionist (OGN-030 → ogn-030-298) · 4 Might "[Accelerate] [Assault 2] When you play me, discard 2."
 *   × Sunken Temple (SFD-218 → sfd-218-221) Battlefield "When you conquer here with one or more [Mighty] units, you may pay [1] to
 *     draw 1. (A unit is Mighty while it has 5+ [Might].)"
 *
 * Q: Does Assault's bonus last through combat resolution — is a 4-Might Jinx attacking with Assault 2 still 6 (Mighty) when
 *    conquer triggers happen?
 * A: Yes (Unleashed update): Assault/Shield last until the combat showdown ENDS, not just through the damage step. Jinx wins at
 *    6, conquers, and is still 6 when "when you conquer" triggers are put on the chain and resolved — so she counts as Mighty
 *    for Sunken Temple. (Previously Assault dropped before conquer effects.)
 * Rules: 808 Assault ("while I'm an attacker" — through the end of the combat), 466–469 (combat resolution → conquer),
 *        383.4.c (conquer effects), 707 (Mighty = 5+ Might).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const JINX_DEMOLITIONIST = "ogn-030-298";
const SUNKEN_TEMPLE = "sfd-218-221";

/** P1's turn with exactly [1] (the Temple's payment). P2 holds a LIVE Sunken Temple with a 3-Might Guard; `attacker` ready in P1's base. */
function board(attacker: string | { might: number; name: string }) {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
    .unit(P2, "temple", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", attacker, "atk")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling f04d5265ef4cdef8 — Assault keeps Jinx Mighty through the conquer trigger", () => {
  test("Jinx attacks at 4 + Assault 2 = 6, kills the Guard and conquers; when Sunken Temple's conquer trigger is put to P1 she is STILL 6 — the 'Mighty' condition holds and P1 is offered 'pay [1] to draw 1'", async () => {
    const game = await board(JINX_DEMOLITIONIST).build();
    expect(game.state("atk").might).toBe(4);
    await game.p1.move("atk", "temple");
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 6 });
    const r = await game.settle(); // both pass Focus → combat → conquer → trigger finalized
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "temple" } });
    expect(game.state("atk").might).toBe(6); // Assault has not lapsed yet
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    // Once everything is over she is a plain 4 again.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("atk")).toMatchObject({ combatRole: null, might: 4, zone: "battlefield-temple" });
    expect(game.violations()).toEqual([]);
  });

  test("control: a vanilla 4-Might attacker (no Assault) conquering the same Temple is not Mighty — the trigger's condition fails, nothing is offered, no draw", async () => {
    const game = await board({ might: 4, name: "Vanilla" }).build();
    await game.p1.move("atk", "temple");
    const r = await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
  });
});
