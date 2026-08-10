/**
 * Ruling fca8971c01eb742c — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · Calm · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action] "Move a friendly unit and ready it."
 *   × Flash (OGS-011 → ogs-011-024) — mentioned as a further move; not needed for the ruled sequence.
 *   × Mountain Drake (OGN-142 → ogn-142-298) · 10 Might.
 *
 * Q: Yasuo attacks and his ability deals 6 to Mountain Drake; he is then Ridden to another battlefield. Does the Drake
 *    heal before Yasuo can attack again?
 * A: Yes. The first showdown does not end just because Yasuo left — it ends only when both players pass Focus; then its
 *    cleanup heals all units. The combat Yasuo staged at battlefield B waits ("staged") until the first one has fully
 *    resolved, and only then begins (where Yasuo attacks again).
 * Rules: 345–348 (a showdown ends when all pass Focus), 467 (combat cleanup heals), 323.13/344 (staged combats open
 *        only from a Neutral Open state, turn player resolves the started one first).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const RIDE_THE_WIND = "ogn-173-298";
const MOUNTAIN_DRAKE = "ogn-142-298";

/** P1's turn with [2][chaos]. P2 holds battlefield A with Mountain Drake (10) and battlefield B with a 2-Might Guard. P1: Yasuo in base, Ride the Wind in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfa", { controller: P2 })
    .battlefield("bfb", { controller: P2 })
    .unit(P2, "bfa", MOUNTAIN_DRAKE, "drake")
    .unit(P2, "bfb", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

function showdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Yasuo attacks A; his trigger (→ Drake) resolves: Drake carries 6. P1 holds Focus in the showdown at A. */
async function yasuoHitsDrake(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bfa");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("drake");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["drake"], triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("drake")).toMatchObject({ damage: 6, zone: "battlefield-bfa" }); // 6 < 10: alive, damaged
  expect(showdowns(game)).toEqual([expect.objectContaining({ battlefieldId: "bfa", focusPlayer: P1, isCombatShowdown: true })]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 Rides the Wind: Yasuo → B (readied); the spell resolves (P1 pass, P2 pass). */
async function yasuoRidesToB(): Promise<Game> {
  const game = await yasuoHitsDrake();
  await game.p1.cast("rtw", { targets: "yasuo" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bfb");
  }
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.state("yasuo")).toMatchObject({ isReady: true, location: "bfb" });
  return game;
}

describe("Ruling fca8971c01eb742c — the first showdown must fully end (and heal) before Yasuo's second combat begins", () => {
  test("after Ride the Wind resolves the showdown at A is STILL open (it does not end just because Yasuo left): Drake still carries the 6, P2 now holds Focus; B is merely contested/staged — no showdown there, Yasuo has no attacker role and has NOT triggered again", async () => {
    const game = await yasuoRidesToB();
    expect(showdowns(game)).toEqual([expect.objectContaining({ battlefieldId: "bfa", focusPlayer: P2 })]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("drake").damage).toBe(6);
    expect(game.gameState.battlefields.bfb).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdowns(game).some((s) => s.battlefieldId === "bfb")).toBe(false);
    expect(game.state("yasuo").combatRole ?? null).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(0);
  });

  test("Player B passes Focus, Player A passes Focus → the first showdown ends and its cleanup HEALS the Drake (0 damage, still P2's battlefield A) …", async () => {
    const game = await yasuoRidesToB();
    await game.p2.passFocus();
    expect(game.state("drake").damage).toBe(6); // one pass is not enough
    expect(showdowns(game)).toEqual([expect.objectContaining({ battlefieldId: "bfa", focusPlayer: P1 })]);
    await game.p1.passFocus();
    expect(game.state("drake")).toMatchObject({ damage: 0, zone: "battlefield-bfa" });
    expect(game.gameState.battlefields.bfa).toMatchObject({ contested: false, controller: P2 });
  });

  test("… and only THEN does the staged combat at B begin: a new showdown at B with Yasuo as attacker, his 'When I attack' triggering a second time (→ the Guard) — strictly after the Drake healed", async () => {
    const game = await yasuoRidesToB();
    await game.p2.passFocus();
    await game.p1.passFocus();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    expect(showdowns(game)).toEqual([expect.objectContaining({ attackingPlayer: P1, battlefieldId: "bfb", isCombatShowdown: true })]);
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["guard"], triggered: true })]);
    expect(game.state("drake").damage).toBe(0);
    // Play it out: 6 to the Guard kills it, Yasuo conquers B.
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bfb?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfa?.controller).toBe(P2);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
