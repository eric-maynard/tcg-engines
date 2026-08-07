/**
 * Apprentice Mage — ven-047-166 · Unit · Mind · 3 energy · 3 Might
 *
 *   [Empower] [2] ([2]: Empower me. Use only if not Empowered.)
 *   When I become [Empowered], [Predict 2]. (Look at the top 2 cards of your Main Deck. Recycle any
 *   of them and put the rest back in any order.)
 *   [Empowered][>] I have +1 [Might].
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. [Empower] [2] is an activated ability (827.1.c.1): pays 2 energy up front, becomes a NON-triggered chain
 *     item (377.3) the opponent may respond to; only on my turn in an Open state (381 / 145.2 — not inside a
 *     showdown); illegal while already Empowered.
 *  2. "When I become Empowered" is its own TRIGGERED ability keyed on the false→true edge (441.2.a / 828.1.d):
 *     it fires whoever empowers her (her own ability, Sanction, …) but NOT on a redundant empower of an
 *     already-Empowered Mage (441.1.c). Predict 2 = look at top 2, recycle any (→ bottom), rest back on top.
 *  3. Killed in response to her own [Empower]: the ability resolves with its source gone — nothing is
 *     empowered (124 / 441.2: Empowered is a board status), no Predict, energy stays spent (425.1).
 *  4. [Empowered][>] +1 is live exactly while Empowered (828.1.c) and persists across turns; a turn-only
 *     empower (Sanction) gives 4 Might now and 3 after the turn.
 *  5. Cost edges: play 3; ability exactly 2 (1 short → not offered); with 2 floating she can Empower the turn
 *     she is played even though she is exhausted (no [Exhaust] in the cost).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-047-166";
const SANCTION = "ven-035-166"; // Calm Reaction: mode 0 = Empower a unit, disempower it at end of turn
const TOP_A = { cardType: "spell", energyCost: 0, name: "Top A" };
const TOP_B = { cardType: "spell", energyCost: 0, name: "Top B" };
const KILL_SHOT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill Shot",
  timing: "reaction",
};

/** Mage in P1's base with `energy`, and two known cards on top of P1's deck: a (top), then b. */
function board(energy = 2) {
  return scenario().resources(P1, { energy }).unit(P1, "base", CARD, "mage").deckTop(P1, TOP_A, "a").deckTop(P1, TOP_B, "b");
}

