/**
 * Ruling 157bb5457cedbf95 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: A opens a showdown at bf1; B rides a unit to bf2 (staging a second showdown), then rides the SAME unit back to
 *    bf1 before the first showdown has resolved, and wins there. Does B score one point or two that turn?
 * A: One. The showdown already running at bf1 must resolve before any other showdown can begin, so while B's unit is
 *    at bf2 the bf2 showdown is only STAGED — it never opens. Riding back to bf1 removes B's unit from bf2, so the
 *    staged bf2 showdown simply evaporates. B then wins the (surprise-defended) combat at bf1 and scores there: 1 point.
 * Rules: 348 (a showdown closes only when everyone passes Focus in a row), 323.8/323.8.a (a Showdown is *staged* at a
 *        contested battlefield and stays staged only while the contesting player has units there), 323.11 (contested
 *        status is removed once they don't), 323.12/323.13 (a staged showdown/combat only BEGINS in a Neutral Open
 *        State — i.e. after the current one is done), 323.14 (combat staged where a showdown runs ⇒ it becomes a
 *        Combat Showdown), 466.5/466.5.d (establishing control at the end of combat = a Conquer = 1 point).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/**
 * P1 ("Player A") is the turn player with Scout (2) in base. bf1 and bf2 are both open and uncontrolled.
 * P2 ("Player B") has Rider (4) in base and two Ride the Winds with exactly [4][chaos][chaos].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Rider" }, "rider")
    .hand(P2, RIDE_THE_WIND, "rtw1")
    .hand(P2, RIDE_THE_WIND, "rtw2")
    .resources(P2, { energy: 4, power: { chaos: 2 } });
}

/** A's Scout charges bf1, opening a showdown there; A passes Focus so B may act. */
async function showdownAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** B rides the Rider to `dest` and lets the spell resolve (taking Focus back from A first if needed). */
async function rideTo(game: Game, card: string, dest: string): Promise<void> {
  if (game.decision()?.seat !== P2) {
    await game.acting().passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast(card, { targets: "rider" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick(`battlefield-${dest}`);
  }
  expect(game.chain().map((c) => c.cardId)).toEqual([card]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(card)).toBe("trash");
  expect(game.locationOf("rider")).toBe(dest);
}

/** Drain every remaining showdown: one showdown may close straight into the next one that was staged. */
async function settleOut(game: Game): Promise<void> {
  await game.settle();
  for (let i = 0; i < 12 && stack(game).length > 0; i++) {
    await game.acting().pass();
    await game.settle();
  }
}

describe("Ruling 157bb5457cedbf95 — riding out to bf2 and back to bf1 mid-showdown scores ONE point, not two", () => {
  test("step 1: while the bf1 showdown is unresolved, riding to bf2 only STAGES a second showdown — it never begins", async () => {
    const game = await showdownAtBf1();
    await rideTo(game, "rtw1", "bf2");
    // bf2 is contested by B, but the only OPEN showdown is still the one at bf1 (323.12/323.13 need a Neutral Open State).
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2 });
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(null);
    expect(game.p2.points()).toBe(0);
  });

  test("step 2: riding back to bf1 empties bf2 — its staged showdown evaporates and bf1 becomes a Combat Showdown", async () => {
    const game = await showdownAtBf1();
    await rideTo(game, "rtw1", "bf2");
    await rideTo(game, "rtw2", "bf1");
    expect(game.state("rider").isReady).toBe(true); // "…and ready it"
    // bf2 no longer has any unit of the player who contested it (323.8.a), so nothing is ever staged there again;
    // the engine clears bf2's contested bookkeeping when the bf1 showdown finishes (asserted in step 3).
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(null);
    // Still exactly ONE showdown, at bf1 — now a combat one (323.14).
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rider").combatRole).toBe("defender");
  });

  test("step 3: B wins the combat at bf1 and scores exactly ONE point; bf2 is never scored", async () => {
    const game = await showdownAtBf1();
    await rideTo(game, "rtw1", "bf2");
    await rideTo(game, "rtw2", "bf1");
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash"); // Rider 4 vs Scout 2
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(1); // ONE — not two
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("if instead B STAYS at bf2: the bf1 showdown closes first (A conquers bf1), and only then does the staged bf2 showdown open — B still scores just one", async () => {
    const game = await showdownAtBf1();
    await rideTo(game, "rtw1", "bf2");
    await settleOut(game);
    expect(stack(game)).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
