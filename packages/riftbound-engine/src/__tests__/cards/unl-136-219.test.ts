/**
 * Scryer's Bloom — unl-136-219 · Gear · Chaos · 1 energy (no power)
 *
 *   This enters exhausted.
 *   Kill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP.
 *   (To Predict 2, look at the top two cards of your Main Deck. Recycle any of them and put the rest
 *   back in any order.)
 *
 * Rules: 369.3 ("enters exhausted" replaces the normal ready entry of gear), 151.2 (gear activated
 * abilities: your Main Phase, Open state, not in a showdown; it is not [Reaction]/[Add], so it is a
 * chain item), 202/203.1 (ALL of "Kill this, [1], [Exhaust]" are costs, paid on activation: the Bloom
 * is already in the trash and the energy gone while the ability waits on the chain), 436 (Predict 2:
 * look at two, recycle any subset to the bottom, rest back on top in any order; 436.4 short deck →
 * predict as many as possible, no burn out), "then draw 1" happens AFTER the predict (so you draw what
 * you chose to leave on top), 730.1 (gain 1 XP).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. It enters EXHAUSTED and [Exhaust] is part of the cost → never usable the turn it is played; it
 *     readies at your next Awaken and is a one-shot (Kill this) from then on.
 *  2. All three costs: 0 energy → not activatable even when ready; exhausted → not activatable even
 *     with energy; on activation exactly 1 energy is paid and the Bloom is in its owner's trash before
 *     anything resolves.
 *  3. Predict-then-draw ordering: top A, B, then C. Keep both as-is → draw A. Recycle A → draw B, C is
 *     the new top, A is on the bottom. Recycle both → draw C. Reorder to B, A → draw B.
 *  4. Exactly +1 XP, exactly +1 card, per activation.
 *  5. Timing: never on the opponent's turn, never inside a showdown.
 *  6. Registry: a static enters-exhausted AND an activated ability with cost {kill self, 1 energy,
 *     exhaust} → sequence [predict 2, draw 1, gain-xp 1].
 *
 *  7. "[Predict 2], THEN draw 1" (436 + the printed "then") demands the whole Predict — including the
 *     "put the rest back in any order" prompt — before "draw 1" and "gain 1 XP" run, so the drawn card
 *     is whatever the player chose to leave on top.
 *
 * Engine status when this file was written: the parser drops the whole activated ability (it emits a
 * stray costless `{type:"spell", effect: gain-xp 1}` next to the enters-exhausted static), so every
 * activation clause below is a `test.failing("BUG: …")` that flips once the ability exists and resolves
 * in printed order.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-136-219";
const A = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card A" } as const;
const B = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card B" } as const;
const C = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card C" } as const;

/** P1's turn, a READY Bloom in base, `energy`, deck (top first) a, b, c + filler. */
function ready(energy = 1) {
  return scenario().resources(P1, { energy }).gear(P1, CARD, "bloom").deck(P1, [A, B, C], ["a", "b", "c"]);
}

/** Activate the ready Bloom and drain to the Predict prompt; asserts the costs were paid up front. */
async function crack(game: Game): Promise<void> {
  expect(game.p1.can("activate", "bloom")).toBe(true);
  const before = game.p1.energy();
  await game.p1.activate("bloom");
  expect(game.p1.energy()).toBe(before - 1);
  expect(game.zoneOf("bloom")).toBe("trash"); // "Kill this" is a cost (203.1)
  expect(game.p1.trash()).toContain("bloom");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
}

