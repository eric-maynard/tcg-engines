/**
 * Interaction: Endless Riches (ven-022-166) · Gear · Fury · 5+[fury]
 *     "… You may play cards from your trash. If a card would go to your trash from anywhere other
 *      than your Main Deck, banish it instead."
 *   × Void Drone (sfd-010-221) · Unit · Fury · 3 · 3 Might
 *     "I cost [2] less to play from anywhere other than your hand."
 *   × Drag Under (sfd-164-221) · Spell · Order · 5+[order] · [Action]
 *     "I cost [2] less to play from anywhere other than your hand. Kill a unit at a battlefield."
 *   (+ probes for "played from anywhere other than your hand": Heart of the Tempest ven-197-166
 *    "When you play a card from anywhere other than your hand, empower me." and Rek'Sai, Breacher
 *    sfd-029-221 "Friendly units played from anywhere other than a player's hand have [Accelerate].")
 *
 * Question: Burn has put Void Drone and Drag Under into P1's trash while P1 controls Endless
 * Riches. (a) Is playing them from the trash an ordinary play (costs, timing, location choice,
 * enters exhausted, counts as a card played / non-hand play)? (b) Where do they go afterwards —
 * Drag Under after resolving, Void Drone after dying — and can they be replayed? (c) Contrast:
 * the same two cards played from HAND while Riches is out.
 *
 * Rules: 419.1.a (default play zones — Riches widens them, nothing more), 358.4 (timing
 * permissions unchanged), 356.4 (discounts: the self "[2] less from non-hand" is live from the
 * trash, not from hand), 355.2.a (controller picks the unit's location), 143.4 (units enter
 * exhausted), 419.4.b / 812.1.c (a Finalized card counts as "played this turn"), 359.3.d (a
 * resolved spell goes to trash → from the CHAIN, so Riches banishes it), 428.2 (a kill is
 * board → trash → banished instead), 369.1 / 370.1 (replacement semantics), 808.1.d.1.
 *
 * Expected: (a) ordinary plays: Drone 1 energy, own turn / open state only, P1 chooses base or a
 * controlled battlefield, enters exhausted; Drag Under 3+[order], Action timing (own turn, or a
 * showdown on either turn once P1 holds Focus, never as a Reaction); both bump "cards played this
 * turn" and fire Heart of the Tempest. (b) Drag Under → banishment after resolving (one use);
 * Void Drone → banishment when it dies (no replay). (c) From hand: 3 and 5+[order]; they are
 * STILL banished afterwards (Riches cares where the card is coming from when it heads to trash).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ENDLESS_RICHES = "ven-022-166";
const VOID_DRONE = "sfd-010-221";
const DRAG_UNDER = "sfd-164-221";
const HEART_OF_THE_TEMPEST = "ven-197-166";
const REKSAI_BREACHER = "sfd-029-221"; // "Friendly units played from anywhere other than a player's hand have [Accelerate]."

/** Inline 1-energy action spell for P2: deal 3 to a unit (lethal on a 3-Might Drone). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: Endless Riches in base, Void Drone + Drag Under in TRASH, hand copies of both for contrast.
 * bf1 = P2's battlefield with a 10-Might Giant (Drag Under fodder); bf2 = P1's battlefield with a
 * 1-Might Holder (a legal Drone destination / a showdown site on P2's turn).
 */
function board(opts: { energy?: number; order?: number; active?: typeof P1 } = {}) {
  return scenario()
    .active(opts.active ?? P1)
    .resources(P1, { energy: opts.energy ?? 8, power: { order: opts.order ?? 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 10, name: "Giant" }, "giant")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 9, name: "Raider" }, "raider")
    .gear(P1, ENDLESS_RICHES, "riches")
    .trash(P1, VOID_DRONE, "drone")
    .trash(P1, DRAG_UNDER, "drag")
    .hand(P1, VOID_DRONE, "droneHand")
    .hand(P1, DRAG_UNDER, "dragHand")
    .hand(P2, BOLT, "bolt");
}

function locationsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("playUnit", alias);
  const field = opt?.fields.find((f) => f.arg === "to" || f.name === "location");
  return ((field?.options ?? []) as string[]).map((z) => (z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z));
}

