/**
 * Ruling 6b95fe9d90ba22b5 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might "[Tank] When you play me to a battlefield, you may move an enemy
 *     unit to here. When I hold, return me to my owner's hand."
 *   × Last Stand (OGN-069 → ogn-069-298) · Action · [3][calm] "Double a friendly unit's Might this turn. Give it [Temporary]. (Kill it at the start of
 *     its controller's Beginning Phase, before scoring.)"
 *
 * Q: Blitzcrank has [Temporary] (from Last Stand). Does Temporary kill him before his Hold ability can return him to hand?
 * A: Yes. Start of the Beginning Phase: Temporary kills him. The Hold step comes after — Blitzcrank is already gone, so he is never returned to
 *    hand (he is in the trash).
 * Rules: 816.1.b (Temporary: killed at the start of its controller's Beginning Phase, before scoring), 315.2 (Beginning Phase order: beginning
 *        step → scoring/hold), 383.4.d (Hold triggers need the unit there when you hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const LAST_STAND = "ogn-069-298";

/**
 * P1's turn (turn 3), 0 points. P1 controls bf1 with Blitzcrank AND a 2-Might Buddy (so bf1 stays P1's and IS held next turn regardless of
 * Blitzcrank). P1 holds Last Stand with exactly [3][calm]. P2 has an idle unit at its own bf2.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", BLITZCRANK, "blitz")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 3, name: "Idler" }, "idler")
    .hand(P1, LAST_STAND, "ls");
}

/** Last Stand on Blitzcrank, then pass the turn to P2 and have P2 end it — stopping at the first decision of P1's new turn. */
async function lastStandThenAroundToP1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ls", { targets: "blitz" });
  await game.settle();
  expect(game.zoneOf("ls")).toBe("trash");
  expect(game.state("blitz").keywords).toContain("Temporary");
  await game.advanceTurn(); // → P2's turn
  expect(game.turnPlayer()).toBe(P2);
  expect(game.zoneOf("blitz")).toBe("battlefield-bf1"); // nothing happens in the OPPONENT's Beginning Phase
  await game.p2.endTurn(); // → P1's Beginning Phase
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling 6b95fe9d90ba22b5 — Temporary kills Blitzcrank at the start of the Beginning Phase, before his Hold trigger could bounce him", () => {
  test("premise: Last Stand gives Blitzcrank [Temporary], and it is still on him during P2's turn (it is not a 'this turn' grant)", async () => {
    const game = await board().build();
    await game.p1.cast("ls", { targets: "blitz" });
    await game.settle();
    expect(game.state("blitz").keywords).toContain("Temporary");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("blitz").keywords).toContain("Temporary");
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
  });

  // RULING-CONFLICT: riftjudge 6b95fe9d90ba22b5 describes the Beginning Step as killing Blitzcrank outright,
  // before anything can reach the Chain. rule 816.1 makes [Temporary] a TRIGGERED ability keyword — 816.1.b:
  // "At the start of this permanent's controller's Beginning Phase, before scoring, kill this" — so the kill is
  // queued as its own Chain item and both players get Priority over it (`flow/riftbound-flow.ts` beginning
  // onBegin → effect `temporary-kill`). The single triggered blitz item standing on the Chain at P1's first
  // window is therefore that KILL, not a Hold trigger: it resolves Blitzcrank into the trash and he is never
  // returned to hand, which is exactly the outcome the ruling asks for. rule 315.2's step order is preserved —
  // the kill's Chain resolves before the Hold/scoring step runs.
  test("engine: [Temporary]'s kill is itself a Chain item at the start of P1's Beginning Phase (rule 816.1), and it resolves Blitzcrank into the trash before the Hold step — no 'When I hold' bounce", async () => {
    const game = await lastStandThenAroundToP1();
    // The kill is a triggered ability awaiting Priority; Blitzcrank is still standing while it waits.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true }),
    ]);
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
    await game.settle();
    // It was the Temporary kill, not the Hold return: Blitzcrank ends in the trash, never in hand.
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.p1.hand()).not.toContain("blitz");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("end state of P1's Beginning Phase: Blitzcrank is in the TRASH (killed by Temporary), NOT returned to hand; P1 still holds bf1 via Buddy for 1 point", async () => {
    const game = await lastStandThenAroundToP1();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.p1.hand()).not.toContain("blitz");
    expect(game.p1.trash()).toContain("blitz");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold itself still happened (Buddy) — just without Blitzcrank
    expect(game.violations()).toEqual([]);
  });

  test("contrast — WITHOUT Temporary, holding with Blitzcrank does trigger 'When I hold': he returns to P1's hand and P1 scores the hold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", BLITZCRANK, "blitz")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("blitz")).toBe("hand");
    expect(game.p1.points()).toBe(1);
  });
});
