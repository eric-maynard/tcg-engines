/**
 * Ruling 2b898c8c440acd05 — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action] "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit."
 *
 * Q: On the opponent's turn they Charm my unit off battlefield A onto battlefield B; I answer with Ride the
 *    Wind and move it back to A. Do I score conquest on A?
 * A: Yes (assuming you had not already scored A this turn). Losing your only unit at A drops your control of
 *    it, so coming back is a fresh conquer. The scoring happens when the showdowns resolve, not the moment
 *    Ride the Wind resolves — and conquering scores on the opponent's turn just as well as on your own.
 * Rules: 323.6 (control lapses at a Cleanup in an Open State with no unit of yours there), 323.12/323.13
 *        (staged showdowns begin only in a Neutral Open State), 348.2.a / 466.5 (conquer on close),
 *        469/470 (Conquer scores once per player per battlefield per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/**
 * P2's turn. P1 holds bfA with its only unit there (Holder, 3). P2 holds bfB with a 1-Might Watcher.
 * P2 has Charm + [1][calm]; P1 has Ride the Wind + [2][chaos].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bfB", { might: 1, name: "Watcher" }, "watcher")
    .hand(P2, CHARM, "charm")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 Charms the Holder from bfA to bfB (contesting bfB) and lets the spell resolve. */
async function charmedAway(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  await game.p2.cast("charm", { targets: "holder", answers: ["bfB"] });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("holder")).toBe("bfB");
  return game;
}

describe("Ruling 2b898c8c440acd05 — riding back to the battlefield you were Charmed off re-conquers it, on their turn", () => {
  test("step 1: the Charm drags the Holder to bfB and opens the combat there; P1 no longer holds bfA", async () => {
    const game = await charmedAway();
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bfB" });
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(null); // control lapsed — no unit of P1 there
    expect(game.p1.points()).toBe(0);
  });

  test("step 2: P1 rides the Holder back to bfA — that stages a showdown at bfA while bfB's is still running", async () => {
    const game = await charmedAway();
    if (game.decision()?.seat !== P1) {
      await game.acting().passFocus();
    }
    await game.p1.cast("rtw", { targets: "holder" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfA");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("holder")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bfA?.controller).toBe(null); // not scored yet
    expect(game.p1.points()).toBe(0);
  });

  test("ruling: after the showdowns resolve P1 conquers bfA and scores 1 — on P2's turn", async () => {
    const game = await charmedAway();
    if (game.decision()?.seat !== P1) {
      await game.acting().passFocus();
    }
    await game.p1.cast("rtw", { targets: "holder" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfA");
    }
    for (let i = 0; i < 12 && stack(game).length > 0; i++) {
      await game.settle();
      if (stack(game).length > 0) {
        await game.acting().pass();
      }
    }
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("holder")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
