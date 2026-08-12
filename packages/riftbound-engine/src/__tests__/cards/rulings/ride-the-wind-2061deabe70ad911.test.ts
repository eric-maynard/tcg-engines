/**
 * Ruling 2061deabe70ad911 — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Player A moves onto an OPEN battlefield; player B answers with Ride the Wind, sending a unit to
 *    the same battlefield. Who is the attacker?
 * A: Player A — the player who applied the Contested status. A's move opens a non-combat showdown;
 *    Ride the Wind resolves inside it, and only when that showdown closes does the combat showdown
 *    open, with A still remembered as the one who contested the battlefield.
 * Rules: 344.1 / 450 / 453 (contesting opens a showdown; the contester is remembered),
 *        465.1.a–b (attacker vs defender designation), 347 (Action spells in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P1's turn ("player A"). bf1 is open and uncontrolled. P1 has a 5-Might Vanguard ready in base;
 * P2 ("player B") has a 3-Might Interceptor in base plus Ride the Wind and exactly [2][chaos].
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 5, name: "Vanguard" }, "vanguard")
    .unit(P2, "base", { might: 3, name: "Interceptor" }, "interceptor")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** A moves in (non-combat showdown, A contests); A passes Focus; B rides the Interceptor in. */
async function aMovesThenBRides(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "interceptor" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      const key = d.options.find((o) => o.key === "bf1" || o.key === "battlefield-bf1")?.key;
      await game.p2.pick(key ?? "bf1");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("interceptor")).toBe("bf1");
  return game;
}

describe("Ruling 2061deabe70ad911 — the player who applied Contested status is the attacker, not the one who rode in afterwards", () => {
  test("step 1: A's move opens a NON-combat showdown at the open battlefield and records A as the contester", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(game.p2.units("bf1")).toEqual([]); // nobody to fight yet — non-combat
    expect(game.state("vanguard").combatRole).not.toBe("defender");
  });

  test("step 2: Ride the Wind resolves inside that showdown — the Interceptor arrives READY (the spell readies it) and the battlefield is still contested by A", async () => {
    const game = await aMovesThenBRides();
    expect(game.state("interceptor").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("ruling: with both units present the designations name A's Vanguard the ATTACKER and B's Interceptor the defender — Ride the Wind did not make B the aggressor", async () => {
    const game = await aMovesThenBRides();
    expect(game.state("vanguard").combatRole).toBe("attacker");
    expect(game.state("interceptor").combatRole).toBe("defender");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    // Focus is back with A, the contester, to act in the showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("epilogue: the combat plays out with A attacking — the 5-Might Vanguard beats the 3-Might Interceptor and A conquers bf1", async () => {
    const game = await aMovesThenBRides();
    await game.settle();
    expect(game.zoneOf("interceptor")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // A conquered — a defender would have scored nothing
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
