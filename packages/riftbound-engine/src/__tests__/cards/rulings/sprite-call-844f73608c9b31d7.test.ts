/**
 * Ruling 844f73608c9b31d7 — Sprite Call (OGN-094 → ogn-094-298) · Hidden · Action · [3]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."  (Sprite token OGN-274 → ogn-274-298)
 *
 * Q: An opponent moves into an open (uncontrolled) battlefield, starting a showdown. Can I Sprite Call a Sprite
 *    directly onto THAT battlefield?
 * A: No. The showdown does let me play the Action, but units/tokens may only be played to my base or a battlefield I
 *    control — and I don't control the battlefield being moved into. (When DEFENDING a battlefield I control, I can
 *    play the Sprite there during the showdown.)
 * Rules: 806 (Action: playable in showdowns), 344/345 (showdown at an uncontrolled battlefield; Focus), 401.4 /
 *        813.3.a (units are played to your base or a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

/** P2's turn. bf1: P1's (Warden 3). bf2: open. P2's Scout (2) in base. P1 holds Sprite Call with [3]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, SPRITE_CALL, "call");
}

const sprites = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Sprite");

/** Cast Sprite Call (P1 has Focus/priority) and pass until the Sprite's destination is asked. */
async function castToDestination(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  expect(game.p1.can("cast", "call")).toBe(true);
  await game.p1.cast("call");
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // where the Sprite is played is P1's choice
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling 844f73608c9b31d7 — Sprite Call can't drop a Sprite onto the uncontrolled battlefield an opponent is moving into", () => {
  test("Scout moves into open bf2 → a showdown starts with P2 holding Focus; once P2 passes, P1 (Focus) may play the Action Sprite Call", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "call")).toBe(false); // not yet — P2 has Focus
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "call")).toBe(true);
  });

  test("the Sprite's destination offers ONLY P1's base and P1's own bf1 — bf2 (uncontrolled, being moved into) is not a legal place; picking it is rejected", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf2");
    await game.p2.passFocus();
    const d = await castToDestination(game);
    const offered = d.options.map((o) => o.key).slice().sort();
    expect(offered).toEqual(["base", "battlefield-bf1"]);
    expect(offered).not.toContain("battlefield-bf2");
    const r = await game.p1.try((p) => p.pick("battlefield-bf2"));
    expect(r.ok).toBe(false);
    await game.p1.pick("base");
    const s = sprites(game);
    expect(s).toHaveLength(1);
    expect(game.locationOf(s[0] as string)).toBe("base");
    expect(game.state(s[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    // The showdown then ends with nobody of P1's at bf2: P2 takes it.
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — DEFENDING: Scout attacks P1's bf1 instead; during that showdown Sprite Call may put the Sprite AT bf1 (a battlefield P1 controls), where it joins the defense", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    await game.p2.passFocus();
    const d = await castToDestination(game);
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    const s = sprites(game);
    expect(s).toHaveLength(1);
    expect(game.locationOf(s[0] as string)).toBe("bf1");
    await game.settle(); // combat: Warden 3 + Sprite 3 vs Scout 2
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });
});
