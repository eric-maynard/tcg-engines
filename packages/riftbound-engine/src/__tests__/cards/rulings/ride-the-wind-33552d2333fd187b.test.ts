/**
 * Ruling 33552d2333fd187b — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: Surprise defense — A moves onto an unoccupied battlefield (open showdown); B answers with Ride the
 *    Wind, moving a unit there. Does the open showdown end at once and combat start, or do players keep
 *    passing priority in the open showdown first?
 * A: They keep going. The open showdown ends only when both players pass in a row over an empty chain;
 *    combat needs a Neutral Open State, so the staged combat begins only during the cleanup after that.
 *    The first player to apply Contested (A) is the attacker; the late arrival (B) is the defender.
 * Rules: 323.12/323.13 (a staged showdown/combat begins only in a Neutral Open State), 323.14 (a combat
 *        staged where a showdown runs makes it a Combat Showdown), 348 (consecutive passes close a
 *        showdown), 460.1 (attacker = first contester), 383 ("when I attack/defend" fire at combat begin).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** P1 is the turn player with Scout (2) in base; bfX is empty and uncontrolled; P2 holds Rider (4) + Ride the Wind. */
function board() {
  return scenario()
    .battlefield("bfX", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Rider" }, "rider")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .resources(P2, { energy: 2, power: { chaos: 1 } });
}

/** P1 walks onto the empty bfX (open showdown), passes Focus; P2 rides in and lets the spell resolve. */
async function surpriseDefense(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bfX");
  await game.p1.passFocus();
  await game.p2.cast("rtw", { targets: "rider" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfX");
  }
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("rider")).toBe("bfX");
  return game;
}

describe("Ruling 33552d2333fd187b — the open showdown runs to its natural close; combat begins only afterwards", () => {
  test("step 1: moving onto the unoccupied bfX opens a NON-combat showdown with no designations at all", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bfX");
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bfX", isCombatShowdown: false });
    expect(game.gameState.battlefields.bfX).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("step 2: after Ride the Wind resolves the SAME showdown is still open — it did not end immediately, and both players may still act", async () => {
    const game = await surpriseDefense();
    expect(stack(game)).toHaveLength(1); // still one showdown, at bfX
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bfX" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bfX?.controller).toBe(null); // nobody controls it during the showdown
  });

  // RULING-CONFLICT: riftjudge 33552d2333fd187b says designations are handed out only once the open showdown has
  // closed and the staged combat begins. The CR hands them out earlier: 323.14 turns the running Non-Combat
  // Showdown into a COMBAT Showdown during the cleanup after the move, and 464.2 defines combat as opening exactly
  // then ("it either opens with a Combat Showdown, or the current Showdown becomes a Combat Showdown"), which
  // makes 464.2.c's tasks outstanding — 464.2.c.3: "Units at the Contested Battlefield controlled by the Attacker
  // or Defender gain the Attacker or Defender designation NOW". 464.2.c.1.b confirms combat can open into a
  // showdown that is already running (the Focus holder keeps Focus). The rest of the ruling is right and is
  // asserted above/below: the showdown does not end early, and the first contester is the attacker.
  // ADJUDICATED 2026-08-12 (CONFLICTS-ADJUDICATED-2026-08-12.md, item 01bd7f7c1abc): this facet PREVIOUSLY
  // asserted the opposite (no designation yet). Do not flip it back — step 3 below reads the same state.
  test("rule 323.14 + 464.2.c.3 — the moment the staged combat joins the open showdown it becomes a Combat Showdown and stamps attacker/defender", async () => {
    const game = await surpriseDefense();
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bfX", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker"); // first contester (460.1)
    expect(game.state("rider").combatRole).toBe("defender");
    // …and the showdown is nonetheless still open: designations do not close it.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("step 3: once both players pass, combat runs with P1 (the first contester) as attacker and P2 as defender", async () => {
    const game = await surpriseDefense();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rider").combatRole).toBe("defender");
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash"); // Rider 4 vs Scout 2
    expect(game.zoneOf("rider")).toBe("battlefield-bfX");
    expect(game.gameState.battlefields.bfX?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
