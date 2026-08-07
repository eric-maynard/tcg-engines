/**
 * Kennen, Storm of Shuriken — ven-113-166 · Champion Unit (Kennen) · Chaos · 3 energy + [chaos] · 4 Might
 *
 *   When you play me, [Burn 2]. (Put the top 2 cards of your Main Deck into your trash.)
 *   When I conquer, give a spell in your trash [Flow] equal to its cost this turn. (You may play it
 *   from your trash for its Flow cost. Then banish it.)
 *
 * Rules: 440 (Burn X = move the top X of your Main Deck to your trash; mandatory; 440.4: short deck →
 * burn what you can, Burn Out (431: recycle trash into deck, an opponent gains 1 point), burn the rest),
 * 829 (Flow = permission to play from trash for an alternate cost + delayed replacement "banish instead"
 * when it leaves the chain; 829.1.b.2 no timing change; 829.1.c.3 several Flow costs → controller picks),
 * 206 ("its cost" = PRINTED energy + power), 355.10.a (a spell in your trash is a public-zone TARGET),
 * 383.4.c (conquer trigger: only when THIS unit conquers).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Burn is not draw: exactly the top two deck cards land in P1's trash, hand unchanged, and it is a
 *     play TRIGGER (on the chain after Kennen is already on the board).
 *  2. 440.4 short deck: 1 card left + 3 in trash → burn 1, Burn Out (P2 +1 point, 4 trash cards become
 *     the deck), burn 1 more → deck 3 / trash 1.
 *  3. Self-fuel: spells Kennen burned are exactly what his conquer trigger can later hand Flow to.
 *  4. The grant prices off the PRINTED cost incl. power (Void Seeker → [3][fury]); the flowed spell is
 *     BANISHED after resolving; the grant is "this turn" — gone after the turn passes; only SPELLS in
 *     YOUR trash are candidates (units / the opponent's trash never); empty trash → trigger fizzles.
 *  5. 829.1.b.2: a granted-Flow Reaction (Discipline) keeps Reaction timing; a standard spell does not
 *     gain showdown timing.
 *  6. 829.1.c.3: a spell that already has a different printed Flow (Iterative Design, Flow [2][mind])
 *     gets a SECOND Flow cost [4] from Kennen — with 4 energy and no mind power it must be castable.
 *  7. Conquer only: holding at turn start, or a friend conquering while Kennen sits in base → nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-113-166";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.
const ITERATIVE_DESIGN = "ven-051-166"; // 4 · Play a 3-Might Mech token. Flow [2][mind].
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit (a non-spell for the trash)

/** P1's turn: ready Kennen in base, P2 holds an EMPTY bf1; P1's trash per `trash`. */
function conquerBoard(trash: [string, string][], res: { energy?: number; power?: Record<string, number> } = { energy: 6, power: { fury: 1 } }) {
  const b = scenario().resources(P1, res).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "kennen").unit(P1, "base", { might: 2, name: "Pal" }, "pal");
  for (const [def, alias] of trash) {
    b.trash(P1, def, alias);
  }
  return b;
}

/** Move Kennen onto bf1, resolve the conquer, and answer the trigger's target prompt with `pick` if asked. */
async function conquerAndGrant(game: Game, pick?: string): Promise<string[] | undefined> {
  await game.p1.move("kennen", "bf1");
  let offered: string[] | undefined;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = r.decision;
    if (d?.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(pick ?? offered[0]!);
      continue;
    }
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    break;
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return offered;
}

