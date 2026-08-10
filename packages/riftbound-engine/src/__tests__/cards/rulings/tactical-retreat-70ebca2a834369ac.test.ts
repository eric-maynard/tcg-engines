/**
 * Ruling 70ebca2a834369ac — Tactical Retreat (UNL-175 → unl-175-219) · Spell · Order · 2 · [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead."
 *   × Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Abandon (UNL-131 → unl-131-219) · 2 · [Reaction] "Counter a spell. Return it to its owner's hand instead… [Predict]."
 *   (Retreat OGN-104 is listed on the ruling but plays no part in the sequence.)
 *
 * Q: I Tactical Retreat in response to the opponent's Falling Star; they Abandon my Retreat. After Abandon resolves,
 *    may I play Tactical Retreat AGAIN (I have the runes) before Falling Star kills my unit?
 * A: Yes. LIFO: Abandon resolves first, countering Tactical Retreat back to my HAND; Falling Star is still waiting on
 *    the chain, so I get priority and may play the [Reaction] again (paying 2 again). It lands on top, resolves first,
 *    sets up the replacement; then Falling Star resolves and the unit is healed, exhausted and recalled instead of dying.
 * Rules: 340 (LIFO), 425.1 (counter; Abandon's "instead" → hand), 124 (returned card is a new object, full cost again),
 *        813.1.c (Reaction while a chain exists), 332/336 (priority passes around before the next item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TACTICAL_RETREAT = "unl-175-219";
const FALLING_STAR = "ogn-029-298";
const ABANDON = "unl-131-219";

/**
 * P2's turn. P1's Scout and Ranger (3 Might each, at bf1 which P1 controls) are "my units"; Falling Star sends 3 at
 * each. P1 has 4 energy = two Tactical Retreats (both aimed at the Scout). P2: [2][fury][fury] + 2 for Abandon; a
 * known deck top for Abandon's Predict.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 2 } })
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "bf1", { might: 3, name: "Ranger" }, "ranger")
    .hand(P2, FALLING_STAR, "star")
    .hand(P2, ABANDON, "abandon")
    .deck(P2, ["ogn-175-298"], ["p2top"])
    .hand(P1, TACTICAL_RETREAT, "tr");
}

/** Falling Star (3 at the Scout, 3 at the Ranger) → P1 Tactical Retreat on the Scout → P2 Abandon on the Retreat. */
async function starRetreatAbandon(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("star", { targets: ["scout", "ranger"] });
  expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 0 } });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  await game.p1.cast("tr", { targets: "scout" });
  expect(game.p1.energy()).toBe(2);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("abandon", { targets: "tr" });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "tr", "abandon"]);
  return game;
}

/** Both pass → Abandon resolves (LIFO): counter TR → hand, then P2's Predict prompt (declined). */
async function resolveAbandon(game: Game): Promise<void> {
  await game.p2.passPriority();
  await game.p1.passPriority();
  // Abandon's [Predict] — P2 looks at p2top and may recycle it.
  const d = game.decision();
  expect(d).toMatchObject({ seat: P2 });
  expect(d?.kind).not.toBe("action");
  await game.p2.decline();
}

describe("Ruling 70ebca2a834369ac — Abandon bounces Tactical Retreat; it can be replayed onto the still-open chain before Falling Star resolves", () => {
  test("step 4: Abandon resolves first — Tactical Retreat is countered back to P1's HAND (not trash), Falling Star is still the (only) chain item", async () => {
    const game = await starRetreatAbandon();
    await resolveAbandon(game);
    expect(game.zoneOf("tr")).toBe("hand");
    expect(game.p1.hand()).toEqual(["tr"]);
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    expect(game.state("scout").damage).toBe(0); // Falling Star has not resolved yet
    expect(game.p1.energy()).toBe(2); // no refund for the countered Retreat (425.1.c)
  });

  test("step 5: the chain still exists, so P1 receives priority and Tactical Retreat is legal to cast again from hand (2 energy left)", async () => {
    const game = await starRetreatAbandon();
    await resolveAbandon(game);
    // Priority passes around before Falling Star may resolve; P1 must get a window.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "tr")).toBe(true);
    await game.p1.cast("tr", { targets: "scout" });
    expect(game.p1.energy()).toBe(0); // full cost paid a second time
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "tr"]);
  });

  test("step 6: the second Tactical Retreat resolves first, then Falling Star deals its damage — the Scout would die but is healed, exhausted and recalled to base instead (the unprotected Ranger dies)", async () => {
    const game = await starRetreatAbandon();
    await resolveAbandon(game);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("tr", { targets: "scout" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("tr")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("base"); // recalled, not dead
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("ranger")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["ranger", "tr"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 does NOT replay it, Falling Star resolves and both 3-Might units die", async () => {
    const game = await starRetreatAbandon();
    await resolveAbandon(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("ranger")).toBe("trash");
    expect(game.zoneOf("tr")).toBe("hand");
  });
});
