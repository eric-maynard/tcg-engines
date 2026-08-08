/**
 * Downstage Dramatics — unl-061-219 · Spell · Mind · 2 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Draw 1.
 *
 * Rules: 813 (Reaction = Action's permissions + Closed states on ANY player's turn; still not an
 * opponent's Open main phase), 820 (Repeat: optional additional cost paid as you play; ONE chain item
 * whose instruction executes one extra time on resolution; 820.1.c.3 each Repeat cost payable once),
 * 206 (a card's cost is its printed cost even when Repeat was paid — Defy's "costs no more than [4]"
 * still sees 2), 340 (LIFO resolution), 431 (Burn Out: drawing past the deck recycles the trash,
 * gives an opponent 1 point, then finishes the draw), 425.1 (a countered spell does none of its
 * instructions — including the repeated execution).
 *
 * Head-judge corner cases for THIS card:
 *   1. Repeat is all-or-nothing at play time: 4 energy → one chain item, two draws; 3 energy → the
 *      repeat is not even offered and only the plain cast is legal; max one repeat (no "repeat 2").
 *   2. Timing: legal in your Open state, in a showdown, and in response on the opponent's chain
 *      (where it resolves first); illegal in the opponent's Open main phase.
 *   3. Burn Out mid-repeat: deck of 1 + trash of 2 → first draw empties the deck, second draw burns
 *      out (trash recycled, P2 +1 point) and still draws; the spell itself is on the chain during
 *      this, so it is NOT among the recycled cards and ends in the trash afterwards.
 *   4. Countered by Defy even with Repeat paid (printed cost 2 ≤ 4): zero cards drawn, 4 energy gone.
 *   5. Plain clause: exactly one card, from the TOP of the deck, spell to trash, 2 energy.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-061-219";
const FILLER = "ogn-175-298";
const DEFY = "ogn-045-298"; // Reaction 1+[calm]: counter a spell that costs ≤4 and ≤1 power
const SLOW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Slow Draw",
  timing: "action",
} as const;

describe("Downstage Dramatics (unl-061-219)", () => {
  test("registry payload: a single Reaction spell ability 'draw 1' carrying repeat { energy: 2 }; 2-cost Mind spell, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 2, name: "Downstage Dramatics", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ effect: { amount: 1, type: "draw" }, repeat: { energy: 2 }, timing: "reaction", type: "spell" }]);
  });

  test("plain cast: 2 energy, one chain item, draws exactly the top card of the deck, spell to trash; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).deckTop(P1, FILLER, "top").deckTop(P1, FILLER, "second").hand(P1, CARD, "dd").build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "second"]);
    await game.p1.cast("dd");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dd", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn before resolution
    await game.settle();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("second")).toBe("mainDeck");
    expect(game.zoneOf("dd")).toBe("trash");
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "dd").build()).p1.can("cast", "dd")).toBe(false);
  });

  test("[Repeat] [2]: paying 4 total is still ONE chain item and draws the top two cards in order", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).deckTop(P1, FILLER, "top").deckTop(P1, FILLER, "second").deckTop(P1, FILLER, "third").hand(P1, CARD, "dd").build();
    const repeat = game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toMatchObject({ max: 1, min: 0, required: false }); // 820.1.c.3: at most once
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toEqual(["top", "second"]);
    expect(game.zoneOf("third")).toBe("mainDeck");
    expect(game.zoneOf("dd")).toBe("trash");
  });

  test("[Repeat] is optional and must be affordable: with 3 energy the repeat is not offered, forcing it is rejected, the plain cast draws 1", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "dd").build();
    const repeat = game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options ?? []).not.toContain(1);
    const forced = await game.p1.try((p) => p.cast("dd", { repeat: 1 }));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("dd")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    await game.p1.cast("dd");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
    expect((await game.p1.try((p) => p.cast("dd", { repeat: 2 }))).ok).toBe(false); // already cast; and 2 was never legal
  });

  test("[Reaction] on the opponent's turn: illegal in their Open state; legal once their spell is on the chain; resolves FIRST (LIFO) — P1 has drawn while P2's spell still waits", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 0 })
      .deckTop(P1, FILLER, "top")
      .hand(P1, CARD, "dd")
      .hand(P2, SLOW, "slow")
      .build();
    expect(game.p1.can("cast", "dd")).toBe(false);
    await game.p2.cast("slow");
    expect(game.p1.can("cast", "dd")).toBe(false); // P2 still holds priority (312.1)
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dd")).toBe(true);
    await game.p1.cast("dd");
    expect(game.chain().map((i) => i.cardId)).toEqual(["slow", "dd"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["slow"]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] inside a showdown you opened: castable while holding Focus, draws before combat resolves, combat then proceeds normally", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Lead" }, "lead", { exhausted: false })
      .unit(P2, "bf1", { might: 1, name: "Extra" }, "extra")
      .deckTop(P1, FILLER, "top")
      .hand(P1, CARD, "dd")
      .build();
    await game.p1.move("lead", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dd")).toBe(true);
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("extra")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Burn Out mid-repeat (431): deck of 1, trash of 2 → draws the last card, burns out (trash recycled, P2 +1 point), draws again; the spell lands in trash only afterwards", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 4 })
      .deck(P1, [FILLER], ["last"])
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .hand(P1, CARD, "dd")
      .build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.hand()).toContain("last");
    const second = game.p1.hand().find((c) => c !== "last");
    expect(["t1", "t2"]).toContain(second!);
    expect(game.p1.deck()).toHaveLength(1); // the other recycled card
    expect(game.p1.trash()).toEqual(["dd"]); // it was on the chain during the burn out, not recycled
    expect(game.violations()).toEqual([]);
  });

  test("negative space: with a healthy deck no Burn Out happens — P2 scores nothing off a repeated cast", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "dd").build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.points()).toBe(0);
  });

  test("rule 206 × Defy: even with Repeat paid (4 spent) the spell 'costs' 2, so Defy counters it — nothing is drawn, both spells in trash, energy not refunded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .deckTop(P1, FILLER, "top")
      .hand(P1, CARD, "dd")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("dd", { repeat: 1 });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["dd", "defy"]);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("responding to your OWN chain: cast a slow spell, then Downstage on top of it — Downstage's card arrives first", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .deckTop(P1, FILLER, "top")
      .deckTop(P1, FILLER, "second")
      .hand(P1, SLOW, "slow")
      .hand(P1, CARD, "dd")
      .build();
    await game.p1.cast("slow");
    expect(game.p1.can("cast", "dd")).toBe(true); // caster keeps priority and Reaction is legal in the Closed state
    await game.p1.cast("dd");
    expect(game.chain().map((i) => i.cardId)).toEqual(["slow", "dd"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["top"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["top", "second"]);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["slow", "dd"]));
  });
});
