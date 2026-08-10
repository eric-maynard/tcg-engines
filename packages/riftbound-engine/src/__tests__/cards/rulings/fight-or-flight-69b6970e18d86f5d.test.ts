/**
 * Ruling 69b6970e18d86f5d — Fight or Flight (OGN-168 → ogn-168-298) · Action · Chaos · [2] · [Hidden]
 *   "Move a unit from a battlefield to its base."
 *   × Blitzcrank, Impassive (ogn-067-298, [5][calm], 5 Might, Tank) — "When you play me, [if I'm at a battlefield] you may
 *     move an enemy unit to here." (The ruling's "Blitz pulling a unit"; Kayn ogn-189-298 is only a nuance.)
 *
 * Q: Can a HIDDEN Fight or Flight target a unit at a different battlefield than where it's hidden, and how does it
 *    resolve when played in reaction to Blitz pulling a unit?
 * A: From hidden it may only choose units at ITS battlefield. Reacting to Blitz: Fight or Flight resolves first and sends
 *    the unit to base; Blitz's ability (no location restriction on its target) then STILL resolves and moves that unit
 *    from base to Blitz's battlefield.
 * Rules: 811.1.d.2 (hidden-play targeting: "here"), 340 (LIFO), 359.3.e (target still legal in its new valid location).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const BLITZCRANK = "ogn-067-298";

/**
 * P2's turn (turn 3). P1 controls bf1 (Runner 3 + Anchor 2, Fight or Flight facedown there since an earlier turn) and
 * bf3 (Far 2). P2 controls bf2 (Holder 2) and plays Blitzcrank there with [5][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "bf3", { might: 2, name: "Far" }, "far")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .hand(P2, BLITZCRANK, "blitz")
    .resources(P2, { energy: 5, power: { calm: 1 } });
}

/** P2 plays Blitz to bf2, accepts the pull choosing Runner (bf1); P2 passes so P1 holds priority with the pull on the chain. */
async function blitzPullsRunnerP1ToRespond(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("blitz", { to: "bf2" });
  for (let i = 0; i < 5; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d.kind === "pick" && d.seat === P2) {
      // Blitz has no location restriction: any enemy unit anywhere is offered.
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["anchor", "far", "runner"]);
      await game.p2.pick("runner");
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P2, targets: ["runner"], triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 69b6970e18d86f5d — hidden Fight or Flight only targets 'here'; vs Blitz's pull the unit goes to base, then Blitz still drags it over", () => {
  test("flipping the hidden Fight or Flight at bf1: its target choice offers ONLY the units at bf1 (Runner, Anchor) — not Far at bf3, not Blitz/Holder at bf2", async () => {
    const game = await blitzPullsRunnerP1ToRespond();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fof" } });
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["anchor", "runner"]);
    expect((await game.p1.try((p) => p.pick("far"))).ok).toBe(false);
    await game.p1.pick("runner");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blitz", "fof"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, targets: ["runner"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // from hidden: [0]
  });

  test("LIFO: Fight or Flight resolves first — Runner goes from bf1 to P1's base; Blitz's pull is still pending on Runner", async () => {
    const game = await blitzPullsRunnerP1ToRespond();
    await game.p1.reveal("fof");
    await game.p1.pick("runner");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.p1.base()).toContain("runner");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["runner"], triggered: true })]);
  });

  test("Blitz's ability then STILL resolves (its target has no location requirement): Runner is moved from base to bf2, Blitz's battlefield", async () => {
    const game = await blitzPullsRunnerP1ToRespond();
    await game.p1.reveal("fof");
    await game.p1.pick("runner");
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.locationOf("blitz")).toBe("bf2");
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.locationOf("far")).toBe("bf3");
    expect(game.violations()).toEqual([]);
  });
});
