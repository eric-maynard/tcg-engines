/**
 * Protective Sands — ven-162-166 · Battlefield (no cost, colorless)
 *
 *   When you conquer here, if you control 4 or fewer runes, you may pay [1] to draw 1.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "if you control 4 or fewer runes" is part of the trigger CONDITION (383.2.a.1): at 5+ runes the
 *      ability never goes on the chain — no prompt, nothing to respond to. Boundary: exactly 4 fires,
 *      exactly 5 does not; 0 runes fires. Runes are the cards in your rune pool, ready OR exhausted
 *      (154/430.1) — not your unspent Energy, and never the opponent's runes.
 *   2. "you may pay [1] to draw 1" — "you may" first ⇒ opt-in at finalization (383.3.a); the "pay [1]"
 *      right behind it is the ability's base cost (383.3.b) and must be paid to finalize (383.3.b.1):
 *      accepting spends exactly 1 energy and draws exactly 1; declining costs and draws nothing; with
 *      0 energy it cannot be finalized, so no card may be had for free.
 *   3. "you" = whoever conquers here (471.2.a): P2 conquering a Sands card P1 owns is asked, judged on
 *      P2's rune count, paid from P2's pool.
 *   4. Conquer only and only HERE: holding it scores but never asks; conquering elsewhere while you
 *      control the Sands must not ask; a failed attack is no conquer.
 *   5. A catch-up card by design: early (turn-2, 2 runes) conquers get the offer, late-game ones don't —
 *      across game.advanceTurn() the rune count grows by 2 per turn (Channel step) and turns it off.
 *
 * Engine note: the parser left the effect as `{ type: "raw" }`, so the opt-in resolves as a no-op —
 * accepting neither pays nor draws (BUG tests below). The rune gate and the prompt itself work.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-162-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn; P2 holds the Sands with a 2-Might guard; P1 (given runes/energy) attacks with 4 Might. */
