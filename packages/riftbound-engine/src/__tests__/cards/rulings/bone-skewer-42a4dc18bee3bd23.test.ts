/**
 * Ruling 42a4dc18bee3bd23 — Bone Skewer (UNL-139 → unl-139-219) · Spell · Chaos · [2][chaos]
 *   "[Hidden] Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play
 *    that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 Might · [Accelerate] · "When you play me, give
 *     enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: I Bone Skewer the opponent's Watcher onto the field — whose units take the -3?
 * A: Mine. The opponent PLAYS the Watcher, so the opponent controls it and its "When you play me" trigger;
 *    "enemy" is read from that trigger's controller (the opponent), so the caster's units get -3 (min 1) and
 *    the opponent's own units are untouched.
 * Rules: 359.3.f.4 (friendly/enemy are relative to the triggered ability's controller), 108.2 (control).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const WATCHER = "ogn-116-298";

/**
 * P1's turn with exactly [2][chaos]. P1 controls bf1 with a 5-Might Guard and has a 4-Might Squire in base.
 * P2 has a 4-Might Grunt in base and the Watcher in hand (P2 has no resources — the play ignores costs).
 * P2 declines the Watcher's optional [Accelerate].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, WATCHER, "watcher")
    .script(P2, ["no"]);
}

/** Cast Bone Skewer at bf1 and drive to P1's "choose a unit from it" pick. */
async function skewerToPick(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  await game.p1.cast("skewer", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Extract<Decision, { kind: "pick" }>;
}

/** Pass priority until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      await game.settle({ maxSteps: 1 });
      continue;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 42a4dc18bee3bd23 — a Watcher forced out by Bone Skewer is the OPPONENT's play: its -3 hits the caster's units", () => {
  test("P1 is offered the Watcher from P2's revealed hand; choosing it makes P2 play it to bf1 — owner AND controller P2, stunned, for free", async () => {
    const game = await board().build();
    const d = await skewerToPick(game);
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["watcher"]);
    expect(d.allowDecline).toBe(true); // "You MAY choose a unit"
    await game.p1.pick("watcher");
    // The Watcher is P2's play: its chain item / play trigger is controlled by P2.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2 })]);
    await resolveChain(game);
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.state("watcher").owner).toBe(P2);
    expect(game.state("watcher").controller).toBe(P2);
    expect(game.state("watcher").isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("'enemy units' is read from P2's side: P1's Guard (5→2) and Squire (4→1, minimum 1) take -3; P2's Grunt stays at 4", async () => {
    const game = await board().build();
    await skewerToPick(game);
    await game.p1.pick("watcher");
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    // Inspect right after the trigger resolved (the Watcher's arrival at P1's bf1 has opened a combat showdown).
    expect(game.state("guard").might).toBe(2);
    expect(game.state("squire").might).toBe(1);
    expect(game.state("grunt").might).toBe(4);
    expect(game.state("watcher").might).toBe(7); // not its own enemy
    // Drive through the combat; the debuff is "this turn" and persists afterwards.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("squire").might).toBe(1);
    expect(game.state("grunt").might).toBe(4);
    expect(game.zoneOf("skewer")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
