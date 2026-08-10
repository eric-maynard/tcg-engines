/**
 * Ruling cc605b7cbac990b5 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · 2 · "Move a friendly unit and ready it."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · "[Hidden] When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *   × Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · [Ganking]
 *
 * Q: I have a hidden Tideturner and Kayn at my battlefield; the opponent attacks it (showdown). I Ride the Wind Kayn
 *    to base, leaving the battlefield empty of my units. Is my hidden card discarded for losing control, or can I
 *    still play it before the showdown ends?
 * A: You keep control — battlefield control cannot change while a combat/showdown is ongoing, units or not — so the
 *    hidden Tideturner is NOT discarded and you may still flip it as a Reaction during the showdown. Control is only
 *    re-evaluated after the showdown fully resolves.
 * Rules: 187.4.b (no control change during combat), 811 (play a Hidden card for [0] as a Reaction), 323 (cleanup after combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const TIDETURNER = "ogn-199-298";
const KAYN_UNLEASHED = "ogn-189-298";

/** P2's turn. P1 controls bf1 with Kayn (6) + a facedown Tideturner; exactly [2][chaos] for Ride the Wind. P2's Raider (3) attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KAYN_UNLEASHED, "kayn")
    .facedown(P1, "bf1", TIDETURNER, "tt")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Raider attacks bf1 (showdown, P2 has Focus and passes it); P1 Rides the Wind Kayn to base and it resolves. */
async function kaynRidesHome(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true); // an [Action] is playable inside a showdown
  await game.p1.cast("rtw", { targets: "kayn" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("base");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1, targets: ["kayn"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ride the Wind resolves
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling cc605b7cbac990b5 — emptying my battlefield mid-showdown does not cost me control or my hidden card", () => {
  test("after Ride the Wind resolves Kayn is in base READY, bf1 holds only the enemy Raider — yet the showdown is still on, bf1 is still controlled by P1, and the facedown Tideturner is still there", async () => {
    const game = await kaynRidesHome();
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn").isReady).toBe(true);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["raider"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("tt")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["tt"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("P1 still gets to act in the showdown and CAN flip the hidden Tideturner for [0]: it enters play at bf1 (its play trigger is offered) instead of ever being discarded", async () => {
    const game = await kaynRidesHome();
    // Focus comes back round to P1 within the same showdown.
    for (let i = 0; i < 4 && !(game.actingSeat() === P1 && game.decision()?.kind === "action"); i++) {
      await game.p2.pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.state("tt").isHidden).toBe(false);
    // Its "when you play me, you may…" is asked — proof it was PLAYED, not trashed.
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.no();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still mid-showdown
    expect(game.violations()).toEqual([]);
  });

  test("control is only re-evaluated once the showdown fully resolves: if P1 does nothing more, the Raider takes bf1 at the end and only THEN is the still-hidden Tideturner trashed", async () => {
    const game = await kaynRidesHome();
    // While anything of the showdown remains, tt stays facedown and bf1 stays P1's.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(game.zoneOf("tt")).toBe("facedown-bf1");
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
      await game.seat(d.seat).pass();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("kayn")).toBe("base");
  });
});
