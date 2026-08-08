/**
 * Lunar Boon — unl-125-219 · Spell · Chaos · 3 energy (no power)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Discard 1, then draw 2.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. ORDER: discard first, THEN draw — the discarded card comes from the hand as it was before
 *     the draws; you can never pitch one of the two fresh cards (asserted via the prompt's options
 *     and the deck being untouched while the discard is pending).
 *  2. Empty hand after casting (Boon was the last card): "Discard 1" is ignored but the draw is
 *     NOT linked by "if you do" — you still draw 2 (359.3.e.11 / 422.4).
 *  3. The caster chooses which card to discard (422.1.a): 2+ candidates → a pick prompt for P1;
 *     exactly one candidate → forced.
 *  4. [Reaction] on the opponent's turn: goes on top of their spell and resolves FIRST (LIFO) —
 *     P1 has already discarded/drawn while P2's spell is still on the chain. But Reaction only adds
 *     CLOSED-state permission (813.1.c.1): opponent's turn + open state + no showdown → not legal.
 *  5. Discarding is a real Discard event: "When you discard me" (Flame Chompers) triggers off it,
 *     after the Boon has finished resolving (422.1.b).
 *  6. Cost 3 energy, no power; not a permanent — ends in trash; nothing else on the board changes.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-125-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3-might unit (hand/deck padding)
const CHOMPERS = "ogn-006-298"; // Fury unit: When you discard me, you may pay [fury] to play me.
/** The opponent's chain-opener: a plain slow spell that damages a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Slow Bolt",
  timing: "action",
} as const;

function base(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .hand(P1, CARD, "boon");
}

describe("Lunar Boon (unl-125-219)", () => {
  test("registry payload: Reaction spell, 3 energy, no power; effect = discard 1 THEN draw 2", async () => {
    await base().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 3, timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, then: { amount: 2, type: "draw" }, type: "discard" }, timing: "reaction", type: "spell" },
    ]);
  });

  test("cost: pays exactly 3 energy; with 2 energy it is not castable", async () => {
    const game = await base().hand(P1, FILLER, "junk").build();
    await game.p1.cast("boon");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("boon")).toBe("chain");
    const poor = await base(2).hand(P1, FILLER, "junk").build();
    expect(poor.p1.can("cast", "boon")).toBe(false);
  });

  test("one other card in hand: it is discarded (forced), then the top two deck cards are drawn; Boon ends in trash", async () => {
    const game = await base().hand(P1, FILLER, "junk").build();
    await game.p1.cast("boon");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("d3")).toBe("mainDeck");
    expect(game.zoneOf("boon")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("caster chooses the discard (422.1.a): with two candidates P1 is prompted, the picked one goes, the other stays", async () => {
    const game = await base().hand(P1, FILLER, "keep").hand(P1, FILLER, "toss").build();
    await game.p1.cast("boon");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["keep", "toss"]); // deck cards are NOT offered: discard happens before the draw
    await game.p1.pick("toss");
    await game.settle();
    expect(game.zoneOf("toss")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "keep"]);
  });

  test("discard-before-draw: the prompt never offers a freshly drawn card, and after resolving both draws are still in hand", async () => {
    const game = await base().hand(P1, FILLER, "a").hand(P1, FILLER, "b").build();
    await game.p1.cast("boon");
    await game.settle();
    const d = game.decision() as { kind: string; options: { card?: string; key: string }[] };
    expect(d.kind).toBe("pick");
    expect(d.options.some((o) => (o.card ?? o.key) === "d1" || (o.card ?? o.key) === "d2")).toBe(false);
    expect(game.zoneOf("d1")).toBe("mainDeck"); // nothing drawn yet while the discard is pending
    await game.p1.pick("a");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("hand");
    expect(game.zoneOf("d2")).toBe("hand");
  });

  test("empty hand after casting: 'Discard 1' is ignored but you STILL draw 2 (359.3.e.11 / 422.4)", async () => {
    const game = await base().build(); // Boon is the only card in hand
    await game.p1.cast("boon");
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.trash()).toEqual(["boon"]);
  });

  test("[Reaction] on the opponent's turn: cast in response to their spell, it resolves FIRST — P1 has discarded and drawn while the Bolt is still on the chain", async () => {
    const game = await base()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 4, name: "Wall" }, "wall")
      .hand(P1, FILLER, "junk")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "wall" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "boon")).toBe(true);
    await game.p1.cast("boon");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "boon"]);
    // Both pass once → only the top item (Boon) resolves.
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
    }
    expect(game.zoneOf("boon")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect(game.state("wall").damage).toBe(0);
    await game.settle();
    expect(game.state("wall").damage).toBe(2); // the Bolt still resolves afterwards
    expect(game.turnPlayer()).toBe(P2);
  });

  test("negative space (813.1.c.1): [Reaction] adds CLOSED-state permission only — on the opponent's turn in an Open State (no chain, no showdown) it is not playable; on your own open turn it is", async () => {
    const opp = await base().active(P2).hand(P1, FILLER, "junk").build();
    expect(opp.turnPlayer()).toBe(P2);
    expect(opp.chain()).toEqual([]);
    expect(opp.p1.can("cast", "boon")).toBe(false);
    const mine = await base().hand(P1, FILLER, "junk").build();
    expect(mine.p1.can("cast", "boon")).toBe(true);
  });

  test("partner: discarding Flame Chompers is a real discard — after Boon finishes (2 drawn) P1 may pay [fury] to play the Chompers from trash", async () => {
    const game = await base().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CHOMPERS, "chomp").build();
    await game.p1.cast("boon");
    const stop = await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("chomp");
      await game.settle();
    }
    // 422.1.b: the discard trigger is handled after the discard — and the Boon's own draw has completed.
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chomp" } });
    expect(stop.reason === "unanswered" || game.decision()?.kind === "yes-no").toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.zoneOf("chomp")).toBe("base");
    expect(game.zoneOf("boon")).toBe("trash");
  });

  test("negative space: no unit, rune or opponent card is touched — only P1's hand/deck/trash change", async () => {
    const game = await base()
      .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
      .hand(P2, FILLER, "theirs")
      .hand(P1, FILLER, "junk")
      .build();
    const p2HandBefore = game.p2.hand();
    await game.p1.cast("boon");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.p2.hand()).toEqual(p2HandBefore);
    expect(game.state("by").damage).toBe(0);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["boon", "junk"]);
  });
});
