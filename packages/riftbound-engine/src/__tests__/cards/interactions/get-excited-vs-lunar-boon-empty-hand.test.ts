/**
 * Interaction: Get Excited! (ogn-008-298) · Spell · Fury · 2 + [fury] · [Action]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)"
 *   × Lunar Boon (unl-125-219) · Spell · Chaos · 3 · [Reaction] · "Discard 1, then draw 2."
 *   fodder: Falling Comet (ogn-085-298) · Spell · Mind · Energy cost 5
 *   watchers: Ravenbloom Student (ogn-103-298) "When you play a spell, give me +1 [Might] this turn."
 *             Jinx, Rebel (ogn-202-298) "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Question — partial execution of multi-instruction spells when "Discard 1" is impossible:
 *   (a) P1's hand is exactly {Get Excited!}; P2 has a 2-Might unit X at a battlefield. Is Get Excited even
 *       offered? If P1 plays it targeting X: damage to X? Does it count as played ("when you play a spell",
 *       Legion)? Where does it go? Any discard trigger?
 *   (b) P1's hand is exactly {Lunar Boon}, deck 5. Offered? How many cards discarded / drawn?
 *   (c) Yes-side: {Get Excited!, Falling Comet} → result on X; {Lunar Boon, Falling Comet} → result.
 *
 * Rules: 055 / 055.1 (do as much as you can; a spell whose instructions are all impossible is still played and
 * resolved), 359.3.e.10 (no instruction executed → still "played", play-a-spell triggers fire), 359.3.e.11
 * ("Discard 2, then draw 2" with an empty hand: discard ignored, still draw 2), 359.3.e.12 / 359.3.e.14.a
 * (linked instructions: "its Energy cost" refers to the discarded card — nothing discarded → null → the deal
 * is ignored), 422.1 (discard = hand → trash, the performer chooses), 422.1.b (discard triggers only after an
 * actual discard).
 *
 * Expected: (a) offered and legal (the discard is an instruction, not a cost); X is chosen at finalization; on
 * resolution nothing is discarded, the linked deal is ignored → X takes 0; the spell resolved, counts as played
 * (Student +1, cardsPlayedThisTurn 1) and goes to P1's trash; Jinx (discard watcher) never triggers.
 * (b) offered; discard 0, then the independent "draw 2" executes fully: hand = 2 new cards, deck 5 → 3, trash =
 * {Lunar Boon}; no discard trigger. (c) Get Excited: forced discard of Falling Comet → 5 damage to X (2) → X
 * dies → P2's trash; Jinx readies with +1. Lunar Boon: discard Falling Comet, draw 2 → hand 2, trash = {Falling
 * Comet, Lunar Boon}.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const LUNAR_BOON = "unl-125-219";
const FALLING_COMET = "ogn-085-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const JINX_REBEL = "ogn-202-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla deck stock

/**
 * P1's turn. P2 controls bf1 with X (2 Might). P1's base: Ravenbloom Student (spell-play watcher, 2 Might) and an
 * EXHAUSTED Jinx, Rebel (discard watcher, 5 Might). P1's deck is exactly d1..d5 (no filler); P2 has a small deck.
 * `spell` is the only card in P1's hand unless `withComet` adds Falling Comet; resources are exactly the spell's cost.
 */
function board(spell: "ge" | "lb", withComet: boolean) {
  const s = scenario()
    .fillDecks(false)
    .resources(P1, spell === "ge" ? { energy: 2, power: { fury: 1 } } : { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Target X" }, "X")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .deck(P1, [FILLER, FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4", "d5"])
    .deck(P2, [FILLER, FILLER, FILLER])
    .hand(P1, spell === "ge" ? GET_EXCITED : LUNAR_BOON, spell);
  return withComet ? s.hand(P1, FALLING_COMET, "comet") : s;
}

