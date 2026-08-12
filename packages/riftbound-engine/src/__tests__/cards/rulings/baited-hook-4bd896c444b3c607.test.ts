/**
 * Ruling 4bd896c444b3c607 — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … play it, ignoring its cost."
 *   × Sun Disc (OGN-021 → ogn-021-298) · Gear "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *
 * Q: I tap Sun Disc while I have no [Legion], then tap Baited Hook, kill a unit and play a new one (which gives me
 *    [Legion]). Does Sun Disc retroactively apply and ready that unit?
 * A: No. [Legion] is checked at the moment Sun Disc's ability is activated; with no card played yet this turn the
 *    ability does nothing, and gaining [Legion] afterwards never brings it back. Tap it AFTER a card has been
 *    played this turn and the effect is set up, so the Hooked unit enters ready. (Nuance: on the turn you PLAY
 *    Sun Disc, [Legion] is already satisfied — the ability sees that Sun Disc itself was played.)
 * Rules: 402/404 (conditions checked as the ability goes on the chain), [Legion] reminder text, 370 (the
 *        enters-ready replacement only exists if the condition held).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SUN_DISC = "ogn-021-298";
const CLEAVE = "ogn-004-298"; // [1] Action — give a unit +3 [Might] this turn (a cheap "first card" to switch [Legion] on)
const SKULKER = "ogn-175-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn, NOTHING played yet. Baited Hook ready in base with [1][order]; a 1-Might Poro holds P1's bf1.
 * `discInHand` puts Sun Disc in hand (2 + [fury]) instead of on the board.
 */
function board(discInHand = false) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "bf1", { might: 1, name: "Poro" }, "poro")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, CLEAVE, "cleave")
    .deck(
      P1,
      [{ cardType: "unit", energyCost: 3, might: 2, name: "Wader" }, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER],
      ["wader", "r1", "r2", "r3", "r4", "below"],
    )
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => o.key === "poro") && !d.options.some((o) => o.key === "wader") ? "poro" : undefined)]);
  return discInHand ? s.hand(P1, SUN_DISC, "disc") : s.gear(P1, SUN_DISC, "disc");
}

/** Hook the Poro away and take the Wader; answer the destination with `dest`. */
async function hookInWader(game: Game, dest: string): Promise<void> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "poro" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as Pick).options.map((o) => o.card ?? o.key)).toContain("wader");
  await game.p1.pick("wader");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(dest);
  }
  await game.settle();
  expect(game.zoneOf("wader")).not.toBe("mainDeck");
}

describe("Ruling 4bd896c444b3c607 — Sun Disc checks [Legion] when you tap it; gaining [Legion] afterwards changes nothing", () => {
  test("ruling: with nothing played yet this turn, Sun Disc's effect is not set up — the Hooked unit enters EXHAUSTED even though playing it granted [Legion]", async () => {
    const game = await board().build();
    expect(game.state("disc").isExhausted).toBe(false);
    await hookInWader(game, "base");
    expect(game.state("wader")).toMatchObject({ controller: P1, isExhausted: true, isReady: false });
    expect(game.violations()).toEqual([]);
  });

  // Expected (ruling): tapping Sun Disc with no [Legion] is allowed — the cost is paid and "the ability does nothing".
  // Actual: the engine treats [Legion] as an activation condition and refuses the activation outright.
  // RULING-CONFLICT: riftjudge 4bd896c444b3c607 lets an unsatisfied Legion ability be tapped for no effect; rule 812.1.b.1
  // says Legion is short for "If you have played another card this turn, this card GAINS [Text]" (812.1.c: the Dependent
  // Ability is Active only then), so with no other play the activated ability is not on the card and cannot be activated.
  // Engine follows the CR — same model asserted by cards/rulings/sun-disc-80fc9c7dc7e3af38.test.ts; do not flip one alone.
  test.failing("BUG: ruling 4bd896c444b3c607 — engine forbids activating Sun Disc without [Legion] instead of letting it be tapped for no effect", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await hookInWader(game, "base");
    expect(game.state("wader")).toMatchObject({ isExhausted: true, isReady: false }); // no retroactive readying
  });

  test("ruling contrast: play a card FIRST, then tap Sun Disc — [Legion] holds and the Hooked unit enters READY", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "squire" }); // first card of the turn → [Legion] is on
    await game.settle();
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await hookInWader(game, "base");
    expect(game.state("wader")).toMatchObject({ controller: P1, isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });

  test("… and 'the next unit you play' follows it wherever it lands, including straight onto bf1", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "squire" });
    await game.settle();
    await game.p1.activate("disc");
    await game.settle();
    await hookInWader(game, "battlefield-bf1");
    expect(game.state("wader")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  // Expected (ruling): "The turn you play Sun Disc, it does have [Legion] because the ability is separate from the
  // card itself and sees that you played a card (Sun Disc itself)."
  // Actual: the engine reads [Legion] as "played a card OTHER than this one", so the ability stays unusable.
  // RULING-CONFLICT: rule 812.1.c is explicit — "as long as a card DIFFERENT than the one with the Legion ability has been
  // Finalized by you on the same turn" (812.1.b.1: "another card") — so a just-played Sun Disc never satisfies its own
  // Legion. Engine follows the CR; asserted directly by cards/rulings/sun-disc-80fc9c7dc7e3af38.test.ts.
  test.failing("BUG: ruling 4bd896c444b3c607 — Sun Disc's own play should satisfy [Legion] on the turn it is played", async () => {
    const game = await board(true).build();
    await game.p1.play("disc");
    await game.settle();
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    await hookInWader(game, "base");
    expect(game.state("wader")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });
});
