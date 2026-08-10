/**
 * Interaction: the Mulligan procedure (rule 117) with discard-sensitive cards in the opening hand.
 *   × Flame Chompers (ogn-006-298) · Unit · Fury · 3 · "When you discard me, you may pay [fury] to play me."
 *   × Mystic Poro    (ogn-171-298) · Unit · Chaos · 2 · "[Vision]"
 *   × Jinx, Rebel    (ogn-202-298) · Champion · "When you discard one or more cards, ready me and give me
 *     +1 [Might] this turn."                                              — in P1's Champion Zone
 *
 * Rules: 117.1 (choose up to two hand cards, SET THEM ASIDE), 117.2 ("Then, that player draws as many
 * cards as they set aside"), 117.3 ("Finally, that player Recycles the cards that were set aside"),
 * 416.1 / 416.1.a (Recycle = put on the BOTTOM of the Main Deck — nothing says shuffle), 422.1 (a
 * discard is hand → trash; a mulligan never touches the trash, so it is not a discard).
 *
 * Question: P1's opening four are Flame Chompers, Mystic Poro and two keepers; the Main Deck is in a
 * known order D1…D35. P1 mulligans Chompers + Poro. (a) Are the replacements exactly D1, D2 (drawn
 * BEFORE the set-aside cards go back)? (b) Do Chompers and Poro end up as the bottom two cards with
 * D3… otherwise untouched — no shuffle? (c) Does Chompers' discard trigger stay silent (no pay-[fury]
 * prompt) and Jinx not react? (d) Deck 35, hand 4, trash 0 afterwards.
 *
 * The position is built with the scenario builder (no pregame state), and the engine's real
 * `mulligan` move is executed through the harness escape hatch `seat.do("mulligan", …)`. NOTE: the
 * engine's param is (mis)named `keepCards` but holds the cards to RETURN.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLAME_CHOMPERS = "ogn-006-298";
const MYSTIC_PORO = "ogn-171-298";
const JINX_REBEL = "ogn-202-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-might unit
const ENFORCER = "ogn-003-298"; // Chemtech Enforcer · 2 · "When you play me, discard 1." (contrast only)

const DECK_NAMES = Array.from({ length: 35 }, (_, i) => `D${i + 1}`);

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's opening hand: Flame Chompers, Mystic Poro, two vanilla keepers. Main Deck D1…D35 (top first,
 * all vanilla). Jinx, Rebel in the Champion Zone. P1 holds a [fury] power so that IF a discard trigger
 * fired, its "you may pay [fury]" would be payable and therefore prompted.
 */
function board() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .champion(P1, JINX_REBEL, "jinx")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, MYSTIC_PORO, "poro")
    .hand(P1, FILLER, "keep1")
    .hand(P1, FILLER, "keep2")
    .deck(
      P1,
      DECK_NAMES.map(() => FILLER),
      DECK_NAMES,
    );
}

async function mulliganChompersAndPoro(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual(["chompers", "poro", "keep1", "keep2"]);
  expect(game.p1.deck()).toEqual(DECK_NAMES);
  await game.p1.do("mulligan", { keepCards: ["chompers", "poro"] });
  return game;
}

describe("Mulligan order of operations (117) × Flame Chompers / Mystic Poro / Jinx, Rebel", () => {
  test("(a) the two replacements are exactly D1 and D2 — drawn from the top BEFORE the set-aside cards return, so the shipped cards can never come back (117.2 before 117.3)", async () => {
    const game = await mulliganChompersAndPoro();
    const hand = game.p1.hand();
    expect(hand).toHaveLength(4);
    expect([...hand].sort()).toEqual(["D1", "D2", "keep1", "keep2"].sort());
    expect(hand).not.toContain("chompers");
    expect(hand).not.toContain("poro");
  });

  test("(b) Chompers and Poro are Recycled to the BOTTOM of the Main Deck; D3 is now on top and D3…D35 keep their exact order — no shuffle (117.3, 416.1.a)", async () => {
    const game = await mulliganChompersAndPoro();
    const deck = game.p1.deck();
    expect(deck).toHaveLength(35);
    expect(deck[0]).toBe("D3");
    expect(deck.slice(0, 33)).toEqual(DECK_NAMES.slice(2)); // D3…D35 verbatim
    expect([...deck.slice(-2)].sort()).toEqual(["chompers", "poro"]); // bottom two, either order among themselves
    expect(game.zoneOf("chompers")).toBe("mainDeck");
    expect(game.zoneOf("poro")).toBe("mainDeck");
  });

  test("(c) setting aside / recycling is not a discard (422.1): the trash stays empty, nothing goes on the chain, and NO 'pay [fury] to play me' prompt appears — P1 is simply back in an open state with the fury unspent", async () => {
    const game = await mulliganChompersAndPoro();
    expect(game.p1.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("fury")).toBe(1);
    // Nothing further to drain: settling is a no-op that lands on the same open decision.
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("chompers")).toBe("mainDeck");
  });

  test("(c) Jinx, Rebel does not react either — still in the Champion Zone, not readied/buffed, no +1 Might, no chain item from her", async () => {
    const game = await mulliganChompersAndPoro();
    expect(game.zoneOf("jinx")).toBe("championZone");
    const jinx = game.state("jinx");
    expect(jinx.might).toBe(jinx.baseMight);
    expect(jinx.mightModifier).toBe(0);
    expect(game.chain().some((c) => c.cardId === "jinx")).toBe(false);
  });

  test("(d) counts afterwards: hand 4, Main Deck 35 (35 − 2 drawn + 2 recycled), trash 0, banishment 0; P2 untouched", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.do("mulligan", { keepCards: ["chompers", "poro"] });
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.deck()).toHaveLength(35);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.banishment()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a REAL discard of Flame Chompers (Chemtech Enforcer's 'discard 1') does put it in the trash and surface the optional pay-[fury] prompt, so its silence during the mulligan is meaningful (422.1.b)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .champion(P1, JINX_REBEL, "jinx")
      .hand(P1, ENFORCER, "enforcer")
      .hand(P1, FLAME_CHOMPERS, "chompers")
      .build();
    await game.p1.play("enforcer", { to: "base" });
    await game.settle(); // Enforcer's trigger resolves; the single-card discard is forced onto Chompers
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
  });
});
