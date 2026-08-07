/**
 * Altar of Memories — sfd-169-221 · Gear · Order · 2 energy
 *
 *   When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on the
 *   top or bottom of your Main Deck.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Trigger = a FRIENDLY unit dies, by any means (spell kill, combat, on either player's turn); an
 *    ENEMY unit dying does nothing. A friendly unit token dying counts (185.2.d) even though it then
 *    ceases to exist.
 *  - "you may exhaust me" is a COST paid to get the effect: an already-exhausted Altar cannot pay, so
 *    two friendly deaths in one combat yield exactly ONE draw; declining leaves it ready, no draw.
 *  - Order of the effect: draw 1 FIRST, then choose a card from the (new) hand — the freshly drawn
 *    card is a legal choice — and choose TOP or BOTTOM of the Main Deck. Net hand size is unchanged.
 *    "Top" must really be the next card drawn; "bottom" the last.
 *  - With an empty hand before the trigger you draw 1 and must put that very card back (hand → 0).
 *  - Gear: costs 2, enters the base ready (so it is live the turn it is played).
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-169-221";
const FILLER = "ogn-175-298";
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

interface Trace {
  askedPay: number;
  handOffered: string[];
  destOffered: string[];
}

/**
 * Drive everything pending (priority passes, the Altar's "exhaust me?" question, the hand-card
 * pick and a top/bottom choice if one is offered) until an open main/showdown state.
 */
