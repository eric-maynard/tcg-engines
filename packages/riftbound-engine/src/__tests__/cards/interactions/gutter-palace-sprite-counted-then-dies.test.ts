/**
 * Interaction: Gutter Palace (unl-088-219) × a [Temporary] Sprite token (ogn-274-298) × Gust (ogn-169-298)
 *
 *   Gutter Palace — Gear · Mind · 4
 *     "At the start of your Beginning Phase, if you have exactly 4 cards in hand and exactly 4 units at
 *      battlefields, you win the game. Discard 1, [Exhaust]: Play a 1 [Might] Bird unit token with [Deflect]."
 *   Sprite — 3-Might Fae unit token · "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   Gust — Spell · Chaos · 1 · "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Board. P2 is about to end turn 3. P1 controls bf1 + bf2 and the Palace and has exactly 4 cards in hand.
 *   Case YES:  3 non-token 2-Might units + ONE Sprite at P1's battlefields = 4 units at battlefields.
 *   Case NO:   4 non-token units + the Sprite = 5.
 *   Case NO-2: 3 + Sprite = 4 units, but 5 cards in hand.
 * P2 has Gust and one ready calm rune (its pool empties at its own end of turn).
 *
 * Expected:
 *  (a) Both the Sprite's Temporary and the Palace are triggered abilities keyed to the same event — P1's
 *      Beginning Phase starting (315.2.a.1, 816.1.b/.c). Trigger conditions INCLUDING the intervening "if" are
 *      evaluated right after that event (383.2.c, 383.2.a.1), before anything resolves, while the Sprite is still on
 *      the board → 4 & 4 → the Palace triggers. Batch = [Sprite kill, Palace win], both P1's → P1 orders them
 *      (383.3.d — DESIGN: a soft, defaultable order offer).
 *  (b) The "if exactly 4 … and exactly 4 …" is part of the TRIGGER CONDITION, not the effect (383.2.a.1, Sona
 *      example) → not re-checked on resolution: even when the Temporary kill resolves first (3 units left) the
 *      Palace item then resolves and P1 WINS. The order is outcome-irrelevant.
 *  (c) Gust in response bounces a unit (3 units / 5 cards) — the already-fulfilled condition stands → P1 wins
 *      (matches riftjudge fe794f868960370d).
 *  NO:   5 units at the instant the phase starts → condition false → the Palace does NOT trigger; only the Temporary
 *        item is on the chain (no order offer). After the Sprite dies P1 is 4/4 but the moment has passed
 *        (383.2.c) → no win; scoring proceeds (P1 holds bf1 + bf2) and the Draw step makes the hand 5.
 *  NO-2: the check is in the Beginning Step, before Channel/Draw (315/316) — the pre-draw hand of 5 counts → no
 *        trigger, no win.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUTTER_PALACE = "unl-088-219";
const SPRITE = "ogn-274-298";
const GUST = "ogn-169-298";
const FILLER = "ogn-175-298";

/** P2 about to end turn 3; P1: Palace, `hand` filler cards, `nonToken` 2-Might units over bf1/bf2 (+ a Sprite at bf1). */
function eve(o: { hand: number; nonToken: number; sprite?: boolean }) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .points(P1, 0)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .gear(P1, GUTTER_PALACE, "palace")
    .unit(P2, "bf3", { might: 5, name: "Theirs" }, "theirs")
    .runes(P2, "calm", 1)
    .hand(P2, GUST, "gust");
  for (let i = 0; i < o.nonToken; i++) {
    b.unit(P1, i % 2 ? "bf1" : "bf2", { might: 2, name: `Unit ${i}` }, `u${i}`);
  }
  if (o.sprite !== false) {
    b.unit(P1, "bf1", SPRITE, "sprite");
  }
  for (let i = 0; i < o.hand; i++) {
    b.hand(P1, FILLER, `c${i}`);
  }
  return b;
}

const YES = { hand: 4, nonToken: 3 } as const;
const NO = { hand: 4, nonToken: 4 } as const;
const NO2 = { hand: 5, nonToken: 3 } as const;

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);
const spriteZone = (game: Game) => game.zoneOf("sprite");
const unitsAtBattlefields = (game: Game) => [...game.p1.units("bf1"), ...game.p1.units("bf2")];

