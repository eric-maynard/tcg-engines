/**
 * Ruling a0421e38176d59fc — Relentless Storm (Volibear legend, OGN-249 → ogn-249-298)
 *     "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction "Give a unit -1 Might this turn, to a minimum of 1. Draw 1."
 *   (Fox-Fire OGN-256 is only cited in the answer as a contrast about target re-checks.)
 *
 * Q: Can the opponent respond with a Might-reducing Reaction to drop the played unit below 5 and stop Volibear's channel?
 * A: No. The trigger condition is checked once, when the Mighty unit is played; the ability is then on the chain and
 *    resolves (exhaust Volibear, channel 1 rune exhausted) regardless of the unit's Might at resolution.
 * Rules: 383 (triggered abilities check their condition when they trigger), 780 (Mighty = 5+ Might), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_STORM = "ogn-249-298";
const STUPEFY = "ogn-095-298";
const BIG = { cardType: "unit", energyCost: 5, might: 5, name: "Big" } as const;

/** P1's turn 3, Volibear legend, a printed-5 Big in hand with [5]. P2: Stupefy with [1][mind]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 1, power: { mind: 1 } })
    .legend(P1, RELENTLESS_STORM, "voli")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, BIG, "big")
    .hand(P2, STUPEFY, "stupefy");
}

/** P1 plays Big (Mighty on arrival) and accepts Volibear's "you may"; returns with the trigger on the chain and P2 holding priority. */
async function bigPlayedTriggerPending(): Promise<{ game: Game; runesBefore: number }> {
  const game = await board().build();
  const runesBefore = game.p1.runes().length;
  await game.p1.play("big");
  expect(game.state("big")).toMatchObject({ might: 5, zone: "base" });
  // The legend's play-trigger is on the chain; P1 is asked the optional "exhaust me" question.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
  expect(game.p1.runes()).toHaveLength(runesBefore); // nothing channeled yet — it must resolve first
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return { game, runesBefore };
}

describe("Ruling a0421e38176d59fc — reducing the unit's Might in response doesn't stop Volibear's channel", () => {
  test("control: nobody responds → the trigger resolves, Volibear is exhausted and P1 channels 1 rune exhausted", async () => {
    const { game, runesBefore } = await bigPlayedTriggerPending();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state(game.p1.runes().at(-1) as string).isExhausted).toBe(true);
  });

  test("P2 Stupefies Big in response (it lands above the trigger); Stupefy resolves first: Big 5 → 4 (no longer Mighty) while Volibear's trigger is still on the chain", async () => {
    const { game } = await bigPlayedTriggerPending();
    await game.p2.cast("stupefy", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "stupefy"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("big").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", countered: false, triggered: true })]);
  });

  test("…and the trigger STILL resolves: Volibear exhausted, 1 rune channeled exhausted — Big's current 4 Might is irrelevant", async () => {
    const { game, runesBefore } = await bigPlayedTriggerPending();
    await game.p2.cast("stupefy", { targets: "big" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("big").might).toBe(4);
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state(game.p1.runes().at(-1) as string).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
