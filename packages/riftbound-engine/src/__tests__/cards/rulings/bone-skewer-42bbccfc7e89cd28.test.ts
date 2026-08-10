/**
 * Ruling 42bbccfc7e89cd28 — Bone Skewer (UNL-139 → unl-139-219) · Spell · Chaos · 2+[chaos]
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit
 *    to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7 Might
 *   "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: I Bone Skewer my opponent's Watcher onto a battlefield I control. Does its "when you play me" hit MY units,
 *    or does it do nothing because I'm the one playing it?
 * A: The opponent is the one who plays (and controls) the Watcher; "enemy" is read from the ability's controller,
 *    so the trigger fires and YOUR units get -3 Might (min 1). The Watcher arrives under the opponent's control.
 * Rules: 108.2 (friendly/enemy relative to controller), 419.3 / 356.5.a (they play it, ignoring costs), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const WATCHER = "ogn-116-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls bf1 with a 5-might Guard there and a 2-might Runt in base. P1 holds Bone Skewer with
 * exactly [2][chaos]. P2's hand: the Watcher. P2 has a 4-might unit in its own base (must NOT be debuffed).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
    .unit(P2, "base", { might: 4, name: "P2 Bystander" }, "p2unit")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, WATCHER, "watcher");
}

/** Cast Bone Skewer choosing bf1 and settle to P1's "choose a unit from it" pick. */
async function skewerAtBf1(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  await game.p1.cast("skewer", { targets: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  return d as Extract<Decision, { kind: "pick" }>;
}

/** P1 picks the Watcher; P2 (the one PLAYING it) declines its Accelerate opt-in if the engine asks. */
async function pickWatcher(game: Game): Promise<void> {
  await game.p1.pick("watcher");
  const d = game.decision();
  if (d?.kind === "yes-no") {
    // The play belongs to P2 — any play-time opt-in is P2's to answer (419.3).
    expect(d.seat).toBe(P2);
    await game.p2.no();
  }
}

describe("Ruling 42bbccfc7e89cd28 — a Bone-Skewered Watcher is played BY the opponent, so its debuff hits the caster's units", () => {
  test("P1 chooses the Watcher from P2's revealed hand; P2 plays it to bf1 for free under P2's control, stunned, and its play trigger goes on the chain under P2's control", async () => {
    const game = await board().build();
    const d = await skewerAtBf1(game);
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["watcher"]);
    expect(d.allowDecline).toBe(true); // "You MAY choose"
    await pickWatcher(game);
    expect(game.zoneOf("watcher")).toBe("battlefield-bf1");
    expect(game.state("watcher").controller).toBe(P2);
    expect(game.state("watcher").owner).toBe(P2);
    expect(game.state("watcher").isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // "ignoring any and all costs"
    // "When you play me" DID trigger — and it is P2's ability, not P1's.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true })]);
    expect(game.zoneOf("skewer")).toBe("trash");
  });

  test("the trigger resolves reading 'enemy' from P2's side: P1's units get -3 Might (min 1), P2's bystander does not", async () => {
    const game = await board().build();
    await skewerAtBf1(game);
    await pickWatcher(game);
    // Both pass → the trigger resolves; then the bf1 showdown (stunned Watcher vs Guard) is passed through.
    await game.settle();
    expect(game.state("guard").might).toBe(2); // 5 − 3
    expect(game.state("runt").might).toBe(1); // 2 − 3 → floor of 1
    expect(game.state("p2unit").might).toBe(4); // friendly to the Watcher's controller — untouched
    expect(game.state("watcher").might).toBe(7);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // stunned Watcher dealt no combat damage
  });

  test("the debuff is 'this turn' only — gone after the turn passes", async () => {
    const game = await board().build();
    await skewerAtBf1(game);
    await pickWatcher(game);
    await game.settle();
    expect(game.state("runt").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("runt").might).toBe(2);
    expect(game.state("guard").might).toBe(5);
  });
});
