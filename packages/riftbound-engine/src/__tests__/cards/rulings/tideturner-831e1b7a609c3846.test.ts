/**
 * Ruling 831e1b7a609c3846 — Tideturner (OGN-199 → ogn-199-298) · [2] · 2 Might "[Hidden] When you play me, you may choose a unit you control
 *   at another location. Move me to its location and it to my original location."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: If the unit Tideturner wants to swap with is bounced by Star-Crossed in response, does Tideturner still move to that unit's
 *    original location?
 * A: No. On resolution the chosen unit is in a non-board zone → illegal target; its location is null, so neither move happens.
 *    Tideturner stays where it is and the bounced unit stays in hand.
 * Rules: 359.3.e.2 (target moved to a non-board zone is illegal), 359.3.f (null referent → instruction ignored), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const STAR_CROSSED = "unl-128-219";

/** P1's turn: Tideturner in hand + [2]; P1's Pal (2) holds bf1. P2's Grunt (2) holds bf2; P2 has Star-Crossed + [3][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf2", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, TIDETURNER, "tt")
    .hand(P2, STAR_CROSSED, "sc");
}

/** 1. P1 plays Tideturner to base and chooses the Pal (at bf1) for the swap; the trigger is on the chain; P1 passes → P2 has priority. */
async function tideturnerTargetsPal(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("tt", { to: "base" });
  expect(game.zoneOf("tt")).toBe("base");
  if (game.decision()?.kind === "yes-no") {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
  }
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("pal");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", controller: P1, targets: ["pal"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 831e1b7a609c3846 — Star-Crossed bounces Tideturner's swap partner: Tideturner does not move", () => {
  test("control: unanswered, the swap happens — Tideturner → bf1, Pal → base", async () => {
    const game = await tideturnerTargetsPal();
    await game.p2.passPriority();
    await game.settle();
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("pal")).toBe("base");
  });

  test("2–3. P2 responds with Star-Crossed [Grunt, Pal]; it resolves first (LIFO): both go to their owners' hands while Tideturner's trigger still waits", async () => {
    const game = await tideturnerTargetsPal();
    expect(game.p2.can("cast", "sc")).toBe(true);
    await game.p2.cast("sc", { targets: ["grunt", "pal"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tt", "sc"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p1.hand()).toContain("pal");
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.p2.hand()).toContain("grunt");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", targets: ["pal"], triggered: true })]);
  });

  test("4. Tideturner's trigger then resolves against an illegal (in-hand) target: NEITHER move happens — Tideturner stays in base, the Pal stays in hand, bf1 is now empty/uncontrolled", async () => {
    const game = await tideturnerTargetsPal();
    await game.p2.cast("sc", { targets: ["grunt", "pal"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.locationOf("tt")).toBe("base"); // did NOT jump to bf1 (Pal's old location)
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
