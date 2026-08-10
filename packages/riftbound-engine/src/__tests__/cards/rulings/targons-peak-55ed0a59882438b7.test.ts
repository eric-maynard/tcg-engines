/**
 * Ruling 55ed0a59882438b7 — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *   "When you conquer here, ready up to 2 runes at the end of this turn."
 *   × Sigil of the Storm (OGN-287 → ogn-287-298) — cited only as an example of a negative conquer effect.
 *
 * Q: Does Targon's Peak trigger when you HOLD it, or only when you conquer it?
 * A: Only on conquer. Hold and Conquer are distinct game actions; a "when you conquer here" ability never fires
 *    off a hold (otherwise negative conquer effects like Sigil of the Storm's would also fire on holds).
 * Rules: 441 (Conquer) vs 442 (Hold) are separate events; 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";

describe("Ruling 55ed0a59882438b7 — Targon's Peak readies runes on CONQUER only, never on HOLD", () => {
  test("conquer: P1 takes the empty Peak with 3 exhausted runes → the Peak's trigger fires; at end of turn P1 chooses up to 2 runes and they are READY during P2's turn", async () => {
    const game = await scenario()
      .battlefield("peak", { controller: null, def: TARGONS_PEAK, inert: false })
      .battlefield("bf2", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Climber" }, "climber")
      .build();
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.move("climber", "peak");
    await game.p1.passFocus();
    await game.p2.passFocus(); // non-combat showdown closes → conquer
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    await game.settle(); // sets up the delayed "at the end of this turn" ready
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // not yet — end of turn
    await game.p1.endTurn();
    // "up to 2 runes": P1 picks which.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const runes = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(runes).toHaveLength(3);
    await game.p1.pick(runes[0]!, runes[1]!);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("hold: P1 starts their turn holding the Peak → the hold point is scored but NO Peak trigger is created; runes P1 exhausts that turn are still exhausted during P2's turn (nothing readied 'at end of turn')", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("peak", { controller: P1, def: TARGONS_PEAK, inert: false })
      .battlefield("bf2", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .unit(P1, "peak", { might: 3, name: "Climber" }, "climber")
      .fillDecks({ main: 10, runes: 0 }) // no channeling noise: P1 has exactly these 3 runes
      .script(P1, [], { strict: true }) // a "choose runes to ready" prompt would throw
      .build();
    await game.p2.endTurn(); // → P1's Beginning Phase: hold
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // held
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3); // readied by P1's own Awaken, as usual
    await game.p1.tapRunes(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // a hold-fired Peak would have readied 2 here
  });
});