async function drive(game: Game, opts: { pay?: boolean; put?: string; dest?: "top" | "bottom" } = {}): Promise<Trace> {
  const t: Trace = { askedPay: 0, destOffered: [], handOffered: [] };
  for (let i = 0; i < 24; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      t.askedPay += 1;
      await ((opts.pay ?? true) && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      const isDest = keys.some((k) => /top|bottom/i.test(String(k)));
      if (isDest) {
        t.destOffered = keys.map(String);
        const want = keys.find((k) => new RegExp(opts.dest ?? "bottom", "i").test(String(k))) ?? keys[0];
        await game.p1.answer({ keys: [d.options[keys.indexOf(want as string)]?.key as string], kind: "pick" });
      } else {
        t.handOffered = keys.map(String).sort();
        const want = opts.put && keys.includes(opts.put) ? opts.put : (keys[0] as string);
        await game.p1.answer({ keys: [d.options[keys.indexOf(want)]?.key as string], kind: "pick" });
      }
    } else {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
  }
  return t;
}

/** P1: Altar in base, a doomed 2-Might ally, `hand` filler cards, a known deck top; a 0-cost 4-damage bolt to kill with. */
function board(hand: string[] = ["keep"], altarMeta?: { exhausted?: boolean }) {
  const b = scenario()
    .gear(P1, CARD, "altar", altarMeta)
    .unit(P1, "base", { might: 2, name: "Doomed" }, "doomed")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .hand(P1, BOLT, "bolt");
  for (const h of hand) {
    b.hand(P1, FILLER, h);
  }
  return b;
}

describe("Altar of Memories (sfd-169-221)", () => {
  test("cost: 2 energy; as a gear it enters the base READY; unaffordable at 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "altar").build();
    await game.p1.play("altar");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("altar")).toBe("base");
    expect(game.state("altar")).toMatchObject({ cardType: "gear", isReady: true });
    expect((await scenario().resources(P1, { energy: 1, power: { order: 2 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("a friendly unit killed by a spell: asked once, yes → Altar exhausted, draw d1, then put a chosen hand card (keep) on the BOTTOM; hand size net unchanged", async () => {
    const game = await board(["keep"]).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    const t = await drive(game, { dest: "bottom", pay: true, put: "keep" });
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(t.askedPay).toBe(1);
    expect(game.state("altar").isExhausted).toBe(true);
    expect(t.handOffered).toEqual(["d1", "keep"]); // chosen AFTER the draw: the fresh card is a candidate too
    expect(game.p1.hand()).toEqual(["d1"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d2");
    expect(deck[deck.length - 1]).toBe("keep");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the freshly drawn card itself may be the one put back", async () => {
    const game = await board(["keep"]).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    await drive(game, { dest: "bottom", pay: true, put: "d1" });
    expect(game.p1.hand()).toEqual(["keep"]);
    expect(game.p1.deck().at(-1)).toBe("d1");
    expect(game.p1.deck()[0]).toBe("d2");
  });

  test("'top OR bottom' — the controller may put the card on TOP of the Main Deck (next draw)", async () => {
    const game = await board(["keep"]).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    const t = await drive(game, { dest: "top", pay: true, put: "keep" });
    expect(t.destOffered.length).toBeGreaterThanOrEqual(2);
    expect(game.p1.deck()[0]).toBe("keep");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("empty hand: draw 1, then that lone card must go back — hand ends empty, Altar exhausted", async () => {
    const game = await board([]).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    await drive(game, { dest: "bottom", pay: true });
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("d1")).toBe("mainDeck"); // drawn, then put back (we choose/DEFAULT to the bottom)
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d2");
    expect(deck.at(-1)).toBe("d1");
  });

  test("'you may': declining leaves the Altar ready, draws nothing, deck untouched", async () => {
    const game = await board(["keep"]).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    const t = await drive(game, { pay: false });
    expect(t.askedPay).toBe(1);
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.state("altar").isReady).toBe(true);
    expect(game.p1.hand()).toEqual(["keep"]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
  });

  test("negative space: an ENEMY unit dying is not 'a friendly unit' — no question, no draw", async () => {
    const game = await board(["keep"]).build();
    await game.p1.cast("bolt", { targets: "foe" });
    const t = await drive(game);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(t.askedPay).toBe(0);
    expect(game.state("altar").isReady).toBe(true);
    expect(game.p1.hand()).toEqual(["keep"]);
  });

  test("the exhaust is a cost: an already-exhausted Altar cannot pay — no draw (any question offered must be unacceptable)", async () => {
    const game = await board(["keep"], { exhausted: true }).build();
    await game.p1.cast("bolt", { targets: "doomed" });
    let acceptable = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no") {
        acceptable = d.canAccept !== false;
        await game.p1.no();
      } else {
        throw new Error(`unexpected ${d.kind}: ${d.prompt}`);
      }
    }
    expect(acceptable).toBe(false);
    expect(game.p1.hand()).toEqual(["keep"]);
    expect(game.p1.deck()[0]).toBe("d1");
  });

  test("combat on P1's turn: the friendly attacker dies into a 5-Might wall → trigger, pay, draw, put back — works off a combat death too", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .gear(P1, CARD, "altar")
      .unit(P1, "base", { might: 2, name: "Doomed" }, "doomed")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .hand(P1, FILLER, "keep")
      .build();
    await game.p1.move("doomed", "bf1");
    await game.settle(); // combat resolves; the death trigger's question stops the settle
    const t = await drive(game, { pay: true, put: "keep" });
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(t.askedPay).toBe(1);
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("keep")).toBe("mainDeck");
  });

  test("two friendly units die in the same combat: both deaths trigger, but the Altar can only be exhausted once → exactly one draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .gear(P1, CARD, "altar")
      .unit(P1, "base", { might: 2, name: "A" }, "a")
      .unit(P1, "base", { might: 2, name: "B" }, "b")
      .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .hand(P1, FILLER, "keep")
      .build();
    await game.p1.move(["a", "b"], "bf1");
    await game.settle();
    await drive(game, { pay: true, put: "keep" });
    await drive(game, { pay: true, put: "keep" }); // a second question (if any) cannot be paid
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1); // drew d1, put one back: never two draws
    expect(game.zoneOf("d2")).toBe("mainDeck");
  });

  test("on the OPPONENT's turn: a friendly defender dies → P1 is asked, pays, draws and puts back during P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, CARD, "altar")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .hand(P1, FILLER, "keep")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    const t = await drive(game, { pay: true, put: "keep" });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(t.askedPay).toBe(1);
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("a friendly unit TOKEN dying is a friendly unit dying (185.2.d): the Altar triggers off a Sand Soldier", async () => {
    const game = await scenario()
      .gear(P1, CARD, "altar")
      .unit(P1, "base", { might: 2, name: "Sand Soldier", tags: ["Shurima"] }, "token-soldier")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .hand(P1, FILLER, "keep")
      .hand(P1, BOLT, "bolt")
      .build();
    expect(game.state("token-soldier").isToken).toBe(true);
    await game.p1.cast("bolt", { targets: "token-soldier" });
    const t = await drive(game, { pay: true, put: "keep" });
    expect(t.askedPay).toBe(1);
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.trash()).not.toContain("token-soldier"); // 186.1: it ceased to exist
  });

  test("parsed abilities match the printed text: optional friendly-unit-death trigger, exhaust-self cost, draw 1 THEN put 1 from hand on top-or-bottom of deck", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", energyCost: 2, name: "Altar of Memories" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as Record<string, unknown>;
    expect(ab).toMatchObject({
      condition: { cost: { exhaust: true }, type: "pay-cost" },
      optional: true,
      trigger: { event: "die", on: "friendly-units" },
      type: "triggered",
    });
    const seq = ab.effect as { type: string; effects: Record<string, unknown>[] };
    expect(seq.type).toBe("sequence");
    expect(seq.effects[0]).toEqual({ amount: 1, type: "draw" });
    expect(seq.effects[1]).toMatchObject({ amount: 1, from: "hand" });
  });
});