/** Both players pass once → the spell (the only chain item) starts resolving; stops at whatever it asks. */
async function resolve(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Cards that appeared on the chain as TRIGGERED items while settling (to prove which watchers fired). */
async function settleWatchingTriggers(game: Game): Promise<string[]> {
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    for (const c of game.chain()) {
      if (c.triggered) {
        seen.add(c.cardId);
      }
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return [...seen].sort();
}

describe("Get Excited! / Lunar Boon with nothing to discard — partial execution (055, 359.3.e.11, 359.3.e.14.a)", () => {
  // ---- (a) Get Excited!, hand = {Get Excited!} --------------------------------------------------------------------

  test("(a) Get Excited IS offered with an otherwise empty hand: the discard is an instruction, not a cost — the cast option targets X and is affordable at exactly 2 + [fury]", async () => {
    const game = await board("ge", false).build();
    expect(game.p1.hand()).toEqual(["ge"]);
    expect(game.p1.can("cast", "ge")).toBe(true);
    const targets = game.p1.option("cast", "ge")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual([["X"]]);
  });

  test("(a) playing it: X is chosen at finalization, 2 energy + 1 fury are paid, P1's hand is now EMPTY and Get Excited sits on the chain targeting X — nobody was asked to discard anything yet", async () => {
    const game = await board("ge", false).build();
    await game.p1.cast("ge", { targets: "X" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["X"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) on resolution 'Discard 1' is impossible and ignored — no discard prompt at all — and the LINKED 'deal its Energy cost' has no antecedent, so X takes 0 damage and stays put (359.3.e.11, 359.3.e.14.a)", async () => {
    const game = await board("ge", false).build();
    await game.p1.cast("ge", { targets: "X" });
    await resolve(game);
    expect(game.decision()?.kind).not.toBe("pick"); // nothing to choose: the hand is empty
    await settleWatchingTriggers(game);
    expect(game.state("X")).toMatchObject({ damage: 0, location: "bf1", zone: "battlefield-bf1" });
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual(["d1", "d2", "d3", "d4", "d5"]); // nothing drawn / touched either
    expect(game.p1.hand()).toEqual([]);
  });

  test("(a) the spell still RESOLVED and counts as played (055.1, 359.3.e.10): Ravenbloom Student's 'when you play a spell' fires (+1 → 3), cardsPlayedThisTurn = 1, and Get Excited ends in P1's trash — the ONLY card there", async () => {
    const game = await board("ge", false).build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("ge", { targets: "X" });
    await resolve(game);
    const triggered = await settleWatchingTriggers(game);
    expect(triggered).toContain("student");
    expect(game.state("student").might).toBe(3);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ge"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) no discard happened, so no discard trigger (422.1.b): Jinx, Rebel is never put on the chain, stays exhausted at 5 Might", async () => {
    const game = await board("ge", false).build();
    await game.p1.cast("ge", { targets: "X" });
    await resolve(game);
    const triggered = await settleWatchingTriggers(game);
    expect(triggered).not.toContain("jinx");
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
  });

  // ---- (b) Lunar Boon, hand = {Lunar Boon}, deck 5 -----------------------------------------------------------------

  test("(b) Lunar Boon IS offered as P1's only card (no target, no extra field) and castable for exactly 3", async () => {
    const game = await board("lb", false).build();
    expect(game.p1.hand()).toEqual(["lb"]);
    expect(game.p1.deck()).toHaveLength(5);
    expect(game.p1.can("cast", "lb")).toBe(true);
    expect(game.p1.option("cast", "lb")?.fields ?? []).toEqual([]);
    await game.p1.cast("lb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["lb"]);
  });

  test("(b) on resolution: discard 0 (impossible, ignored — no prompt), THEN the independent 'draw 2' executes in full (359.3.e.11's own example): hand = the top two deck cards, deck 5 → 3, trash = {Lunar Boon} only", async () => {
    const game = await board("lb", false).build();
    await game.p1.cast("lb");
    await resolve(game);
    expect(game.decision()?.kind).not.toBe("pick");
    await settleWatchingTriggers(game);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()).toEqual(["d3", "d4", "d5"]);
    expect(game.p1.trash()).toEqual(["lb"]);
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) it counts as a played spell (Student +1) but NOT as a discard (Jinx untouched, never on the chain)", async () => {
    const game = await board("lb", false).build();
    await game.p1.cast("lb");
    await resolve(game);
    const triggered = await settleWatchingTriggers(game);
    expect(triggered).toEqual(["student"]);
    expect(game.state("student").might).toBe(3);
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  // ---- (c) yes-side: Falling Comet in hand ----------------------------------------------------------------------------

  test("(c) Get Excited with Falling Comet in hand: on resolution P1 MUST discard and the only candidate is Falling Comet (no decline) → Comet to P1's trash → 5 (its printed Energy cost) is dealt to X (2 Might) → X dies → P2's trash", async () => {
    const game = await board("ge", true).build();
    await game.p1.cast("ge", { targets: "X" });
    expect(game.p1.hand()).toEqual(["comet"]);
    await resolve(game);
    const d = game.decision();
    if (d?.kind === "pick") {
      // Asked-and-forced (or the engine may lock the single candidate without asking).
      expect(d).toMatchObject({ allowDecline: false, seat: P1 });
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["comet"]);
      expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
      await game.p1.pick("comet");
    }
    await settleWatchingTriggers(game);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["comet", "ge"]);
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.trash()).toEqual(["X"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) …and THAT was a real discard: Jinx, Rebel triggers (readied, +1 → 6) alongside the Student (+1 → 3)", async () => {
    const game = await board("ge", true).build();
    await game.p1.cast("ge", { targets: "X" });
    await resolve(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("comet");
    }
    const triggered = await settleWatchingTriggers(game);
    expect(triggered).toEqual(["jinx", "student"]);
    expect(game.state("jinx")).toMatchObject({ isExhausted: false, might: 6 });
    expect(game.state("student").might).toBe(3);
  });

  test("(c) Lunar Boon with Falling Comet in hand: discard Falling Comet (forced), then draw 2 → hand = {d1, d2}, trash = {Falling Comet, Lunar Boon}, deck 5 → 3; Jinx readied +1", async () => {
    const game = await board("lb", true).build();
    await game.p1.cast("lb");
    expect(game.p1.hand()).toEqual(["comet"]);
    await resolve(game);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["comet"]); // never a freshly drawn card: discard comes first
      expect(d.allowDecline).toBe(false);
      expect(game.zoneOf("d1")).toBe("mainDeck"); // nothing drawn while the discard is pending
      await game.p1.pick("comet");
    }
    const triggered = await settleWatchingTriggers(game);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.trash().sort()).toEqual(["comet", "lb"]);
    expect(game.p1.deck()).toEqual(["d3", "d4", "d5"]);
    expect(triggered).toEqual(["jinx", "student"]);
    expect(game.state("jinx")).toMatchObject({ isExhausted: false, might: 6 });
    expect(game.state("X")).toMatchObject({ damage: 0, location: "bf1" }); // Lunar Boon never touches the board
    expect(game.violations()).toEqual([]);
  });
});
