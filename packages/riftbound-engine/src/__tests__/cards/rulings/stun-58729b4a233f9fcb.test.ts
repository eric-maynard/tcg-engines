/**
 * Ruling 58729b4a233f9fcb — Radiant Dawn (OGN-261 → ogn-261-298) · Leona Legend ·
 *   "When you stun one or more enemy units, buff a friendly unit."
 *
 * Q: Can you stun the same unit again and again to fire Leona's legend each time and stack buffs?
 * A: No. A unit that is already stunned cannot be stunned again. You may still TARGET it with a stun
 *    effect, but the stun does nothing, so the "when you stun" trigger does not fire a second time. The
 *    rest of the spell's effect resolves normally.
 * Rules: 815 ([Stun]: a unit deals no combat damage this turn; a stunned unit cannot be stunned again),
 *        383.4.b ("when you stun" needs a stun to actually happen), 359.3.e (the remaining instructions
 *        of a partially-inert effect still resolve).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RADIANT_DAWN = "ogn-261-298";

/** [Action] "Stun an enemy unit. Draw 1." — the draw shows the rest of the effect still resolving. */
const SHOCK = {
  abilities: [
    {
      effect: {
        effects: [{ target: { controller: "enemy", type: "unit" }, type: "stun" }, { amount: 1, type: "draw" }],
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Shock",
  rulesText: "[Action] Stun an enemy unit. Draw 1.",
  timing: "action",
} as const;

/** P1 has Leona's legend, two un-buffed allies in base, two Shocks; P2 has one unit at bf1. */
const board = () =>
  scenario()
    .legend(P1, RADIANT_DAWN, "leona")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 2, name: "Ally One" }, "ally1")
    .unit(P1, "base", { might: 2, name: "Ally Two" }, "ally2")
    .hand(P1, SHOCK, "shock1")
    .hand(P1, SHOCK, "shock2");

const buffedCount = (game: Game) => ["ally1", "ally2"].filter((a) => game.state(a).isBuffed).length;

/** Cast a Shock at `target`; if Leona's legend triggered, answer its "buff a friendly unit" pick with `buff`. */
async function shock(game: Game, spell: string, target: string, buff: string): Promise<boolean> {
  await game.p1.cast(spell, { targets: target });
  await game.settle();
  const d = game.decision();
  const asked = d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "leona";
  if (asked) {
    await game.p1.pick(buff);
    await game.settle();
  }
  return asked;
}

describe("Ruling 58729b4a233f9fcb — a stunned unit cannot be stunned again, so Leona's legend fires only once", () => {
  test("the first stun lands and Leona's legend triggers: exactly one ally is buffed", async () => {
    const game = await board().build();
    expect(await shock(game, "shock1", "foe", "ally1")).toBe(true); // Leona asked which ally to buff
    expect(game.state("foe").isStunned).toBe(true);
    expect(buffedCount(game)).toBe(1);
  });

  test("the second Shock may still name the stunned Foe — being already stunned does not make it an illegal target", async () => {
    const game = await board().build();
    await shock(game, "shock1", "foe", "ally1");
    const targets = (game.p1.option("cast", "shock2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("foe");
  });

  test("…but the second stun does nothing: no second buff, while the rest of the spell (Draw 1) still resolves", async () => {
    const game = await board().build();
    await shock(game, "shock1", "foe", "ally1");
    const handAfterFirst = game.p1.hand().length;
    expect(await shock(game, "shock2", "foe", "ally2")).toBe(false); // no second trigger to answer
    expect(game.state("foe").isStunned).toBe(true);
    expect(buffedCount(game)).toBe(1); // Leona did NOT fire a second time
    expect(game.p1.hand()).toHaveLength(handAfterFirst - 1 + 1); // shock2 left the hand, the draw replaced it
    expect(game.violations()).toEqual([]);
  });

  test("control: stunning a DIFFERENT, unstunned enemy does fire the legend again", async () => {
    const game = await board()
      .unit(P2, "bf1", { might: 3, name: "Other Foe" }, "foe2")
      .build();
    await shock(game, "shock1", "foe", "ally1");
    expect(await shock(game, "shock2", "foe2", "ally2")).toBe(true);
    expect(game.state("foe2").isStunned).toBe(true);
    expect(buffedCount(game)).toBe(2);
  });
});
