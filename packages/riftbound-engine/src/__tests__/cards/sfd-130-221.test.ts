/**
 * Treasure Hunter — sfd-130-221 · Unit · Chaos · 2 energy (no power) · 1 Might
 *
 *   When I move, play a Gold gear token exhausted.
 *
 * (Gold — sfd-t03: gear token, "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow].")
 *
 * Rules: 446.1 (any board→board relocation is a Move: base→bf, bf→base, bf→bf), 446.3.c (the
 * move itself never uses the chain — but the triggered ability does, 383), 449 (moves caused by
 * spells are moves), 456.1 (Recalls are NOT moves and never fire move triggers), 446.2 (playing a
 * unit onto the board is a zone change, not a move), 460 (a staged combat only begins once the
 * chain is empty → the Gold lands before the fight), 185/152.2 (a gear token is played to base;
 * "exhausted" overrides the ready default), 375 example (this very card).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - "When I move" has NO direction: retreating bf → base and a Ganking bf → bf step both pay out.
 *  - Attackers that survive a drawn combat are RECALLED (466.1.a.2) — that trip home is not a move,
 *    so exactly one Gold (from the way in), never two.
 *  - A move into an enemy battlefield: the trigger resolves (Gold in base) before combat opens, so
 *    the Gold stays even if Treasure Hunter dies in that combat.
 *  - Two Treasure Hunters moved together in one Standard Move → two triggers → two Gold.
 *  - Being moved by a spell (Ride the Wind) is still a move → Gold.
 *  - Playing Treasure Hunter straight to a battlefield is not a move → no Gold.
 *  - The Gold enters EXHAUSTED: its [Exhaust] cost can't be paid this turn; after your next Awaken it
 *    is ready and cashes in for 1 [rainbow].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-130-221";
const RIDE_THE_WIND = "ogn-173-298"; // Action spell, 2 + [chaos]: "Move a friendly unit and ready it."

const golds = (game: Game) => game.p1.gear().filter((id) => game.state(id).name === "Gold");

describe("Treasure Hunter (sfd-130-221)", () => {
  test("cost: 2 energy, no power; 1-Might unit that enters exhausted; playing it is not a move (no Gold); unaffordable at 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "th").build();
    await game.p1.play("th");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("th")).toBe("base");
    expect(game.state("th")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1 });
    expect(game.chain()).toHaveLength(0);
    expect(golds(game)).toHaveLength(0);
    const poor = await scenario().resources(P1, { energy: 1, power: { chaos: 2 } }).hand(P1, CARD, "th").build();
    expect(poor.p1.can("play", "th")).toBe(false);
  });

  test("Standard Move base → battlefield: a triggered item goes on the chain; on resolution ONE Gold gear token is played to base, exhausted", async () => {
    const game = await scenario().battlefield("own", { controller: P1 }).unit(P1, "base", CARD, "th").build();
    await game.p1.move("th", "own");
    expect(game.locationOf("th")).toBe("own"); // the move itself is instantaneous (446.3)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "th", controller: P1, triggered: true })]);
    expect(golds(game)).toHaveLength(0); // nothing until the trigger resolves
    await game.settle();
    const [gold] = golds(game);
    expect(golds(game)).toHaveLength(1);
    expect(game.state(gold as string)).toMatchObject({ cardType: "gear", energyCost: 0, isExhausted: true, isToken: true, location: "base", owner: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the opponent receives priority on the move trigger before the Gold exists (they could respond with a Reaction)", async () => {
    const game = await scenario().battlefield("own", { controller: P1 }).unit(P1, "base", CARD, "th").build();
    await game.p1.move("th", "own");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(golds(game)).toHaveLength(0);
    await game.p2.passPriority();
    expect(golds(game)).toHaveLength(1);
  });

  test("'exhausted' matters: the fresh Gold cannot pay its [Exhaust] cost this turn; after your next Awaken it is ready and cashes in for 1 [rainbow]", async () => {
    const game = await scenario().battlefield("own", { controller: P1 }).unit(P1, "base", CARD, "th").build();
    await game.p1.move("th", "own");
    await game.settle();
    const [gold] = golds(game) as [string];
    expect(game.p1.can("activate", gold)).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Awaken readies the token)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isReady).toBe(true);
    await game.p1.activate(gold);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(golds(game)).toHaveLength(0); // killed as part of the cost — a token that leaves the board ceases to exist
  });

  test("'When I move' has no direction: a retreat battlefield → base also plays a Gold", async () => {
    const game = await scenario().battlefield("own", { controller: P1 }).unit(P1, "own", CARD, "th").build();
    await game.p1.move("th", "base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "th", triggered: true })]);
    await game.settle();
    expect(game.locationOf("th")).toBe("base");
    expect(golds(game)).toHaveLength(1);
  });

  test("battlefield → battlefield (Ganking granted this turn) is a move too: Gold, and the empty enemy field is conquered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "th", { grantedKeywords: [{ duration: "turn", keyword: "Ganking" }] })
      .build();
    await game.p1.gank("th", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "th", triggered: true })]);
    await game.settle();
    expect(golds(game)).toHaveLength(1);
    expect(game.locationOf("th")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("two Treasure Hunters moved together in one Standard Move → two triggers → two Gold tokens", async () => {
    const game = await scenario().battlefield("own", { controller: P1 }).unit(P1, "base", CARD, "th1").unit(P1, "base", CARD, "th2").build();
    await game.p1.move(["th1", "th2"], "own");
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["th1", "th2"]);
    await game.settle();
    expect(golds(game)).toHaveLength(2);
    expect(golds(game).every((g) => game.state(g).isExhausted)).toBe(true);
  });

  test("moved by a spell (Ride the Wind, 449) is still a move: the trigger fires after the spell resolves and a Gold is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("own", { controller: P1 })
      .battlefield("open", { controller: null })
      .unit(P1, "base", CARD, "th", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "th" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-own");
    expect(game.locationOf("th")).toBe("own");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "th", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(golds(game)).toHaveLength(1);
  });

  test("460: attacking into an enemy battlefield — the trigger resolves BEFORE combat opens, so the Gold stays even though Treasure Hunter (1) dies to the 5-Might defender", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "th")
      .build();
    await game.p1.move("th", "enemy");
    expect((game.decision() as ActionDecision).context).toBe("chain"); // trigger first, not yet a showdown
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(golds(game)).toHaveLength(1);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("th")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
    expect(golds(game)).toHaveLength(1);
  });

  test.failing("BUG: 344 / 323.12 / 401.1: moving into an empty uncontrolled battlefield does NOT open the non-combat Showdown while the move trigger is still on the chain", async () => {
    const game = await scenario()
      .battlefield("climb", { controller: null })
      .unit(P1, "base", CARD, "th")
      .build();
    await game.p1.move("th", "climb");
    expect(game.chain()).toHaveLength(1);
    // 401.1 — the Pending Item makes this a Closed State; 344 needs a Neutral Open one.
    expect(game.gameState.interaction?.showdownStack?.some((sd) => sd.active)).toBeFalsy();
    await game.settle();
    expect(golds(game)).toHaveLength(1);
    // deferred, not skipped: the Cleanup opens it once the chain is empty.
    expect(game.gameState.battlefields.climb?.contested).toBe(true);
  });

  test("456.1: surviving attackers RECALLED after a drawn combat do not 'move' — exactly one Gold (from the way in), not two", async () => {
    // Treasure Hunter (1) walks in with a stunned 10-Might Tank bodyguard: attackers deal only 1 (423.1.b) so the
    // 5-Might defender lives; its 5 damage must go to the Tank first (815) and is not lethal → everyone survives,
    // both sides remain → attackers are recalled to base (466.1.a.2), which is not a Move.
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "th")
      .unit(P1, "base", { keywords: ["Tank"], might: 10, name: "Bodyguard" }, "guard", { stunned: true })
      .build();
    await game.p1.move(["th", "guard"], "enemy");
    expect(game.chain()).toHaveLength(1); // only Treasure Hunter has a move trigger
    await game.settle();
    expect(game.locationOf("th")).toBe("base");
    expect(game.locationOf("guard")).toBe("base");
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
    expect(game.chain()).toHaveLength(0); // no second trigger from the recall
    expect(golds(game)).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("446.2 negative space: playing Treasure Hunter directly TO a battlefield you control is a zone change, not a move — no trigger, no Gold", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("own", { controller: P1 }).hand(P1, CARD, "th").build();
    await game.p1.play("th", { to: "own" });
    await game.settle();
    expect(game.zoneOf("th")).toBe("battlefield-own");
    expect(game.chain()).toHaveLength(0);
    expect(golds(game)).toHaveLength(0);
  });

  test("negative space: another friendly unit moving (Treasure Hunter stays put) does not trigger it", async () => {
    const game = await scenario()
      .battlefield("own", { controller: P1 })
      .unit(P1, "base", CARD, "th")
      .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
      .build();
    await game.p1.move("runner", "own");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(golds(game)).toHaveLength(0);
    expect(game.locationOf("th")).toBe("base");
  });

  test("parsed abilities match the printed text: one self-move trigger that creates a Gold gear token NOT ready", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 2, might: 1, name: "Treasure Hunter" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      trigger: { event: "move", on: "self" },
      type: "triggered",
    });
    expect(abilities[0]?.optional).not.toBe(true); // "play", not "you may play"
  });
});
