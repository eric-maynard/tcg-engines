/**
 * Ruling 3fa243538f7bd583 — Sacrifice (UNL-173 → unl-173-219) · Reaction · [1] · "As an additional cost to play this, kill a
 *     friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Rift Herald (UNL-179 → unl-179-219) · 7 Might · "[Deathknell] — Play a unit from your hand to your base, ignoring its
 *     Energy cost."
 *
 * Q: I Sacrifice my Rift Herald and have no cards in hand afterwards — which resolves first, Sacrifice or the Deathknell?
 * A: The Herald dies while Sacrifice's COST is paid, so its Deathknell lands on the chain ABOVE Sacrifice and resolves FIRST:
 *    with an empty hand its "play a unit from your hand" cannot be done and is skipped (359.3.e.11). THEN Sacrifice resolves:
 *    draw 2, channel 1 exhausted. (So the drawn cards are never available to the Deathknell.)
 * Rules: 357.2 (triggers from paying costs go on the chain above the card being played), 340 (LIFO), 359.3.e.11.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const RIFT_HERALD = "unl-179-219";

/** P1's turn. Rift Herald (7, Mighty) in base; hand = Sacrifice ONLY; exactly [1]; deck top→: two cheap units U1, U2. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", RIFT_HERALD, "herald")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, SACRIFICE, "sac")
    .deck(
      P1,
      [
        { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Unit One" },
        { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Unit Two" },
        { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Unit Three" },
      ],
      ["u1", "u2", "u3"],
    );
}

async function sacrificeTheHerald(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual(["sac"]);
  await game.p1.cast("sac", { sacrifice: "herald" });
  return game;
}

describe("Ruling 3fa243538f7bd583 — Rift Herald's Deathknell (from Sacrifice's cost) resolves first and finds an empty hand; then Sacrifice draws", () => {
  test("steps 1–4: paying the cost kills the Herald during the play; the chain finalizes bottom→top as [Sacrifice, Herald's Deathknell]; P1's hand is now EMPTY", async () => {
    const game = await sacrificeTheHerald();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sac", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "herald", controller: P1, triggered: true }),
    ]);
    expect(game.zoneOf("u1")).toBe("mainDeck"); // nothing drawn yet
  });

  test("step 5 (LIFO) — resolution 1: the Deathknell resolves FIRST; with no card in hand its instruction is skipped — no prompt, nothing enters the base — and Sacrifice is still waiting below", async () => {
    const game = await sacrificeTheHerald();
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Deathknell) resolves
    expect(game.decision()?.kind).toBe("action"); // no "which unit" pick was raised
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac"]);
    expect(game.p1.units()).toEqual([]); // Herald gone, nothing played
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("u1")).toBe("mainDeck");
  });

  test("resolution 2: Sacrifice then resolves — P1 draws 2 (U1, U2 arrive in HAND, they are not played) and channels 1 rune exhausted", async () => {
    const game = await sacrificeTheHerald();
    const runes = game.p1.runes().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["u1", "u2"]);
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.zoneOf("u2")).toBe("hand");
    expect(game.p1.units()).toEqual([]); // the Deathknell had already resolved empty-handed; the draws came too late for it
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
