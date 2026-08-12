/**
 * Ruling a9681910ad3d69b7 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: Can Ride the Wind move a unit that has no [Ganking] from battlefield to battlefield, and does that start a
 *    showdown?
 * A: Yes. Ride the Wind carries no movement restriction, so any unit moves battlefield → battlefield with it.
 *    Arriving at a battlefield always starts a showdown — occupied or not; occupied by the enemy it is a combat,
 *    and whoever applied Contested first is the attacker. The STANDARD move keeps its [Ganking] restriction.
 * Rules: 442 / 726 ([Ganking] gates only the standard battlefield→battlefield move), 347/348 (arriving at a
 *        battlefield stages a showdown), 450 / 464.2.c (first to make it contested = Attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn 3. P1 holds bf1 with a plain (no-[Ganking]) Runner; bf2 is open, or held by P2 with a Guard on it. */
function board(bf2: "open" | "enemy") {
  const b = scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: bf2 === "enemy" ? P2 : null })
    .unit(P1, "bf1", { might: 4, name: "Runner" }, "runner")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, RIDE_THE_WIND, "rtw");
  return bf2 === "enemy"
    ? b.unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    : b.unit(P2, "base", { might: 1, name: "Scout" }, "scout");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Ride the Wind on the Runner and send it to bf2 (the destination is a bound `choose-destination` pick). */
async function rideTo(game: Game, to: string): Promise<void> {
  await game.p1.cast("rtw", { answers: [to], targets: "runner" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

/** Pass focus/priority for whoever is asked until the position is open again (a non-combat showdown needs both passes). */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling a9681910ad3d69b7 — Ride the Wind moves battlefield→battlefield without [Ganking], and arriving always starts a showdown", () => {
  test("baseline: the Runner has no [Ganking], so the STANDARD move bf1 → bf2 is illegal (only bf1 → base is offered)", async () => {
    const game = await board("open").build();
    expect(game.state("runner").keywords).not.toContain("Ganking");
    const bad = await game.p1.try((p) => p.move("runner", "bf2"));
    expect(bad.ok).toBe(false);
    const gank = await game.p1.try((p) => p.gank("runner", "bf2"));
    expect(gank.ok).toBe(false);
    expect(game.locationOf("runner")).toBe("bf1");
  });

  test("Ride the Wind moves that same Runner bf1 → bf2 anyway, readies it, and stages a (non-combat) showdown at the EMPTY bf2", async () => {
    const game = await board("open").build();
    await rideTo(game, "bf2");
    expect(game.state("runner")).toMatchObject({ isReady: true, location: "bf2" });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2" });
    // rule 450 — P1 applied Contested to bf2 first, so P1 is the attacker there.
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("…and with no enemy unit at bf2 the combat step never opens: the showdown just closes and P1 conquers bf2", async () => {
    const game = await board("open").points(P1, 1).build();
    await rideTo(game, "bf2");
    expect(game.state("runner").combatRole).not.toBe("defender");
    await passUntilOpen(game);
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("if the enemy already holds bf2 the very same Ride the Wind makes it a COMBAT showdown — Runner is the attacker, the sitting unit the defender", async () => {
    const game = await board("enemy").build();
    await rideTo(game, "bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    await passUntilOpen(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 4 vs 2
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