function board(p1: { runes: number; energy: number; exhausted?: boolean }, extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario()
    .resources(P1, { energy: p1.energy })
    .runes(P1, "fury", p1.runes, { exhausted: p1.exhausted })
    .battlefield("sands", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P2, "sands", { might: 2, name: "Dune Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "attacker");
  extra?.(b);
  return b;
}

/** Attack the Sands and pass Focus both ways so the combat resolves (4 vs 2 → conquer). */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("attacker", "sands");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("guard")).toBe("trash");
  expect(game.gameState.battlefields.sands?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

describe("Protective Sands (ven-162-166)", () => {
  test("registry payload — an optional conquer-here trigger gated on ≤4 runes whose effect is 'pay [1] → draw 1' (parser produced a raw/unimplemented effect)", async () => {
    // Expected: a structured pay-then-draw effect (cf. Sunken Temple sfd-218-221: pay-cost {energy:1} + draw 1).
    // Actual: `effect: { type: "raw", text: "pay :rb_energy_1: to draw 1." }`.
    await scenario().build();
    const [ability] = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as Record<string, unknown>[];
    expect(ability).toMatchObject({
      condition: { amount: 4, type: "runes-at-most" },
      optional: true,
      trigger: { event: "conquer", location: "here", on: "controller" },
      type: "triggered",
    });
    expect((ability?.effect as { type?: string } | undefined)?.type).not.toBe("raw");
    expect(JSON.stringify(ability)).toContain('"draw"');
    expect(JSON.stringify(ability)).toMatch(/"energy":\s*1/);
  });

  test("with exactly 4 runes: conquering here puts the Sands' trigger on the chain under P1 and asks P1 (not P2) whether to use it — nothing drawn or paid yet", async () => {
    const game = await board({ energy: 2, runes: 4 }).build();
    const hand0 = game.p1.hand().length;
    await conquer(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sands", controller: P1, name: "Protective Sands", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.energy()).toBe(2);
  });

  test("accepting pays exactly [1] and draws exactly 1, then play returns to P1's main phase (engine's raw effect does nothing)", async () => {
    // Expected: energy 2 → 1, hand +1. Actual: yes/no is asked but resolving changes nothing.
    const game = await board({ energy: 2, runes: 4 }).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await conquer(game);
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });

  test("declining: no energy spent, no card drawn, chain empties into P1's open main phase", async () => {
    const game = await board({ energy: 2, runes: 4 }).build();
    const hand0 = game.p1.hand().length;
    await conquer(game);
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.chain()).toEqual([]);
  });

  test("with 5 runes the condition fails and the ability never triggers: no chain item, no prompt — straight back to the main phase (383.2.a.1)", async () => {
    const game = await board({ energy: 2, runes: 5 }).build();
    const hand0 = game.p1.hand().length;
    await conquer(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.energy()).toBe(2);
  });

  test("runes are counted in the rune pool regardless of state: 5 EXHAUSTED runes still shut it off; 0 runes (energy floating from elsewhere) still asks", async () => {
    const tapped = await board({ energy: 5, exhausted: true, runes: 5 }).build();
    await conquer(tapped);
    expect(tapped.chain()).toEqual([]);
    expect(tapped.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const none = await board({ energy: 1, runes: 0 }).build();
    expect(none.p1.runes()).toHaveLength(0);
    await conquer(none);
    expect(none.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("only YOUR runes count: P1 on 4 runes is asked even though P2 sits on 8", async () => {
    const game = await board({ energy: 1, runes: 4 }, (b) => b.runes(P2, "calm", 8)).build();
    expect(game.p2.runes()).toHaveLength(8);
    await conquer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("with 0 energy the [1] base cost (383.3.b/383.3.b.1) cannot be paid — the opt-in must not be acceptable (or not offered) and no card is ever drawn for free", async () => {
    // Expected: `canAccept === false` (or no yes/no at all). Actual: canAccept is true (and the effect is a no-op anyway).
    const game = await board({ energy: 0, exhausted: true, runes: 4 }).build();
    const hand0 = game.p1.hand().length;
    await conquer(game);
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.energy()).toBe(0);
  });

  test("'you' is the conqueror: P2 (3 runes) conquering a Sands card OWNED by P1 (who has 6 runes) → P2 is asked; P1 is never involved", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .runes(P2, "calm", 3)
      .runes(P1, "fury", 6)
      .battlefield("sands", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "sands", { might: 2 }, "guard")
      .unit(P2, "base", { might: 4 }, "raider")
      .build();
    await game.p2.move("raider", "sands");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.sands?.controller).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sands", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    // Mirror: the conqueror has 6 runes (owner has 3) → judged on the conqueror → no trigger.
    const mirror = await scenario()
      .active(P2)
      .runes(P2, "calm", 6)
      .runes(P1, "fury", 3)
      .battlefield("sands", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "sands", { might: 2 }, "guard")
      .unit(P2, "base", { might: 4 }, "raider")
      .build();
    await mirror.p2.move("raider", "sands");
    await mirror.settle();
    expect(mirror.gameState.battlefields.sands?.controller).toBe(P2);
    expect(mirror.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("hold is not conquer: holding the Sands at the start of your turn (2 runes) scores 1 and asks nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .runes(P1, "fury", 2)
      .battlefield("sands", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "sands", { might: 2 }, "sitter")
      .script(P1, [], { strict: true }) // any prompt for P1 during the turn start would throw
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // draw step only
  });

  test("only HERE — conquering a DIFFERENT battlefield while you control the Sands (2 runes) asks nothing (engine drops `location: \"here\"` and prompts)", async () => {
    // Expected: bf2's conquer is not "here" → straight to main phase. Actual: a Protective Sands yes/no appears.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .runes(P1, "fury", 2)
      .battlefield("sands", { controller: P1, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "sands", { might: 2 }, "sitter")
      .unit(P2, "bf2", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .build();
    await game.p1.move("attacker", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.chain().some((c) => c.cardId === "sands")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("a failed attack (2 Might into a 3-Might guard) is no conquer: attacker dies, P2 keeps the Sands, nothing is asked", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .runes(P1, "fury", 2)
      .battlefield("sands", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "sands", { might: 3 }, "guard")
      .unit(P1, "base", { might: 2 }, "weakling")
      .build();
    await game.p1.move("weakling", "sands");
    await game.settle();
    expect(game.zoneOf("weakling")).toBe("trash");
    expect(game.gameState.battlefields.sands?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("catch-up window closes by itself: 3 runes now → across two of your own turn starts you channel to 7, and the next conquer here asks nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .runes(P1, "fury", 3)
      .battlefield("sands", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "sands", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .build();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (channels 2 → 5 runes)
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (7 runes)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes().length).toBeGreaterThanOrEqual(5);
    await conquer(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
