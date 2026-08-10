/**
 * Ruling 3816040673bef9ae — Fight or Flight (ogn-168-298) × Zhonya's Hourglass (ogn-077-298)
 *   Fight or Flight: "[Hidden] [Action] Move a unit from a battlefield to its base." (2)
 *   Zhonya's Hourglass: Gear, "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: When a unit with a hidden gear at its battlefield is returned to base, what happens to the hidden gear?
 * A: Its controller may flip (play) the hidden gear in response. Gear can't stay at a battlefield, so it is recalled to
 *    base at the next Cleanup; then the unit returns to base. Hidden cards at a battlefield you no longer control are
 *    trashed — but that doesn't bite if you flipped the gear before losing control.
 * Rules: 811 (Hidden: play later for [0] at Reaction speed), 518 / 319 (Cleanup recalls loose gear; removes hidden cards
 *        at battlefields you don't control), 454 (recall ≠ move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P2's turn 3. P1 controls bf1 with a lone Ally and a Zhonya's hidden there (hidden on an earlier turn). P2 holds Fight or Flight. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", { might: 2, name: "Other" }, "other")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

describe("Ruling 3816040673bef9ae — flip the hidden gear in response to your unit being sent home; it recalls to base instead of being trashed", () => {
  test("P2 Fight-or-Flights the Ally; with FoF on the chain P1 may reveal the hidden Zhonya's for 0 — the gear ends up in P1's base (recalled, not moved), then the Ally returns to base; nothing is trashed even though bf1 becomes uncontrolled", async () => {
    const game = await board().build();
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    await game.p2.cast("fof", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
    await game.p2.passPriority();
    // P1 has priority with FoF pending and the flip is on the menu.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    // The gear does not stay at the battlefield: it is (or will be at the next Cleanup) in P1's base — never in the trash.
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh"));
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // FoF has not resolved yet
    expect(game.chain().map((c) => c.cardId)).toContain("fof");

    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    expect(game.state("zh")).toMatchObject({ controller: P1, isHidden: false });
    // P1 no longer controls bf1 (its only unit left) — and yet the flipped gear survived.
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.trash()).not.toContain("zh");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 does NOT flip it, FoF empties bf1, P1 loses control, and the still-hidden Zhonya's at a battlefield P1 no longer controls is trashed", async () => {
    const game = await board().build();
    await game.p2.cast("fof", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zh")).toBe(true); // the window existed …
    await game.p1.passPriority(); // … but P1 lets FoF resolve
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
  });
});