describe("Apprentice Mage (ven-047-166)", () => {
  test("parsed abilities should be activated [Empower] [2] + a 'when I become Empowered → Predict 2' trigger + the while-empowered +1 static; the trigger is missing", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.find((a) => a.type === "activated")).toMatchObject({
      cost: { energy: 2 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
    });
    expect(abilities.find((a) => a.type === "static")).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 1, type: "modify-might" } });
    const trig = abilities.find((a) => a.type === "triggered") as { trigger?: { event?: string }; effect?: { type?: string; amount?: number } } | undefined;
    expect(trig).toBeDefined();
    expect(trig?.trigger?.event).toBe("empower");
    expect(trig?.effect).toMatchObject({ amount: 2, type: "predict" });
  });

  test("cost: 3 energy, enters the base exhausted at 3 Might, not Empowered; 2 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "mage").build();
    await game.p1.play("mage");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("mage")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 3, zone: "base" });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mage").build()).p1.can("play", "mage")).toBe(false);
  });

  test("[Empower] [2]: pays exactly 2 up front, sits on the chain as a non-triggered item P2 may answer, resolves → Empowered and 4 Might", async () => {
    const game = await board(3).build();
    expect(game.p1.can("activate", "mage")).toBe(true);
    await game.p1.activate("mage");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mage", controller: P1, triggered: false })]);
    expect(game.state("mage").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("mage")).toMatchObject({ baseMight: 3, isEmpowered: true, might: 4 });
    expect(game.state("mage").isExhausted).toBe(false); // no [Exhaust] in the cost
  });

  test("negative space — 1 energy, already Empowered (827.1.c.1), the opponent's turn (381), or an open showdown (145.2): the ability is not offered", async () => {
    expect((await board(1).build()).p1.can("activate", "mage")).toBe(false);
    const already = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "mage", { empowered: true }).build();
    expect(already.p1.can("activate", "mage")).toBe(false);
    const theirTurn = await scenario().active(P2).resources(P1, { energy: 2 }).unit(P1, "base", CARD, "mage").build();
    expect(theirTurn.p1.can("activate", "mage")).toBe(false);
    const showdown = await scenario().resources(P1, { energy: 2 }).battlefield("bf1").unit(P1, "base", CARD, "mage").unit(P1, "base", { might: 2 }, "scout").build();
    await showdown.p1.move("scout", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("activate", "mage")).toBe(false);
  });

  test("freshly played (exhausted) with 2 floating she can still Empower the same turn: 5 energy → play, activate, 4 Might, pool empty", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "mage").build();
    await game.p1.play("mage");
    await game.settle();
    await game.p1.activate("mage");
    expect(game.p1.energy()).toBe(0);
    await game.settle({ policy: "first" }); // take whatever Predict prompts appear
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, isExhausted: true, might: 4 });
  });

  test("when she becomes Empowered via her own ability → Predict 2: I am shown my top 2 (a, b), recycle 'a' to the bottom, 'b' becomes the top card", async () => {
    // Actual: no trigger exists, so no Predict prompt is ever raised.
    const game = await board(2).build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    await game.p1.activate("mage");
    await game.settle();
    expect(game.state("mage").isEmpowered).toBe(true);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["a", "b"]);
    await game.p1.pick("a");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.deck()[0]).toBe("b");
    expect(game.p1.deck().at(-1)).toBe("a");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Predict 2 declining every recycle keeps both cards and lets me reorder them (436.1.a) — [a, b] → [b, a]", async () => {
    const game = await board(2).build();
    await game.p1.activate("mage");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.decision()?.kind).toBe("order");
    await game.p1.order(["b", "a"]);
    await game.settle();
    expect(game.p1.deck().slice(0, 2)).toEqual(["b", "a"]);
  });

  test("becoming Empowered from ANOTHER source (Sanction) also fires Predict 2 (441.2.a / 828.1.d)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "mage")
      .hand(P1, SANCTION, "sanc")
      .deckTop(P1, TOP_A, "a")
      .deckTop(P1, TOP_B, "b")
      .build();
    await game.p1.cast("sanc");
    await game.settle();
    await game.p1.chooseMode(0);
    if (game.decision()?.kind === "pick" && (game.decision() as PickDecision).options.some((o) => o.card === "mage" || o.key === "mage")) {
      await game.p1.pick("mage");
    }
    await game.settle();
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["a", "b"]);
  });

  test("negative space — a redundant empower of an already-Empowered Mage is not 'becoming' Empowered (441.1.c): no Predict prompt, still 4 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "mage", { empowered: true })
      .hand(P1, SANCTION, "sanc")
      .deckTop(P1, TOP_A, "a")
      .build();
    await game.p1.cast("sanc");
    await game.settle();
    await game.p1.chooseMode(0);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mage");
    }
    await game.settle();
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck()[0]).toBe("a");
  });

  test("killed in response to her own [Empower] — the ability fizzles: the card in the trash is NOT Empowered (124.1 / 441.2), no Predict, the 2 energy stays spent", async () => {
    // Actual: the trashed card is flagged empowered.
    const game = await board(2).hand(P2, KILL_SHOT, "shot").build();
    await game.p1.activate("mage");
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: "mage" });
    await game.settle();
    expect(game.zoneOf("mage")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no Predict prompt
    expect(game.state("mage").isEmpowered).toBe(false);
  });

  test("[Empowered][>] +1 persists across turns and keeps [Empower] switched off: two turns later still 4 Might, ability not offered even with energy", async () => {
    const game = await board(2).build();
    await game.p1.activate("mage");
    await game.settle({ policy: "first" });
    expect(game.state("mage").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.p1.can("activate", "mage")).toBe(false);
  });

  test("turn-only empower (Sanction): 4 Might this turn, back to a 3-Might non-Empowered Mage next turn — and then her own [Empower] is legal again", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", CARD, "mage").hand(P1, SANCTION, "sanc").build();
    await game.p1.cast("sanc");
    await game.settle();
    await game.p1.chooseMode(0);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mage");
    }
    await game.settle({ policy: "first" });
    expect(game.state("mage").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("mage")).toMatchObject({ isEmpowered: false, might: 3 });
    await game.advanceTurn();
    await game.p1.tapRunes(2);
    expect(game.p1.can("activate", "mage")).toBe(true);
  });
});
