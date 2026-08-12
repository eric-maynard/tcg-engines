/**
 * Ruling ec93d1b623a4a880 — Vanguard Captain (OGN-218 → ogn-218-298) · [3][order] 3 [Might]
 *   "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here.
 *    (Get the effect if you've played another card this turn.)"
 *   × Baited Hook (OGN-242 → ogn-242-298) — "[1][order], [Exhaust]: Kill a friendly unit. … banish a unit … and play it."
 *
 * Q: Does triggering the Hook count as "playing a card" for [Legion]?
 * A: No — activating the Hook is an activated ability, not a card being played. But if the Hook actually PLAYS a
 *    unit out of the five, that unit was played this turn, and a Vanguard Captain cast afterwards does get [Legion].
 * Rules: 421 (Play vs. Activate are different actions), [Legion] ("if you've played another card this turn").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const VANGUARD_CAPTAIN = "ogn-218-298";
const BAITED_HOOK = "ogn-242-298";
const TWO_MIGHT = { cardType: "unit", energyCost: 2, might: 2, name: "Deckhand" } as const;
const SKULKER = "ogn-175-298";

/** P1's turn with exactly the Hook's [1][order] plus the Captain's [3][order]. Bait: a 1-Might Poro. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 1, name: "Poro" }, "poro")
    .hand(P1, VANGUARD_CAPTAIN, "captain")
    .deck(P1, [TWO_MIGHT, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["deckhand", "r1", "r2", "r3", "r4", "below"]);
}

/** Activate the Hook on the Poro and stop at the "play one of the five" pick. */
async function hookThePoro(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "poro" });
  await game.settle();
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

function recruits(game: Game): string[] {
  return game.p1.units("base").filter((id) => game.state(id).name === "Recruit");
}

describe("Ruling ec93d1b623a4a880 — activating Baited Hook is not 'playing a card'; the unit it plays is", () => {
  test("baseline: with nothing played this turn the Captain gets no [Legion] and makes no Recruits", async () => {
    const game = await board().build();
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    expect(recruits(game)).toEqual([]);
  });

  test("activating the Hook and DECLINING its play leaves [Legion] unsatisfied — still no Recruits", async () => {
    const game = await hookThePoro();
    await game.p1.decline();
    await game.settle();
    expect(game.state("hook").isExhausted).toBe(true); // the ability really was used
    expect(game.zoneOf("deckhand")).not.toBe("base"); // …but nothing was played
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    expect(recruits(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("letting the Hook PLAY the Deckhand does satisfy [Legion]: the Captain arrives with two Recruits", async () => {
    const game = await hookThePoro();
    await game.p1.pick("deckhand");
    await game.settle();
    expect(game.zoneOf("deckhand")).toBe("base"); // a card was played this turn
    await game.p1.play("captain", { to: "base" });
    await game.settle();
    expect(recruits(game)).toHaveLength(2);
    for (const r of recruits(game)) expect(game.state(r).might).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