describe("Endless Riches × Void Drone / Drag Under — playing from the trash is an ordinary play", () => {
  // ---- (a) cost --------------------------------------------------------------------------------

  test("(a) Void Drone from trash costs exactly [1] (3 − 2 self discount, 356.4): legal on 1 energy, pool drops 1 → 0", async () => {
    const game = await board({ energy: 1, order: 0 }).build();
    expect(game.p1.can("play", "drone")).toBe(true);
    expect(game.p1.can("play", "droneHand")).toBe(false); // hand copy needs 3
    await game.p1.play("drone", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("drone")).toBe("base");
  });

  test("(a) Drag Under from trash costs 3 + [order] (5 − 2, power pip untouched): legal on exactly 3+order, not on 2+order or 3 without order", async () => {
    const game = await board({ energy: 3, order: 1 }).build();
    expect(game.p1.can("cast", "drag")).toBe(true);
    expect(game.p1.can("cast", "dragHand")).toBe(false); // hand copy needs 5
    await game.p1.cast("drag", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });

    const short = await board({ energy: 2, order: 1 }).build();
    expect(short.p1.can("cast", "drag")).toBe(false);
    const noOrder = await board({ energy: 3, order: 0 }).build();
    expect(noOrder.p1.can("cast", "drag")).toBe(false);
  });

  // ---- (a) location / enters exhausted ---------------------------------------------------------

  test("(a) P1 chooses Void Drone's location as usual (355.2.a): base or P1's bf2 are offered, P2's bf1 is not; played to bf2 it arrives there EXHAUSTED (143.4)", async () => {
    const game = await board().build();
    const offered = locationsOffered(game, "drone");
    expect(offered).toContain("base");
    expect(offered).toContain("bf2");
    expect(offered).not.toContain("bf1");
    await game.p1.play("drone", { to: "bf2" });
    await game.settle();
    expect(game.zoneOf("drone")).toBe("battlefield-bf2");
    expect(game.state("drone").isExhausted).toBe(true);
    expect(game.state("drone").might).toBe(3);
    await expect(board().build().then((g) => g.p1.play("drone", { to: "bf1" }))).rejects.toThrow();
  });

  // ---- (a) timing ------------------------------------------------------------------------------

  test("(a) on P2's turn (open state, no showdown) neither trash card is playable — no Reaction speed is granted (358.4)", async () => {
    const game = await board({ active: P2 }).build();
    expect(game.p1.can("play", "drone")).toBe(false);
    expect(game.p1.can("cast", "drag")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("cast");
  });

  test("(a) Drag Under is an [Action]: in a showdown on P2's turn P1 may cast it from the trash once Focus passes to P1 — Void Drone (no Action) still may not be played", async () => {
    const game = await board({ active: P2 }).build();
    await game.p2.move("raider", "bf2"); // attack P1's Holder → combat showdown, P2 has Focus
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "drag")).toBe(false); // P2 holds Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "drone")).toBe(false); // a unit without Action/Reaction: never in a showdown
    expect(game.p1.can("cast", "drag")).toBe(true);
    await game.p1.cast("drag", { targets: "raider" });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { order: 0 } }); // 8 − 3
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // P2's unit → P2's trash (not "your trash" for Riches)
    expect(game.zoneOf("holder")).toBe("battlefield-bf2");
  });

  test("(a) not a Reaction: while a chain is open on P1's own turn, neither trash card is offered", async () => {
    const game = await board().build();
    await game.p1.cast("dragHand", { targets: "giant" }); // opens a chain; P1 keeps priority first
    expect(game.chain()).toHaveLength(1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "drag")).toBe(false);
    expect(game.p1.can("play", "drone")).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2 may respond as normal
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("cast"); // Bolt is an Action, not a Reaction
  });

  test("(a) Drag Under cast from trash: target locked on cast, one chain item controlled by P1, P2 gets priority before the kill", async () => {
    const game = await board().build();
    await game.p1.cast("drag", { targets: "giant" });
    expect(game.zoneOf("drag")).toBe("chain");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "drag", controller: P1, triggered: false });
    expect(game.chain()[0]?.targets).toEqual(["giant"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("giant")).toBe("battlefield-bf1");
    await game.p2.passPriority();
    expect(game.zoneOf("giant")).toBe("trash");
  });

  // ---- (a) counts as a card played / non-hand play ---------------------------------------------

  test("(a) each trash play is a Finalized card: 'cards played this turn' goes 0 → 1 → 2 (419.4.b / 812.1.c Legion, Battering Ram)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("drone", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.p1.cast("drag", { targets: "giant" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
  });

  test("(a) a trash play IS 'played from anywhere other than your hand': Heart of the Tempest empowers on the trash Drone, not on the hand Drone", async () => {
    const fromTrash = await board().legend(P1, HEART_OF_THE_TEMPEST, "heart").build();
    expect(fromTrash.state("heart").isEmpowered).toBe(false);
    await fromTrash.p1.play("drone", { to: "base" });
    await fromTrash.settle();
    expect(fromTrash.zoneOf("drone")).toBe("base");
    expect(fromTrash.state("heart").isEmpowered).toBe(true);

    const fromHand = await board().legend(P1, HEART_OF_THE_TEMPEST, "heart").build();
    await fromHand.p1.play("droneHand", { to: "base" });
    await fromHand.settle();
    expect(fromHand.zoneOf("droneHand")).toBe("base");
    expect(fromHand.state("heart").isEmpowered).toBe(false);
  });

  test("(a) Accelerate-type options apply as to any play: with Rek'Sai, Breacher out the TRASH Drone (non-hand) is offered Accelerate (1+[fury]) and enters ready; the hand Drone is not", async () => {
    const game = await board()
      .resources(P1, { energy: 8, power: { fury: 1, order: 1 } })
      .unit(P1, "base", REKSAI_BREACHER, "breacher")
      .build();
    const payField = (alias: string) => game.p1.option("playUnit", alias)?.fields.find((f) => f.arg === "payOptional");
    expect(payField("drone")?.options).toContain(true);
    expect(payField("droneHand")).toBeUndefined();
    await game.p1.play("drone", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 0, order: 1 } }); // 1 (discounted) + 1+[fury] accelerate
    await game.settle();
    expect(game.zoneOf("drone")).toBe("base");
    expect(game.state("drone").isExhausted).toBe(false);
  });

  // ---- (b) where they go afterwards ------------------------------------------------------------

  test("(b) Drag Under resolved from the trash heads chain → trash and is BANISHED instead (359.3.d + Riches); it cannot be recast, even next turn", async () => {
    const game = await board().build();
    await game.p1.cast("drag", { targets: "giant" });
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("drag")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("drag");
    expect(game.p1.can("cast", "drag")).toBe(false);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("drag")).toBe("banishment");
    expect(game.p1.can("cast", "drag")).toBe(false);
  });

  test("(b) Void Drone played from trash and later killed goes board → BANISHMENT (428.2 + Riches), never restocking the trash; it cannot be replayed", async () => {
    const game = await board().build();
    await game.p1.play("drone", { to: "base" });
    await game.settle();
    expect(game.zoneOf("drone")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune(); // pools empty at end of turn; P2 channels 2 runes at turn start
    await game.p2.cast("bolt", { targets: "drone" });
    await game.settle();
    expect(game.zoneOf("drone")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("drone");
    await game.advanceToTurnOf(P1);
    expect(game.p1.can("play", "drone")).toBe(false);
  });

  test("(b) only P1's cards are redirected: P2's Giant killed by Drag Under lands in P2's trash, P1's trash only ever shrinks", async () => {
    const game = await board().build();
    const trashBefore = [...game.p1.trash()].sort();
    expect(trashBefore).toEqual(["drag", "drone"]);
    await game.p1.cast("drag", { targets: "giant" });
    await game.settle();
    expect(game.p2.trash()).toContain("giant");
    expect(game.p1.trash()).toEqual(["drone"]);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) contrast: from hand while Riches is out ---------------------------------------------

  test("(c) from HAND with Riches out: Void Drone costs the full 3, Drag Under the full 5 + [order] (no self discount)", async () => {
    const game = await board({ energy: 8, order: 1 }).build();
    await game.p1.play("droneHand", { to: "base" });
    expect(game.p1.energy()).toBe(5);
    await game.settle();
    await game.p1.cast("dragHand", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");

    const four = await board({ energy: 4, order: 1 }).build();
    expect(four.p1.can("cast", "dragHand")).toBe(false);
    expect(four.p1.can("play", "droneHand")).toBe(true); // 3 ≤ 4
    const two = await board({ energy: 2, order: 1 }).build();
    expect(two.p1.can("play", "droneHand")).toBe(false);
    expect(two.p1.can("play", "drone")).toBe(true); // trash copy: 1
  });

  test("(c) hand-cast Drag Under is STILL banished after resolving — the replacement keys on chain → trash, not on where it was played from", async () => {
    const game = await board().build();
    await game.p1.cast("dragHand", { targets: "giant" });
    await game.settle();
    expect(game.zoneOf("dragHand")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("dragHand");
  });

  test("(c) hand-played Void Drone that dies is STILL banished (board → trash replaced), so it never becomes trash-replayable", async () => {
    const game = await board().build();
    await game.p1.play("droneHand", { to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.p2.tapRune();
    await game.p2.cast("bolt", { targets: "droneHand" });
    await game.settle();
    expect(game.zoneOf("droneHand")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("droneHand");
  });

  test("same timing rules from hand: on P2's open turn the hand copies are just as unplayable as the trash copies", async () => {
    const game = await board({ active: P2 }).build();
    expect(game.p1.can("play", "droneHand")).toBe(false);
    expect(game.p1.can("cast", "dragHand")).toBe(false);
  });
});
