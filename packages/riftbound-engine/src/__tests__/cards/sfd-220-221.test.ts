/**
 * Treasure Hoard — sfd-220-221 · Battlefield · no domain · no cost
 *
 *   When you conquer here, you may pay [1] to play a Gold gear token exhausted.
 *
 * Rules: 469.1 / 466.5.d (Conquer = establish control of a battlefield you have not scored this
 * turn — by walking onto an empty one or by winning a combat), 471.2.a ("conquer here" abilities
 * trigger at the conquered battlefield), 190.6.d ("you" on a battlefield = its CONTROLLER — the
 * conqueror has just become it; the card's owner is irrelevant), 383.3.a (an effect that STARTS with
 * "you may" is decided during finalization: declining removes the item, it never triggered),
 * 355.10.c.1 ("pay [1] to …" is a cost inside the instruction), 187.5 (Gold = domainless gear token
 * with "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]"), 184.1 / 430.2-style stipulation (the
 * token is played EXHAUSTED), 469.2 (Hold ≠ Conquer), 471.1.b.1 (at Victory−1 a non-final conquer
 * draws instead — but it is still a Conquer, so the trigger fires).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Symmetry: P2 conquering a Hoard that P1 owns is P2's trigger, P2's prompt, P2's energy and
 *     P2's Gold; P1 is never asked.
 *  2. The [1] is real: it is deducted on accepting; with 0 energy accepting is not possible and no
 *     token appears; declining costs nothing (and the conquer point stands either way).
 *  3. Only CONQUER and only HERE: holding the Hoard next turn, or conquering some other battlefield
 *     while sitting on the Hoard, offers nothing; a failed attack is no conquer.
 *  4. Ordering: the point is scored first, then the trigger goes on the chain; the token exists only
 *     after the item resolves (both players get priority in between).
 *  5. Partner: Plundering Poro conquering the Hoard → its own mandatory Gold + the Hoard's paid Gold
 *     = two exhausted Gold tokens for [1].
 *  6. The token is a real Gold: exhausted now, ready after its controller's next Awaken, then
 *     cashable for [rainbow].
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-220-221";
const PORO = "sfd-069-221"; // Plundering Poro · 2 Might · When I conquer, play a Gold gear token exhausted.

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");
const hoardItems = (game: Game) => game.chain().filter((i) => i.cardId === "hoard" && i.triggered);

/** P1's turn with `energy`; the Hoard (owned AND controlled by P2, optionally guarded) faces P1's ready `might`-Might raider. */
function board(opts: { energy?: number; guard?: number; might?: number } = {}) {
  const b = scenario()
    .resources(P1, { energy: opts.energy ?? 2 })
    .battlefield("hoard", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P1, "base", { might: opts.might ?? 3, name: "Raider" }, "raider");
  if (opts.guard !== undefined) {
    b.unit(P2, "hoard", { might: opts.guard, name: "Guard" }, "guard");
  }
  return b;
}

