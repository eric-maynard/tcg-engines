/**
 * Sona, Harmonious — ven-sp2-006 (alt printing of ogn-073-298)
 * Champion Unit · Calm · 4 energy + [calm] · 4 Might · Sona
 *
 *   At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes.
 *
 * Head-judge checklist for this card:
 *   1. rule 383.2.a.1 — "if I'm at a battlefield" sits right after the trigger condition, so it is
 *      part of the CONDITION: checked once when the Ending Step happens; nothing goes on the chain
 *      from the base, and (the rule's own example) removing Sona in response does NOT stop it.
 *   2. rule 355.13 "up to 4" — 0..4 runes; with 5+ exhausted runes exactly the chosen ≤4 ready;
 *      choosing 5 is illegal; with nothing exhausted the trigger must not stall the turn.
 *   3. "friendly runes" — the opponent's runes are never offered nor readied.
 *   4. rule 317.1 vs 315.1 — only at the end of YOUR turn; the next player's Awaken readies only
 *      their own permanents, so Sona's readied runes stay ready through the opponent's turn.
 *   5. The condition is a snapshot at end of turn: a Sona that walked onto a battlefield this
 *      turn (conquering an empty one) qualifies even though she started the turn in base.
 *   6. Cost: 4 energy + 1 calm power; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-sp2-006";
const RETREAT = "ogn-104-298"; // [Reaction] 1 energy: return a friendly unit to hand; owner channels 1 rune exhausted

function withSonaAt(where: "bf1" | "base", exhaustedRunes: number) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, where, CARD, "sona", { exhausted: true })
    .runes(P1, "calm", exhaustedRunes, { exhausted: true })
    .runes(P2, "fury", 2, { exhausted: true });
}

/** End P1's turn, pass to the rune prompt, and return it (asserting it is Sona's). */
async function endTurnToRunePrompt(game: Game): Promise<PickDecision> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sona" } });
  return d;
}

describe("Sona, Harmonious (ven-sp2-006)", () => {
  test("registry payload: one end-of-turn trigger, at-battlefield condition, ready up-to-4 friendly runes", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, isChampion: true, might: 4, powerCost: ["calm"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { type: "while-at-battlefield" },
      effect: { target: { controller: "friendly", quantity: { upTo: 4 }, type: "rune" }, type: "ready" },
      trigger: { event: "end-of-turn", on: "controller" },
      type: "triggered",
    });
  });

  test("cost: 4 energy + 1 calm deducted, enters the base exhausted; unaffordable without the calm pip or at 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "sona").build();
    await game.p1.play("sona");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("sona")).toBe("base");
    expect(game.state("sona")).toMatchObject({ isExhausted: true, might: 4 });
    const noCalm = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "sona").build();
    expect(noCalm.p1.can("play", "sona")).toBe(false);
    const short = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "sona").build();
    expect(short.p1.can("play", "sona")).toBe(false);
  });

  test("'up to 4' with 5 exhausted runes: only MY runes are offered (max 4); the 4 chosen become ready, the 5th stays exhausted", async () => {
    const game = await withSonaAt("bf1", 5).build();
    const d = await endTurnToRunePrompt(game);
    const mine = game.p1.runes();
    expect(d.max).toBe(4);
    expect(d.options.map((o) => o.card).sort()).toEqual([...mine].sort()); // none of P2's fury runes
    await game.p1.pick(...mine.slice(0, 4));
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true }).sort()).toEqual(mine.slice(0, 4).sort());
    expect(game.state(mine[4] as string).isExhausted).toBe(true);
    // "friendly": the opponent's exhausted runes were not touched (their own Awaken readies them).
    expect(game.violations()).toEqual([]);
  });

  test("choosing 5 runes is rejected (rule 355.13: at most 4)", async () => {
    const game = await withSonaAt("bf1", 5).build();
    await endTurnToRunePrompt(game);
    const r = await game.p1.try((p) => p.pick(...game.p1.runes()));
    expect(r.ok).toBe(false);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("'up to' lets me choose fewer: picking 2 of 3 readies exactly those 2; declining readies none and the turn still passes", async () => {
    const two = await withSonaAt("bf1", 3).build();
    await endTurnToRunePrompt(two);
    const [a, b, c] = two.p1.runes() as [string, string, string];
    await two.p1.pick(a, b);
    // The engine offers an "any more?" continuation for the remaining rune — stop choosing here.
    expect(two.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await two.p1.decline();
    await two.settle();
    expect(two.turnPlayer()).toBe(P2);
    expect(two.p1.runes({ ready: true }).sort()).toEqual([a, b].sort());
    expect(two.state(c).isExhausted).toBe(true);

    const none = await withSonaAt("bf1", 3).build();
    const d = await endTurnToRunePrompt(none);
    expect(d.allowDecline).toBe(true);
    await none.p1.decline();
    await none.settle();
    expect(none.turnPlayer()).toBe(P2);
    expect(none.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("readied runes survive into the opponent's turn (their Awaken only readies their own permanents)", async () => {
    const game = await withSonaAt("bf1", 4).build();
    await endTurnToRunePrompt(game);
    await game.p1.pick(...game.p1.runes());
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
    expect(game.state("sona").isExhausted).toBe(true); // Sona readies RUNES, not herself
  });

  test("no runes at all: the trigger still fires (condition met) but resolves without stalling the turn hand-off", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "sona").build();
    await game.p1.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("condition (rule 383.2.a.1): Sona in the BASE at end of turn — nothing goes on the chain, no rune is readied", async () => {
    const game = await withSonaAt("base", 3).build();
    await game.p1.endTurn();
    expect(game.chain().some((c) => c.cardId === "sona")).toBe(false);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("only YOUR turn: the opponent ending their turn with my Sona at a battlefield triggers nothing", async () => {
    const game = await withSonaAt("bf1", 3).turn(3).active(P2).build();
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "sona")).toBe(false);
    // Straight into P1's turn with no prompt for P1 to choose runes (P1's own Awaken readies them — turn structure, not Sona).
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });

  test("rule 383.2.a.1 example: Sona returned to hand IN RESPONSE to her own trigger — it still resolves and readies runes", async () => {
    const game = await withSonaAt("bf1", 3).resources(P1, { energy: 1 }).hand(P1, RETREAT, "retreat").build();
    await game.p1.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
    // P1 holds priority first and answers with Retreat on Sona.
    await game.p1.cast("retreat", { targets: "sona" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "retreat"]);
    const r = await game.settle(); // Retreat resolves (Sona → hand, +1 exhausted rune), then Sona's trigger asks for runes
    expect(game.zoneOf("sona")).toBe("hand");
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sona" } });
    const exhausted = game.p1.runes({ ready: false });
    expect(exhausted.length).toBe(4); // 3 placed + 1 channeled exhausted by Retreat
    await game.p1.pick(...exhausted.slice(0, 4));
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
  });

  test("snapshot at end of turn: a ready Sona that conquered an empty battlefield THIS turn triggers when the turn ends", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "sona") // ready
      .runes(P1, "calm", 2, { exhausted: true })
      .build();
    await game.p1.move("sona", "bf1");
    await game.settle();
    expect(game.locationOf("sona")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const d = await endTurnToRunePrompt(game);
    expect(d.options).toHaveLength(2);
    await game.p1.pick(...game.p1.runes());
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
