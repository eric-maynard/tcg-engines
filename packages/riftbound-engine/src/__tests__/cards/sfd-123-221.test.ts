/**
 * Corrupt Enforcer — sfd-123-221 · Unit · Chaos · 3 energy + [chaos] · 4 Might
 *
 *   When I move to a battlefield, discard 1.
 *   When I win a combat, draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - "move TO A BATTLEFIELD": base → bf fires, bf → bf (Ganking granted) fires, bf → base does NOT;
 *    a Recall is not a move at all (456.1). Being moved by a spell (Ride the Wind) is still a move
 *    (449) and fires it. Playing him is not moving.
 *  - The discard is an EFFECT, not a cost (422.4): empty hand → ignored, he still moves; with two
 *    cards the controller chooses which. The trigger uses the chain (moves don't, 446.3.c) and per
 *    460 the staged combat only opens once the chain is empty → the discard lands BEFORE the fight.
 *  - "win a combat" (466.3.a/c): only units still AT the battlefield inherit the result. Attacker
 *    kills the lone defender and survives → draw. Both survive → attackers recalled → No Result → no
 *    draw. He dies while his side wins → he is in the trash, no draw. Defending and the attacker dies
 *    → draw on the opponent's turn. Walking onto an EMPTY enemy battlefield conquers without a combat
 *    → no draw.
 *  - Full line: move in (discard 1) → combat → win (draw 1) → conquer point, all in one action.
 *  - Cost 3 + [chaos]; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-123-221";
const FILLER = "ogn-175-298";
const RIDE_THE_WIND = "ogn-173-298"; // Chaos [Action] 2+[chaos]: Move a friendly unit and ready it.

/** Pass priority around; answer a discard pick with `discard` when it appears. Returns what was offered. */
async function resolveChain(game: Game, discard?: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      offered = d.options.map((o) => o.card ?? o.key);
      await game.seat(d.seat).pick(discard ?? (offered[0] as string));
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return offered;
}

