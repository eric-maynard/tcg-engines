/**
 * Ruling bf29e6eddba863ae — Herald of the Arcane (OGN-265 → ogn-265-298) · Legend
 *   "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *
 * Q: Can you tap Legend: Viktor as a defensive action during a showdown at a battlefield you control?
 * A: No. The ability carries no [Action] tag, so it is an ordinary activated ability — usable only on your
 *    own turn in an Open State, never mid-showdown.
 * Rules: 381 / 416.3 (activated abilities need an Open State on your turn unless tagged),
 *        444.1 ([Action] is what allows showdown timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERALD = "ogn-265-298";

/** P2's turn. P1 controls bf1 with a defender and holds the Legend ready with [1] in pool. */
function underAttack() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .legend(P1, HERALD, "herald")
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .resources(P1, { energy: 1 });
}

describe("Ruling bf29e6eddba863ae — the Herald's ability has no Action timing, so it is not a defensive play", () => {
  test("during the showdown at P1's own battlefield the Legend ability is not offered to the defender", async () => {
    const game = await underAttack().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1); // P1 has focus as the defender…
    expect(game.p1.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p1.can("activate", "herald")).toBe(false); // …but this is not an action they may take
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
    const attempt = await game.p1.try((p) => p.activate("herald", 0));
    expect(attempt.ok).toBe(false);
    expect(game.state("herald").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(1);
  });

  test("control — on P1's own turn, in an Open State, the same ability is legal and makes the Recruit", async () => {
    const game = await scenario()
      .legend(P1, HERALD, "herald")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .resources(P1, { energy: 1 })
      .build();
    expect(game.p1.can("activate", "herald")).toBe(true);
    await game.p1.activate("herald", 0);
    await game.settle();
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    const recruits = game.p1.units().filter((id) => game.state(id).name === "Recruit");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0]!).might).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