/** The cards shown by the pending Predict prompt. */
function shown(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

describe("Scryer's Bloom (unl-136-219)", () => {
  test("cost & clause 1: 1 energy, lands in base EXHAUSTED (enters-exhausted static), nothing on the chain, no XP; 0 energy cannot play it", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "bloom").build();
    await game.p1.play("bloom");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("bloom")).toMatchObject({ cardType: "gear", isExhausted: true, zone: "base" });
    expect(game.p1.gear()).toEqual(["bloom"]);
    expect(game.p1.xp()).toBe(0);
    expect((await scenario().resources(P1, { energy: 0, power: { chaos: 3 } }).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
  });

  test.failing("BUG: unusable the turn it is played (enters exhausted), readies at P1's next Awaken and is THEN activatable with 1 energy — the 'Kill this, [1], [Exhaust]' activated ability is not parsed, so it is never offered", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "bloom").build();
    await game.p1.play("bloom");
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "bloom")).toBe(false); // exhausted: the [Exhaust] cost cannot be paid
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("bloom").isReady).toBe(true);
    await game.p1.tapRune(); // 1 energy from a channeled rune
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "bloom")).toBe(true);
  });

  test.failing("BUG: all three costs gate it — ready + 1 energy → legal; ready + 0 energy → not; exhausted + energy → not (activated ability missing: never legal)", async () => {
    expect((await ready(1).build()).p1.can("activate", "bloom")).toBe(true);
    expect((await ready(0).build()).p1.can("activate", "bloom")).toBe(false);
    const tapped = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "bloom", { exhausted: true }).build();
    expect(tapped.p1.can("activate", "bloom")).toBe(false);
    expect((await tapped.p1.try((p) => p.activate("bloom"))).ok).toBe(false);
    expect(tapped.zoneOf("bloom")).toBe("base");
    expect(tapped.p1.energy()).toBe(3);
  });

  test.failing("BUG: activation pays [1] + kills the Bloom up front, goes on the chain, then Predict 2 shows exactly a,b with hand/XP untouched; keeping both draws a, +1 XP (activated ability missing; and 'THEN draw 1' must wait for the predict)", async () => {
    // Expected (203.1 / 436 / 730.1): costs paid up front → chain item → predict prompt over a,b with hand and
    // XP untouched → keep both → draw a → b,c on top → +1 XP. Actual: at the prompt the hand already holds a
    // and XP is already 1; the follow-up order prompt then offers b AND c.
    const game = await ready(1).build();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("bloom");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bloom", controller: P1 })]);
    expect(game.p1.xp()).toBe(0); // nothing resolves before both pass
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(shown(game).sort()).toEqual(["a", "b"]);
    expect(game.p1.hand()).toHaveLength(hand0); // nothing drawn while the predict is being answered
    expect(game.p1.xp()).toBe(0); // and no XP yet either
    await game.p1.decline(); // recycle none
    await game.settle();
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ items: [expect.objectContaining({ card: "a" }), expect.objectContaining({ card: "b" })] });
      await game.p1.order(["a", "b"]);
      await game.settle();
    }
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.hand()).toContain("a");
    expect(game.p1.deck()[0]).toBe("b");
    expect(game.p1.deck()[1]).toBe("c");
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("bloom")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: Predict 2 — recycle the top card (a → bottom), keep b → 'then draw 1' draws b and c becomes the top card (activated ability missing)", async () => {
    const game = await ready(1).build();
    const deck0 = game.p1.deck().length;
    await crack(game);
    await game.p1.pick("a");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline(); // done recycling
      await game.settle();
    }
    expect(game.decision()?.kind).not.toBe("order"); // one card left on top: nothing to arrange
    expect(game.p1.hand()).toEqual(["b"]);
    expect(game.p1.deck()[0]).toBe("c");
    expect(game.p1.deck().at(-1)).toBe("a");
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p1.xp()).toBe(1);
  });

  test.failing("BUG: Predict 2 — recycle BOTH → a and b go to the bottom, the draw takes c (activated ability missing)", async () => {
    const game = await ready(1).build();
    await crack(game);
    const d = game.decision();
    if (d?.kind === "pick" && d.max >= 2) {
      await game.p1.pick("a", "b");
    } else {
      await game.p1.pick("a");
      await game.settle();
      await game.p1.pick("b");
    }
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual(["c"]);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["a", "b"]);
    expect(game.p1.xp()).toBe(1);
  });

  test.failing("BUG: Predict 2 — keep both but put them back as b, a → the draw takes b, a is the new top (436.1.a 'in any order'; activated ability missing)", async () => {
    const game = await ready(1).build();
    await crack(game);
    await game.p1.decline();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["b", "a"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["b"]);
    expect(game.p1.deck()[0]).toBe("a");
    expect(game.p1.deck()[1]).toBe("c");
    expect(game.p1.xp()).toBe(1);
  });

  test.failing("BUG: XP stacks with what you had (4 → 5) and exactly one card is drawn even with an empty hand (activated ability missing)", async () => {
    const game = await ready(1).xp(P1, 4).build();
    await crack(game);
    await game.p1.decline();
    await game.settle({ policy: "first" });
    expect(game.p1.xp()).toBe(5);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test.failing("BUG: timing (151.2) — legal in your open Main Phase, but NOT with Focus inside a showdown and NOT on the opponent's turn (activated ability missing: the first, positive expectation fails)", async () => {
    const open = await ready(2).build();
    expect(open.p1.can("activate", "bloom")).toBe(true);

    const sd = await ready(2).battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf1");
    expect((sd.decision() as ActionDecision).context).toBe("showdown");
    expect(sd.p1.can("activate", "bloom")).toBe(false);

    const BOLT = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Bolt", timing: "action" };
    const opp = await ready(2).active(P2).unit(P1, "base", { might: 3 }, "mine").hand(P2, BOLT, "bolt").build();
    expect(opp.p1.can("activate", "bloom")).toBe(false);
    await opp.p2.cast("bolt", { targets: "mine" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("activate", "bloom")).toBe(false);
  });

  test("only its CONTROLLER could ever use it: P2 is never offered P1's Bloom", async () => {
    const game = await ready(2).active(P2).resources(P2, { energy: 5 }).build();
    expect(game.p2.can("activate", "bloom")).toBe(false);
    expect((await game.p2.try((p) => p.activate("bloom"))).ok).toBe(false);
    expect(game.zoneOf("bloom")).toBe("base");
  });

  test.failing("BUG: registry payload should be [static enters-exhausted, activated {cost: kill self + 1 energy + exhaust} → sequence(predict 2, draw 1, gain-xp 1)]; the parser emits a stray costless `spell: gain-xp 1` in place of the activated ability", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "chaos", energyCost: 1, name: "Scryer's Bloom" });
    expect(def?.powerCost ?? []).toEqual([]);
    type Ab = { type: string; cost?: Record<string, unknown>; effect?: { type?: string; effects?: Record<string, unknown>[] } };
    const abilities = (def?.abilities ?? []) as Ab[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { type: "enters-exhausted" }, type: "static" });
    expect(abilities.some((a) => a.type === "spell")).toBe(false); // a gear has no spell abilities
    const act = abilities.find((a) => a.type === "activated");
    expect(act).toBeDefined();
    expect(act?.cost).toMatchObject({ energy: 1, exhaust: true, kill: "self" });
    const steps = act?.effect?.type === "sequence" ? (act.effect.effects ?? []) : [act?.effect ?? {}];
    expect(steps).toEqual([
      expect.objectContaining({ amount: 2, type: "predict" }),
      expect.objectContaining({ amount: 1, type: "draw" }),
      expect.objectContaining({ amount: 1, type: "gain-xp" }),
    ]);
  });
});