describe("Corrupt Enforcer (sfd-123-221)", () => {
  test("cost: 3 energy + 1 chaos; enters the base exhausted as a 4-Might unit; playing is not moving (no trigger); unaffordable without the chaos or at 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "ce").hand(P1, FILLER, "junk").build();
    await game.p1.play("ce");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("ce")).toBe("base");
    expect(game.state("ce")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("junk")).toBe("hand");
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "ce").build()).p1.can("play", "ce")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "ce").build()).p1.can("play", "ce")).toBe(false);
  });

  test("move base → own battlefield: trigger on the chain, opponent gets priority, then the controller CHOOSES which of two cards to discard", async () => {
    const game = await scenario()
      .battlefield("own", { controller: P1 })
      .unit(P1, "base", CARD, "ce")
      .hand(P1, FILLER, "keep")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.move("ce", "own");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ce", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // they could react before the discard happens
    expect(game.p1.hand()).toHaveLength(2);
    const offered = await resolveChain(game, "junk");
    expect([...offered].sort()).toEqual(["junk", "keep"]);
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("keep")).toBe("hand");
    expect(game.locationOf("ce")).toBe("own");
  });

  test("empty hand: the discard is ignored (422.4) — he still moves and conquers an empty enemy battlefield; no combat ⇒ no draw", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P1, "base", CARD, "ce")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p1.move("ce", "enemy");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("ce")).toBe("enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual([]); // nothing drawn: a walk-in conquer is not a combat
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("battlefield → base is not 'to a battlefield': no trigger, hand untouched", async () => {
    const game = await scenario()
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", CARD, "ce")
      .unit(P1, "own", { might: 1 }, "holder")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.move("ce", "base");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("junk")).toBe("hand");
  });

  test("battlefield → battlefield with granted Ganking IS a move to a battlefield: discard again", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "ce", { grantedKeywords: [{ duration: "turn", keyword: "Ganking" }] })
      .unit(P1, "bf1", { might: 1 }, "holder")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.gank("ce", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ce", triggered: true })]);
    await resolveChain(game, "junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.locationOf("ce")).toBe("bf2");
  });

  test("moved by a spell (Ride the Wind) also counts (449): the move trigger fires and a card is discarded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", { might: 1 }, "holder")
      .unit(P1, "base", CARD, "ce", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .hand(P1, FILLER, "junk")
      .hand(P1, FILLER, "keep")
      .build();
    await game.p1.cast("rtw", { targets: "ce" });
    await game.settle(); // resolves; the lone battlefield is the forced destination
    if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "destination") {
      await game.p1.pick("battlefield-own");
      await game.settle();
    }
    expect(game.locationOf("ce")).toBe("own");
    // Now the move trigger's discard prompt (two candidates → a real choice).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = await resolveChain(game, "junk");
    expect([...offered].sort()).toEqual(["junk", "keep"]);
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["keep"]);
  });

  test("full line: attack a lone 2-Might defender — discard resolves BEFORE combat opens (460), he wins, draws 1 and conquers", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "ce")
      .hand(P1, FILLER, "junk")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p1.move("ce", "enemy");
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // no showdown yet
    await resolveChain(game, "junk");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("top")).toBe("mainDeck"); // not drawn yet — combat has not happened
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ce")).toBe("enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual(["top"]); // "When I win a combat, draw 1"
    expect(game.state("ce").damage).toBe(0); // healed in the combat cleanup
  });

  test("tie: a STUNNED 5-Might defender deals no damage (423.1.b) and survives his 4 → both remain, attackers recalled, No Result (466.3.d) → no draw", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 5, name: "Dazed Wall" }, "wall", { stunned: true })
      .unit(P1, "base", CARD, "ce")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p1.move("ce", "enemy");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.locationOf("ce")).toBe("base"); // recalled (466.1.a.2), not killed
    expect(game.zoneOf("ce")).toBe("base");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]); // no winner → no draw
  });

  test("he dies while attacking (5-Might defender): the defender wins, he is in the trash and draws nothing", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "ce")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p1.move("ce", "enemy");
    await game.settle();
    expect(game.zoneOf("ce")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]); // the WALL won, but it has no such trigger
  });

  test("466.3.c: his SIDE wins but HE died (Tank granted → the 4 damage must go on him first) — a unit in the trash does not inherit the win: no draw", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "ce", { grantedKeywords: [{ duration: "turn", keyword: "Tank" }] })
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .deckTop(P1, FILLER, "top")
      .build();
    expect(game.state("ce").keywords).toContain("Tank");
    await game.p1.move(["ce", "bruiser"], "enemy");
    await resolveChain(game); // empty hand: the discard is simply ignored
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 4 + 5 = 9 ≥ 4
    expect(game.zoneOf("ce")).toBe("trash"); // exactly-lethal 4 on the Tank
    expect(game.locationOf("bruiser")).toBe("enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual([]); // the dead Enforcer draws nothing
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("defending on the opponent's turn: a 3-Might attacker dies into him → he wins the combat and his controller draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", CARD, "ce")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p2.move("raider", "own");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("ce")).toBe("own");
    expect(game.gameState.battlefields.own?.controller).toBe(P1);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("defending while STUNNED: he deals nothing, survives a 3-Might attacker who is recalled — holding the field is not winning (No Result): no draw", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", CARD, "ce", { stunned: true })
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deckTop(P1, FILLER, "top")
      .build();
    await game.p2.move("raider", "own");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base"); // recalled, alive
    expect(game.locationOf("ce")).toBe("own");
    expect(game.gameState.battlefields.own?.controller).toBe(P1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("parsed abilities match the printed text: self move-to-battlefield → discard 1; self win-combat → draw 1; cost 3 + [chaos], 4 Might", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 4, name: "Corrupt Enforcer", powerCost: ["chaos"] });
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, type: "discard" }, trigger: { event: "move-to-battlefield", on: "self" }, type: "triggered" },
      { effect: { amount: 1, type: "draw" }, trigger: { event: "win-combat", on: "self" }, type: "triggered" },
    ]);
  });
});
