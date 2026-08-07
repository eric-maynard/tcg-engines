/**
 * Clairvoyance — ven-056-166 · Spell · Mind · 7 energy (no power)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Predict 5]. (Look at the top 5 cards of your Main Deck. Recycle any of them and put the rest
 *   back in any order.)
 *   Draw 2.
 *
 * Rules: 813 (Reaction = Action's permissions + "may be played during Closed States on any player's
 * turn"; it grants no priority of its own — in a Neutral Open State on the opponent's turn nobody but
 * the turn player acts), 327/332 (LIFO: a Reaction on top of a chain resolves before what it answers),
 * 436 (Predict X: look at X, recycle ANY subset to the bottom, rest back on top in ANY order; 436.4 a
 * short deck predicts as many as possible and never Burns Out), printed order (the Predict — including
 * its "put the rest back" arrangement — completes before "Draw 2", so you draw what you left on top).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Draw-what-you-arranged: keep a..e as is → draw a,b; put e,d on top → draw e,d; recycle a,b,c →
 *     draw d,e and f surfaces; recycle all five → draw f,g (the recycled five sit on the bottom).
 *  2. Nothing is drawn while the Predict prompt is open (hand size unchanged mid-resolution).
 *  3. Short deck (3 cards): Predict 3, then draw 2 → one card left, game goes on (436.4.a).
 *  4. Reaction timing: on P2's turn P1 answers P2's Rune Prison; Clairvoyance resolves FIRST — P1 is
 *     arranging/drawing while the Prison still waits on the chain and the unit is not yet stunned.
 *  5. Negative space: on P2's quiet turn (empty chain, no showdown) P1 has no priority → not castable
 *     even with 7 energy; and 6 energy is never enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-056-166";
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit. — 2 energy + [calm]

const NAMES = ["a", "b", "c", "d", "e", "f", "g"] as const;
const known = (n: string) => ({ abilities: [], cardType: "spell", domain: "mind", energyCost: 9, name: `Card ${n.toUpperCase()}` });

/** P1 to act with `energy`, Clairvoyance in hand, deck (top first) a,b,c,d,e,f,g + filler. */
function ready(energy = 7) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "clv").deck(P1, NAMES.map(known), [...NAMES]);
}

/** Cast, let it resolve, and stop at the Predict prompt. */
async function castToPrompt(game: Game): Promise<void> {
  await game.p1.cast("clv");
  expect(game.p1.energy()).toBe(0);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
}

function shown(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Recycle the given cards one prompt at a time (or all at once if the prompt allows), then finish. */
async function recycle(game: Game, cards: string[]): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.max >= cards.length && cards.length > 1) {
    await game.p1.pick(...cards);
    await game.settle();
  } else {
    for (const c of cards) {
      await game.p1.pick(c);
      await game.settle();
    }
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.decline();
    await game.settle();
  }
}

