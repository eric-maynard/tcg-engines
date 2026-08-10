/**
 * Ruling 12f3b2717ca68437 — Temporal Breach (VEN-066 → ven-066-166) · Mind · [2][mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *
 * Q: Cast on a unit at a battlefield you control — does it start a showdown?
 * A: No, if the unit's owner already controls that battlefield: Contested only applies when a unit becomes present at a battlefield its
 *    controller doesn't control (190.3.a.1), so replaying your own unit to your own battlefield stages nothing. Caveat: cast on an
 *    OPPONENT's unit sitting at a battlefield you control, the opponent replays it to a battlefield they don't control ⇒ Contested ⇒ a
 *    (combat) showdown is staged at the next cleanup.
 * Rules: 190.3.a.1 (Contested), 344–345 / 464 (showdown / combat staged at cleanup), 419 (play via effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 12f3b2717ca68437 — Temporal Breach on a battlefield you control: no showdown for your own unit; a showdown for an enemy unit there", () => {
  test("own unit at own battlefield: Breach resolves (banish → replayed to bf1 for free, fresh — damage gone), bf1 never becomes Contested, no showdown opens, no points; P1 is straight back in the main phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper", { damage: 1 })
      .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    await game.p1.cast("breach", { targets: "keeper" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    let everContested = false;
    let everShowdown = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      everContested ||= game.gameState.battlefields.bf1?.contested === true;
      everShowdown ||= showdown(game)?.active === true || (d?.kind === "action" && d.context === "showdown");
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(everContested).toBe(false);
    expect(everShowdown).toBe(false);
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.state("keeper")).toMatchObject({ controller: P1, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("caveat — an OPPONENT's unit at a battlefield P1 controls: P2 replays it to bf1 (which P2 doesn't control) ⇒ bf1 becomes Contested by P2 and a COMBAT showdown is staged (P2 attacking, P1 defending)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper")
      .unit(P2, "bf1", { might: 2, name: "Intruder" }, "intruder")
      .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    await game.p1.cast("breach", { targets: "intruder" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Breach resolves: banish → P2 plays the Intruder back to bf1
    expect(game.zoneOf("intruder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // The combat plays out: Intruder (2) into Keeper (3) dies; P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });
});
