/**
 * Ruling c4d0b8f0d067894a — Promising Future (OGN-115 → ogn-115-298) · Mind · [5][mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Brynhir Thundersong (OGN-026 → ogn-026-298) · 5 Might · "When you play me, opponents can't play cards
 *     this turn."
 *
 * Q: If Brynhir is played and resolves first, does she stop opponents playing the cards Promising Future hands
 *    them?
 * A: Yes. With Brynhir's restriction already active, the opponent still looks at five and banishes one — but
 *    cannot play it, so that card stays in banishment. Your own banished card is played as normal.
 * Rules: 337.1 (a resolved restriction applies to later plays this turn), 419.3 ("plays those cards, ignoring
 *        Energy costs" is still a play and is subject to play restrictions), 356.1.b.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const BRYNHIR = "ogn-026-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

/** P1's turn with plenty of resources; both decks are stacked with plain 3-cost units. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { fury: 2, mind: 1 } })
    .deck(P1, [U(2), U(3), U(4), U(5), U(6), U(7)], ["a1", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [U(2), U(3), U(4), U(5), U(6), U(7)], ["b1", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, BRYNHIR, "bryn")
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast Promising Future and walk both look/banish picks (each seat banishes its first option), then finish. */
async function castPromisingFuture(game: Game): Promise<void> {
  await game.p1.cast("pf");
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
      continue;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
      continue;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling c4d0b8f0d067894a — Brynhir resolved first stops the opponent playing their Promising Future card", () => {
  test("control (no Brynhir): both players play their banished card — b1 lands in P2's base", async () => {
    const game = await board().build();
    await castPromisingFuture(game);
    expect(game.zoneOf("a1")).toBe("base");
    expect(game.zoneOf("b1")).toBe("base");
    expect(game.p2.units("base")).toEqual(["b1"]);
    expect(game.violations()).toEqual([]);
  });

  test("intermediate fact: Brynhir is played and her restriction has RESOLVED before Promising Future is cast", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    await game.settle();
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("ruling: P2 still looks and banishes one — but cannot play it, so b1 stays in banishment", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    await game.settle();
    await castPromisingFuture(game);
    expect(game.p2.banishment()).toEqual(["b1"]);
    expect(game.zoneOf("b1")).toBe("banishment");
    expect(game.p2.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("…while P1, who is not an opponent of Brynhir's controller, plays their own banished card normally", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    await game.settle();
    await castPromisingFuture(game);
    expect(game.zoneOf("a1")).toBe("base");
    expect(game.p1.units("base").toSorted()).toEqual(["a1", "bryn"]);
    expect(game.p1.banishment()).toEqual([]);
  });
});
