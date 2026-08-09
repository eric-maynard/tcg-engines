/**
 * Interaction: a forced Burn on an opponent with an EMPTY Main Deck — Burn Out attribution, the
 * Endless Riches trash→banish replacement, and the repeated-Burn-Out loop that can hand the game
 * to the player who was behind.
 *
 *   × Blade Twirler  (ven-002-166, Unit, fury, 4 Might) "The first time I move each turn, choose
 *                    a player. They [Burn 1]. (They put the top card of their Main Deck into
 *                    their trash.)"
 *   × Endless Riches (ven-022-166, Gear, fury) "When you play this, banish your hand and trash,
 *                    then [Burn 7]. Skip your Draw Phase. You may play cards from your trash. If
 *                    a card would go to your trash from anywhere other than your Main Deck,
 *                    banish it instead."
 *
 * Rules: 440.1 (Burn = top of Main Deck → trash), 431.1.b (moving deck cards in excess of the
 * deck → Burn Out, then complete the instruction), 431.2.b/.c/.d (Burn Out: recycle trash into
 * deck, the burning-out player chooses an OPPONENT to gain 1 point, then finish the action),
 * 431.3 / 431.3.a (empty deck AND trash → the retry burns out again, repeatedly), 431.3.b (those
 * points cannot be prevented), 431.3.c / 431.3.c.1 (reaching the Victory Score with more points
 * than any opponent this way wins IMMEDIATELY, no Cleanup needed).
 *
 * Board (1v1, Victory Score 8): P1 4 points, P2 6 points. P2 controls Endless Riches with an
 * EMPTY Main Deck. P1 already controls bf1 (a friendly unit stands there, so the move conquers
 * nothing); Blade Twirler moves base → bf1 for the first time this turn and P1 chooses a player.
 *   (a) P2's trash holds exactly 1 card → ONE Burn Out: recycle it, P1 (P2's only opponent) 4→5,
 *       then the burn completes deck→trash — from the Main Deck, so Riches does NOT banish it.
 *   (b) P2's trash is empty → Burn Out repeats: 5, 6 (tie, no win), 7, 8 → P1 wins immediately
 *       mid-resolution; exactly 4 Burn Outs, final 8–6, P2's lead irrelevant.
 *   (c) Control: P1 names THEMSELF with 10 cards in deck → plain Burn 1, no points change.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLADE_TWIRLER = "ven-002-166";
const ENDLESS_RICHES = "ven-022-166";

const P1_DECK = Array.from({ length: 10 }, (_, i) => `p1card${i}`);

function board(p2TrashCount: number) {
  let b = scenario()
    .victoryScore(8)
    .points(P1, 4)
    .points(P2, 6)
    .fillDecks(false) // P2's Main Deck must be genuinely EMPTY
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy") // P1 already holds bf1 → the move conquers nothing
    .unit(P1, "base", BLADE_TWIRLER, "twirler")
    .gear(P2, ENDLESS_RICHES, "riches")
    .deck(
      P1,
      P1_DECK.map((_, i) => ({ cardType: "unit", energyCost: 1, might: 1, name: `P1 Deck Card ${i}` })),
      P1_DECK,
    );
  for (let i = 0; i < p2TrashCount; i++) {
    b = b.trash(P2, { cardType: "unit", energyCost: 1, might: 1, name: `Junk ${i}` }, `junk${i}`);
  }
  return b;
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Move Blade Twirler, let its trigger resolve up to the "choose a player" prompt, answer it, settle. */
async function twirlAndChoose(game: Built, who: typeof P1 | typeof P2) {
  await game.p1.move("twirler", "bf1");
  const first = await game.settle();
  expect(first.reason).toBe("unanswered");
  expect(first.decision?.kind).toBe("pick");
  expect(first.decision?.seat).toBe(P1);
  await game.p1.pick(who);
  return game.settle();
}

describe("Blade Twirler's move trigger: 'choose a player' is P1's choice and offers BOTH players", () => {
  test("moving Twirler for the first time this turn puts its trigger on the chain; on resolution P1 is asked to choose a player from {P1, P2} (may not decline)", async () => {
    const game = await board(1).build();
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.gear()).toContain("riches");
    await game.p1.move("twirler", "bf1");
    expect(game.zoneOf("twirler")).toBe("battlefield-bf1");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "twirler", controller: P1, name: "Blade Twirler", triggered: true });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = r.decision;
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual([P1, P2].sort());
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(false);
    // Nothing has been burned or scored yet; the move itself conquered nothing.
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(6);
    expect(game.p2.trash()).toEqual(["junk0"]);
  });
});

