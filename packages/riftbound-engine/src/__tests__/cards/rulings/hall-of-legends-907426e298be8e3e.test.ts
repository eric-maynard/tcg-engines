/**
 * Ruling 907426e298be8e3e — Hall of Legends (SFD-210 → sfd-210-221, Battlefield: "When you conquer here, you may pay [1]
 *   to ready your legend.") × Void Burrower (SFD-187 → sfd-187-221, Rek'Sai legend: "When you conquer, you may exhaust me
 *   to reveal the top 2 cards of your Main Deck. You may banish one, then play it. Recycle the rest.")
 *
 * Q: If Rek'Sai's legend ability was already used (exhausted), can I conquer Hall of Legends, pay to ready the legend,
 *    and then use Rek'Sai's ability again off that same conquer?
 * A: No. With the legend exhausted at the moment of conquering, Rek'Sai's trigger cannot pay its exhaust cost and never
 *    makes it onto the chain; Hall readies the legend afterwards but the trigger opportunity has passed. The reverse
 *    works: legend READY → both triggers fire together; order Rek'Sai's to resolve first (exhaust, reveal, play), then
 *    Hall resolves and [1] readies the legend for the next conquer.
 * Rules: 383.3.b.1 (a trigger whose cost can't be paid can't be taken), 383.3.d (order simultaneous triggers), 332.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HALL_OF_LEGENDS = "sfd-210-221";
const VOID_BURROWER = "sfd-187-221";

/** P1's turn, [3] in pool. Void Burrower (exhausted or ready); the live Hall of Legends is uncontrolled; Runner (3) walks in. Two cheap units on top of P1's deck. */
function board(legendExhausted: boolean) {
  return scenario()
    .resources(P1, { energy: 3 })
    .card("reksai", { def: VOID_BURROWER, meta: legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .battlefield("hall", { controller: null, def: HALL_OF_LEGENDS, inert: false })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "Top A" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Top B" },
      ],
      ["topA", "topB"],
    );
}

interface Seen {
  chainCards: Set<string>;
  reksaiPrompts: string[];
  orderOffer?: Extract<Decision, { kind: "order" }>;
}

/**
 * Runner takes the empty Hall (non-combat showdown: both pass) → conquer. Then walk every prompt: order Rek'Sai's
 * trigger on TOP when offered, accept every opt-in, decline the optional "play a revealed card". Records what was seen.
 */
async function conquerHall(game: Game): Promise<Seen> {
  const seen: Seen = { chainCards: new Set(), reksaiPrompts: [] };
  await game.p1.move("runner", "hall");
  for (let i = 0; i < 24; i++) {
    for (const c of game.chain()) {
      seen.chainCards.add(c.cardId);
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind !== "action" && d.source?.cardId === "reksai") {
      seen.reksaiPrompts.push(d.kind);
    }
    if (d.kind === "order") {
      seen.orderOffer = d;
      const hall = d.items.find((it) => it.card === "hall")?.key as string;
      const rest = d.items.filter((it) => it.card !== "hall").map((it) => it.key);
      await game.p1.order([hall, ...rest]); // Hall at the bottom → Rek'Sai (if there) resolves first
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      await (d.allowDecline ? game.seat(d.seat).decline() : game.seat(d.seat).pick(d.options[0]?.key as string));
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 907426e298be8e3e — an exhausted Rek'Sai cannot re-trigger off the conquer that readies it via Hall of Legends", () => {
  test("legend EXHAUSTED when Hall of Legends is conquered: P1 scores, pays [1] and the legend ends READY — but Void Burrower never asked anything (no exhaust offer, no reveal) and gets no second chance this conquer", async () => {
    const game = await board(true).build();
    expect(game.state("reksai").isExhausted).toBe(true);
    const deckBefore = [...game.p1.deck()];
    const seen = await conquerHall(game);
    expect(game.gameState.battlefields.hall?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(seen.reksaiPrompts).toEqual([]); // never offered: the exhaust cost could not be paid at trigger time
    expect(game.p1.deck()).toEqual(deckBefore); // nothing revealed / recycled
    expect(game.p1.energy()).toBe(2); // Hall: paid [1] …
    expect(game.state("reksai").isExhausted).toBe(false); // … legend readied AFTER the fact
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // and that's it — no late trigger
  });

  // rule 383.3.b.1 — with the legend already exhausted the trigger cannot pay its [Exhaust] cost, so it never
  // enters the Chain at all: no pending item, and it is absent from P1's trigger-ORDER offer.
  test("ruling 907426e298be8e3e — with the legend exhausted, Void Burrower's trigger never appears on the chain / in the order offer", async () => {
    const game = await board(true).build();
    const seen = await conquerHall(game);
    expect(seen.chainCards.has("hall")).toBe(true);
    expect(seen.chainCards.has("reksai")).toBe(false);
    expect(seen.orderOffer?.items.map((it) => it.card) ?? []).not.toContain("reksai");
  });

  test("legend READY: both conquer triggers fire together and P1 orders them — Rek'Sai on top resolves first (legend exhausts, top 2 revealed, play declined → both recycled), then Hall resolves: pay [1] → legend READY again", async () => {
    const game = await board(false).build();
    expect(game.state("reksai").isExhausted).toBe(false);
    const seen = await conquerHall(game);
    expect(game.p1.points()).toBe(1);
    // both were on the chain and P1 was offered their order
    expect(seen.orderOffer).toMatchObject({ kind: "order", seat: P1 });
    expect(seen.orderOffer?.items.map((it) => it.card).sort()).toEqual(["hall", "reksai"]);
    expect([...seen.chainCards].sort()).toEqual(["hall", "reksai"]);
    // Rek'Sai's ability actually ran: exhaust offer + the reveal-and-pick
    expect(seen.reksaiPrompts).toContain("yes-no");
    expect(seen.reksaiPrompts).toContain("pick");
    const deck = game.p1.deck();
    expect(deck.slice(0, 2)).not.toContain("topA"); // revealed two were recycled to the bottom
    expect(deck.slice(-2).sort()).toEqual(["topA", "topB"]);
    // then Hall: [1] paid and the legend — exhausted by its own ability moments ago — is ready for the next conquer
    expect(game.p1.energy()).toBe(2);
    expect(game.state("reksai").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
