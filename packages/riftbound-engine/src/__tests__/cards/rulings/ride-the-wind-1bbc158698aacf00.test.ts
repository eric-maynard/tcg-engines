/**
 * Ruling 1bbc158698aacf00 — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Can I score a battlefield twice in one turn — once by HOLDING it in my Beginning Phase, then
 *    again by riding my unit off it and back on to CONQUER it during my Action Phase?
 * A: No. A battlefield scores at most once per turn, whichever way it is scored. The Beginning
 *    Phase hold is part of that turn, so the later conquer takes the battlefield back but adds no
 *    point.
 * Rules: 465 / 471.2 (each battlefield scores once per turn), 469 (holding scores in the Beginning
 *        Phase), 323.6 / 190.4 (control lapses when no unit of the controller is there in an Open
 *        State), 348.2.a / 466.5 (conquering re-establishes control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * Turn 2, P2 active, so one `advanceTurn()` starts P1's turn (and its Beginning-Phase hold scoring).
 * `holder` tells us whether P1 already owns bf1 when their turn begins.
 */
function board(holds: boolean) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(20)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: holds ? P1 : null })
    .unit(P1, "base", { might: 4, name: "Rider" }, "rider")
    .hand(P1, RIDE_THE_WIND, "rtw");
  return holds ? s.unit(P1, "bf1", { might: 2, name: "Holder" }, "holder") : s;
}

/**
 * Ride the Wind on `unit` (the pools are empty after a turn advance, so top them up first),
 * then close the non-combat showdown the arrival opens.
 */
async function ride(game: Game, unit: string, to: string): Promise<void> {
  await game.p1.do("addResources", { energy: 2, power: { chaos: 1 } });
  await game.p1.cast("rtw", { targets: unit });
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const key = d.options.find((o) => o.key === to || o.key === `battlefield-${to}` || o.card === to)?.key;
      await game.p1.pick(key ?? to);
      continue;
    }
    if (d?.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
      continue;
    }
    break;
  }
}

describe("Ruling 1bbc158698aacf00 — holding bf1 in the Beginning Phase spends its one score for the turn; a later Ride-the-Wind conquer adds nothing", () => {
  test("step 1: P1 begins the turn holding bf1 and scores exactly 1 point for holding", async () => {
    const game = await board(true).build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("step 2: moving the Holder off bf1 in the open Action Phase makes P1 lose control (323.6) — the battlefield is up for grabs again", async () => {
    const game = await board(true).build();
    await game.advanceTurn();
    await game.p1.move("holder", "base");
    expect(game.locationOf("holder")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("ruling: riding the Rider back onto the now-uncontrolled bf1 CONQUERS it, yet P1 stays on 1 point — no second score for the same battlefield this turn", async () => {
    const game = await board(true).build();
    await game.advanceTurn();
    await game.p1.move("holder", "base");
    expect(game.p1.points()).toBe(1);
    await ride(game, "rider", "bf1");
    expect(game.locationOf("rider")).toBe("bf1");
    expect(game.state("rider").isReady).toBe(true); // "and ready it"
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control retaken …
    expect(game.p1.points()).toBe(1); // … but no point
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: the very same Ride-the-Wind conquer on a turn where bf1 was NOT held at the Beginning Phase does score 1 — it is the earlier hold that used the battlefield up", async () => {
    const game = await board(false).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0); // nothing held ⇒ nothing scored in the Beginning Phase
    await ride(game, "rider", "bf1");
    expect(game.locationOf("rider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
