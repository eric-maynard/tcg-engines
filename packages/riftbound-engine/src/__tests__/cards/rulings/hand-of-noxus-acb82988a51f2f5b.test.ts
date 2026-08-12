/**
 * Ruling acb82988a51f2f5b — Hand of Noxus (OGN-253 → ogn-253-298) · Darius' Legend
 *   "[Exhaust]: [Reaction], [Legion] — [Add] [1]."
 *   × Cleave (OGN-004 → ogn-004-298) as the Main-Deck card played to switch [Legion] on.
 *
 * Q: With Darius / Hand of Noxus, do I just play one card and then tap the Legend for the [Legion] effect?
 * A: Yes. Play a Main-Deck card first; the Legend's ability is only usable once [Legion] is on. Then exhaust it for
 *    [Add] [1]. Adding a resource cannot be reacted to (it resolves at once, nothing goes on the Chain), and the
 *    energy is gone at end of turn.
 * Rules: 812.1.c ([Legion]), 429.1/429.2 ([Add] abilities do not use the Chain), 317.2 (pools empty in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const CLEAVE = "ogn-004-298";

/** P1's turn, 1 energy, one Main-Deck card (Cleave) in hand, a body for it to hit. */
function board() {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "noxus")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CLEAVE, "cleave")
    .resources(P1, { energy: 1 });
}

describe("Ruling acb82988a51f2f5b — Hand of Noxus: play a card first, THEN exhaust for [Add] [1]", () => {
  test("before any card is played the ability is not on the menu — [Legion] is not satisfied", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "noxus")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
    const attempt = await game.p1.try((p) => p.activate("noxus", 0));
    expect(attempt.ok).toBe(false);
    expect(game.state("noxus")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.p1.energy()).toBe(1);
  });

  test("after one Main-Deck card the Legend may be exhausted and the energy lands immediately", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // Cleave spent it
    expect(game.p1.can("activate", "noxus")).toBe(true);
    await game.p1.activate("noxus", 0);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("noxus").isExhausted).toBe(true);
  });

  test("nobody can react to it: nothing is put on the Chain and priority never leaves P1's main phase", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    await game.p1.activate("noxus", 0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the energy does not carry over — the pool is empty on the next turn, and the exhausted Legend is not reusable", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.settle();
    await game.p1.activate("noxus", 0);
    expect(game.p1.can("activate", "noxus")).toBe(false); // already exhausted
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn();
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
