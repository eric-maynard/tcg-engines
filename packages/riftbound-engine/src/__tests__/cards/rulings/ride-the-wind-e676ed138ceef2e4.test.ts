/**
 * Ruling e676ed138ceef2e4 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *
 * Q: Both battlefields are empty and my opponent moves into battlefield A (opening a showdown). May I play
 *    Ride the Wind to move one of my units from base to battlefield B instead of into the showdown, and what
 *    happens then?
 * A: Yes — nothing makes you name the showdown's battlefield. The first showdown finishes first, then the
 *    second (staged at B) begins, and each side conquers the battlefield it is alone at.
 * Rules: 355.4 (the mover's destination is a free choice among legal ones), 310.3 / 344.2 (a showdown is staged
 *        and only begins from a Neutral Open State — one at a time), 348.2.a (a non-combat showdown ends with
 *        the sole occupant establishing control = a Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** Turn 3, P2's turn. Both battlefields are empty and uncontrolled. P2 has a Raider; P1 has a Runner + Ride the Wind. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } });
}

/** P2 walks into the empty bf1, opening a non-combat showdown there. */
async function openShowdownAtBf1(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.locationOf("raider")).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBeTruthy();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
}

describe("Ruling e676ed138ceef2e4 — Ride the Wind may name a battlefield other than the one in showdown", () => {
  test("during P2's showdown at bf1, P1's Ride the Wind offers bf2 as a destination — the showdown's battlefield is not forced", async () => {
    const game = await board().build();
    await openShowdownAtBf1(game);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    const dests = game.p1.option("cast", "rtw")?.fields.find((f) => f.arg === "to" || f.name === "location")?.options;
    if (dests) {
      expect(dests).toContain("bf2");
    }
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isReady).toBe(true); // "and ready it"
    expect(game.violations()).toEqual([]);
  });

  test("the second showdown is only STAGED while the first is live — bf1's showdown resolves first", async () => {
    const game = await board().build();
    await openShowdownAtBf1(game);
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf2"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.battlefields.bf2?.contested).toBeTruthy();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // still inside the bf1 showdown
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // nothing settled yet
  });

  test("ruling: both showdowns run, one after the other — P2 conquers bf1 and P1 conquers bf2, a point each", async () => {
    const game = await board().build();
    await openShowdownAtBf1(game);
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf2"] });
    await game.settle(); // the bf1 showdown closes; the bf2 one then opens with P1 holding focus
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.contested).toBeTruthy();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("the alternative was open too: naming bf1 instead joins the existing showdown and turns it into a combat", async () => {
    const game = await board().build();
    await openShowdownAtBf1(game);
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "runner", answers: ["bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").combatRole).toBeTruthy();
    expect(game.gameState.battlefields.bf2?.contested).toBeFalsy();
  });
});
