/**
 * Back-Alley Bar — ogn-277-298 · Battlefield
 *
 *   When a unit moves from here, give it +1 [Might] this turn.
 *
 * Rules: 446.1 (any change of board position is a Move unless it is a Recall), 144.4.b (standard move
 * battlefield → base), 810 / 144.4.c (Ganking: battlefield → battlefield), 449 (effect moves are Moves
 * too), 456.1 (Recalls are NOT Moves and never trigger move abilities), 190.6.a (the battlefield's
 * controller controls the trigger, but the bonus lands on whichever unit moved), 359.3.f.3 ("it" = the
 * mover, noted when the trigger condition is met).
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. "a unit" is ANY unit — the opponent's unit retreating from the Bar on their turn is pumped too.
 *   2. Every kind of Move counts: the standard retreat to base, a Ganking hop to another battlefield
 *      (where the +1 must be live before combat damage — a 2v2 trade becomes a clean win), and an
 *      effect move (The Syren). A multi-unit standard move pumps each mover.
 *   3. Recalls are not moves: an attacker bounced home from the Bar after a combat where both sides
 *      survive gets nothing (456.1). Moving TO the Bar, or leaving some OTHER battlefield, is silent.
 *   4. "this turn" — the bonus is a might modifier that is gone after the turn ends.
 *   Partner used: The Syren (ogn-184-298, "[1], [Exhaust]: Move a friendly unit at a battlefield to its base").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-277-298";
const THE_SYREN = "ogn-184-298";

/** P1's turn; P1 controls the Bar (live text) with a 2-Might Walker on it; P2 holds bf2 with a 2-Might defender. */
function board() {
  return scenario()
    .battlefield("bar", { controller: P1, def: CARD, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bar", { might: 2, name: "Walker" }, "walker")
    .unit(P1, "bar", { keywords: ["Ganking"], might: 2, name: "Ganker" }, "ganker")
    .unit(P2, "bf2", { might: 2, name: "Defender" }, "def");
}

describe("Back-Alley Bar (ogn-277-298)", () => {
  test("registry payload: one triggered ability — any unit moving from here → +1 Might to the mover, this turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Back-Alley Bar" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: { type: "trigger-source" }, type: "modify-might" },
      trigger: { event: "move-from-here", on: "any" },
      type: "triggered",
    });
  });

  test("standard move Bar → base puts the Bar's trigger on the chain and the mover ends at 3 Might; the bonus expires next turn (144.4.b, 446.1)", async () => {
    // Expected: after the retreat a triggered item sourced from "bar" sits on the chain; once it resolves
    // Walker is 3 (base 2); after the turn passes it is 2 again. Actual: `move-from-here` never matches
    // the engine's move event — no chain item, Walker stays 2.
    const game = await board().build();
    await game.p1.move("walker", "base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bar", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("walker")).toBe("base");
    expect(game.state("walker")).toMatchObject({ baseMight: 2, might: 3 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("walker").might).toBe(2);
  });

  test("a two-unit standard move off the Bar pumps EACH mover (+1 / +1) (144.3)", async () => {
    // Expected: both Walker and Ganker read 3 in base. Actual: both stay 2 (trigger never fires).
    const game = await board().build();
    await game.p1.move(["walker", "ganker"], "base");
    await game.settle();
    expect(game.p1.units("base").sort()).toEqual(["ganker", "walker"]);
    expect(game.state("walker").might).toBe(3);
    expect(game.state("ganker").might).toBe(3);
  });

  test("Ganking Bar → bf2 is a move from here — the 2-Might Ganker fights as 3, kills the 2-Might defender, survives and conquers (810, 446.1)", async () => {
    // Ganker (3 after the Bar's +1) takes 2 and lives, Defender takes 3 and dies, P1 conquers bf2 for 1 point.
    const game = await board().build();
    await game.p1.gank("ganker", "bf2");
    // rule 401.1: the Bar's move trigger goes on the chain as a Pending Item, which is a Closed State, and
    // rule 323.13 only begins a Staged Combat from a Neutral Open State — so Attacker/Defender are NOT yet
    // designated (464.2) here; the Combat stays Staged until the chain empties. Asserting combatRole
    // immediately after the gank over-reaches: the roles land during settle, after the +1 has resolved.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bar", triggered: true })]);
    expect(game.state("ganker").combatRole).toBeNull();
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("ganker")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'a unit' is any unit — P2's own unit retreating from a P2-held Bar on P2's turn gets +1 (190.6.a)", async () => {
    // Expected: Raider is 4 in P2's base after the retreat resolves. Actual: stays 3.
    const game = await scenario()
      .active(P2)
      .battlefield("bar", { controller: P2, def: CARD, inert: false })
      .unit(P2, "bar", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "base");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ baseMight: 3, might: 4 });
  });

  test("an EFFECT move counts — The Syren pulling Walker from the Bar to base gives it +1 (449, 446.1)", async () => {
    // Expected: Syren resolves (1 energy paid, Syren exhausted), Walker lands in base, Bar triggers → Walker 3.
    // Actual: Walker arrives at 2 and no trigger is queued.
    const game = await board().resources(P1, { energy: 1 }).gear(P1, THE_SYREN, "syren").build();
    await game.p1.activate("syren", 0, { answers: ["walker"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("syren").isExhausted).toBe(true);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("walker");
      await game.settle();
    }
    expect(game.zoneOf("walker")).toBe("base");
    expect(game.state("walker").might).toBe(3);
  });

  test("negative: moving TO the Bar is not moving from it — a base unit walking onto the Bar stays at printed Might", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Newcomer" }, "newcomer").build();
    await game.p1.move("newcomer", "bar");
    await game.settle();
    expect(game.locationOf("newcomer")).toBe("bar");
    expect(game.state("newcomer").might).toBe(2);
    expect(game.state("newcomer").mightModifier).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("negative: leaving some OTHER battlefield while you control the Bar gives nothing", async () => {
    const game = await scenario()
      .battlefield("bar", { controller: P1, def: CARD, inert: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bar", { might: 2, name: "Barfly" }, "barfly")
      .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "base");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").might).toBe(2);
    expect(game.state("barfly").might).toBe(2);
  });

  test("negative: a Recall is not a Move — P2's attacker bounced home from the Bar after a no-death combat keeps its printed Might (456.1)", async () => {
    // Stunned defender deals no combat damage, so both survive and the attacker is recalled (not moved) to base.
    const game = await scenario()
      .active(P2)
      .battlefield("bar", { controller: P1, def: CARD, inert: false })
      .unit(P1, "bar", { might: 3, name: "Sleepy" }, "sleepy", { stunned: true })
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bar");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("sleepy")).toBe("battlefield-bar");
    expect(game.gameState.battlefields.bar?.controller).toBe(P1);
    expect(game.state("raider")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
  });

  test("negative: with the Bar inert (abilities stripped) the same retreat is a plain move — proves the bonus is the Bar's text, not the move", async () => {
    const game = await scenario().battlefield("bar", { controller: P1, def: CARD, inert: true }).unit(P1, "bar", { might: 2 }, "walker").build();
    await game.p1.move("walker", "base");
    await game.settle();
    expect(game.state("walker").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
