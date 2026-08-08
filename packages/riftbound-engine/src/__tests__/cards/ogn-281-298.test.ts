/**
 * Hallowed Tomb — ogn-281-298 · Battlefield (no cost, no domain)
 *
 *   When you hold here, you may return your Chosen Champion from your trash to your Champion Zone
 *   if it is empty.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Hold (469.2 / 383.4.d): only at the start of YOUR Beginning Phase while you keep control here
 *      with a unit present; you score the hold point and THEN this optional ability goes on the chain
 *      under the holder's control (383.4.d.2.b). Conquering the Tomb is not holding it (471.2.a/b).
 *   2. "you" = the player holding here, whoever brought the card: P2 holding a Tomb P1 owns asks P2.
 *      Holding a DIFFERENT battlefield while the Tomb sits uncontrolled asks nobody.
 *   3. "your Chosen Champion" (103.2.a.3) = the champion unit named for your Champion Zone (matching
 *      your Legend's tag) — not your Legend, not any other champion unit lying in your trash.
 *   4. Destination is the CHAMPION ZONE (108.3), from where it can be played again (419.1.a) — not the
 *      hand, not the board. "if it is empty": with your champion still unplayed in the zone, nothing
 *      may be returned even if a second copy is in the trash.
 *   5. "you may": declining leaves everything where it is; the Beginning Phase then continues
 *      (channel 2, draw 1) into the main phase.
 *   6. A Legend never leaves the Legend Zone — whatever this ability does, the Legend stays put.
 *
 * Engine note: the hand-written ability is `return-to-hand` of a friendly LEGEND "in trash"; on
 * resolution it actually lifts the Legend out of the Legend Zone into the hand and leaves the
 * champion in the trash (BUG tests below). Trigger timing, controller and the opt-in prompt are right.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-281-298";
const DAUGHTER_OF_THE_VOID = "ogn-247-298"; // Legend · Kai'Sa
const KAISA_SURVIVOR = "ogn-039-298"; // Champion unit · Kai'Sa · 4 · 4 Might — the Chosen Champion
const JINX_REBEL = "ogn-202-298"; // Champion unit · Jinx — a champion, but not the chosen one

/**
 * End of P2's turn 2. P1 (Kai'Sa legend) controls Hallowed Tomb with a unit on it; P1's Champion Zone
 * is empty (Kai'Sa was played earlier and died → in P1's trash).
 */
