/**
 * Ruling ea8382a4477b49fc — Ride the Wind (OGN-173 → ogn-173-298) · Spell · [Action] · Chaos · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: If I use Ride the Wind during a showdown at one battlefield to open a showdown at ANOTHER, what
 *    happens? Can I score on my opponent's turn?
 * A: Only one showdown runs at a time. The new battlefield's showdown is STAGED and waits; the first
 *    showdown finishes, then the staged one immediately begins. Winning that second showdown conquers, and
 *    yes — you score on your opponent's turn. (You still only score each battlefield once per turn.)
 * Rules: 344 (only one showdown may be active; further ones are staged), 460–466 (showdown / combat),
 *        471.2 (a conquer scores whenever it happens), 471.2.b (each battlefield scores once per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

const stack = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/** P2 attacks bf1 and passes Focus; P1, holding Focus in that showdown, rides the Striker onto the empty bf2. */
async function openSecond(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("rtw", { targets: "striker" });
  for (let i = 0; i < 10 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.zone ?? o.key).includes("bf2"))?.key ?? d.options[0]!.key);
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

/**
 * P2's turn. P2's Raider attacks P1's bf1 (a real combat showdown). P1 also has a Striker in base,
 * Ride the Wind in hand with [2][chaos], and bf2 sits empty and uncontrolled.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .victoryScore(20)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling ea8382a4477b49fc — a second showdown is staged behind the first, then runs and can score off-turn", () => {
  test("premise: P2's attack on bf1 opens the only active showdown; P1 holds Focus after P2 passes", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ active: true, battlefieldId: "bf1" });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("ruling: Ride the Wind onto the empty bf2 STAGES a second showdown — the bf1 combat is still the active one", async () => {
    const game = await board().build();
    await openSecond(game);
    expect(game.locationOf("striker")).toBe("bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    // Staged, not begun: bf2 is Contested and records who staged it, but the only ACTIVE showdown is bf1's.
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, showdownComplete: false, stagedBy: P1 });
    const entries = stack(game);
    expect(entries.filter((s) => s.active)).toHaveLength(1); // only ONE showdown may be active
    expect(entries.find((s) => s.active)?.battlefieldId).toBe("bf1"); // still the original one
  });

  test("…once the bf1 combat finishes the staged bf2 showdown begins on its own, with P1 (who contested it) on Focus", async () => {
    const game = await board().build();
    await openSecond(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ showdownComplete: true, controller: P2 });
    const active = stack(game).find((s) => s.active);
    expect(active).toMatchObject({ autoBegun: true, battlefieldId: "bf2", focusPlayer: P1 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(null); // not conquered yet
  });

  test("…and when that second showdown finishes P1 conquers bf2 and SCORES, on P2's turn", async () => {
    const game = await board().build();
    await openSecond(game);
    await game.settle(); // bf1 combat
    await game.settle(); // the staged bf2 showdown
    expect(game.turnPlayer()).toBe(P2); // still the opponent's turn
    expect(game.zoneOf("holder")).toBe("trash"); // bf1 combat: Raider 3 beats Holder 1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.locationOf("striker")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // second showdown resolved
    expect(game.p1.points()).toBe(1); // scored on P2's turn
    expect(stack(game).filter((s) => s.active)).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });
});
