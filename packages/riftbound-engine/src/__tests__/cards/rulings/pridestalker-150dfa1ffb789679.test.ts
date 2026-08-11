/**
 * Ruling 150dfa1ffb789679 — Rengar, Pridestalker (UNL-183 → unl-183-219, Legend)
 *     "When you play a unit, give a unit +1 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Reaction "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Pakaa Cub (OGN-135 → ogn-135-298) · 3 Might · "[Hidden]" — the unit revealed in response.
 *
 * Q: Can Rengar's legend ability be interrupted by a Reaction before the unit gains the bonus Might?
 * A: Yes. It is a triggered ability that goes on the chain, so the +1 is not applied until it resolves — after both
 *    players have had Reaction windows. Its target is locked when the trigger finalizes, but the effect can still be
 *    stopped: remove the chosen unit and the buff fizzles, or counter the trigger outright. Nuance: because the
 *    target is locked at finalization, a unit revealed from Hidden in response cannot be redirected onto it.
 * Rules: 383.3 (triggered abilities are chain items), 402.2 / 352.4.b (targets chosen and locked at finalization),
 *        340 (LIFO), 359.3.e.5 (an illegal target on resolution just fizzles), 425 (Counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRIDESTALKER = "unl-183-219";
const GUST = "ogn-169-298";
const NOT_SO_FAST = "sfd-045-221";
const PAKAA_CUB = "ogn-135-298"; // vanilla 3-Might unit with [Hidden]

/**
 * P1's turn with the Rengar legend. P1 holds bf1 with a 2-Might Ally; a 1-Might Recruit waits in hand ([1]).
 * P2 sits on a 3-Might Foe in base plus Gust and Not So Fast with enough resources for either.
 */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "pride")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 2, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, { energyCost: 1, might: 1, name: "Recruit" }, "recruit")
    .hand(P2, GUST, "gust")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** P1 plays the Recruit; Rengar's trigger finalizes on `pick` and P1 names `target`. Chain then holds the trigger. */
async function triggerAimedAt(target: string): Promise<Game> {
  const game = await board().build();
  await game.p1.play("recruit");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pride" }, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["ally", "foe", "recruit"]);
  await game.p1.pick(target);
  expect(game.chain()).toContainEqual(
    expect.objectContaining({ cardId: "pride", controller: P1, targets: [target], triggered: true }),
  );
  return game;
}

describe("Ruling 150dfa1ffb789679 — Rengar's legend trigger is a chain item: the +1 lands only on resolution", () => {
  test("the trigger goes on the chain with its target locked at finalization and NO Might applied yet; P2 then gets a Reaction window", async () => {
    const game = await triggerAimedAt("ally");
    expect(game.state("ally")).toMatchObject({ might: 2, mightModifier: 0 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.state("ally").might).toBe(2);
  });

  test("control: with nobody reacting the trigger resolves and Ally is 3 for the turn (2 again next turn)", async () => {
    const game = await triggerAimedAt("ally");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally")).toMatchObject({ might: 3, mightModifier: 1 });
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("ruling: P2 answers with Gust on the chosen Ally — Gust resolves first (LIFO), the Ally is in hand when the trigger resolves and the buff fizzles; nothing else gets the +1", async () => {
    const game = await triggerAimedAt("ally");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pride", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["pride"]);
    await game.settle(); // the trigger resolves with its target gone
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.state("recruit")).toMatchObject({ might: 1, mightModifier: 0 }); // never re-aimed
    expect(game.state("foe")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the trigger itself can be COUNTERED — with the trigger choosing P2's Foe, Not So Fast counters an enemy ability that chooses a friendly unit and no +1 is ever given", async () => {
    const game = await triggerAimedAt("foe");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "pride" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pride", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("foe")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("ally")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the target is locked at finalization — a unit P2 reveals from Hidden in response is never picked up by the trigger, which still buffs the Ally", async () => {
    const game = await board()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry") // holds bf2 so the hidden card stays put
      .facedown(P2, "bf2", PAKAA_CUB, "ambusher")
      .build();
    await game.p1.play("recruit");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pride" }, timing: "FIN" });
    const offered = (() => {
      const d = game.decision();
      return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    })();
    expect(offered).not.toContain("ambusher"); // still face down: not a unit on the board
    await game.p1.pick("ally");
    await game.p1.passPriority();
    await game.p2.reveal("ambusher");
    expect(game.zoneOf("ambusher")).toBe("battlefield-bf2");
    // The trigger's choice is untouched by the new arrival.
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "pride", targets: ["ally"] }));
    await game.settle();
    expect(game.state("ally")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.state("ambusher")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