function board(opts: { tombOwner?: string; championInZone?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
    .battlefield("tomb", { controller: P1, def: CARD, inert: false, owner: opts.tombOwner ?? P1 })
    .unit(P1, "tomb", { might: 2, name: "Gravekeeper" }, "sitter")
    .trash(P1, KAISA_SURVIVOR, "kaisa");
  if (opts.championInZone) {
    b.champion(P1, KAISA_SURVIVOR, "kaisaUnplayed");
  }
  return b;
}

/** P2 ends the turn → P1's Beginning Phase: the hold is scored and the Tomb's opt-in is pending. */
async function intoHold(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
}

describe("Hallowed Tomb (ogn-281-298)", () => {
  test("registry payload — an optional HOLD-here trigger that returns your CHOSEN CHAMPION from TRASH to the CHAMPION ZONE if empty (engine: return-to-hand of a legend)", async () => {
    // Expected: effect moves a champion unit trash → championZone, gated on the zone being empty.
    // Actual: `{ type: "return-to-hand", target: { type: "legend", location: "trash", controller: "friendly" } }`.
    await scenario().build();
    const [ability] = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as Record<string, unknown>[];
    expect(ability).toMatchObject({ optional: true, trigger: { event: "hold" }, type: "triggered" });
    const effect = JSON.stringify(ability?.effect ?? {});
    expect(effect).not.toContain("return-to-hand");
    expect(effect).not.toContain('"legend"');
    expect(effect).toMatch(/champion/i);
  });

  test("holding here: P1 scores the hold point and the Tomb's OPTIONAL ability is on the chain under P1, asking P1 yes/no while the Beginning Phase holds", async () => {
    const game = await board().build();
    expect(game.p1.champion()).toBeUndefined();
    await intoHold(game);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["tomb"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tomb", controller: P1, name: "Hallowed Tomb", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
    // Nothing has moved yet.
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("legend")).toBe("legendZone");
  });

  test("declining: Kai'Sa stays in the trash, the Champion Zone stays empty, the Legend stays put; the turn continues (channel 2, draw 1) into P1's main phase", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await intoHold(game);
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.p1.legend()).toBe("legend");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("accepting returns Kai'Sa from the trash to P1's CHAMPION ZONE (not hand, not board) — and she can then be played from there again (419.1.a)", async () => {
    // Expected: kaisa zone trash → championZone; later `playChampion` is legal with 4 energy.
    // Actual: kaisa never leaves the trash (the effect looks for a legend instead).
    // 4 ready fury runes: her cost (4 energy + fury) must be payable after the return.
    const game = await board().runes(P1, "fury", 4).build();
    await intoHold(game);
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("kaisa")).toBe("championZone");
    expect(game.p1.champion()).toBe("kaisa");
    expect(game.p1.hand()).not.toContain("kaisa");
    // rule 419.1.a — she is playable from the Champion Zone once her cost is on the table.
    for (let i = 0; i < 4; i++) {
      await game.p1.tapRune();
    }
    expect(game.p1.can("playChampion")).toBe(true);
  });

  test("the Legend never leaves the Legend Zone — after accepting, Daughter of the Void is still P1's legend and NOT in P1's hand (engine bounces the legend to hand)", async () => {
    // Expected: legends are not movable game objects for this effect; only the champion unit is.
    // Actual: the `return-to-hand`/`type: legend` effect resolves against the Legend Zone card.
    const game = await board().build();
    await intoHold(game);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.p1.legend()).toBe("legend");
    expect(game.p1.hand()).not.toContain("legend");
  });

  test("'if it is empty' — with the unplayed Kai'Sa still in the Champion Zone, accepting changes nothing: the trash copy stays, the zone keeps exactly its one card, the Legend stays", async () => {
    // Expected: a complete no-op. Actual: the Legend is moved to P1's hand.
    const game = await board({ championInZone: true }).build();
    expect(game.p1.champion()).toBe("kaisaUnplayed");
    await intoHold(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.cardsAt("championZone", P1)).toEqual(["kaisaUnplayed"]);
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.p1.hand()).not.toContain("legend");
  });

  test("only your CHOSEN champion qualifies: a Jinx champion unit in a Kai'Sa player's trash is never returned and the Champion Zone stays empty", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
      .battlefield("tomb", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "tomb", { might: 2 }, "sitter")
      .trash(P1, JINX_REBEL, "jinx")
      .build();
    await intoHold(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("jinx")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("'you' is the HOLDER: P2 holds a Tomb card owned by P1 → P2 scores and P2 (not P1) is asked; P1's trash and zones are untouched on decline", async () => {
    // Mirror setup for both players (each a Kai'Sa player with their champion in the trash and an empty zone).
    const game = await scenario()
      .turn(3)
      .active(P1)
      .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
      .legend(P2, DAUGHTER_OF_THE_VOID, "legend2")
      .battlefield("tomb", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "tomb", { might: 2 }, "theirSitter")
      .trash(P1, KAISA_SURVIVOR, "kaisa")
      .trash(P2, KAISA_SURVIVOR, "kaisa2")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.p2.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tomb", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.p1.points()).toBe(0);
  });

  test("only HERE: P1 holds a DIFFERENT battlefield while the Tomb (P1's own card) lies uncontrolled → hold point for bf2, but no Tomb item and no prompt", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
      .battlefield("tomb", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "holder")
      .trash(P1, KAISA_SURVIVOR, "kaisa")
      .script(P1, [], { strict: true }) // any real prompt for P1 would throw
      .build();
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "tomb")).toBe(false);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf2"]);
    expect(game.zoneOf("kaisa")).toBe("trash");
  });

  test("hold, not conquer: P1 CONQUERING the Tomb (Kai'Sa in trash, zone empty) scores but never asks", async () => {
    const game = await scenario()
      .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
      .battlefield("tomb", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "tomb", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .trash(P1, KAISA_SURVIVOR, "kaisa")
      .script(P1, [], { strict: true })
      .build();
    await game.p1.move("attacker", "tomb");
    await game.settle();
    expect(game.gameState.battlefields.tomb?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("no unit, no hold: P1 'controls' the Tomb on paper but has nobody there and a unit elsewhere — the opponent's turn start certainly never fires it, and neither does an inert Tomb", async () => {
    // Opponent's beginning phase: P2 does not control the Tomb → nothing for anyone.
    const game = await board().turn(3).active(P1).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain().some((c) => c.cardId === "tomb")).toBe(false);
    await game.settle();
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("kaisa")).toBe("trash");
    // Inert control: same hold with abilities stripped → point, no prompt.
    const inert = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
      .battlefield("tomb", { controller: P1, def: CARD, inert: true, owner: P1 })
      .unit(P1, "tomb", { might: 2 }, "sitter")
      .trash(P1, KAISA_SURVIVOR, "kaisa")
      .script(P1, [], { strict: true })
      .build();
    await inert.advanceTurn();
    expect(inert.p1.points()).toBe(1);
    expect(inert.phase()).toBe("main");
  });
});