/** P2 ends turn 3 → P1's Beginning Phase begins and its start-of-phase triggers are queued. */
async function beginP1Turn(o: { hand: number; nonToken: number; sprite?: boolean }): Promise<Game> {
  const game = await eve(o).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

/** Both players pass priority once (resolves the top item). */
async function passBoth(game: Game): Promise<void> {
  await game.acting().passPriority();
  if (!game.isOver() && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Gutter Palace × Temporary Sprite — is the Sprite counted, and does its death un-win the game?", () => {
  // ── Case YES (a): what is on the chain ──────────────────────────────────────────────────────

  test("(a) YES: at the start of P1's Beginning Phase the Sprite is still on bf1 and counts — 4 units at battlefields, 4 in hand — so BOTH the Temporary kill and the Palace win are queued as P1's triggered items (383.2.c, 383.2.a.1)", async () => {
    const game = await beginP1Turn(YES);
    expect(spriteZone(game)).toBe("battlefield-bf1");
    expect(unitsAtBattlefields(game)).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(4); // pre-draw hand
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "palace", controller: P1, triggered: true }),
      ]),
    );
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(0); // "before scoring": no Hold yet
  });

  // DESIGN (FIXER-PRIMER "383.3.d same-controller trigger order"): the order choice is a SOFT, defaultable offer.
  test("(a) same controller for both items → P1 is offered the ORDER decision (383.3.d), listing exactly the Sprite and Palace triggers; it is defaultable and P1 keeps its priority actions beside it", async () => {
    const game = await beginP1Turn(YES);
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    const items = (d as { items: readonly { card?: string }[] }).items.map((i) => i.card).sort();
    expect(items).toEqual(["palace", "sprite"]);
    expect(((d as { actions?: readonly { verb: string }[] }).actions ?? []).map((a) => a.verb)).toContain("passPriority");
  });

  // ── Case YES (b): either order wins ─────────────────────────────────────────────────────────

  test("(b) listed order accepted (Palace on top): the Palace item resolves first and P1 WINS with the Sprite still alive under its pending kill", async () => {
    const game = await beginP1Turn(YES);
    await game.acceptTriggerOrder();
    expect(chainIds(game)).toEqual(["sprite*", "palace*"]); // bottom → top
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await passBoth(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(spriteZone(game)).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("(b) P1 orders the Temporary kill ON TOP: it resolves first — the Sprite dies (token ceases to exist), 3 units remain — and the Palace item then resolves WITHOUT re-checking its 'if': P1 STILL WINS (383.2.a.1)", async () => {
    const game = await beginP1Turn(YES);
    const d = game.decision();
    expect(d?.kind).toBe("order");
    const keys = (d as { items: readonly { key: string; card?: string }[] }).items;
    const spriteKey = keys.find((k) => k.card === "sprite")?.key as string;
    const palaceKey = keys.find((k) => k.card === "palace")?.key as string;
    await game.p1.order([palaceKey, spriteKey]); // first = bottom, last = top
    expect(chainIds(game)).toEqual(["palace*", "sprite*"]);

    await passBoth(game); // Temporary kill resolves
    expect(spriteZone(game)).toBe("gone");
    expect(unitsAtBattlefields(game)).toHaveLength(3);
    expect(chainIds(game)).toEqual(["palace*"]);
    expect(game.isOver()).toBe(false);

    await passBoth(game); // Palace resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(0); // won by the Palace, not by points — scoring never ran
    expect(game.violations()).toEqual([]);
  });

  test("(b) settle() from the turn start takes the listed order and passes everything → game over, P1 wins, still in the Beginning Phase (no Channel/Draw/Hold happened)", async () => {
    const game = await beginP1Turn(YES);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.winner()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p1.points()).toBe(0);
  });

  // ── Case YES (c): Gust in response ──────────────────────────────────────────────────────────

  test("(c) P2 may respond to the Palace item with Gust (Reaction, Closed State): after P1 passes, P2 taps its rune and Gust on u1 goes on top of both triggers", async () => {
    const game = await beginP1Turn(YES);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.tapRune();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "u1" });
    expect(chainIds(game)).toEqual(["sprite*", "palace*", "gust"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("(c) Gust resolves first (u1 → P1's hand: now 5 cards, 3 units incl. the Sprite) — the Palace item resolves next regardless and P1 WINS (383.2.a.1; riftjudge fe794f868960370d)", async () => {
    const game = await beginP1Turn(YES);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.tapRune();
    await game.p2.cast("gust", { targets: "u1" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(5);
    expect(unitsAtBattlefields(game)).toHaveLength(3);
    expect(chainIds(game)).toEqual(["sprite*", "palace*"]);
    expect(game.isOver()).toBe(false);
    await passBoth(game); // Palace resolves
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Gusting the SPRITE itself instead (a token bounced to hand ceases to exist) changes nothing either: Palace resolves → P1 wins", async () => {
    const game = await beginP1Turn(YES);
    await game.acceptTriggerOrder();
    await game.p1.passPriority();
    await game.p2.tapRune();
    await game.p2.cast("gust", { targets: "sprite" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(spriteZone(game)).toBe("gone");
    expect(unitsAtBattlefields(game)).toHaveLength(3);
    await passBoth(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── Case NO: 4 non-token + Sprite = 5 ───────────────────────────────────────────────────────

  test("NO: with 5 units at battlefields when the phase starts the Palace does NOT trigger — only the Sprite's Temporary item is on the chain and there is no order offer", async () => {
    const game = await beginP1Turn(NO);
    expect(unitsAtBattlefields(game)).toHaveLength(5);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // priority, not an order prompt
  });

  test("NO: the Sprite dies → P1 is now exactly 4/4, but 'at the start of your Beginning Phase' has passed and is not re-polled (383.2.c): nothing new on the chain, no win; the turn proceeds through scoring (bf1 + bf2 held → 2) and the Draw step (hand 5) to P1's main phase", async () => {
    const game = await beginP1Turn(NO);
    await passBoth(game); // Temporary kill resolves
    expect(spriteZone(game)).toBe("gone");
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(unitsAtBattlefields(game)).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(5); // 4 + the Draw step
    expect(game.p1.points()).toBe(2); // held bf1 and bf2 — scoring ran AFTER the Temporary kill
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NO: P1 could still win at the start of its NEXT Beginning Phase if it is 4/4 then — ending this turn with 4 units and (after discarding down via the Palace) 4 cards does it", async () => {
    const game = await beginP1Turn(NO);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(5);
    // Palace: "Discard 1, [Exhaust]: Play a Bird token" — discard down to 4 cards; put the Bird in BASE so the
    // battlefield count stays 4.
    await game.p1.activate("palace", 1, { discard: game.p1.hand()[0] as string });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("base");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4);
    expect(unitsAtBattlefields(game)).toHaveLength(4);
    await game.advanceTurn(); // → P2's turn 4
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn(); // → P1's turn 5 begins: 4 in hand (no draw yet), 4 at battlefields
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "palace", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  // ── Case NO-2: 4 units but 5 cards ──────────────────────────────────────────────────────────

  test("NO-2: 3 + Sprite = 4 units but FIVE cards in the pre-draw hand → the Palace does not trigger (the Beginning Step precedes Channel/Draw, 315/316); only the Temporary item, then a normal turn with 6 cards after the draw", async () => {
    const game = await beginP1Turn(NO2);
    expect(unitsAtBattlefields(game)).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(5);
    expect(chainIds(game)).toEqual(["sprite*"]);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
    expect(spriteZone(game)).toBe("gone");
    expect(game.p1.hand()).toHaveLength(6);
    expect(unitsAtBattlefields(game)).toHaveLength(3);
  });

  test("control — YES board WITHOUT the Sprite (3 units, 4 cards): nothing triggers at all and P1 simply takes its turn", async () => {
    const game = await eve({ ...YES, sprite: false }).build();
    await game.p2.endTurn(); // no start-of-turn trigger → the flow runs straight through to P1's main phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
  });
});
