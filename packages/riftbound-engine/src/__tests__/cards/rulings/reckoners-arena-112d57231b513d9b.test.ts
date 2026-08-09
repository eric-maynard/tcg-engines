/**
 * Ruling 112d57231b513d9b — Reckoner's Arena (OGN-286 → ogn-286-298) · Battlefield
 *     "When you hold here, activate the conquer effects of units here."
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) · Unit · Body · 5 Might
 *     "When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an enemy unit in a base."
 *
 * Q: If I hold Reckoner's Arena with Yone, Blademaster, will he deal damage?
 * A: No. The Arena bridges "hold" into the conquer effects of units there, but it does not bypass conditions
 *    written on those abilities. Yone requires the battlefield to have been UNCONTROLLED; a hold by definition
 *    happens at a battlefield you already control (464.2), so the condition fails and no damage is dealt.
 * Rules: 464.2 (hold = you controlled it), 383.2.a.1 (a trigger's condition must be met), FAQ 9922.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RECKONERS_ARENA = "ogn-286-298";
const YONE = "sfd-116-221";
const KAISA_SURVIVOR = "ogn-039-298"; // "When I conquer, draw 1." — an unconditional conquer effect, as control

/**
 * P2's turn is ending. "arena" = Reckoner's Arena (live text) controlled by P1 with Yone standing on it. P2 keeps two
 * 6-Might units in base (would-be victims of Yone's 5 damage; two so any target prompt is observable).
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
    .unit(P1, "arena", YONE, "yone")
    .unit(P2, "base", { might: 6, name: "Sitting Duck" }, "duck")
    .unit(P2, "base", { might: 6, name: "Other Duck" }, "duck2");
}

describe("Ruling 112d57231b513d9b — Reckoner's Arena does not waive Yone's 'was uncontrolled' condition on a hold", () => {
  test("premise: at the start of P1's turn P1 HOLDS the Arena (scores 1) and the Arena's 'when you hold here' trigger goes on the chain", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P1, triggered: true })]);
    await game.settle({ policy: "first" });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.arena?.controller).toBe(P1);
  });

  test("control: the Arena really does activate conquer effects on a hold — Kai'Sa, Survivor ('When I conquer, draw 1') there draws P1 an extra card", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
      .unit(P1, "arena", KAISA_SURVIVOR, "kaisa")
      .build();
    const hand = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + 1 + 1); // turn draw + Kai'Sa's conquer effect
    // …whereas on a plain battlefield the same hold draws only the turn card.
    const plain = await scenario().active(P2).battlefield("plain", { controller: P1 }).unit(P1, "plain", KAISA_SURVIVOR, "kaisa").build();
    const plainHand = plain.p1.hand().length;
    await plain.advanceTurn();
    expect(plain.p1.hand()).toHaveLength(plainHand + 1);
  });

  // Expected: Yone's conquer effect is "activated" by the Arena but its own condition — the battlefield WAS
  // uncontrolled — is false for a hold, so nothing happens: no target prompt, both Ducks undamaged.
  // Actual: the engine runs Yone's effect unconditionally, asks P1 for a target and deals 5.
  test("ruling 112d57231b513d9b — Yone deals no damage when the Arena is merely held; engine fires his effect anyway", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    // Walk the Beginning phase by hand: only priority passes may be needed — never a Yone target pick.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.source?.cardId === "yone" && d.kind === "pick").toBe(false);
      const r = await game.settle();
      if (r.reason === "unanswered") {
        break;
      }
    }
    expect(game.decision()?.source?.cardId).not.toBe("yone");
    expect(game.p1.points()).toBe(1); // the hold itself still scored
    expect(game.state("duck").damage).toBe(0);
    expect(game.state("duck2").damage).toBe(0);
    expect(game.zoneOf("duck")).toBe("base");
    expect(game.zoneOf("duck2")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast: when Yone actually CONQUERS an uncontrolled battlefield, his effect does fire — 5 damage to an enemy unit in a base", async () => {
    const game = await scenario()
      .battlefield("open", { controller: null })
      .unit(P1, "base", YONE, "yone")
      .unit(P2, "base", { might: 6, name: "Sitting Duck" }, "duck")
      .build();
    await game.p1.move("yone", "open");
    let stop = await game.settle();
    for (let i = 0; i < 4 && stop.reason !== "unanswered" && game.state("duck").damage === 0; i++) {
      stop = await game.settle();
    }
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      await game.p1.pick("duck");
      await game.settle();
    }
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("duck").damage).toBe(5);
  });
});
