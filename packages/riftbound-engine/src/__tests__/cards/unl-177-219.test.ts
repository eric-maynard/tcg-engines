/**
 * Ivern, Friend to All — unl-177-219 · Champion Unit (Ivern) · Order · 6 energy (no power) · 6 Might
 *
 *   As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.
 *   When I conquer or hold, score 1 point if your units have all of the following tags among them —
 *   Bird, Cat, Dog, and Poro.
 *
 * Rules: 135.2.b.3 ("As you play me, …" executes while the card is being played — the tag is already
 * there when Ivern reaches the board), 383.4.c/.d (conquer / hold triggers fire only for a unit AT the
 * scored battlefield), 383.2.a.1 (an "if" in a triggered ability gates it), 108.2 ("your units" = units
 * you control on the board — enemy units and cards in hand do not count), 471.1.a.1 (a point SCORED by
 * an ability is not a Conquer point: the Final-Point restriction of 471.1.b does not apply to it),
 * 467/471.2 (Hold in your Scoring Step, Conquer on taking control; each also scores its normal point).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The condition is a real gate: all FOUR tags among your units → +1 (2 total with the conquer/hold
 *     point); three of four, none, or the tags sitting on ENEMY units → just the normal 1. (Engine today
 *     ignores the tag filter and always pays — several `test.failing` below.)
 *  2. Tags are counted ACROSS units: one Cat/Dog dual-tag unit + a Bird + a Poro is enough; a Poro in
 *     hand is not on the board and does not count.
 *  3. The play-time choice is what usually completes the set: Bird + Cat + Dog friends, choose "Poro"
 *     as you play Ivern → his own tag is the fourth. No prompt exists today.
 *  4. Partner check of the gained tag: Friendship (unl-046, +1 Might per distinct tag among your units)
 *     reads +1 off a lone Ivern that chose a tag.
 *  5. Final point (471.1.a.1): at 7/8 with two enemy battlefields, conquering ONE with Ivern draws a
 *     card for the conquer (not every battlefield scored) but the ability's point still wins the game;
 *     a vanilla 6-drop in the same spot stays at 7.
 *  6. Cost 6, no power, enters exhausted, 6 Might; hold trigger is a Beginning-Phase chain item.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-177-219";
const POUTY_PORO = "ogn-013-298"; // 2-Might Poro
const FRIENDSHIP = "unl-046-219"; // [Reaction] 1: +1 Might this turn per distinct Bird/Cat/Dog/Poro tag among your units
const BIRD = { cardType: "unit", energyCost: 1, might: 1, name: "Songbird", tags: ["Bird"] } as const;
const CAT = { cardType: "unit", energyCost: 1, might: 1, name: "Alley Cat", tags: ["Cat"] } as const;
const DOG = { cardType: "unit", energyCost: 1, might: 1, name: "Good Dog", tags: ["Dog"] } as const;
const CATDOG = { cardType: "unit", energyCost: 1, might: 1, name: "Catdog", tags: ["Cat", "Dog"] } as const;

type Friend = "bird" | "cat" | "dog" | "poro";
const FRIEND_DEFS = { bird: BIRD, cat: CAT, dog: DOG, poro: POUTY_PORO } as const;

/** Ivern ready in P1's base, P2 holds bf1 with a 1-Might Sentry (and bf2 with a Guard); `friends` sit in P1's base. */
function conquerBoard(friends: readonly Friend[]) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", CARD, "ivern");
  for (const f of friends) {
    s.unit(P1, "base", FRIEND_DEFS[f], f);
  }
  return s;
}

/** P2 about to end the turn; Ivern holds bf1 for P1; `friends` in P1's base. */
function holdBoard(friends: readonly Friend[]) {
  const s = scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ivern");
  for (const f of friends) {
    s.unit(P1, "base", FRIEND_DEFS[f], f);
  }
  return s;
}

async function conquerWithIvern(game: Game): Promise<void> {
  await game.p1.move("ivern", "bf1");
  await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.locationOf("ivern")).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

