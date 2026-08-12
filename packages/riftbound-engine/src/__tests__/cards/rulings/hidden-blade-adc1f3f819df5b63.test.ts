/**
 * Ruling adc1f3f819df5b63 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · [2][order] · [Action] · [Hidden]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Resonating Strike (VEN-034 → ven-034-166) · [Reaction] [2][calm] · "Choose a battlefield you control and a unit
 *     you control at a different location. Move that unit there." as the in-response move.
 *
 * Q: A hidden Hidden Blade chooses a unit at one battlefield, and the unit moves to a different battlefield before it
 *    resolves. What happens?
 * A: It mistargets and does nothing — no kill, no cards drawn. A card played from face down gets an implicit "here",
 *    so the chosen unit must still be at THAT battlefield when the spell resolves, even though it never left the board.
 * Rules: 811.1.d.2 (a card played from face down is restricted to "here"), 355.10 (targets are locked at play),
 *        359.3.e.5 / 355.15 (an illegal target makes the instruction fizzle; it is never re-aimed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RESONATING_STRIKE = "ven-034-166";

/** P1's turn. P1 holds bf1 (Holder + Victim) and bf2; a Hidden Blade waits face down at bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P1, "bf2", { might: 4, name: "Holder2" }, "holder2")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, RESONATING_STRIKE, "rs")
    .resources(P1, { energy: 2, power: { calm: 1 } });
}

describe("Ruling adc1f3f819df5b63 — a hidden Hidden Blade whose victim walks to another battlefield does nothing", () => {
  test("played from face down it may only choose units at ITS battlefield — the implicit 'here'", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["holder", "victim"]);
    // holder2, a unit at bf2, is NOT offered even though the printed text says "a unit at a battlefield".
  });

  test("moving the chosen unit to bf2 in response leaves the locked target where it was written", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.p1.pick("victim");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
    await game.p1.cast("rs", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "rs"]);
    await game.acting().pass();
    await game.acting().pass(); // Resonating Strike resolves
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  });

  test("Hidden Blade then resolves for nothing: the unit lives and nobody draws", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.p1.pick("victim");
    await game.p1.cast("rs", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash"); // it did resolve
    expect(game.zoneOf("victim")).toBe("battlefield-bf2"); // …and killed nobody
    expect(game.p1.hand()).toEqual([]); // no "controller draws 2"
    expect(game.violations()).toEqual([]);
  });

  test("control — left at bf1 the very same Hidden Blade kills it and its controller draws 2", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.p1.pick("victim");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3); // Resonating Strike, still in hand, plus the 2 drawn
  });
});