describe("(a) P2 chosen, P2's trash has exactly 1 card: ONE Burn Out (431.1.b, 431.2.b–d) and Riches does not banish the burned card", () => {
  test("P1 — P2's only opponent — gains exactly 1 point (4→5); P2, the player burning out, gains nothing (stays 6); the game is not over", async () => {
    const game = await board(1).build();
    const r = await twirlAndChoose(game, P2);
    expect(r.reason).toBe("open");
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(6);
    expect(game.isOver()).toBe(false);
    // A Burn Out point is not a battlefield score for anyone.
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    expect(game.gameState.scoredThisTurn[P2] ?? []).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the recycled card is then burned deck→trash (440.1): P2 ends with deck 0 / trash [that same card] / banishment empty — it came FROM the Main Deck, so Endless Riches' 'from anywhere other than your Main Deck' replacement does not apply", async () => {
    const game = await board(1).build();
    await twirlAndChoose(game, P2);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual(["junk0"]);
    expect(game.zoneOf("junk0")).toBe("trash");
    expect(game.p2.banishment()).toEqual([]);
    // P1's own deck/trash keep their contents.
    expect([...game.p1.deck()].sort()).toEqual([...P1_DECK].sort());
    expect(game.p1.trash()).toEqual([]);
  });

  test("P2's Burn Out recycles/randomizes only P2's OWN trash into P2's OWN Main Deck (431.2.b) — P1's deck order is untouched", async () => {
    // Expected: P1's deck is exactly P1_DECK in its original order (nothing of P1's moved).
    // Actual: zone shuffle ignores the owner filter, so P1's Main Deck comes back permuted.
    const game = await board(1).build();
    expect(game.p1.deck()).toEqual(P1_DECK);
    await twirlAndChoose(game, P2);
    expect(game.p1.deck()).toEqual(P1_DECK);
  });
});

describe("(b) P2 chosen, P2's trash EMPTY: the burn retries and P2 burns out repeatedly until P1 wins (431.3, 431.3.a–c, 431.3.c.1)", () => {
  test("exactly four Burn Outs: P1 4→5→6 (a tie is not a win)→7→8 = Victory Score with more points than P2 → P1 wins IMMEDIATELY inside the trigger's resolution; final 8–6, P2's 6–4 lead was irrelevant", async () => {
    const game = await board(0).build();
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    const r = await twirlAndChoose(game, P2);
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // Stopped the moment P1 reached 8 (431.3.c.1) — not one Burn Out more, not one fewer.
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(6);
    // Nothing ever materialised for P2: deck, trash and banishment are all still empty.
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the win did not wait for a Cleanup / end of turn: it is still P1's turn 2 with Blade Twirler at bf1 when the game ends", async () => {
    const game = await board(0).build();
    await twirlAndChoose(game, P2);
    expect(game.isOver()).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(2);
    expect(game.zoneOf("twirler")).toBe("battlefield-bf1");
    expect(game.decision()).toBeNull();
  });
});

describe("(c) control: P1 names THEMSELF with a stocked deck — an ordinary Burn 1", () => {
  test("top card of P1's deck → P1's trash; no Burn Out, no points change (4–6), P2 untouched", async () => {
    const game = await board(0).build();
    expect(game.p1.deck()).toHaveLength(10);
    const top = game.p1.deck()[0] as string;
    const r = await twirlAndChoose(game, P1);
    expect(r.reason).toBe("open");
    expect(game.p1.deck()).toHaveLength(9);
    expect(game.p1.trash()).toEqual([top]);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(6);
    expect(game.isOver()).toBe(false);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast within (c): naming P2 instead on the SAME board is what starts the Burn Out chain (P1's stocked deck is irrelevant to P2's burn)", async () => {
    const game = await board(0).build();
    await twirlAndChoose(game, P2);
    expect(game.p1.deck()).toHaveLength(10);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
  });
});
