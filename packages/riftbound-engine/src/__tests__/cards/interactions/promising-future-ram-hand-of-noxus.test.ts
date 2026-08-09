/**
 * Interaction: Promising Future (ogn-115-298) · Spell · Mind · 5+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles
 *      the rest. Starting with the next player, each player plays those cards, ignoring Energy costs.
 *      (They must still pay Power costs.)"
 *   × Battering Ram (sfd-012-221) · Unit · Fury · 5 · 5 Might
 *     "I cost [1] less for each card you've played this turn, to a minimum of [1]."
 *   × Hand of Noxus (ogn-253-298) · Legend (Darius)
 *     "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Get the effect if you've played a card this turn.)"
 *   with Y = Whiteflame Protector (ogn-082-298) · Unit · Calm · 8+[calm][calm] · 8 Might
 *     "When you play me, give a unit +8 [Might] this turn."  (P2's banished card: has a Power cost
 *     AND a targeted "When you play me")
 *   and X = a vanilla 3-cost / 4-Might unit (P1's banished card).
 *
 * Rules: 128.6 (no opt-out — "banishes one of them" names no type/quality), 108.6.e (banishment is
 * public), 354.2/354.3 + 337.1.b (plays queued during resolution are finalized after the spell,
 * oldest first — next player's Y before the turn player's X), 191.1/191.3/191.3.c/191.3.d (the
 * player who plays Y controls it and makes its play-time and "When you play me" decisions),
 * 355.2.a (valid locations = THAT controller's base / battlefields), 356.1.b.2 (only Energy is
 * zeroed; Power is still paid — from the player's own pool), 358.2/358.5 (unpaid cost → the play is
 * undone; the card stays banished, never Finalized), 143.4 (enters exhausted), 419.4.b + 812.1.c
 * ("cards you've played" / Legion count cards Finalized by THAT player on the same turn — whoever's
 * turn it is), 303.2.a (turn order).
 *
 * Q: P1's turn, nobody has played a card. P1 casts Promising Future; P1 banishes X, P2 banishes Y.
 *   (a) Can P2 refuse to banish / refuse to play Y?              → No / no (compulsory; fails only if impossible).
 *   (b) Order; who places / pays for / controls Y; exhausted?    → Y first, then X. P2 chooses P2's base or a
 *       battlefield P2 controls (never P1's), pays [calm][calm] from P2's pool (Energy 0), controls Y,
 *       aims its "When you play me"; Y enters exhausted on P1's turn.
 *   (c) P2 cannot produce Y's Power                               → Y's play fails; Y stays in P2's banishment; X still plays.
 *   (d) P1 then plays Battering Ram — 2, 3 or 4?                  → 3 (PF + X = 2 cards; Y never counts for P1). X failed → 4.
 *   (e) Is P2's Legion live for the rest of P1's turn? Next turn? → Yes once Y is Finalized (not if undone); off again on P2's turn.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const BATTERING_RAM = "sfd-012-221";
const HAND_OF_NOXUS = "ogn-253-298";
const WHITEFLAME_PROTECTOR = "ogn-082-298"; // Y
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;
const X_PLAIN = { cardType: "unit", energyCost: 3, might: 4, name: "Unit X" } as const;
/** X variant with a Power cost P1 cannot pay (P1 holds no fury) — the "X failed" contrast of (d). */
const X_FURY = { cardType: "unit", energyCost: 3, might: 4, name: "Unit X (fury)", powerCost: ["fury"] } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: 9 energy + [mind] → Promising Future (5+[mind]) leaves exactly 4, so Battering Ram's
 * charge is readable (3 → 1 left, 4 → 0 left, 2 → 2 left). P2: 0 energy and `p2calm` calm power
 * (2 = can pay Y's [calm][calm]; 0 = cannot). Each player controls one battlefield holding a 2-Might
 * unit; P2's legend is Hand of Noxus. X tops P1's deck, Y (Whiteflame Protector) tops P2's.
 */
function board(opts: { p2calm?: number; x?: typeof X_PLAIN | typeof X_FURY } = {}) {
  return scenario()
    .resources(P1, { energy: 9, power: { mind: 1 } })
    .resources(P2, { energy: 0, power: { calm: opts.p2calm ?? 2 } })
    .legend(P2, HAND_OF_NOXUS, "hon")
    .battlefield("bfP1", { controller: P1 })
    .battlefield("bfP2", { controller: P2 })
    .unit(P1, "bfP1", { might: 2, name: "P1 Holder" }, "p1holder")
    .unit(P2, "bfP2", { might: 2, name: "P2 Holder" }, "p2holder")
    .deck(P1, [opts.x ?? X_PLAIN, FILLER, FILLER, FILLER, FILLER, FILLER], ["x", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [WHITEFLAME_PROTECTOR, FILLER, FILLER, FILLER, FILLER, FILLER], ["y", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf")
    .hand(P1, BATTERING_RAM, "ram");
}

const keysOf = (d: Decision | null): string[] => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Step the game (passes / forced answers only) until `pred` holds for the current decision. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (pred(d)) {
      return d;
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  const d = game.decision();
  expect(pred(d)).toBe(true);
  return d;
}

const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isChainPriorityFor = (seat: string) => (d: Decision | null) => d?.kind === "action" && d.seat === seat && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

/** Cast Promising Future and make both banish picks: P1 → X, then P2 → Y. */
async function castAndBanish(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("x");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("y");
}

/** YES side, fully driven: Y → P2's base (+8 aimed at P2 Holder), then X → P1's base; ends in P1's open main phase. */
async function resolveBothPlays(game: Game): Promise<void> {
  await until(game, isPickFor(P2, /destination/i));
  await game.p2.pick("base");
  await until(game, isPickFor(P2, /target/i));
  await game.p2.pick("p2holder");
  await until(game, isPickFor(P1, /destination/i));
  await game.p1.pick("base");
  await until(game, isOpenMain);
}

describe("Promising Future × Battering Ram × Hand of Noxus — the opponent's instructed play on your turn", () => {
  // ── (a) compulsory ────────────────────────────────────────────────────────────────────────────
  test("(a) the banish is compulsory for P2: shown exactly its own top 5, no decline offered, decline() rejected (128.6 gives no opt-out)", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    await game.p1.pick("x");
    await game.settle();
    const d = game.decision() as Pick;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2 });
    expect(keysOf(d).sort()).toEqual(["b2", "b3", "b4", "b5", "y"]);
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    expect(game.zoneOf("y")).toBe("mainDeck"); // nothing happened yet
    await game.p2.pick("y");
    expect(game.zoneOf("y")).toBe("banishment"); // 108.6.e — public from here on
    expect(game.p2.deck()[0]).toBe("b6"); // the other four were recycled under b6
  });

  test("(a) playing Y is not optional either: P2 is never asked yes/no — the first thing P2 sees about Y is WHERE to put it, with no decline", async () => {
    const game = await board().build();
    await castAndBanish(game);
    let sawYesNo = false;
    const d = (await until(game, (x) => {
      sawYesNo ||= x?.kind === "yes-no" && x.seat === P2;
      return isPickFor(P2, /destination/i)(x);
    })) as Pick;
    expect(sawYesNo).toBe(false);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P2 });
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    expect(game.zoneOf("y")).toBe("banishment");
  });

  // ── (b) order / controller / location / costs / entry ─────────────────────────────────────────
  test("(b) order: Promising Future has finished (trash) with X and Y both banished before either is played; Y (next player) is finalized first — X is still banished while P2 places Y", async () => {
    const game = await board().build();
    await castAndBanish(game);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.zoneOf("x")).toBe("banishment");
    expect(game.zoneOf("y")).toBe("banishment");
    // Two pending plays, one per player.
    expect(game.chain().map((c) => [c.cardId, c.controller]).sort()).toEqual([["x", P1], ["y", P2]]);
    await until(game, isPickFor(P2, /destination/i));
    expect(game.zoneOf("x")).toBe("banishment"); // X waits
    await game.p2.pick("base");
    expect(game.zoneOf("y")).toBe("base");
    expect(game.zoneOf("x")).toBe("banishment");
    // …then X for P1.
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("p2holder");
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    expect(game.zoneOf("x")).toBe("base");
  });

  test("(b) P2 chooses Y's location among P2's base and the battlefield P2 controls — P1's battlefield is not offered and is rejected (355.2.a, 191.3.c)", async () => {
    const game = await board().build();
    await castAndBanish(game);
    const d = (await until(game, isPickFor(P2, /destination/i))) as Pick;
    expect(d.seat).toBe(P2);
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP2"]);
    expect((await game.p2.try((p) => p.pick("battlefield-bfP1"))).ok).toBe(false);
    await game.p2.pick("battlefield-bfP2");
    expect(game.zoneOf("y")).toBe("battlefield-bfP2");
    expect(game.p2.units("bfP2")).toContain("y");
  });

  test("(b) 'base' means P2's base: Y lands in P2's base under P2's control (owner P2), exhausted, on P1's turn (191.1/191.3, 143.4)", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.base()).toContain("y");
    expect(game.p1.base()).not.toContain("y");
    expect(game.state("y")).toMatchObject({ controller: P2, isExhausted: true, might: 8, owner: P2, zone: "base" });
  });

  test("(b) costs: Y's 8 Energy is ignored but its [calm][calm] is paid from P2's OWN pool — P1's pool is untouched (356.1.b.2)", async () => {
    const game = await board().build();
    await castAndBanish(game);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 2 } });
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    expect(game.zoneOf("y")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1); // Finalized by P2
  });

  test("(b) Y's 'When you play me, give a unit +8' is P2's decision (191.3.d): P2 is asked, may aim it at either side, and the +8 lands where P2 said", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    const d = (await until(game, isPickFor(P2, /target/i))) as Pick;
    expect(d.seat).toBe(P2);
    expect(keysOf(d)).toEqual(expect.arrayContaining(["p1holder", "p2holder", "y"]));
    await game.p2.pick("p2holder");
    await until(game, isPickFor(P1, /destination/i)); // Y's trigger has resolved by the time X is placed (or right after)
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.state("p2holder").might).toBe(10);
    expect(game.state("p1holder").might).toBe(2);
  });

  test("(b) then X likewise for P1: P1's base or P1's battlefield only, Energy ignored (P1 stays at 4), enters P1's base exhausted", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("p2holder");
    const d = (await until(game, isPickFor(P1, /destination/i))) as Pick;
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfP1"]);
    expect((await game.p1.try((p) => p.pick("battlefield-bfP2"))).ok).toBe(false);
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.p1.base()).toContain("x");
    expect(game.state("x")).toMatchObject({ controller: P1, isExhausted: true, owner: P1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) NO side: P2 cannot produce [calm][calm] ───────────────────────────────────────────────
  test("(c) P2 has no calm: Y's play fails (358.2/358.5) — P2 is never asked to place it, Y stays in P2's BANISHMENT (not hand, not board, not deck), P2 has played 0 cards; X still plays for P1", async () => {
    const game = await board({ p2calm: 0 }).build();
    await castAndBanish(game);
    let p2Asked = false;
    await until(game, (d) => {
      p2Asked ||= d?.seat === P2 && d.kind !== "action";
      return isPickFor(P1, /destination/i)(d);
    });
    expect(p2Asked).toBe(false);
    expect(game.zoneOf("y")).toBe("banishment");
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.zoneOf("x")).toBe("base");
    expect(game.zoneOf("y")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["y"]);
    expect(game.p2.hand()).not.toContain("y");
    expect(game.p2.units()).not.toContain("y");
    expect(game.p2.deck()).not.toContain("y");
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.state("p2holder").might).toBe(2); // no "When you play me" ever happened
    expect(game.chain()).toEqual([]);
  });

  // ── (d) Battering Ram ─────────────────────────────────────────────────────────────────────────
  test("(d) after PF + X, P1 has played exactly 2 cards (Y is P2's, 419.4.b) → Battering Ram costs 3: 4 energy → 1 left", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await resolveBothPlays(game);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram", { to: "base" });
    expect(game.p1.energy()).toBe(1); // charged 3 — not 2 (Y doesn't count for P1), not 4
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3);
  });

  test("(d) same on the NO side — Y failing changes nothing for P1: still PF + X = 2 → Ram costs 3", async () => {
    const game = await board({ p2calm: 0 }).build();
    await castAndBanish(game);
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    await game.p1.play("ram", { to: "base" });
    expect(game.p1.energy()).toBe(1);
  });

  test("(d) contrast: if X itself fails (X has a [fury] cost P1 can't pay → stays banished, never Finalized) P1 has played only PF → Ram costs 4: 4 → 0", async () => {
    const game = await board({ x: X_FURY }).build();
    expect(game.state("x").powerCost).toEqual(["fury"]);
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("p2holder");
    await until(game, isOpenMain);
    expect(game.zoneOf("x")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["x"]);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1, [P2]: 1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("ram")).toBe("base");
  });

  // ── (e) Hand of Noxus Legion on the opponent's turn ───────────────────────────────────────────
  test("(e) before Y is Finalized P2's Legion is OFF even with priority on P1's turn (P2 has played nothing yet)", async () => {
    const game = await board().build();
    await castAndBanish(game);
    // The first priority P2 receives after the picks — Y is still banished.
    await until(game, isChainPriorityFor(P2));
    expect(game.zoneOf("y")).toBe("banishment");
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.p2.can("activate", "hon")).toBe(false);
  });

  test("(e) once Y is Finalized, P2 — on P1's turn — may exhaust Hand of Noxus at Reaction speed and really gets [1] (812.1.c: 'same turn', not 'your turn')", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("p2holder");
    // P2 now holds priority with Y's play trigger on the chain, during P1's turn.
    const d = await until(game, isChainPriorityFor(P2));
    expect(game.turnPlayer()).toBe(P1);
    expect(d?.seat).toBe(P2);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.p2.can("activate", "hon")).toBe(true);
    expect(game.p2.energy()).toBe(0);
    await game.p2.activate("hon");
    expect(game.p2.energy()).toBe(1);
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.actingSeat()).toBe(P2); // [Add]: no chain item, priority kept
    // Finish the turn's business; nothing else changes.
    await until(game, isPickFor(P1, /destination/i));
    await game.p1.pick("base");
    await until(game, isOpenMain);
    expect(game.p2.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(e) it stays live for the REST of P1's turn: P2 also has it in the later priority window around X's play", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await until(game, isPickFor(P2, /destination/i));
    await game.p2.pick("base");
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("p2holder");
    await until(game, isChainPriorityFor(P2));
    await game.p2.passPriority(); // don't use it yet
    // Next P2 priority: Y's trigger is gone, X's pending play is the top item.
    await until(game, (d) => isChainPriorityFor(P2)(d) && game.chain().every((c) => c.cardId !== "y"));
    expect(game.chain().map((c) => c.cardId)).toEqual(["x"]);
    expect(game.p2.can("activate", "hon")).toBe(true);
    await game.p2.activate("hon");
    expect(game.p2.energy()).toBe(1);
  });

  test("(e) NO side: Y was undone, so P2's Legion stays OFF in that same later window (nothing Finalized by P2)", async () => {
    const game = await board({ p2calm: 0 }).build();
    await castAndBanish(game);
    // Walk every P2 priority window until X is placed; Hand of Noxus must never be usable / productive.
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (isPickFor(P1, /destination/i)(d)) {
        break;
      }
      if (isChainPriorityFor(P2)(d)) {
        if (game.p2.can("activate", "hon")) {
          await game.p2.activate("hon");
        } else {
          await game.p2.passPriority();
        }
        continue;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.p2.energy()).toBe(0);
  });

  test("(e) on P2's following turn the count has reset: Hand of Noxus is ready but Legion is off again — Y (played last turn) no longer satisfies it", async () => {
    const game = await board().build();
    await castAndBanish(game);
    await resolveBothPlays(game);
    expect(game.state("hon").isReady).toBe(true); // unused on P1's turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("y")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.state("hon").isReady).toBe(true);
    const before = game.p2.energy();
    if (game.p2.can("activate", "hon")) {
      await game.p2.activate("hon");
      await game.settle();
    }
    expect(game.p2.energy()).toBe(before);
  });
});
