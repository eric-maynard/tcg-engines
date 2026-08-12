/**
 * Ruling aa64d9c14f4e4c27 — Herald of the Arcane (OGN-265 → ogn-265-298) · Viktor's Legend
 *   "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) · Unit [4] · "[Legion] — I cost [2] less."
 *   × Dangerous Duo (OGN-016 → ogn-016-298) · Unit [3] · "[Legion] — When you play me, give a unit +2 [Might] this turn."
 *
 * Q: Does playing a Recruit token off Viktor's legend satisfy [Legion]?
 * A: No. [Legion] wants a CARD other than this one to have been played this turn; the Recruit is a token created by
 *    an effect, not a card, so it does not count. Playing any real card first does satisfy it.
 * Rules: 812.1.c ([Legion]), 186 (tokens are not cards).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HERALD_OF_THE_ARCANE = "ogn-265-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const DANGEROUS_DUO = "ogn-016-298";
const CLEAVE = "ogn-004-298";

/** P1's turn with 3 energy: 1 pays the Legend, leaving 2 — exactly Noxus Hopeful's [Legion]-discounted cost. */
function board() {
  return scenario()
    .legend(P1, HERALD_OF_THE_ARCANE, "herald")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .resources(P1, { energy: 3 });
}

describe("Ruling aa64d9c14f4e4c27 — Viktor's Recruit token does not turn [Legion] on", () => {
  test("the Legend's ability really does put a Recruit TOKEN on the board (and exhausts the Legend for [1])", async () => {
    const game = await board().build();
    await game.p1.activate("herald", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("herald").isExhausted).toBe(true);
    const recruits = game.p1.units("base").filter((u) => u !== "ally");
    expect(recruits).toHaveLength(1);
    const token = game.state(recruits[0]!);
    expect(token).toMatchObject({ baseMight: 1, cardType: "unit", isToken: true });
  });

  test("…and [Legion] is still off: Noxus Hopeful is not playable for [2] with only the token played", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "hopeful")).toBe(false); // printed [4], pool holds 3
    await game.p1.activate("herald", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(false); // still [4] — no card was played
    const attempt = await game.p1.try((p) => p.play("hopeful"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("hopeful")).toBe("hand");
  });

  test("control — playing a real CARD first does satisfy [Legion], and the same 2 energy buys Noxus Hopeful", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("a [Legion] TRIGGER is dead too — Dangerous Duo played after only the token gives nobody +2 [Might]", async () => {
    const game = await scenario()
      .legend(P1, HERALD_OF_THE_ARCANE, "herald")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, DANGEROUS_DUO, "duo")
      .resources(P1, { energy: 4 })
      .build();
    await game.p1.activate("herald", 0);
    await game.settle();
    await game.p1.play("duo");
    await game.settle();
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.state("ally")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("duo").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
