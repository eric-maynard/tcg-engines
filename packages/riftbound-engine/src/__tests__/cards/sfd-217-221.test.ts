/**
 * Seat of Power — sfd-217-221 · Battlefield (no cost, no domain)
 *
 *   When you conquer here, draw 1 for each other battlefield you or allies control.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "OTHER battlefield": once you conquer here you control Seat of Power too, but it must never
 *      count itself — with no other battlefield under your control the trigger draws 0 (an ability
 *      that resolves and does nothing), with exactly one other it draws exactly 1, with two it draws 2.
 *   2. Only battlefields YOU (or, in team modes, allies) CONTROL count: an enemy-held or uncontrolled
 *      battlefield adds nothing (181/188 — control, not card ownership).
 *   3. "you" on a battlefield card = whoever conquers here (471.2.a) — the battlefield card belongs to
 *      no player's side, so the OPPONENT conquering a Seat card that P1 brought draws for the opponent,
 *      counted over the opponent's battlefields; P1 gets nothing.
 *   4. Conquer only, and only HERE: holding Seat of Power at the start of your turn scores but draws
 *      nothing extra (469.2 vs 469.1); conquering some other battlefield while you control the Seat
 *      draws nothing; a failed attack (attacker dies) is no conquer at all.
 *   5. 471.1.b.1 — at Victory−1 a conquer that is not the last battlefield this turn yields a card
 *      instead of the Final Point, but it is still a Conquer (469.1): the Seat trigger fires on top.
 *   6. The trigger is a triggered ability on the chain controlled by the conqueror; both players get
 *      priority before anything is drawn.
 *
 * Engine notes: (a) the parsed count descriptor carries `excludeSelf: true`, but the battlefield
 * counter ignores it, so every positive case over-draws by one; (b) the trigger's `location: "here"`
 * is dropped when abilities are loaded, so the Seat also fires when its controller conquers
 * elsewhere (BUG tests below).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-217-221";

/** P1's turn. P2 holds Seat of Power with a `guardMight` defender; P1's 4-Might attacker waits in base. */
function board(opts: { guardMight?: number; seatOwner?: string } = {}) {
  return scenario()
    .battlefield("seat", { controller: P2, def: CARD, inert: false, owner: opts.seatOwner ?? P2 })
    .unit(P2, "seat", { might: opts.guardMight ?? 2, name: "Seat Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "attacker");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function conquerSeat(game: Game): Promise<number> {
  const hand0 = game.p1.hand().length;
  await game.p1.move("attacker", "seat");
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game.p1.hand().length - hand0;
}

describe("Seat of Power (sfd-217-221)", () => {
  test("registry payload: a cost-less battlefield whose only ability is a conquer-here trigger drawing per OTHER friendly/allied battlefield", async () => {
    const game = await board().build();
    expect(game.state("seat")).toMatchObject({ cardType: "battlefield", name: "Seat of Power", zone: "battlefieldRow" });
    expect(game.state("seat").energyCost ?? 0).toBe(0);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { amount: { count: { controller: "friendly-or-allies", excludeSelf: true, type: "battlefield" } }, type: "draw" },
        trigger: { event: "conquer", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("sequence: win the combat → P1 controls the Seat and scores → the Seat's triggered ability sits on the chain under P1's control with nothing drawn yet; both players may respond", async () => {
    const game = await board().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "h2").build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("attacker", "seat");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat resolves: 4 vs 2 → guard dies, P1 conquers
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.seat?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seat", controller: P1, name: "Seat of Power", triggered: true })]);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test.failing("BUG: with exactly ONE other battlefield you control, conquering here draws exactly 1 (engine counts the Seat itself and draws 2)", async () => {
    // Expected: bf2 is the only OTHER battlefield P1 controls → +1 card. Actual: `excludeSelf` is ignored → +2.
    const game = await board().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "h2").build();
    expect(await conquerSeat(game)).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: with NO other battlefield under your control the trigger resolves and draws nothing (engine draws 1 for the Seat itself)", async () => {
    // Expected: the just-conquered Seat is not an "other" battlefield → 0 cards. Actual: +1.
    const game = await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 2 }, "theirs").build();
    expect(await conquerSeat(game)).toBe(0);
    expect(game.p1.points()).toBe(1);
  });

  test.failing("BUG: with TWO other battlefields you control it draws exactly 2 (engine draws 3)", async () => {
    const game = await board()
      .battlefield("bf2", { controller: P1 })
      .battlefield("bf3", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "h2")
      .unit(P1, "bf3", { might: 2 }, "h3")
      .build();
    expect(await conquerSeat(game)).toBe(2);
  });

  test("only battlefields YOU control count: an enemy-held or an uncontrolled other battlefield adds nothing over having no other battlefield at all", async () => {
    const none = await conquerSeat(await board().build());
    const enemyHeld = await conquerSeat(await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 2 }, "theirs").build());
    const uncontrolled = await conquerSeat(await board().battlefield("bf2", { controller: null }).build());
    const mine = await conquerSeat(await board().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "h2").build());
    expect(enemyHeld).toBe(none);
    expect(uncontrolled).toBe(none);
    expect(mine).toBe(none + 1); // each friendly other battlefield is worth exactly one card
  });

  test("'you' is the conqueror: P2 conquering a Seat card owned by P1 draws for P2 (per P2's battlefields) and nothing for P1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("seat", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P1 })
      .unit(P2, "bf2", { might: 2 }, "p2holder")
      .unit(P1, "bf3", { might: 2 }, "p1holder")
      .unit(P1, "seat", { might: 2 }, "guard")
      .unit(P2, "base", { might: 4 }, "raider")
      .build();
    const p1h = game.p1.hand().length;
    const p2h = game.p2.hand().length;
    await game.p2.move("raider", "seat");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seat", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.gameState.battlefields.seat?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(p1h); // P1 owns the card and controls bf3 — irrelevant, P1 did not conquer
    expect(game.p2.hand().length).toBeGreaterThan(p2h); // P2 drew (bf2 counts; exact count is pinned by the BUG tests)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test.failing("BUG: only HERE — conquering a DIFFERENT battlefield while you already control Seat of Power draws nothing (471.2.a; engine fires the Seat on any conquer by its controller)", async () => {
    // Expected: bf2 was conquered, not the Seat → no Seat trigger, hand unchanged. Actual: the trigger's
    // `location: "here"` is dropped when abilities are loaded, so P1 draws 2 (Seat + bf2 counted).
    const game = await scenario()
      .battlefield("seat", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "seat", { might: 2 }, "sitter")
      .unit(P2, "bf2", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("attacker", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: only HERE (uncontrolled Seat) — P1 merely OWNS an uncontrolled Seat of Power card and conquers ANOTHER battlefield: nothing is drawn and no Seat item hits the chain (engine falls back to the card owner and fires it)", async () => {
    // Expected: a battlefield card belongs to no side (471.2.a) and this conquer is not "here" → silence.
    // Actual: with controller null the trigger scan attributes the Seat to its deck owner (P1) and, with
    // "here" dropped, P1's conquer of bf2 puts a Seat of Power item on the chain.
    const game = await scenario()
      .battlefield("seat", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("attacker", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain().some((c) => c.cardId === "seat")).toBe(false);
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.seat?.controller).toBe(null);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("hold is not conquer: holding Seat of Power (and another battlefield) at the start of your turn scores 2 but draws only the draw-phase card", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("seat", { controller: P1, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "seat", { might: 2 }, "sitter")
      .unit(P1, "bf2", { might: 2 }, "h2")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("a failed attack (2-Might attacker into a 5-Might guard) is no conquer: no point, no control change, no draw", async () => {
    const game = await scenario()
      .battlefield("seat", { controller: P2, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "h2")
      .unit(P2, "seat", { might: 5 }, "guard")
      .unit(P1, "base", { might: 2 }, "attacker")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("attacker", "seat");
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.gameState.battlefields.seat?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("471.1.b.1 — at 7 of 8 points the conquer yields a card instead of the Final Point, but it is still a conquer: the Seat trigger fires on top and the game is not over", async () => {
    const game = await board().points(P1, 7).battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "h2").build();
    expect(game.gameState.victoryScore).toBe(8);
    const hand0 = game.p1.hand().length;
    await game.p1.move("attacker", "seat");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // Conquered, but bf2 was not scored this turn → a card instead of the 8th point …
    expect(game.gameState.battlefields.seat?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    // … and the conquer trigger is pending regardless.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seat", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand().length).toBeGreaterThan(hand0 + 1);
    expect(game.p1.points()).toBe(7);
  });

  test("inert control: the same conquer at an abilities-stripped Seat draws nothing (so every card above came from the printed trigger)", async () => {
    const game = await scenario()
      .battlefield("seat", { controller: P2, def: CARD, inert: true, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "h2")
      .unit(P2, "seat", { might: 2 }, "guard")
      .unit(P1, "base", { might: 4 }, "attacker")
      .build();
    expect(await conquerSeat(game)).toBe(0);
    expect(game.p1.points()).toBe(1);
  });
});
