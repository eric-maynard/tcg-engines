/**
 * Undertitan — sfd-175-221 · Unit · Order · 6 energy + [order] · 5 Might
 *
 *   When you play me, give your other units +2 [Might] this turn.
 *   As I'm revealed from your deck, [Add] [2].
 *
 * Rules: 383.4.a (Play Effect: goes on the chain after I enter the board), 740.1.a ("your" =
 * units you control), 317.2.c ("this turn" expires in the Expiration Step), 424 (Reveal: a
 * temporary state applied only by REVEAL instructions — drawing/looking is not revealing; the
 * card stays in its zone while revealed), 429.2 ([Add] abilities resolve immediately when they
 * trigger — no chain window), 143.4 (units enter exhausted).
 *
 * Head-judge corner cases for THIS card:
 *  1. "your OTHER units": every friendly unit at base AND at battlefields gets +2 — Undertitan
 *     itself stays 5, enemy units are untouched; with no other unit the trigger just resolves.
 *  2. One-shot, not an aura: a unit played AFTER the trigger resolved gets nothing; the +2 is a
 *     Might modification (not a buff) and is gone next turn.
 *  3. Reveal payoff fires from the deck during someone's reveal instruction (Apprentice Smith's
 *     "reveal the top card") — +2 energy immediately, and the revealed Undertitan is then handled
 *     by that effect as usual (recycled).
 *  4. The signature line: Void Rush (reveal 2, banish one, play it for [2] less) with EXACTLY 4
 *     energy — 2 left after Void Rush, +2 from the reveal, Undertitan costs 4+[order] → lands.
 *  5. Drawing Undertitan (Discipline's "Draw 1") is not a reveal → no energy.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-175-221";
const APPRENTICE_SMITH = "sfd-041-221"; // When I move, reveal the top card of your Main Deck. Gear → draw, else recycle.
const VOID_RUSH = "sfd-188-221"; // 2 + [rainbow] · Reveal top 2; you may banish one, then play it for [2] less; draw the rest.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const FILLER = "ogn-175-298";

function board(energy = 6, power: Record<string, number> = { order: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Far" }, "far")
    .unit(P1, "base", { might: 1, name: "Near" }, "near")
    .unit(P2, "base", { might: 1, name: "Foe" }, "foe")
    .hand(P1, CARD, "ut");
}

describe("Undertitan (sfd-175-221)", () => {
  test("costs 6 energy + 1 order power; may be played to base or a battlefield I control; enters EXHAUSTED as a 5-Might unit with its play trigger on the chain", async () => {
    const game = await board().build();
    expect(game.p1.option("play", "ut")?.fields.find((f) => f.arg === "to")?.options).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    await game.p1.play("ut", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ut")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ut", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("ut")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("not affordable with 6 energy and no order power, with 5 energy + order, or with an off-domain power", async () => {
    expect((await board(6, {}).build()).p1.can("play", "ut")).toBe(false);
    expect((await board(5, { order: 1 }).build()).p1.can("play", "ut")).toBe(false);
    expect((await board(6, { fury: 1 }).build()).p1.can("play", "ut")).toBe(false);
    expect((await board(6, { order: 1 }).build()).p1.can("play", "ut")).toBe(true);
  });

  // BUG — expected: Far (bf1) 2→4 and Near (base) 1→3 for the turn; Undertitan stays 5; Foe stays 1;
  // next turn Far/Near are back to 2/1. Actual: "your other units" parsed into a tag filter
  // (`tag: "other units"`), which matches nothing — nobody gets +2.
  test("When you play me — every OTHER friendly unit (base and battlefield) gets +2 Might this turn; not me, not enemies; expires next turn", async () => {
    const game = await board().build();
    await game.p1.play("ut", { to: "base" });
    await game.settle();
    expect(game.state("far")).toMatchObject({ baseMight: 2, isBuffed: false, might: 4 });
    expect(game.state("near").might).toBe(3);
    expect(game.state("ut").might).toBe(5);
    expect(game.state("foe").might).toBe(1);
    await game.advanceTurn();
    expect(game.state("far").might).toBe(2);
    expect(game.state("near").might).toBe(1);
  });

  test("with no other friendly unit the play trigger still resolves cleanly and Undertitan is a plain 5", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "ut").build();
    await game.p1.play("ut");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("ut").might).toBe(5);
    expect(game.state("foe").might).toBe(3);
    expect(game.decision()?.kind).toBe("action");
  });

  test("one-shot, not an aura: a unit played AFTER the trigger resolved keeps its printed Might", async () => {
    const game = await board(9).hand(P1, FILLER, "late").build();
    await game.p1.play("ut", { to: "base" });
    await game.settle();
    await game.p1.play("late", { to: "base" });
    await game.settle();
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late").might).toBe(3);
  });

  // BUG — expected (424 / 429.2): Smith's move reveals Undertitan from the top of my deck → I
  // immediately Add [2] (0 → 2 energy); Undertitan is not a gear so it is then recycled to the
  // bottom. Actual: the reveal ability is not parsed/implemented — energy stays 0.
  test("As I'm revealed from your deck — Apprentice Smith's reveal adds 2 energy on the spot, then recycles Undertitan", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [CARD, FILLER], ["ut", "d2"])
      .build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.move("smith", "bf1");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d2");
    expect(deck[deck.length - 1]).toBe("ut");
    expect(game.p1.energy()).toBe(2);
  });

  // BUG — expected: Void Rush (2 + [rainbow]) leaves 2 energy; revealing Undertitan adds 2 (→ 4);
  // banish-and-play it for 6−2 = 4 + [order] → Undertitan on the board, pool empty, d2 drawn.
  // Actual: no [Add] happens, the 4-energy play is unaffordable and Undertitan is stranded in banishment.
  test("the Void Rush line with EXACTLY 4 energy — the reveal's [Add] [2] is what makes the discounted Undertitan affordable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 1, rainbow: 1 } })
      .hand(P1, VOID_RUSH, "vr")
      .deck(P1, [CARD, FILLER, FILLER], ["ut", "d2", "d3"])
      .build();
    await game.p1.cast("vr");
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p1.energy()).toBe(4); // revealed → added, before any choice is made
    await game.p1.pick("ut");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.locationOf("ut")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.p1.hand()).toEqual(["d2"]);
  });

  test("the Void Rush line with 6 energy: Undertitan is banished then played for 4 + [order], the reveal's [Add] [2] leaves 2 spare, d2 is drawn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1, rainbow: 1 } })
      .hand(P1, VOID_RUSH, "vr")
      .deck(P1, [CARD, FILLER, FILLER], ["ut", "d2", "d3"])
      .build();
    await game.p1.cast("vr");
    await game.settle();
    await game.p1.pick("ut");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.locationOf("ut")).toBe("base");
    expect(game.p1.energy()).toBe(2); // 6 − 2 (Void Rush) + 2 (reveal) − 4 (discounted Undertitan)
    expect(game.p1.power("order")).toBe(0);
    expect(game.p1.hand()).toEqual(["d2"]);
  });

  test("negative space: DRAWING Undertitan (Discipline's 'Draw 1') is not a reveal — no energy is added", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 1 }, "near")
      .hand(P1, DISCIPLINE, "disc")
      .deck(P1, [CARD, FILLER], ["ut", "d2"])
      .build();
    await game.p1.cast("disc", { targets: "near" });
    await game.settle();
    expect(game.p1.hand()).toEqual(["ut"]);
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space: an OPPONENT's Apprentice Smith reveals from THEIR deck — my Undertitan on top of my deck adds nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [CARD], ["ut"])
      .deck(P2, [FILLER], ["p2top"])
      .build();
    await game.p2.move("smith", "bf1");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.deck()[0]).toBe("ut");
  });

  // BUG — expected: two abilities — (a) play-self trigger: +2 Might this turn to all OTHER friendly
  // units; (b) a self-reveal-from-deck ability that adds 2 energy. Actual: only (a) is produced,
  // and its target carries a bogus `filter.tag = "other units"` instead of an exclude-self marker.
  test("parsed abilities — play trigger (+2 to other friendly units, this turn) AND a revealed-from-deck [Add] [2]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, might: 5, powerCost: ["order"] });
    const abilities = (def?.abilities ?? []) as { type: string; trigger?: { event: string }; effect: Record<string, unknown> }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 2, duration: "turn", target: { controller: "friendly", quantity: "all", type: "unit" }, type: "modify-might" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(JSON.stringify(abilities[0].effect.target)).not.toMatch(/"tag"/);
    expect(JSON.stringify(abilities[0].effect.target)).toMatch(/exclude|other|self/i);
    expect(JSON.stringify(abilities[1])).toMatch(/reveal/i);
    expect(abilities[1].effect).toMatchObject({ type: "add-resource" });
    expect(JSON.stringify(abilities[1].effect)).toMatch(/2/);
  });
});
