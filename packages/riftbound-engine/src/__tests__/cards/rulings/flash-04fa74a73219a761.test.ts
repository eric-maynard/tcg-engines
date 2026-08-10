/**
 * Ruling 04fa74a73219a761 — Flash (OGS-011 → ogs-011-024, Reaction, 2) "Move up to 2 friendly units to base."
 *   × Ride the Wind (ogn-173-298, Action, 2 + [chaos]) "Move a friendly unit and ready it."
 *
 * Q: Enemy attacks my battlefield; I Flash my only unit out (losing control), then Ride the Wind back in and win
 *    the combat. Can I Conquer (score)?
 * A: Yes. Flashing out your only unit loses you control at once, but the battlefield stays Contested and the
 *    combat continues (the attacker does not score yet). Riding back in and winning/tieing means you GAIN control
 *    at the end of combat — a Conquer — and score a point (if you have not scored there this turn).
 * Rules: 190.4 / 190.4.c (control from units; none = lose it), 465–467 (combat resolution → control → conquer),
 *        343 (Reaction/Action timing in a showdown), 630-series scoring (conquer = gaining control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn. P1 holds bf1 with its ONLY unit Anchor (5). P2's Raider (3) attacks from base.
 * P1: Flash + Ride the Wind in hand, exactly 4 energy + 1 chaos. bf2 exists (P2's) so destinations are a real choice.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "ride");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Raider attacks bf1; P2 passes Focus; P1 Flashes Anchor to base and the Flash resolves. */
async function flashedOut(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
  await game.p2.pass();
  expect(game.p1.can("cast", "flash")).toBe(true);
  await game.p1.cast("flash", { targets: "anchor" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Flash resolves
  expect(game.locationOf("anchor")).toBe("base");
  return game;
}

/** …then, once P1 has Focus again, Ride the Wind moves Anchor back to bf1 and resolves. */
async function rodeBackIn(): Promise<Game> {
  const game = await flashedOut();
  if (game.actingSeat() === P2) {
    await game.p2.pass();
  }
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("cast", "ride")).toBe(true);
  await game.p1.cast("ride", { targets: "anchor" });
  // The destination is a play-time choice of P1.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  const key = d?.kind === "pick" ? (d.options.find((o) => o.key === "battlefield-bf1")?.key as string) : "";
  await game.p1.pick(key);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves
  expect(game.locationOf("anchor")).toBe("bf1");
  return game;
}

describe("Ruling 04fa74a73219a761 — Flash out, Ride the Wind back in, win: the defender CONQUERS and scores", () => {
  test("Flashing the only defender out mid-combat: the attacker does NOT score, bf1 stays Contested and the same combat showdown continues", async () => {
    const game = await flashedOut();
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P2 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 04fa74a73219a761 says P1 loses control of bf1 the moment its last unit Flashes
  // out; CR 190.4.b says control of a contested battlefield is not recalculated while the showdown is ongoing —
  // it is re-evaluated when the combat resolves — so controller stays P1 for the duration of the combat. Engine
  // follows CR (also asserted by core-rules/hidden-and-facedown-zones and combat-flow-and-resolution).
  // rule 190.4.b: control of a contested battlefield does not change mid-showdown.
  test("Flashing out its only unit does not change control mid-combat: bf1 stays contested and still controlled by P1", async () => {
    const game = await flashedOut();
    expect(bf1(game)?.contested).toBe(true);
    expect(bf1(game)?.controller).toBe(P1);
  });

  test("Ride the Wind is a legal Action for P1 in the ongoing showdown; Anchor returns to bf1 ready and is a Defender again, Raider still the Attacker", async () => {
    const game = await rodeBackIn();
    expect(game.state("anchor")).toMatchObject({ combatRole: "defender", isReady: true, location: "bf1" });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(showdown(game)?.active).toBe(true);
    expect(game.zoneOf("ride")).toBe("trash");
  });

  test("combat then resolves: Anchor (5) kills Raider (3) and survives at bf1; P2 scores nothing", async () => {
    const game = await rodeBackIn();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
  });

  // RULING-CONFLICT: riftjudge 04fa74a73219a761 says P1 lost control when it Flashed out and so GAINS it back at the
  // end of combat (a Conquer, +1). CR 190.4.b / 190.4.c / 323.6 ("…unless there is a Combat or Showdown ongoing there")
  // and the large majority of rulings on the identical line (0763e2fd879f27ba, 144a43c3a845800b "the pre-October
  // answers were based on old rules", 3e4999ac60026bdb, 4c23871af3d48982, a0658bc35ab1df0b, c964c32b608fbc82,
  // cd9356416a0b87e4) say control never left P1 during the combat, so surviving it is a plain defence: NO point.
  // Engine follows CR — battlefield control timing model, operations/battlefield-control.ts.
  test("ruling 04fa74a73219a761 (rewritten to CR 190.4.b) — winning after Flash-out + Ride-back in the SAME combat is a defence, not a Conquer: P1 keeps bf1 and scores nothing", async () => {
    const game = await rodeBackIn();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).not.toContain("bf1");
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
  });
});
