/**
 * Ruling 348231d0d3eabd28 — En Garde (OGN-046 → ogn-046-298) · Reaction spell · Calm · [1]
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you
 *      control there."
 *   × Disintegrate (OGN-005 → ogn-005-298) · Action spell · Fury · [4]
 *     "Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1."
 *
 * Q: When can a +Might reaction like En Garde save a unit from Disintegrate's lethal damage?
 * A: Only while Disintegrate is still on the chain. Played in response, En Garde resolves first and the boosted
 *    unit survives the 3. Once Disintegrate resolves, the lethally-damaged unit dies in the immediate cleanup —
 *    there is no reaction window between resolution and death.
 * Rules: 355.5 (targets on play), 336–337 (LIFO), 322–323 (cleanup after a chain item resolves kills lethally
 *        damaged units), 386 ("do this:" reflexive trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const DISINTEGRATE = "ogn-005-298";

/** P1's turn with [4] and Disintegrate. P2: a lone 3-Might Duelist holding bf1, En Garde in hand with [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Duelist" }, "duelist")
    .hand(P1, DISINTEGRATE, "dis")
    .hand(P2, EN_GARDE, "eg");
}

async function disintegrateOnDuelist(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dis", { targets: "duelist" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dis", targets: ["duelist"] })]);
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 348231d0d3eabd28 — En Garde saves a unit from Disintegrate only if played before Disintegrate resolves", () => {
  test("Example 1 (correct): P2 responds with En Garde — it resolves first (+2: alone there → 5 Might), then Disintegrate's 3 is not lethal; Duelist lives and P1 draws nothing", async () => {
    const game = await disintegrateOnDuelist();
    expect(game.p2.can("cast", "eg")).toBe(true);
    await game.p2.cast("eg", { targets: "duelist" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis", "eg"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde resolves
    expect(game.zoneOf("eg")).toBe("trash");
    expect(game.state("duelist").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis"]);
    const hand0 = game.p1.hand().length;
    await game.settle(); // Disintegrate resolves against the boosted unit
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
    expect(game.state("duelist")).toMatchObject({ damage: 3, might: 5 });
    expect(game.p1.hand()).toHaveLength(hand0); // "if this kills it" — it did not
    expect(game.violations()).toEqual([]);
  });

  test("Example 2 (incorrect): P2 passes instead — the moment Disintegrate resolves the Duelist is already dead; P2 never gets a window in which the damaged Duelist is still on the board", async () => {
    const game = await disintegrateOnDuelist();
    const hand0 = game.p1.hand().length;
    await game.p2.passPriority(); // both passed → Disintegrate resolves, cleanup follows immediately
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("trash");
    // The very next window either player sees (here: the "do this: draw 1" reflexive trigger) already has the
    // Duelist in the trash — En Garde can no longer be aimed at it.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context === "main") {
        break;
      }
      expect(game.zoneOf("duelist")).toBe("trash");
      if (d.seat === P2) {
        expect(game.p2.can("cast", "eg")).toBe(false); // no friendly unit left to give +1
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // "if this kills it" — it did → draw 1
    expect(game.zoneOf("eg")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