/** Pass focus/priority for whoever holds it until a non-action prompt or the open main phase appears. */
async function passUntilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Treasure Hoard (sfd-220-221)", () => {
  test("registry payload: an OPTIONAL conquer-here (controller) trigger with a pay-[1] cost that creates an exhausted Gold gear token", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Treasure Hoard" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      optional: true,
      trigger: { event: "conquer", location: "here", on: "controller" },
      type: "triggered",
    });
  });

  test("walk onto the empty Hoard: point scored, ONE triggered item controlled by P1 and a 'Pay [1]' yes/no for P1; accepting deducts 1, and after both pass a single EXHAUSTED Gold token sits in P1's base", async () => {
    const game = await board({ energy: 2 }).build();
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    expect(game.gameState.battlefields.hoard?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // scored before the trigger is even answered
    expect(hoardItems(game)).toEqual([expect.objectContaining({ controller: P1, name: "Treasure Hoard" })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(goldOf(game, "p1")).toHaveLength(0);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1);
    // 383 — still a chain item: both players get priority before the token exists.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(goldOf(game, "p1")).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(goldOf(game, "p2")).toHaveLength(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining (383.3.a): no energy spent, no token, nothing left on the chain — the conquer point stands", async () => {
    const game = await board({ energy: 2 }).build();
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the [1] is a real cost: with 0 energy accepting is impossible and no free Gold appears (point still scored)", async () => {
    const game = await board({ energy: 0 }).build();
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.seat).toBe(P1);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.energy()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("conquering through combat (4 into a 2-Might guard) triggers it just the same", async () => {
    const game = await board({ energy: 1, guard: 2, might: 4 }).build();
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.hoard?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("a failed attack (3 into a 5-Might guard) is no conquer: raider dies, no prompt, no item, no token, no point", async () => {
    const game = await board({ energy: 2, guard: 5, might: 3 }).build();
    await game.p1.move("raider", "hoard");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.hoard?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.energy()).toBe(2);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(goldOf(game, "p2")).toHaveLength(0);
  });

  test("'you' is the conqueror (190.6.d): P2 conquering a Hoard OWNED and controlled by P1 → P2's item, P2's prompt, P2 pays, P2's Gold; P1 is never asked", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 1 })
      .battlefield("hoard", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "hoard", { might: 1, name: "Sitter" }, "sitter")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "hoard");
    await passUntilPrompt(game);
    expect(game.zoneOf("sitter")).toBe("trash");
    expect(hoardItems(game)).toEqual([expect.objectContaining({ controller: P2 })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.energy()).toBe(3);
    expect(goldOf(game, "p2")).toHaveLength(1);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.p2.points()).toBe(1);
  });

  // BUG — expected (471.2.a: conquer abilities trigger at the battlefield that was CONQUERED): taking the
  // plain battlefield while merely controlling the Hoard raises nothing. Actual: a "Treasure Hoard" item
  // goes on the chain and P1 is asked to pay [1] — the trigger's `location: "here"` is not enforced for
  // the controller's conquers elsewhere.
  test("'When you conquer HERE' does not fire when the Hoard's controller conquers a DIFFERENT battlefield (471.2.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("hoard", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("plain", { controller: P2 })
      .unit(P1, "hoard", { might: 2, name: "Sitter" }, "sitter")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "plain");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.plain?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("Hold ≠ Conquer (469.2): holding the Hoard at the start of your turn scores 1 but never asks about Gold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("hoard", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "hoard", { might: 2, name: "Sitter" }, "sitter")
      .script(P1, [], { strict: true }) // any unscripted prompt for P1 would throw
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("partner — Plundering Poro conquers the Hoard: its own mandatory Gold plus the Hoard's paid one = TWO exhausted Gold tokens for [1]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("hoard", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", PORO, "poro")
      .build();
    await game.p1.move("poro", "hoard");
    for (let i = 0; i < 16 && game.decision()?.kind !== "yes-no"; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.points()).toBe(1);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(2);
    for (const g of gold) {
      expect(game.state(g).isExhausted).toBe(true);
    }
  });

  test("471.1.b.1 — at 7 of 8 with another unscored battlefield the conquer draws instead of winning, but it is still a Conquer: the Hoard asks, and paying yields the Gold", async () => {
    const game = await board({ energy: 1 }).points(P1, 7).battlefield("elsewhere", { controller: P2 }).build();
    expect(game.gameState.victoryScore).toBe(8);
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("the token is a real Gold (187.5): exhausted now, ready after P1's next Awaken, then 'Kill this, [Exhaust]: [Add] [rainbow]' cashes it in", async () => {
    const game = await board({ energy: 1 }).build();
    await game.p1.move("raider", "hoard");
    await passUntilPrompt(game);
    await game.p1.yes();
    await game.settle();
    const gold = goldOf(game, "p1")[0] as string;
    expect(game.state(gold).isExhausted).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.activate(gold);
    await game.settle();
    expect(game.zoneOf(gold)).toBe("gone");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("inert control: the same walk-on at an abilities-stripped Hoard scores 1 with no prompt and no token", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("hoard", { controller: P2, def: CARD, inert: true, owner: P2 })
      .unit(P1, "base", { might: 3 }, "raider")
      .build();
    await game.p1.move("raider", "hoard");
    await game.settle();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.p1.energy()).toBe(2);
  });
});
