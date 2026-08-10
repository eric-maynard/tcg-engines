/**
 * Ruling 59f890117e886820 — Temporal Portal (SFD-078 → sfd-078-221) · Mind gear · [3]
 *   "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action spell · [2][order] — "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Portal gives Hidden Blade Repeat; I "kill" the same enemy unit twice with it. How many cards does each player draw?
 * A: You draw 0; the opponent draws 2 total. First execution kills the unit → its controller draws 2. Second
 *    execution tries to kill an already-dead unit → the kill is ignored, and the linked draw is ignored with it.
 * Rules: 820 (Repeat: each execution evaluated independently), 359.3.e.14 (linked instructions — later ones are
 *        ignored when the earlier one is), 359.3.f.2.a (illegal/absent target → instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_PORTAL = "sfd-078-221";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn. P2 holds bf1 with Victim (3) and Bystander (2). P1: Temporal Portal ready in base, Hidden Blade in
 * hand, exactly [4] + 3 order = Portal's [rainbow] (1) + Blade [2][order] + one Repeat [2][order].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["a1", "a2", "a3", "a4"])
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
}

/** Activate the Portal, then cast Hidden Blade with one Repeat, both executions aimed at Victim. Leaves it on the chain. */
async function portalThenRepeatedBladeAtVictim(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } });
  // The Portal granted Repeat to the next spell: the cast offers a repeat count.
  const fields = game.p1.option("cast", "blade")?.fields ?? [];
  expect(fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
  await game.p1.cast("blade", { repeat: 1, targets: ["victim"] });
  // Repeat cost = the Blade's own cost again → everything spent.
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
  return game;
}

describe("Ruling 59f890117e886820 — repeated Hidden Blade at one unit: only the first execution kills and draws", () => {
  test("Portal → Blade with Repeat ×1 at Victim: one chain item, full cost paid twice, nothing dead or drawn yet", async () => {
    const game = await portalThenRepeatedBladeAtVictim();
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("on resolution the first execution kills Victim; Bystander is untouched; the caster (P1) draws nothing", async () => {
    const game = await portalThenRepeatedBladeAtVictim();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual([]); // "you draw 0 cards total"
    expect(game.p1.deck()[0]).toBe("a1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: the second execution's kill is ignored (Victim already dead) and so is its LINKED "its controller draws 2"
  // → P2 draws exactly 2 in total. Actual: the engine runs the draw for the second execution too — P2 draws 4.
  test("ruling 59f890117e886820 — engine lets the second (ignored-kill) execution still draw: P2 draws 4 instead of 2", async () => {
    const game = await portalThenRepeatedBladeAtVictim();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toEqual(["d1", "d2"]); // opponent draws 2 total, not 4
    expect(game.p2.deck()[0]).toBe("d3");
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