describe("Kennen, Storm of Shuriken (ven-113-166)", () => {
  test("registry payload: Chaos champion unit 3+[chaos], 4 Might, tag Kennen; abilities = [play-self → mill 2, conquer(self) → grant-flow (turn) to a friendly spell in trash]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, isChampion: true, might: 4, name: "Kennen, Storm of Shuriken", tags: ["Kennen"] });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 2, type: "mill" }, trigger: { event: "play-self" }, type: "triggered" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { duration: "turn", target: { controller: "friendly", location: "trash", types: ["spell"] }, type: "grant-flow" },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
  });

  test("cost 3 + [chaos]: enters base exhausted as a 4; the play trigger Burns exactly the TOP TWO deck cards into P1's trash (hand unchanged, P2 untouched); short energy / wrong power → unplayable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .deckTop(P1, DISCIPLINE, "top1")
      .deckTop(P1, VOID_SEEKER, "top2")
      .deckTop(P1, SKULKER, "top3")
      .hand(P1, CARD, "kennen")
      .build();
    expect(game.p1.deck().slice(0, 3)).toEqual(["top1", "top2", "top3"]);
    const deckBefore = game.p1.deck().length;
    await game.p1.play("kennen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("kennen")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kennen", controller: P1, triggered: true })]);
    expect(game.p1.trash()).toEqual([]); // nothing burned before the trigger resolves
    await game.settle();
    expect(game.state("kennen")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.p1.trash().sort()).toEqual(["top1", "top2"]);
    expect(game.p1.deck()[0]).toBe("top3");
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 2 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
  });

  test("440.4 short deck: 1 card in deck, 3 in trash → burn 1, Burn Out (P2 gains 1 point, trash recycled into the deck), burn 1 more → deck 3, trash 1", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .deckTop(P1, SKULKER, "last")
      .trash(P1, DISCIPLINE, "t1")
      .trash(P1, DISCIPLINE, "t2")
      .trash(P1, SKULKER, "t3")
      .hand(P1, CARD, "kennen")
      .build();
    expect(game.p1.deck()).toEqual(["last"]);
    await game.p1.play("kennen");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick(P2); // "choose an opponent to gain 1 point" (only one opponent anyway)
      await game.settle();
    }
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.zoneOf("kennen")).toBe("base");
  });

  test("When I conquer: the Reaction in my trash gains Flow = its printed [2]; I may cast it from the trash for exactly 2, it resolves (+2 Might, draw 1) and is then BANISHED", async () => {
    const game = await conquerBoard([[DISCIPLINE, "disc"]]).build();
    expect(game.p1.can("cast", "disc")).toBe(false); // no Flow yet
    await conquerAndGrant(game, "disc");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.option("cast", "disc")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("disc", { flow: true, targets: "pal" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.zoneOf("disc")).toBe("chain");
    await game.settle();
    expect(game.state("pal").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.zoneOf("disc")).toBe("banishment");
    expect(game.p1.can("cast", "disc")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("'equal to its cost' includes POWER (206): Void Seeker gets Flow [3][fury] — 3 energy without a fury power cannot Flow it; with the pip it can and pays both", async () => {
    const noPip = await conquerBoard([[VOID_SEEKER, "vs"]], { energy: 5, power: { calm: 1 } }).unit(P2, "base", { might: 1 }, "x").build();
    await conquerAndGrant(noPip, "vs");
    expect(noPip.p1.can("cast", "vs")).toBe(false);

    const game = await conquerBoard([[VOID_SEEKER, "vs"]], { energy: 3, power: { fury: 1 } }).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 5, name: "Far" }, "far").build();
    await conquerAndGrant(game, "vs");
    expect(game.p1.can("cast", "vs")).toBe(true);
    await game.p1.cast("vs", { flow: true, targets: "far" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("far").damage).toBe(4);
    expect(game.zoneOf("vs")).toBe("banishment");
  });

  test("targets: only SPELLS in MY trash are offered — a unit in my trash and a spell in the opponent's trash are not; I choose which spell", async () => {
    const game = await conquerBoard([[DISCIPLINE, "disc"], [VOID_SEEKER, "vs"], [SKULKER, "deadUnit"]]).trash(P2, DISCIPLINE, "theirs").build();
    const offered = await conquerAndGrant(game, "vs");
    expect(offered).toEqual(["disc", "vs"]);
    expect(game.p1.can("cast", "vs")).toBe(true);
    expect(game.p1.can("cast", "disc")).toBe(false); // only the chosen one
    expect(game.p1.can("play", "deadUnit")).toBe(false);
    expect(game.p2.can("cast", "theirs")).toBe(false);
  });

  test("empty / spell-less trash: Kennen still conquers and scores, no prompt is left dangling, nothing becomes castable", async () => {
    const game = await conquerBoard([[SKULKER, "deadUnit"]]).build();
    const offered = await conquerAndGrant(game);
    expect(offered).toBeUndefined();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.card === "deadUnit")).toBe(false);
  });

  test("'this turn': the granted Flow is gone once the turn passes — back on P1's next turn the trash spell is no longer castable and is still in the trash", async () => {
    const game = await conquerBoard([[DISCIPLINE, "disc"]]).build();
    await conquerAndGrant(game, "disc");
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 5 });
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.can("cast", "disc")).toBe(false);
  });

  test("'this turn' ends with P1's turn, not 'until your next turn': on P2's following turn the trash Reaction can NOT be flowed in response to P2's spell (P1 still has 6 energy)", async () => {
    const game = await conquerBoard([[DISCIPLINE, "disc"]]).resources(P2, { energy: 1 }).unit(P2, "base", { might: 3 }, "theirs").hand(P2, "ogn-004-298", "cleave").build();
    await conquerAndGrant(game, "disc");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p1.do("addResources", { energy: 6 });
    await game.p2.tapRune();
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "disc")).toBe(false);
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("same-turn Reaction use: after the grant, P1 opens a chain with Void Seeker from hand and responds to it with the trash Discipline via Flow", async () => {
    const game = await conquerBoard([[DISCIPLINE, "disc"]], { energy: 8, power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Far" }, "far")
      .hand(P1, VOID_SEEKER, "vsHand")
      .build();
    await conquerAndGrant(game, "disc");
    await game.p1.cast("vsHand", { targets: "far" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "disc")).toBe(true); // Reaction speed on an open chain
    await game.p1.cast("disc", { flow: true, targets: "kennen" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vsHand", "disc"]);
    await game.settle();
    expect(game.state("kennen").might).toBe(6);
    expect(game.zoneOf("disc")).toBe("banishment");
    expect(game.zoneOf("vsHand")).toBe("trash"); // a hand cast is not a Flow play
  });

  test("self-fuel across turns: Kennen burns two spells on entry, next turn conquers and Flows one of the very cards he burned", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .deckTop(P1, DISCIPLINE, "burnA")
      .deckTop(P1, DISCIPLINE, "burnB")
      .hand(P1, CARD, "kennen")
      .build();
    await game.p1.play("kennen");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["burnA", "burnB"]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("kennen").isReady).toBe(true);
    const offered = await conquerAndGrant(game, "burnA");
    expect(offered).toEqual(["burnA", "burnB"]);
    await game.p1.tapRunes(2);
    await game.p1.cast("burnA", { flow: true, targets: "kennen" });
    await game.settle();
    expect(game.zoneOf("burnA")).toBe("banishment");
    expect(game.zoneOf("burnB")).toBe("trash");
  });

  test("conquer ONLY: Kennen holding bf1 through P1's turn start scores the hold point but grants nothing; a friend conquering while Kennen sits in base grants nothing", async () => {
    const hold = await scenario().turn(2).active(P2).resources(P1, { energy: 4 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "kennen").trash(P1, DISCIPLINE, "disc").build();
    await hold.advanceTurn();
    expect(hold.turnPlayer()).toBe(P1);
    expect(hold.p1.points()).toBe(1);
    await hold.p1.do("addResources", { energy: 4 });
    expect(hold.p1.can("cast", "disc")).toBe(false);

    const friend = await conquerBoard([[DISCIPLINE, "disc"]]).build();
    await friend.p1.move("pal", "bf1");
    await friend.settle();
    expect(friend.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(friend.p1.points()).toBe(1);
    expect(friend.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(friend.p1.can("cast", "disc")).toBe(false);
  });

  test("getFlowCostForPlay lets the printed Flow shadow Kennen's granted Flow, so the [4] alternative is never offered (829.1.c.3) — Iterative Design (printed Flow [2][mind]) given Flow [4]: with 4 energy and NO mind power the controller may use Kennen's cost", async () => {
    // Expected: two Flow instances → the controller chooses which cost to pay (829.1.c.3); [4] is payable.
    // Actual: only the printed [2][mind] is consulted → not castable without a mind power.
    const game = await conquerBoard([[ITERATIVE_DESIGN, "design"]], { energy: 4 }).build();
    expect(game.p1.can("cast", "design")).toBe(false); // printed Flow needs [mind]
    await conquerAndGrant(game, "design");
    expect(game.p1.can("cast", "design")).toBe(true);
    await game.p1.cast("design", { flow: true });
    expect(game.p1.resources().energy).toBe(0);
    await game.settle();
    expect(game.zoneOf("design")).toBe("banishment");
    expect(game.p1.base().some((id) => id.startsWith("token-mech-"))).toBe(true);
  });
});
