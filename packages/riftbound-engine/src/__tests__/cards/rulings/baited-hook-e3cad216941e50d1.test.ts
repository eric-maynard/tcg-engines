/**
 * Ruling e3cad216941e50d1 — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *    from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) 1 [Might] "[Deathknell] — Draw 1."
 *   × Chemtech Enforcer (OGN-003 → ogn-003-298) 2 [Might] "When you play me, discard 1."
 *
 * Q: With Baited Hook killing a Deathknell unit, do I choose whether Baited Hook or the Deathknell resolves first?
 * A: No — the chain is LIFO and the order is fixed. The Deathknell trigger is queued the moment the unit is killed,
 *    while Baited Hook is still resolving, so Baited Hook finishes ALL its instructions first. A "when you play me"
 *    ability of the unit Baited Hook plays is queued later still, so it resolves BEFORE the Deathknell.
 * Rules: 808.1.d.2 (a trigger raised mid-resolution becomes a pending chain item), 340 (LIFO), 428.1 (Kill).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might, [Deathknell] — Draw 1
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 Might, "When you play me, discard 1"
const SKULKER = "ogn-175-298"; // 3-Might filler (too big for a 1-Might kill: 3 > 1 + 1)

/** P1's turn: Hook ready with [1][order], the Sentry in base, the Enforcer on top of the deck, one spare card in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "Spare" }, "spare")
    .deck(P1, [CHEMTECH_ENFORCER, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["enforcer", "r1", "r2", "r3", "r4", "below"]);
}

/** Activate the Hook on the Sentry and stop at the "pick a revealed card to play" decision. */
async function hookTheSentry(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "sentry" });
  await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

describe("Ruling e3cad216941e50d1 — Baited Hook finishes first; the Deathknell it caused resolves last", () => {
  test("killing the Sentry queues its Deathknell as a chain item while Baited Hook is still resolving", async () => {
    const game = await hookTheSentry();
    expect(game.chain().map((c) => c.cardId)).toContain("sentry");
    expect(game.chain().find((c) => c.cardId === "sentry")).toMatchObject({ triggered: true });
    // Baited Hook has NOT finished: it is still asking which of the five to play.
    expect(game.decision()?.prompt.toLowerCase()).toContain("play");
  });

  test("only the Enforcer clears the 'Might up to 1 more than the killed unit' bar (2 ≤ 1 + 1)", async () => {
    const game = await hookTheSentry();
    const d = game.decision();
    const playable = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(playable).toContain("enforcer");
    expect(playable).not.toContain("r1"); // a 3-Might Skulker is out of range
  });

  test("the Enforcer's 'when you play me' lands ABOVE the Deathknell, so it resolves first", async () => {
    const game = await hookTheSentry();
    await game.p1.pick("enforcer");
    expect(game.zoneOf("enforcer")).toBe("base");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toEqual(["sentry", "enforcer"]); // Deathknell at the bottom, WYPM on top
  });

  test("resolution: the discard (Enforcer) happens, then the Deathknell draw — and P1 never chose the order", async () => {
    const game = await hookTheSentry();
    await game.p1.pick("enforcer");
    await game.settle();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind !== "pick" || d.context === "main") break;
      await game.seat(d.seat).pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spare")).toBe("trash"); // the Enforcer's discard
    expect(game.p1.hand()).toHaveLength(1); // the Deathknell's Draw 1
    expect(game.zoneOf("enforcer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
