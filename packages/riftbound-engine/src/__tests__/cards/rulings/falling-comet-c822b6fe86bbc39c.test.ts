/**
 * Ruling c822b6fe86bbc39c — Falling Comet (OGN-085 → ogn-085-298) · Action [5] "Deal 6 to a unit at a battlefield."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction [2][rainbow] "Banish a friendly unit, then its owner plays it to
 *     any battlefield, ignoring its cost."
 *
 * Q: I Falling Comet a unit at a battlefield; the opponent responds with Thrill of the Hunt on it. Does the Comet still hit?
 * A: No. Thrill resolves first (LIFO): the unit is banished (a non-board zone) and re-played, so it is a new object and the
 *    Comet's targeting is severed. Falling Comet then resolves with an illegal target and deals no damage.
 * Rules: 359.3.e.7 (mistargeted instruction does not execute), 1xx zone-change = new object, LIFO chain resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_COMET = "ogn-085-298";
const THRILL = "unl-184-219";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Prey" }, "prey")
    .unit(P2, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P2, THRILL, "thrill");
}

async function cometThenThrill(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("comet", { targets: "prey" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1, targets: ["prey"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "prey" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "thrill"]);
  return game;
}

describe("Ruling c822b6fe86bbc39c — Thrill of the Hunt in response makes Falling Comet miss", () => {
  test("Thrill resolves first: Prey is banished and re-played to a battlefield of P2's choice (P2 is asked)", async () => {
    const game = await cometThenThrill();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Thrill resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bf1");
    await game.p2.pick("battlefield-bf1");
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    // Falling Comet is still on the chain, waiting to resolve.
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet"]);
  });

  test("Falling Comet then resolves against a severed target: Prey (same battlefield, new object) takes NO damage and survives", async () => {
    const game = await cometThenThrill();
    await game.p2.passPriority();
    await game.p1.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.state("prey").damage).toBe(0);
    expect(game.state("anchor").damage).toBe(0); // it did not retarget either
    expect(game.p1.energy()).toBe(0); // costs are not refunded
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Thrill response Falling Comet deals 6 and kills the 3-Might Prey", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "prey" });
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("trash");
  });
});