describe("Clairvoyance (ven-056-166)", () => {
  test("registry payload: Mind 7-cost Reaction spell → sequence [predict 5, draw 2]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 7, name: "Clairvoyance", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { effects: [{ amount: 5, type: "predict" }, { amount: 2, type: "draw" }], type: "sequence" }, timing: "reaction", type: "spell" },
    ]);
  });

  test("cost: exactly 7 energy on your own turn (one chain item); 6 energy + power → not castable", async () => {
    const game = await ready(7).build();
    expect(game.p1.can("cast", "clv")).toBe(true);
    await game.p1.cast("clv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "clv", controller: P1, triggered: false })]);
    const poor = await ready(6).resources(P1, { power: { mind: 3 } }).build();
    expect(poor.p1.can("cast", "clv")).toBe(false);
    expect((await poor.p1.try((p) => p.cast("clv"))).ok).toBe(false);
    expect(poor.zoneOf("clv")).toBe("hand");
  });

  test("Predict 5 shows exactly the top five (a–e, not f/g); nothing is drawn while the prompt is open; keep all in place → Draw 2 takes a,b and c,d,e stay on top; spell → trash", async () => {
    const game = await ready().build();
    await castToPrompt(game);
    expect(shown(game).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(game.p1.hand()).toEqual([]); // Draw 2 waits for the predict
    await game.p1.decline(); // recycle none
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["a", "b", "c", "d", "e"]);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    expect(game.p1.deck().slice(0, 4)).toEqual(["c", "d", "e", "f"]);
    expect(game.zoneOf("clv")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'in any order' with all FIVE kept — stacking them e,d,c,b,a must be legal (436.1.a) so Draw 2 takes e,d and c is the new top; the engine only offers the unchanged order once more than 4 cards remain", async () => {
    // Expected: any of the 120 arrangements is a legal answer. Actual: permutations are enumerated
    // only for ≤ 4 cards, so with 5 kept the sole legal "order" is a,b,c,d,e and e,d,c,b,a is rejected.
    const game = await ready().build();
    await castToPrompt(game);
    await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("order");
    await game.p1.order(["e", "d", "c", "b", "a"]);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d", "e"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["c", "b", "a"]);
  });

  test("'in any order' (four kept): recycle a, then stack e,d,c,b → Draw 2 takes e and d; c then b on top, a on the bottom", async () => {
    const game = await ready().build();
    await castToPrompt(game);
    await recycle(game, ["a"]);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["e", "d", "c", "b"]);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d", "e"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["c", "b", "f"]);
    expect(game.p1.deck().at(-1)).toBe("a");
  });

  test("recycle three (a,b,c → bottom): the two kept cards d,e are drawn, f becomes the top card, deck shrinks by exactly the 2 drawn", async () => {
    const game = await ready().build();
    const deck0 = game.p1.deck().length;
    await castToPrompt(game);
    await recycle(game, ["a", "b", "c"]);
    if (game.decision()?.kind === "order") {
      await game.p1.order(["d", "e"]);
      await game.settle();
    }
    expect(game.p1.hand().sort()).toEqual(["d", "e"]);
    expect(game.p1.deck()[0]).toBe("f");
    expect(game.p1.deck().slice(-3).sort()).toEqual(["a", "b", "c"]);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
  });

  test("recycle ALL five: nothing to arrange, Draw 2 digs into f and g; a–e are the bottom five", async () => {
    const game = await ready().build();
    await castToPrompt(game);
    await recycle(game, ["a", "b", "c", "d", "e"]);
    expect(game.decision()?.kind).not.toBe("order");
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["f", "g"]);
    expect(game.p1.deck().slice(-5).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("short deck (436.4): with only 3 cards left it predicts 3, then draws 2 — one card remains and nobody burns out", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 7 })
      .hand(P1, CARD, "clv")
      .deck(P1, ["a", "b", "c"].map(known), ["a", "b", "c"])
      .build();
    expect(game.p1.deck()).toEqual(["a", "b", "c"]);
    await castToPrompt(game);
    expect(shown(game).sort()).toEqual(["a", "b", "c"]);
    await game.p1.decline();
    await game.settle();
    if (game.decision()?.kind === "order") {
      await game.p1.order(["a", "b", "c"]);
      await game.settle();
    }
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    expect(game.p1.deck()).toEqual(["c"]);
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(0);
  });

  test("[Reaction] on the opponent's turn: P1 answers P2's Rune Prison; Clairvoyance resolves FIRST (predict + draw 2 while the Prison still waits, unit not yet stunned), then the Prison stuns", async () => {
    const game = await ready()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", { might: 3, name: "Victim" }, "victim")
      .hand(P2, RUNE_PRISON, "prison")
      .build();
    expect(game.p1.can("cast", "clv")).toBe(false); // quiet Neutral Open state: no priority for P1
    await game.p2.cast("prison", { targets: "victim" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "clv")).toBe(true);
    await game.p1.cast("clv");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["prison", "clv"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Clairvoyance) resolves
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(shown(game).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["prison"]);
    expect(game.state("victim").isStunned).toBe(false);
    await game.p1.decline();
    await game.settle();
    if (game.decision()?.kind === "order") {
      await game.p1.order(["a", "b", "c", "d", "e"]);
    }
    await game.settle(); // remaining passes → Rune Prison resolves
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    expect(game.zoneOf("clv")).toBe("trash");
    expect(game.state("victim").isStunned).toBe(true);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] inside a showdown on your own turn: after attacking, P1 (Focus) may cast it mid-showdown and draws before combat resolves", async () => {
    const game = await ready()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "clv")).toBe(true);
    await game.p1.cast("clv");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).toBe("pick");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1"); // combat has not resolved yet
    await game.p1.decline();
    await game.settle();
    if (game.decision()?.kind === "order") {
      await game.p1.order(["a", "b", "c", "d", "e"]);
    }
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["a", "b"]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