/** Answer the "choose Bird, Cat, Dog, or Poro" play-time prompt, whatever shape it takes. */
async function chooseTag(game: Game, tag: string): Promise<void> {
  const d = game.decision();
  expect(d?.seat).toBe(P1);
  if (d?.kind === "name") {
    await game.p1.name(tag);
    return;
  }
  expect(d?.kind).toBe("pick");
  const opts = d?.kind === "pick" ? d.options : [];
  expect(opts.map((o) => o.label)).toEqual(expect.arrayContaining([expect.stringMatching(/Bird/), expect.stringMatching(/Cat/), expect.stringMatching(/Dog/), expect.stringMatching(/Poro/)]));
  const opt = opts.find((o) => o.label.includes(tag) || String(o.value ?? "").includes(tag) || o.key.includes(tag));
  expect(opt).toBeDefined();
  await game.p1.pick(opt?.key as string);
}

describe("Ivern, Friend to All (unl-177-219)", () => {
  test("registry payload (scoring half): a conquer trigger and a hold trigger, each `score 1` gated by an AND of four has-at-least-1 friendly-unit checks for the tags Bird, Cat, Dog, Poro; 6 energy, no power, 6 Might, champion Ivern", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, isChampion: true, might: 6, name: "Ivern, Friend to All", tags: ["Ivern"] });
    expect(def?.powerCost ?? []).toEqual([]);
    type Ab = { type: string; trigger?: { event: string; on: string }; effect?: unknown; condition?: { type: string; conditions: { type: string; count: number; target: { controller: string; type: string; filter: { tag: string } } }[] } };
    const abilities = (def?.abilities ?? []) as Ab[];
    for (const ev of ["conquer", "hold"]) {
      const a = abilities.find((x) => x.type === "triggered" && x.trigger?.event === ev);
      expect(a).toMatchObject({ effect: { amount: 1, type: "score" }, trigger: { event: ev, on: "self" } });
      expect(a?.condition?.type).toBe("and");
      expect(a?.condition?.conditions.map((c) => c.target.filter.tag).sort()).toEqual(["Bird", "Cat", "Dog", "Poro"]);
      for (const c of a?.condition?.conditions ?? []) {
        expect(c).toMatchObject({ count: 1, target: { controller: "friendly", type: "unit" }, type: "has-at-least" });
      }
    }
    expect(abilities.filter((x) => x.type === "triggered" && (x.trigger?.event === "conquer" || x.trigger?.event === "hold"))).toHaveLength(2);
  });

  test("registry payload (first line) — 'As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.' is not encoded at all", async () => {
    // Expected: some ability/flag naming the four tags as a play-time choice that grants a tag to self.
    // Actual: only the two scoring triggers exist.
    const def = (await loadDefaultCardPool()).get(CARD);
    const rest = (def?.abilities ?? []).filter((a) => {
      const t = (a as { trigger?: { event?: string } }).trigger?.event;
      return t !== "conquer" && t !== "hold";
    });
    expect(rest.length).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(rest);
    for (const tag of ["Bird", "Cat", "Dog", "Poro"]) {
      expect(blob).toContain(tag);
    }
    expect(blob).toMatch(/tag/i);
  });

  test("cost: 6 energy, no power; lands in base exhausted as a 6-Might unit; 5 energy (even with order power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { order: 1 } }).hand(P1, CARD, "ivern").build();
    await game.p1.play("ivern");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    await game.settle({ policy: "first" }); // take whatever tag prompt may exist
    expect(game.state("ivern")).toMatchObject({ isExhausted: true, might: 6, zone: "base" });
    expect(game.p1.points()).toBe(0);
    expect((await scenario().resources(P1, { energy: 5, power: { order: 3 } }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
  });

  test("'As you play me, choose Bird, Cat, Dog, or Poro' — playing Ivern must raise a four-way choice for P1 before he settles on the board; no prompt is raised", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "ivern").build();
    await game.p1.play("ivern");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "pick" || d?.kind === "name").toBe(true);
    await chooseTag(game, "Poro");
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
  });

  test("conquer with Bird + Cat + Dog + Poro among your other units → the conquer point AND the ability's point: 2", async () => {
    const game = await conquerBoard(["bird", "cat", "dog", "poro"]).build();
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("tags are pooled across units: a single Cat+Dog unit, a Bird and a Poro satisfy 'all of the following tags among them' → 2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", CARD, "ivern")
      .unit(P1, "base", CATDOG, "catdog")
      .unit(P1, "base", BIRD, "bird")
      .unit(P1, "base", POUTY_PORO, "poro")
      .build();
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(2);
  });

  test("only three of the four tags (Bird, Cat, Dog — no Poro, and an untagged Ivern) → the 'if' fails → exactly 1 point; the engine ignores the tag filter and pays 2", async () => {
    const game = await conquerBoard(["bird", "cat", "dog"]).build();
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(1);
  });

  test("Ivern conquering ALONE (no tagged units at all) scores only the conquer point (1), not 2", async () => {
    const game = await conquerBoard([]).build();
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(1);
  });

  test("'YOUR units' — the four tags spread over ENEMY units do not count → 1 point (engine pays 2)", async () => {
    const game = await conquerBoard([])
      .unit(P2, "base", BIRD, "ebird")
      .unit(P2, "base", CAT, "ecat")
      .unit(P2, "base", DOG, "edog")
      .unit(P2, "base", POUTY_PORO, "eporo")
      .build();
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("units on the BOARD only — Bird, Cat, Dog in base but the Poro still in HAND → 1 point (engine pays 2)", async () => {
    const game = await conquerBoard(["bird", "cat", "dog"]).hand(P1, POUTY_PORO, "poro-in-hand").build();
    await conquerWithIvern(game);
    expect(game.zoneOf("poro-in-hand")).toBe("hand");
    expect(game.p1.points()).toBe(1);
  });

  test("hold with all four tags at home: the hold trigger is a Beginning-Phase chain item, then 2 points (hold + ability); nothing on the opponent's turn start", async () => {
    const game = await holdBoard(["bird", "cat", "dog", "poro"]).build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ivern", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1); // the hold point is in; the ability waits on the chain
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    await game.advanceTurn(); // → P2: not P1's hold
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  });

  test("hold with NO tagged friends → just the hold point (1); the engine pays 2", async () => {
    const game = await holdBoard([]).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'When I conquer' needs Ivern AT the battlefield: a Bird conquering while Ivern (and the full menagerie) idles in base scores only the normal point", async () => {
    const game = await conquerBoard(["bird", "cat", "dog", "poro"]).build();
    await game.p1.move("poro", "bf1"); // 2-Might Poro beats the 1-Might Sentry
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("ivern")).toBe("base");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("the chosen tag completes the set — Bird + Cat + Dog friends, choose 'Poro' as you play Ivern, and two turns later his conquer pays 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", BIRD, "bird")
      .unit(P1, "base", CAT, "cat")
      .unit(P1, "base", DOG, "dog")
      .hand(P1, CARD, "ivern")
      .build();
    await game.p1.play("ivern");
    await chooseTag(game, "Poro");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn(); // Ivern readied
    expect(game.state("ivern").isReady).toBe(true);
    await conquerWithIvern(game);
    expect(game.p1.points()).toBe(2);
  });

  test("partner — Friendship reads the gained tag: a lone Ivern that chose 'Cat' gets +1 Might (6 → 7) from Friendship", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "ivern").hand(P1, FRIENDSHIP, "friendship").build();
    await game.p1.play("ivern");
    await chooseTag(game, "Cat");
    await game.settle();
    await game.p1.cast("friendship", { targets: "ivern" });
    await game.settle();
    expect(game.state("ivern").might).toBe(7);
  });

  test("Friendship baseline (no chosen tag involved): with Bird + Poro friends on board it gives Ivern +2 this turn (6 → 8), gone next turn", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "ivern").unit(P1, "base", BIRD, "bird").unit(P1, "base", POUTY_PORO, "poro").hand(P1, FRIENDSHIP, "friendship").build();
    await game.p1.cast("friendship", { targets: "ivern" });
    await game.settle();
    expect(game.state("ivern").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("ivern").might).toBe(6);
  });

  test("Final Point (471.1.a.1): at 7 of 8 with two enemy battlefields, Ivern conquers one → the CONQUER point becomes a draw (471.1.b.1) but the ability's scored point is unrestricted → 8, P1 wins; a vanilla 6-drop in the same spot stays on 7", async () => {
    const game = await conquerBoard(["bird", "cat", "dog", "poro"]).points(P1, 7).victoryScore(8).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("ivern", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // the conquer's replacement draw
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);

    const plain = await scenario()
      .points(P1, 7)
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 6, name: "Treant" }, "treant")
      .build();
    await plain.p1.move("treant", "bf1");
    await plain.settle();
    expect(plain.p1.points()).toBe(7);
    expect(plain.isOver()).toBe(false);
  });
});
