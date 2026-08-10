/**
 * Ruling f721a66117acda2d — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri)
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ahri, Inquisitive ("Blue Ahri", OGN-119 → ogn-119-298) · 3 Might · "When I attack or defend, give an enemy unit
 *     here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action] "Move a friendly unit and ready it."
 *   × Vi, Destructive (OGN-036 → ogn-036-298) · 3 Might.
 *
 * Q: P1 (Ahri legend) moves Blue Ahri to an EMPTY battlefield; P2, on getting Focus, Rides the Wind to send Vi there.
 *    Triggers? Attacker/defender? Scoring?
 * A: The empty-battlefield showdown is non-combat (no triggers). Once Vi arrives combat happens there: the player who
 *    contested the battlefield (P1/Ahri) is the Attacker, the Vi player the Defender. Blue Ahri's attack trigger fires;
 *    the Legend does NOT (nobody controls the battlefield during the showdown). Control is only established when combat
 *    concludes; the winner conquers and scores 1.
 * Rules: 344/344.1 (showdown at a contested battlefield; an ongoing showdown becomes a Combat Showdown), 464.2.c
 *        (attacker = who applied Contested), 466.5/190.4 (control established at combat resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const VI_DESTRUCTIVE = "ogn-036-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1: Nine-Tailed Fox legend, Blue Ahri (3) in base. bf1 empty and uncontrolled. P2: Vi (3) in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .legend(P1, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", AHRI_INQUISITIVE, "ahri")
    .unit(P2, "base", VI_DESTRUCTIVE, "vi")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Ahri moves to the empty bf1 (non-combat showdown, P1 Focus); P1 passes Focus; P2 Rides the Wind: Vi → bf1; the spell resolves. */
async function viRidesIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ahri", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "vi" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bf1");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("vi")).toBe("bf1");
  expect(game.state("vi").isReady).toBe(true);
  return game;
}

describe("Ruling f721a66117acda2d — Ahri to an empty battlefield, Vi Rides the Wind in", () => {
  test("step 1: Ahri's move to the EMPTY, uncontrolled bf1 opens a NON-combat showdown with P1 holding Focus — no attacker designation, no triggers (neither Blue Ahri nor the Legend), nobody controls bf1, no point yet", async () => {
    const game = await board().build();
    await game.p1.move("ahri", "bf1");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("ahri").combatRole ?? null).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.p1.points()).toBe(0);
  });

  test("step 2: Vi arrives via Ride the Wind ⇒ combat at bf1: P1 (who contested it) is the ATTACKER, P2 the DEFENDER; Ahri = attacker, Vi = defender", async () => {
    const game = await viRidesIn();
    // RULING-CONFLICT: riftjudge f721a66117acda2d narrates "the first showdown closes, both pass focus, then a NEW combat
    // showdown opens"; CR 344.1 says "If a Showdown is already ongoing at that Battlefield, it will become a Combat Showdown
    // and a Combat will initiate there" — engine follows CR: the same showdown is upgraded in place.
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("ahri").combatRole).toBe("attacker");
    expect(game.state("vi").combatRole).toBe("defender");
  });

  test("only Blue Ahri triggers (her attack trigger, aimed at Vi); the Nine-Tailed Fox legend does NOT — nobody controls bf1 during the showdown", async () => {
    const game = await viRidesIn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, targets: ["vi"], triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "fox")).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    // It resolves: Vi 3 − 2 = 1; Ahri untouched by any Fox trigger.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("vi").might).toBe(1);
    expect(game.state("ahri").might).toBe(3);
    // Still mid-showdown: no control, no points.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("combat concludes (both pass Focus): Ahri 3 kills Vi 1; only NOW is control established — P1 conquers bf1 and scores exactly 1; P2 scores nothing", async () => {
    const game = await viRidesIn();
    await game.settle();
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
