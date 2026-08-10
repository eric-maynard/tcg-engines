/**
 * Ruling bd76df1ff86577fd — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · 2+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] 2 "Move up to 2 friendly units to base."   × Zhonya's Hourglass (ogn-077-298).
 *   (Retreat ogn-104-298 is cited as another way to remove the target; Flash covers that nuance.)
 *
 * Q: Opponent Hidden-Blades my unit; I respond by flipping MY hidden Hidden Blade on the same unit. Do I draw 2 twice?
 * A: No — only from the Blade that actually kills it (mine, resolving first). The opponent's Blade then finds no unit at a
 *    battlefield, cannot determine "its controller", and draws nobody anything. Same if the unit was moved away (Flash /
 *    Retreat). Exception: if the kill is REPLACED (Hourglass) the unit was still there on resolution, so its controller draws 2.
 * Rules: 340.1 (LIFO), 359.3.e.5–7 (target gone → instruction and its dependants skipped), 811 (Hidden → Reaction for [0]),
 *        369–373 (replacement keeps the event's referent).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn 3. P1 holds bf1 with a lone 3-Might Pawn and has its own Hidden Blade facedown there (hidden earlier); P1's deck is
 * d1..d5 so draws are countable. P2: Hidden Blade in hand + [2][order].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Pawn" }, "pawn")
    .facedown(P1, "bf1", HIDDEN_BLADE, "myBlade")
    .hand(P2, HIDDEN_BLADE, "oppBlade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
}

/** P2 casts its Hidden Blade at the Pawn and passes; stops with P1 holding priority. */
async function oppBladesPawn(game: Game): Promise<void> {
  await game.p2.cast("oppBlade", { targets: "pawn" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "oppBlade", controller: P2, targets: ["pawn"] })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling bd76df1ff86577fd — two Hidden Blades on one unit: only the one that kills it draws", () => {
  test("control: unanswered, the opponent's Hidden Blade kills the Pawn and ITS CONTROLLER (P1) draws 2", async () => {
    const game = await board().build();
    await game.p2.cast("oppBlade", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("P1 flips its own facedown Hidden Blade on the Pawn in response (for [0]): it sits above the opponent's and resolves first — Pawn dies, P1 draws d1+d2", async () => {
    const game = await board().build();
    await oppBladesPawn(game);
    expect(game.p1.can("reveal", "myBlade")).toBe(true);
    await game.p1.reveal("myBlade", { answers: ["pawn"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["oppBlade", "myBlade"]);
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "myBlade"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("myBlade")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["oppBlade"]);
  });

  test("the opponent's Hidden Blade then resolves against nothing: no kill, and NOBODY draws — P1 ends with exactly 2 cards (not 4), P2 with none", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await oppBladesPawn(game);
    await game.p1.reveal("myBlade", { answers: ["pawn"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("oppBlade")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d3", "d4", "d5"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } }); // paid, wasted
    expect(game.violations()).toEqual([]);
  });

  test("nuance — moved away instead (P1 Flashes the Pawn to base in response): the opponent's Blade finds no unit at a battlefield → Pawn lives, nobody draws", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, FLASH, "flash").build();
    const deck0 = game.p1.deck().length;
    await oppBladesPawn(game);
    await game.p1.cast("flash", { targets: ["pawn"] });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.zoneOf("oppBlade")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0);
  });

  test("exception — kill REPLACED by Zhonya's Hourglass: the Pawn was a unit at a battlefield when the Blade resolved, so P1 still draws 2 (Pawn recalled exhausted, Hourglass in trash)", async () => {
    const game = await board().gear(P1, ZHONYAS, "zh").build();
    await game.p2.cast("oppBlade", { targets: "pawn" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });
});
