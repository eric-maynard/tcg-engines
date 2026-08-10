/**
 * Ruling bfd6f1ee69c8c6d1 — Kayn, Unleashed (OGN-189 → ogn-189-298) 6 Might "[Ganking] If I have moved twice this turn, I don't take
 *   damage." × Ride the Wind (OGN-173 → ogn-173-298) Action [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Kayn Rides the Wind (his second move) into an enemy battlefield, is readied, can't conquer, takes no damage and is sent back
 *    to base. Does he keep his Ready status?
 * A: Yes. A recall changes location only — damage, ready/exhausted, buffs etc. are unaffected unless the recall's source says so.
 *    Kayn ends in base READY (and may act again this turn).
 * Rules: 449 / 466.1 (surviving attackers that don't conquer are recalled), recall keeps state, Kayn's no-damage static.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn with [2][chaos]. P1 holds bf2 (Holder 2); P2 holds bf1 with an 8-Might Wall (NOT stunned — it hits for 8). Kayn ready in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", KAYN, "kayn")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Move 1: standard move base → own bf2 (exhausts). Move 2: Ride the Wind bf2 → bf1 (readies). */
async function twoMovesIntoBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kayn", "bf2");
  await game.settle();
  expect(game.state("kayn")).toMatchObject({ isExhausted: true, location: "bf2" });
  await game.p1.cast("rtw", { targets: "kayn" });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling bfd6f1ee69c8c6d1 — Kayn recalled after a failed conquer keeps the Ready he got from Ride the Wind", () => {
  test("after the second move Kayn is at bf1 READY, attacking the Wall; this was his second move this turn", async () => {
    const game = await twoMovesIntoBf1();
    expect(game.state("kayn")).toMatchObject({ combatRole: "attacker", isReady: true, location: "bf1" });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("combat: Kayn takes NO damage from the Wall's 8 (moved twice), his 6 doesn't kill the Wall (8) → no conquer, and Kayn is RECALLED to base…", async () => {
    const game = await twoMovesIntoBf1();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn").damage).toBe(0);
  });

  test("…and the recall leaves his state alone: Kayn is in base READY (not exhausted), so he can even move again this turn", async () => {
    const game = await twoMovesIntoBf1();
    await game.settle();
    expect(game.state("kayn")).toMatchObject({ isExhausted: false, isReady: true, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("kayn", "bf2");
    expect(game.locationOf("kayn")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });
});

void P2;
