/**
 * Diana, Lunari — unl-079-219 · Champion Unit (Diana) · Mind · 3 energy (no power) · 3 might
 *
 *   When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card
 *   of your Main Deck. If it's a spell, draw it. (To Predict, look at the top card of your Main
 *   Deck. You may recycle it.)
 *
 * Rules: 340–345 (a Showdown begins whenever a battlefield becomes Contested — combat or not — and
 * whoever applied Contested gets Focus), 383 (this is a plain triggered ability keyed to an EVENT at
 * Diana's location, not an Attack Trigger: it fires when she attacks, when she is attacked, and when
 * she walks onto an empty non-friendly battlefield), 135.2 ("you may pay [1]. If you do …" — paying is
 * an optional game action; unpayable → nothing), 436 (Predict 1: look at the top card, may recycle it
 * to the bottom; no burn out on a short deck), 128/359 (reveal exactly ONE card — the top card AFTER
 * the predict; a non-spell stays on top, a spell is drawn).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. "here" is Diana's battlefield at the moment the showdown begins: a showdown at ANOTHER
 *     battlefield, or any showdown while Diana sits in base, triggers nothing.
 *  2. Fires on DEFENCE too (opponent's turn) — the pay/predict/reveal is P1's decision mid-P2-turn.
 *  3. Fires for a NON-combat showdown (Diana alone onto an open battlefield) before she conquers.
 *  4. Predict-then-reveal ordering is the whole point: top = unit, 2nd = spell → recycle the unit,
 *     reveal the spell, draw it. Keep the unit instead → reveal the unit → no draw, it stays on top.
 *  5. Exactly one card is revealed — never "reveal until you hit a spell" (parsed payload says
 *     `until: "spell"`, which is suspicious → dedicated negative test).
 *  6. Pay [1] with 0 energy → cannot accept; declining keeps energy and touches nothing.
 *  7. The trigger resolves on the showdown chain BEFORE combat damage; the fight then proceeds normally.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-079-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla unit
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Moonbolt",
  timing: "action",
} as const;

/** Diana ready in base, Foe at P2's bf1, an open bf2; P1 deck (top first) per `deck`. */
function board(deck: readonly (string | typeof BOLT)[], aliases: readonly string[], energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P1, "base", CARD, "diana")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .deck(P1, deck, aliases);
}

