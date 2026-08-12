/**
 * Ruling c30b0955050f197c — Chemtech Enforcer (OGN-003 → ogn-003-298) · Unit · [2] · 2 Might
 *   "[Assault 2] · When you play me, discard 1."
 *
 * Q: Can Chemtech Enforcer be played with no other cards in hand?
 * A: Yes. The unit enters the board first; the "when you play me" trigger only happens afterwards, so an empty
 *    hand is never a restriction on playing it — the discard simply finds nothing to discard.
 * Rules: 355 (playing = costs + the object entering), 383.3 (the play trigger is added after the play resolves),
 *        359.3.e.11 (follow the instruction as far as possible).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const CHEMTECH_ENFORCER = "ogn-003-298";

describe("Ruling c30b0955050f197c — Chemtech Enforcer is playable from an otherwise empty hand", () => {
  test("with the Enforcer as the ONLY card in hand the play is legal, it lands in base, and nothing is discarded", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CHEMTECH_ENFORCER, "enforcer").build();
    expect(game.p1.hand()).toEqual(["enforcer"]);
    expect(game.p1.can("play", "enforcer")).toBe(true);
    await game.p1.play("enforcer");
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("base"); // it entered the board…
    expect(game.p1.hand()).toEqual([]); // …and the trigger then had nothing to take
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — with a spare card in hand the same trigger does discard it, confirming the trigger fires after the unit is in play", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, CHEMTECH_ENFORCER, "enforcer")
      .hand(P1, { cardType: "unit", might: 1, name: "Spare" }, "spare")
      .build();
    await game.p1.play("enforcer");
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("base");
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
