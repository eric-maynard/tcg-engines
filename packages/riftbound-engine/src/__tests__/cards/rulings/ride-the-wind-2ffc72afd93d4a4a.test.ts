/**
 * Ruling 2ffc72afd93d4a4a — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action] "Move a friendly unit and ready it."
 *   × Star-Crossed (UNL-128 → unl-128-219) · [3][chaos] [Reaction] "Return a friendly unit and an enemy unit
 *     to their owners' hands." (stands in for the Zealous-Fan style "remove every unit from the battlefield")
 *
 * Q: If an effect removes ALL units from the battlefield, can the opponent still Ride the Wind a unit back
 *    into the same combat showdown, or does the showdown end?
 * A: The showdown continues. It ends only when both players pass Focus in a row on an empty chain — an empty
 *    battlefield does not end it. A unit moved back in joins that same showdown.
 * Rules: 348 (showdown closes on consecutive passes over an empty chain), 190.4.b (control frozen while a
 *        showdown/combat is ongoing there), 344.1 (arrivals join the running showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const STAR_CROSSED = "unl-128-219";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** P1's turn: Scout (2) attacks P2's bf1 (2-Might Sentry). P1 holds Star-Crossed + Ride the Wind and a Reserve (4). */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Reserve" }, "reserve")
    .hand(P1, STAR_CROSSED, "sc")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Open the combat at bf1, then bounce BOTH units out of it with Star-Crossed. */
async function emptiedBattlefield(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
  await game.p1.cast("sc", { targets: ["scout", "sentry"] });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Star-Crossed resolves
  expect(game.zoneOf("scout")).toBe("hand");
  expect(game.zoneOf("sentry")).toBe("hand");
  return game;
}

describe("Ruling 2ffc72afd93d4a4a — emptying the battlefield does not end the showdown; a unit can be ridden back in", () => {
  test("ruling: with no units left at bf1 the showdown is still on the stack and players still have Focus", async () => {
    const game = await emptiedBattlefield();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("ruling: Ride the Wind puts a unit back into the SAME showdown — no new showdown is opened", async () => {
    const game = await emptiedBattlefield();
    if (game.decision()?.seat !== P1) {
      await game.acting().passFocus();
    }
    await game.p1.cast("rtw", { targets: "reserve" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    expect(game.state("reserve").isReady).toBe(true);
  });

  test("the showdown then closes on two consecutive passes, and the sole remaining unit takes the battlefield", async () => {
    const game = await emptiedBattlefield();
    if (game.decision()?.seat !== P1) {
      await game.acting().passFocus();
    }
    await game.p1.cast("rtw", { targets: "reserve" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("reserve")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