/** After the showdown began: drain to Diana's "you may pay [1]" prompt. */
async function toPayPrompt(game: Game): Promise<void> {
  expect(game.chain().some((i) => i.cardId === "diana" && i.triggered && i.controller === P1)).toBe(true);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/** Answer the Predict look: recycle the shown card (true) or keep it (false). Asserts what was shown. */
async function predict(game: Game, shown: string, recycle: boolean): Promise<void> {
  // rule 402 (finalization): the "you may pay [1]" is answered when the trigger is put on the chain;
  // the predict itself only happens when that chain item resolves.
  if (game.decision()?.kind !== "pick") {
    await game.settle();
  }
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual([shown]);
  if (recycle) {
    await game.p1.pick(shown);
  } else {
    await game.p1.decline();
  }
}

describe("Diana, Lunari (unl-079-219)", () => {
  test("registry payload: ONE optional showdown-begin@here trigger; pay 1 energy; sequence = predict 1, then reveal 1 from deck drawing it if it is a spell", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, isChampion: true, might: 3, name: "Diana, Lunari", tags: ["Diana"] });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { effects: [{ amount: 1, type: "predict" }, { amount: 1, from: "deck", type: "reveal" }], type: "sequence" },
      optional: true,
      trigger: { event: "showdown-begin", on: { location: "here" } },
      type: "triggered",
    });
    const reveal = ((abilities[0].effect as { effects: Record<string, unknown>[] }).effects[1] ?? {}) as Record<string, unknown>;
    expect(JSON.stringify(reveal)).toMatch(/spell/); // the "if it's a spell, draw it" rider is encoded
    expect(JSON.stringify(reveal)).toMatch(/draw/);
  });

  test("cost: 3 energy, no power; enters base exhausted at 3 might with no trigger (no showdown); 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "diana").build();
    await game.p1.play("diana");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().some((i) => i.cardId === "diana" && i.triggered)).toBe(false);
    await game.settle();
    expect(game.zoneOf("diana")).toBe("base");
    expect(game.state("diana")).toMatchObject({ isExhausted: true, might: 3 });
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 2 } }).hand(P1, CARD, "d").build()).p1.can("play", "d")).toBe(false);
  });

  test("Diana attacks bf1 → showdown begins here → 'you may pay [1]'; declining keeps the energy, deck and hand untouched, and the 3-vs-2 fight conquers", async () => {
    const game = await board([FILLER, BOLT, FILLER], ["u1", "bolt", "u3"]).build();
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["u1", "bolt", "u3"]);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("pay [1], PREDICT recycles the top unit to the bottom, then the REVEALED top card is the spell → drawn; combat still resolves afterwards", async () => {
    const game = await board([FILLER, BOLT, FILLER], ["u1", "bolt", "u3"]).build();
    const deckSize = game.p1.deck().length;
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await predict(game, "u1", true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.p1.deck().at(-1)).toBe("u1"); // recycled → bottom (436.1)
    expect(game.p1.deck()[0]).toBe("u3");
    expect(game.p1.deck()).toHaveLength(deckSize - 1);
    // The trigger resolved on the showdown chain; the fight then went ahead: 3 ≥ 2.
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("diana")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("pay [1], KEEP the unit on top → the revealed card is that unit: nothing is drawn and it stays on top of the deck (not trashed, not bottomed)", async () => {
    const game = await board([FILLER, BOLT, FILLER], ["u1", "bolt", "u3"]).build();
    const deckSize = game.p1.deck().length;
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    await predict(game, "u1", false);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["u1", "bolt", "u3"]);
    expect(game.p1.deck()).toHaveLength(deckSize);
    expect(game.p1.trash()).toEqual([]);
  });

  test("spell already on top: keep it in the predict, reveal it, draw it — the card under it becomes the new top", async () => {
    const game = await board([BOLT, FILLER], ["bolt", "u2"]).build();
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    await predict(game, "bolt", false);
    await game.settle();
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.p1.deck()[0]).toBe("u2");
  });

  test("exactly ONE card is revealed: unit on top (kept), spell second → NO draw — it must not dig 'until' a spell", async () => {
    const game = await board([FILLER, FILLER, BOLT], ["u1", "u2", "bolt"]).build();
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    await predict(game, "u1", true); // bottom u1; new top is u2 (a unit)
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("bolt")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("u2");
    expect(game.p1.deck()[1]).toBe("bolt");
  });

  test("0 energy: the payment cannot be made — 'yes' is refused, nothing is looked at or drawn, and the fight just happens", async () => {
    const game = await board([BOLT, FILLER], ["bolt", "u2"], 0).build();
    await game.p1.move("diana", "bf1");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("bolt");
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("fires on DEFENCE (not an attack trigger): P2 attacks Diana's battlefield on P2's turn → P1 is asked, pays, predicts and draws the spell mid-enemy-turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "diana")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .deck(P1, [BOLT, FILLER], ["bolt", "u2"])
      .build();
    await game.p2.move("raider", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await predict(game, "bolt", false);
    await game.settle();
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.zoneOf("raider")).toBe("trash"); // 3 ≥ 1, Diana holds
    expect(game.locationOf("diana")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("fires for a NON-combat showdown: Diana alone onto the open bf2 → pay, predict, reveal/draw, then she conquers it unopposed", async () => {
    const game = await board([BOLT, FILLER], ["bolt", "u2"]).build();
    await game.p1.move("diana", "bf2");
    await toPayPrompt(game);
    await game.p1.yes();
    await predict(game, "bolt", false);
    await game.settle();
    await game.settle(); // close the uncontested showdown if it was handed back
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'HERE' only: a showdown at ANOTHER battlefield (Scout attacks bf1 while Diana sits at bf2) triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "bf2", CARD, "diana")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .deck(P1, [BOLT], ["bolt"])
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.chain().some((i) => i.cardId === "diana")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toEqual([]);
  });

  test("Diana in BASE is never 'here' for any showdown: Scout's attack on bf1 leaves her silent (energy, hand and deck untouched)", async () => {
    const game = await board([BOLT], ["bolt"]).build();
    await game.p1.move("scout", "bf1");
    expect(game.chain().some((i) => i.cardId === "diana")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("bolt")).toBe("mainDeck");
  });

  test("chain order: Diana's trigger sits on the showdown chain and resolves (draw happens) while Foe is still alive — combat damage only after the showdown closes", async () => {
    const game = await board([BOLT, FILLER], ["bolt", "u2"]).build();
    await game.p1.move("diana", "bf1");
    await toPayPrompt(game);
    await game.p1.yes();
    await predict(game, "bolt", false);
    // Right after the trigger finished: card in hand, Foe untouched, showdown still open with P1 holding Focus.
    for (let i = 0; i < 3 && game.decision()?.kind !== "action"; i++) {
      await game.settle({ maxSteps: 1 });
    }
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });
});
