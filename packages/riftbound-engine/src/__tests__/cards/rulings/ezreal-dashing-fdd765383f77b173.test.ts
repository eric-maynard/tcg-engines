/**
 * Ruling fdd765383f77b173 — Ezreal, Dashing (SFD-082 → sfd-082-221) · Unit · Mind · 4 · 3 Might
 *   "When I attack or defend, deal damage equal to my Might to an enemy unit here. I don't deal combat damage. …"
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might "[Hidden] When I defend, choose an enemy unit here and reveal the
 *     top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle them."
 *
 * Q: Ezreal attacks into Teemo — in what order do their abilities deal damage?
 * A: Attacker's trigger goes on the chain first, defender's second; LIFO ⇒ Teemo's resolves FIRST (1 per Hidden card among
 *    P2's top 5, to Ezreal), then Ezreal's (his current Might, 3, to Teemo). Neither deals combat damage. If Teemo's
 *    ability kills Ezreal before his trigger resolves, Ezreal's ability whiffs (he is no longer "here").
 * Rules: 383.2 / 339 (attacker's triggers before defender's; LIFO), 402.4 / 359.3.e.5 (source gone ⇒ no effect), 465.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const TEEMO = "ogn-121-298";
const HIDDEN_CARD = "ogn-083-298"; // Consult the Past — has [Hidden]
const PLAIN_CARD = "ogn-175-298"; // Shipyard Skulker — no [Hidden]

/** P1's turn. P2 holds bf1 with Teemo, Strategist; P2's top 5 = `top`. Ezreal ready in P1's base. */
function board(top: string[]) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TEEMO, "teemo")
    .unit(P1, "base", EZREAL, "ez")
    .deck(P2, top, ["t1", "t2", "t3", "t4", "t5"]);
}

/** Ezreal attacks bf1; answer any single-candidate FIN target prompts; stop with both triggers on the chain. */
async function attack(top: string[]): Promise<Game> {
  const game = await board(top).build();
  await game.p1.move("ez", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("teemo");
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("ez");
    } else {
      break;
    }
  }
  expect(game.state("ez").combatRole).toBe("attacker");
  expect(game.state("teemo").combatRole).toBe("defender");
  return game;
}

describe("Ruling fdd765383f77b173 — Ezreal (attacker) triggers first, so Teemo (defender) resolves first", () => {
  test("chain order: Ezreal's 'When I attack' at the bottom, Teemo's 'When I defend' on top", async () => {
    const game = await attack([PLAIN_CARD, HIDDEN_CARD, PLAIN_CARD, PLAIN_CARD, HIDDEN_CARD]);
    const items = game.chain().filter((c) => c.triggered).map((c) => c.cardId);
    expect(items).toEqual(["ez", "teemo"]);
  });

  test("2 Hidden cards in P2's top 5: Teemo resolves first — 2 to Ezreal (survives, 3 Might unchanged), the 5 are recycled; THEN Ezreal deals 3 to the 2-Might Teemo, who dies; no combat damage either way and Ezreal conquers", async () => {
    const game = await attack([PLAIN_CARD, HIDDEN_CARD, PLAIN_CARD, PLAIN_CARD, HIDDEN_CARD]);
    const deckSize = game.p2.deck().length;
    // Resolve just the top item (Teemo's).
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("ez")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
    expect(game.state("teemo").damage).toBe(0); // Ezreal's hasn't resolved yet
    expect(game.p2.deck()).toHaveLength(deckSize); // revealed cards recycled, not drawn/trashed
    expect(game.p2.deck().slice(-5).toSorted()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(game.chain().filter((c) => c.triggered).map((c) => c.cardId)).toEqual(["ez"]);
    // Now Ezreal's: damage equal to his Might NOW (3) to Teemo (2) → lethal.
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("ez")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("3+ Hidden cards: Teemo's ability deals 3 to the 3-Might Ezreal, who dies BEFORE his own trigger resolves — it whiffs, Teemo takes nothing and P2 keeps bf1", async () => {
    const game = await attack([HIDDEN_CARD, HIDDEN_CARD, PLAIN_CARD, HIDDEN_CARD, PLAIN_CARD]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("ez")).toBe("trash");
    await game.settle();
    expect(game.state("teemo")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
