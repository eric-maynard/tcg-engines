/**
 * Ruling a3a061ca427c60b8 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri) · "When an enemy unit attacks a
 *     battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × "Blue Ahri" = Ahri, Inquisitive (OGN-119 → ogn-119-298) · Unit · Mind · 3 · "When I attack or defend, give an enemy
 *     unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] Action · "Move a friendly unit and ready it."
 *
 * Q: Blue Ahri attacks Reaver's Row where the opponent has one unit; that unit retreats via Reaver's Row. Can the opponent
 *    then Ride the Wind a fresh unit in before the conquer, and does Ahri's ability trigger on the newcomer?
 * A: Ahri and Reaver's Row trigger together but the attacker's trigger is placed (and targeted) first, so Ahri names the
 *    original defender; Reaver's Row resolves first and retreats it; Ahri's ability whiffs. The opponent may Ride the Wind a
 *    new unit in during the same combat — it becomes a defender and combat continues — but Ahri does NOT re-trigger. (The
 *    Ahri player's Nine-Tailed Fox does nothing here either: the Row is not a battlefield they control.)
 * Rules: 464.2.e.1, 355.7/355.9 (target locked, rechecked → whiff), 383.4.e (attack trigger once per combat),
 *        464.2.c.3.a / 323.2.a (a unit arriving mid-combat gains the designation), 323.6.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const REAVERS_ROW = "ogn-285-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1: Nine-Tailed Fox legend, Ahri (3) in base. P2 holds Reaver's Row (live) with Picket (3); Reserve (4) in P2's base; Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .legend(P1, NINE_TAILED_FOX, "ntf")
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P1, "base", AHRI_INQUISITIVE, "ahri")
    .unit(P2, "row", { might: 3, name: "Picket" }, "picket")
    .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

async function ahriAttacksAndPicketRetreats(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ahri", "row");
  // Attacker's trigger first: Ahri's target is locked (only the Picket is here).
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    expect(game.decision()).toMatchObject({ semantics: "target", source: { cardId: "ahri" } });
    await game.p1.pick("picket");
  }
  expect(game.chain().find((c) => c.cardId === "ahri")).toMatchObject({ controller: P1, targets: ["picket"], triggered: true });
  // Then the defender's Reaver's Row: opt in, retreat the Picket.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("picket");
  }
  expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
    ["ahri", P1],
    ["row", P2],
  ]);
  // Drain the initial chain.
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action"); // never a re-target prompt for Ahri
    await game.acting().passPriority();
  }
  return game;
}

async function reserveRidesIn(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "reserve", answers: ["row", "battlefield-row"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("row");
  }
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling a3a061ca427c60b8 — Ahri whiffs on the retreated defender and does not re-trigger on a unit Ridden in mid-combat", () => {
  test("only Ahri (attacker, placed first, target locked on the Picket) and Reaver's Row go on the initial chain — the attacking player's Nine-Tailed Fox does not trigger (the Row is not a battlefield P1 controls)", async () => {
    const game = await board().build();
    await game.p1.move("ahri", "row");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("picket");
    }
    expect(game.chain().some((c) => c.cardId === "ntf")).toBe(false);
    expect(game.chain().find((c) => c.cardId === "ahri")?.targets).toEqual(["picket"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
    expect(game.state("ahri")).toMatchObject({ combatRole: "attacker", might: 3 }); // no −1 from anybody's Fox
  });

  test("Reaver's Row resolves first and retreats the Picket; Ahri's −2 then whiffs (Picket in base at full 3, no re-target); the combat showdown is still open and P2 still controls the Row", async () => {
    const game = await ahriAttacksAndPicketRetreats();
    expect(game.chain()).toEqual([]);
    expect(game.state("picket")).toMatchObject({ location: "base", might: 3, mightModifier: 0 });
    expect(game.cardsAt("battlefield-row")).toEqual(["ahri"]);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P2 may Ride the Wind the Reserve into the Row during this same combat: it arrives ready, gains the DEFENDER designation, and the same showdown continues (no new one)", async () => {
    const game = await ahriAttacksAndPicketRetreats();
    const opened = game.gameState.interaction?.showdownStack?.length ?? 0;
    await reserveRidesIn(game);
    expect(game.locationOf("reserve")).toBe("row");
    expect(game.state("reserve")).toMatchObject({ combatRole: "defender", isReady: true });
    expect(game.gameState.interaction?.showdownStack?.length ?? 0).toBe(opened);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.state("ahri").combatRole).toBe("attacker");
  });

  test("Ahri's 'When I attack' does NOT trigger again for the newcomer: nothing on the chain, no target prompt, the Reserve keeps its full 4 Might", async () => {
    const game = await ahriAttacksAndPicketRetreats();
    await reserveRidesIn(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("reserve")).toMatchObject({ might: 4, mightModifier: 0 });
  });

  test("combat then resolves normally within the same combat: Reserve (4) kills Ahri (3) and P2 keeps the Row", async () => {
    const game = await ahriAttacksAndPicketRetreats();
    await reserveRidesIn(game);
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.locationOf("reserve")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
