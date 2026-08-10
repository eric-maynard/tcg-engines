/**
 * Ruling 12ab5c9f7119ce9e — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · [3]
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *
 * Q: "Recycle the rest" — do the cards go to the bottom randomly or in the order of my choice?
 * A: When 2+ cards are recycled to the Main Deck simultaneously they go to the bottom in a RANDOM order (in paper: shuffle
 *    them / have the opponent cut). The player does not order them.
 * Rules: 416.5 (simultaneous recycles are randomized), 416 (Recycle).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";

type PickD = Extract<Decision, { kind: "pick" }>;

const LOOKED = ["c1", "c2", "c3", "c4", "c5"];
const SEEDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

/**
 * P1's turn with exactly [1][order]. Baited Hook ready; Bait (2) in base. Deck (top→): five known cards c1..c5 (c1 a 2-Might
 * unit, c3 a 3-Might unit, the rest spells), then r6..r8 which are NOT looked at. No filler, so "the bottom" is observable.
 */
function board(seed: string) {
  return scenario({ seed })
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 2, name: "Bait" }, "bait")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 2, might: 2, name: "Unit One" },
        { cardType: "spell", energyCost: 1, name: "Spell Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Unit Three" },
        { cardType: "spell", energyCost: 1, name: "Spell Four" },
        { cardType: "spell", energyCost: 1, name: "Spell Five" },
        { cardType: "spell", energyCost: 1, name: "Rest Six" },
        { cardType: "spell", energyCost: 1, name: "Rest Seven" },
        { cardType: "spell", energyCost: 1, name: "Rest Eight" },
      ],
      [...LOOKED, "r6", "r7", "r8"],
    )
    .fillDecks(false)
    .script(P1, [(d) => (d.kind === "pick" && /target/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/**
 * Activate the Hook killing Bait; at the optional banish-and-play offer either play c1 (`"c1"`) or decline; "recycle the rest"
 * then happens. Records every decision kind P1 saw along the way.
 */
async function hook(seed: string, answer: "c1" | "decline"): Promise<{ game: Game; kindsSeen: string[]; offered: string[] }> {
  const game = await board(seed).build();
  const kindsSeen: string[] = [];
  let offered: string[] = [];
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  await (field ? game.p1.activate("hook", 0, { targets: "bait" }) : game.p1.activate("hook"));
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (!d) {
      break;
    }
    kindsSeen.push(d.kind);
    if (d.kind === "pick" && d.seat === P1 && (d as PickD).allowDecline) {
      offered = (d as PickD).options.map((o) => o.card ?? o.key).sort();
      await (answer === "c1" ? game.p1.pick("c1") : game.p1.decline());
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    } else {
      break;
    }
  }
  expect(game.zoneOf("bait")).toBe("trash");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  return { game, kindsSeen, offered };
}

describe("Ruling 12ab5c9f7119ce9e — Baited Hook's 'recycle the rest' puts the cards on the bottom in a random order", () => {
  test("banish-and-play Unit One (c1, 2 ≤ 2+1): it is played free to base; 'the rest' (c2–c5) become the BOTTOM four of the deck under r6, r7, r8 — none in hand/trash", async () => {
    const { game, offered } = await hook(SEEDS[0]!, "c1");
    expect(offered).toEqual(["c1", "c3"]); // units with Might ≤ 3 among the five
    expect(game.zoneOf("c1")).toBe("base");
    const deck = game.p1.deck();
    expect(deck).toHaveLength(7);
    expect(deck.slice(0, 3)).toEqual(["r6", "r7", "r8"]);
    expect(deck.slice(3).slice().sort()).toEqual(["c2", "c3", "c4", "c5"]);
    expect(game.violations()).toEqual([]);
  });

  test("the player is never asked to ORDER the recycled cards — no order / deck-arrange decision appears at any point", async () => {
    const { kindsSeen } = await hook(SEEDS[1]!, "c1");
    expect(kindsSeen).not.toContain("order");
    expect(kindsSeen).not.toContain("deck-arrange");
    const declined = await hook(SEEDS[1]!, "decline");
    expect(declined.kindsSeen).not.toContain("order");
    expect(declined.kindsSeen).not.toContain("deck-arrange");
  });

  test("random, not the reveal order: across different game seeds the bottom-four order after playing c1 varies (416.5)", async () => {
    const orders = new Set<string>();
    for (const seed of SEEDS) {
      const { game } = await hook(seed, "c1");
      orders.add(game.p1.deck().slice(3).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  test("declining the play: all FIVE looked-at cards are 'the rest' — they are the bottom five under r6–r8", async () => {
    const { game } = await hook(SEEDS[2]!, "decline");
    const deck = game.p1.deck();
    expect(deck).toHaveLength(8);
    expect(deck.slice(0, 3)).toEqual(["r6", "r7", "r8"]);
    expect(deck.slice(3).slice().sort()).toEqual([...LOOKED].sort());
  });

  // Expected (416.5): the five declined cards are recycled simultaneously ⇒ bottom in a RANDOM order, varying with the seed.
  // Actual: when the optional banish is DECLINED the engine puts them under the deck in the exact order they were revealed
  // (c1,c2,c3,c4,c5 for every seed) — only the "picked one, recycle the others" path randomizes.
  test("ruling 12ab5c9f7119ce9e — declining Baited Hook's play recycles the five in fixed reveal order instead of a random order (416.5)", async () => {
    const orders = new Set<string>();
    for (const seed of SEEDS) {
      const { game } = await hook(seed, "decline");
      orders.add(game.p1.deck().slice(3).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});
