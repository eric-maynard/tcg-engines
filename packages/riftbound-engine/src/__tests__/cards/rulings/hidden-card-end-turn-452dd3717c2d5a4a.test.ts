/**
 * Ruling 452dd3717c2d5a4a — (no specific card) hidden cards when the opponent passes the turn.
 *   Exercised with Teemo, Strategist (OGN-121 → ogn-121-298), a [Hidden] unit, hidden at P1's battlefield,
 *   and Sona, Harmonious (OGN-073 → ogn-073-298) "At the end of your turn, … ready up to 4 friendly runes."
 *
 * Q: Can a player play a hidden card when their opponent wants to pass the turn?
 * A: No — passing the turn opens no window for Reactions. The nuance: declaring the end of the turn
 *    runs End-of-Turn TRIGGERS, and those DO go on the chain; while such a chain item is live you
 *    hold priority and may flip a hidden card in response to it.
 * Rules: 317.1 (Ending Step triggers), 336/358.3 (a Reaction needs a chain + priority), 811.1.c.3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const SONA = "ogn-073-298";

describe("Ruling 452dd3717c2d5a4a — passing the turn is not a window; an end-of-turn TRIGGER is", () => {
  test("with no end-of-turn trigger anywhere, P2's end of turn gives P1 no chance to flip the hidden card — the next legal moment is P1's own turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO, "hidden")
      .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
      .build();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("revealHidden", "hidden")).toBe(false); // nothing on the chain, no showdown
    const denied = await game.p1.try((p) => p.reveal("hidden"));
    expect(denied.ok).toBe(false);

    await game.p2.endTurn();
    // No chain was created and no decision was ever handed to P1 during P2's Ending Step:
    // the position that comes back is already P1's own turn.
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("hidden")).toBe("facedown-bf1"); // still hidden, never flipped
    expect(game.p1.can("revealHidden", "hidden")).toBe(true); // legal now, on P1's own turn
    expect(game.violations()).toEqual([]);
  });

  test("nuance: an end-of-turn trigger puts an item on the chain — P1 may flip the hidden card in response to it", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .facedown(P1, "bf1", TEEMO, "hidden")
      .unit(P2, "bf2", SONA, "sona")
      .runes(P2, "calm", 3)
      .build();
    await game.p2.endTurn();
    // Sona's Ending-Step trigger is on the chain and being finalized by its controller.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("ending");
    expect(game.chain().map((i) => i.cardId)).toEqual(["sona"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    await game.p2.decline(); // ready no runes
    // Now the chain item is live and P1 holds priority once P2 passes: the hidden card is playable.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("revealHidden", "hidden")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
