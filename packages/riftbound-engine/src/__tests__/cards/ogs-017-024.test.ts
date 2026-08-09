/**
 * Dark Child - Starter — ogs-017-024 · Legend (Annie) · Fury/Chaos
 *
 *   At the end of your turn, ready up to 2 runes.
 *
 * Rules: 317.1 (Ending Step: "at the end of the turn" abilities trigger and resolve in the Ending
 * Phase, before the turn passes), 383.3 (a triggered ability goes on the chain and both players get
 * priority), 355.13 ("up to 2" = 0, 1 or 2 — the chooser's call), 415.1.b/c (readying a ready object
 * does nothing but is a legal choice), 315.1.b (Awaken readies only the TURN player's objects — so
 * runes readied at the end of MY turn stay ready through YOUR turn), 317.2.d (the rune POOL empties
 * at end of turn — energy is lost, but a READY RUNE is a permanent, not pooled energy, and survives),
 * 159 (a rune's [Exhaust]: Add [1] is a Reaction — usable whenever its controller has priority/focus).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The payoff is Reaction mana on the OPPONENT's turn: two runes tapped on my turn come back ready
 *     at end of turn, survive P2's Awaken (which readies only P2's things) and can be exhausted for a
 *     [Reaction] spell inside P2's showdown. Floating energy would NOT survive (317.2.d) — ready runes do.
 *  2. "up to 2": three exhausted → exactly two (a third pick is illegal); one exhausted → that one;
 *     zero may be chosen (decline) and the turn still ends cleanly; no runes at all → the trigger
 *     still goes on the chain and resolves doing nothing.
 *  3. Only YOUR turn's end: P2 ending their turn puts nothing on the chain and readies none of my runes.
 *  4. It is a chain item in the Ending Phase: phase reads "ending", P1 is still the turn player, and P2
 *     gets priority to respond before any rune readies.
 *  5. Every turn, no cost, no exhaustion of the legend — it fires again next turn.
 *  6. Registry payload: triggered / end-of-turn / controller / ready / rune / upTo 2.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogs-017-024";
const DISCIPLINE = "ogn-058-298"; // [Reaction] 2 energy: give a unit +2 Might this turn, draw 1

/** P1's turn, Dark Child legend, `exhausted` tapped fury runes + `ready` ready ones; P2 has 2 tapped calm runes. */
function board(exhausted: number, ready = 0) {
  return scenario()
    .legend(P1, CARD, "annie")
    .runes(P1, "fury", exhausted, { exhausted: true })
    .runes(P1, "fury", ready)
    .runes(P2, "calm", 2, { exhausted: true });
}

/** End P1's turn and pass priority until the rune prompt (or the next open main phase) appears. */
async function endTurnToPrompt(game: Game): Promise<void> {
  await game.p1.endTurn();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Dark Child - Starter (ogs-017-024)", () => {
  test("registry payload: one triggered ability — at the end of YOUR turn, ready up to 2 runes", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Annie", domain: ["fury", "chaos"], name: "Dark Child - Starter" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { quantity: { upTo: 2 }, type: "rune" }, type: "ready" },
      trigger: { event: "end-of-turn", on: "controller" },
      type: "triggered",
    });
  });

  test("ending my turn puts the trigger on the chain in the Ending Phase: P1 is still the turn player, nothing has readied yet, and P2 gets priority to respond", async () => {
    const game = await board(2).build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "annie", controller: P1, name: "Dark Child - Starter", triggered: true })]);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("core line — 2 tapped runes: choose both → both are ready as P2's turn opens (P2's Awaken does not touch them), the legend itself is not exhausted", async () => {
    const game = await board(2).build();
    await endTurnToPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 2, seat: P1 });
    const mine = new Set(game.p1.runes());
    const offeredMine = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).filter((k) => mine.has(k)) : [];
    expect(offeredMine.sort()).toEqual([...mine].sort());
    await game.p1.pick(...offeredMine);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.energy()).toBe(0); // 317.2.d: no energy floats — the value is in the READY RUNES
    expect(game.state("annie").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("'up to 2' with THREE tapped runes: a third pick is illegal; choosing two readies exactly those two and leaves the third exhausted", async () => {
    const game = await board(3).build();
    await endTurnToPrompt(game);
    const [a, b, c] = game.p1.runes();
    const tooMany = await game.p1.try((p) => p.pick(a!, b!, c!));
    expect(tooMany.ok).toBe(false);
    await game.p1.pick(a!, c!);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state(a!).isReady).toBe(true);
    expect(game.state(c!).isReady).toBe(true);
    expect(game.state(b!).isExhausted).toBe(true);
    expect(game.p2.state(game.p2.runes()[0]!).isReady).toBe(true); // P2's own runes readied by P2's Awaken, not by Annie
  });

  test("'up to 2' includes zero (355.13): declining readies nothing and the turn still passes cleanly to P2", async () => {
    const game = await board(2).build();
    await endTurnToPrompt(game);
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("one tapped + one ready rune: picking just the tapped one is enough — both end up ready (415.1.c: readying the ready one would do nothing anyway)", async () => {
    const game = await board(1, 1).build();
    const tapped = game.p1.runes({ ready: false })[0]!;
    await endTurnToPrompt(game);
    await game.p1.pick(tapped);
    // "up to 2": after one pick the engine offers a continuation — stop at one.
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("no runes at all: the trigger still goes on the chain and resolves as a no-op — no prompt, no stall, P2's main phase opens", async () => {
    const game = await scenario().legend(P1, CARD, "annie").fillDecks({ main: 10, runes: 0 }).build();
    await game.p1.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["annie"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("only YOUR turn: P2 ending their turn triggers nothing — no Annie item on the chain, and my tapped runes are readied only later by MY Awaken", async () => {
    const game = await board(2).active(P2).build();
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "annie")).toBe(false);
    // No rune prompt for P1 anywhere on the way to P1's main phase.
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.transcript().steps.some((s) => s.executed.some((e) => e.moveId === "resolvePendingChoice" || e.moveId === "chooseTargets"))).toBe(false);
  });

  test("fires every turn with no cost: after a full round the trigger is on the chain again at the end of my next turn", async () => {
    const game = await board(2).build();
    await endTurnToPrompt(game);
    await game.p1.decline();
    await game.settle();
    await game.advanceTurn(); // P2 → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "annie", triggered: true })]);
  });

  test("the payoff — Reaction mana on P2's turn: two runes readied at end of turn are tapped inside P2's attack showdown to pay for Discipline (+2), turning a 2-vs-3 loss into a hold", async () => {
    const game = await scenario()
      .legend(P1, CARD, "annie")
      .runes(P1, "calm", 2, { exhausted: true })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await endTurnToPrompt(game);
    await game.p1.pick(...game.p1.runes());
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.energy()).toBe(0);
    await game.p2.move("raider", "bf1");
    await game.p2.pass(); // attacker passes focus → P1 has focus in the showdown
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.tapRune();
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(2);
    await game.p1.cast("disc", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 4 ≥ 3
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // took 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("control: WITHOUT the legend the same two tapped runes are still exhausted during P2's turn (so the Reaction line above is Annie's doing)", async () => {
    const game = await scenario().runes(P1, "calm", 2, { exhausted: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });
});
