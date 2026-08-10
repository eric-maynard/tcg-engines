/**
 * Ruling 62100456c909f607 — Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *   × Rebuke (OGN-172 → ogn-172-298) · [Action] "Return a unit at a battlefield to its owner's hand."
 *
 * Q: With Warwick's attack trigger on the chain, can it be stopped by (hidden) Fight or Flight, or by Rebuke?
 * A: A hidden Fight or Flight can be flipped in response (it has Reaction from facedown); if Warwick is gone when the
 *    trigger resolves, "here" cannot be determined and nothing is killed. Rebuke cannot be used in response at all — it
 *    is an Action, not a Reaction — so the trigger resolves first.
 * Rules: 811.6 (hidden → Reaction), 359.3.e.12 ("here" of a departed source is null), 309 / 354.1 (closed state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const REBUKE = "ogn-172-298";

/** P1's turn. P2 holds bf1 with a DAMAGED Wounded (4, 1 damage). P1's Warwick attacks from base. */
function board(answer: "hidden-fof" | "rebuke") {
  const s = scenario()
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wounded" }, "wounded", { damage: 1 })
    .unit(P1, "base", WARWICK, "ww");
  return answer === "hidden-fof" ? s.facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof") : s.hand(P2, REBUKE, "rebuke");
}

async function warwickAttacks(game: Game): Promise<void> {
  expect(game.state("wounded").damage).toBe(1);
  await game.p1.move("ww", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 62100456c909f607 — Warwick's attack trigger: hidden Fight or Flight blanks it, Rebuke is too slow", () => {
  test("hidden Fight or Flight IS a legal response: flipped onto Warwick it resolves first and sends him to base", async () => {
    const game = await board("hidden-fof").build();
    await warwickAttacks(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["ww"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "fof"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "fof"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("ww")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]); // the trigger is still there, independent of its source
  });

  test("… the trigger then resolves with Warwick gone: 'here' is nowhere, so the damaged Wounded is NOT killed", async () => {
    const game = await board("hidden-fof").build();
    await warwickAttacks(game);
    await game.p2.reveal("fof", { answers: ["ww"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
    expect(game.locationOf("ww")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Rebuke (an Action) is NOT playable in response to the trigger; both pass and the trigger kills the damaged Wounded", async () => {
    const game = await board("rebuke").build();
    await warwickAttacks(game);
    expect(game.p2.can("cast", "rebuke")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rebuke", { targets: "ww" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    await game.p2.passPriority(); // both passed → resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
    // Only now (open state) could Rebuke be played — after the kill already happened.
    for (let i = 0; i < 3 && !(game.actingSeat() === P2 && game.p2.can("cast", "rebuke")); i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    if (game.actingSeat() === P2 && game.decision()?.kind === "action") {
      expect(game.p2.can("cast", "rebuke")).toBe(true);
    }
    expect(game.violations()).toEqual([]);
  });
});
