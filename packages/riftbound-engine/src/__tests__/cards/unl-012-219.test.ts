/**
 * Lord Broadmane — unl-012-219 · Unit · Fury · 5 energy + [fury] · 5 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play me, give your other units here [Assault] this turn. (+1 [Might] while they're attackers.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - "your other units here": friendly units at the SAME location he was played to (base counts as
 *    a location), never himself, never enemies there, never friendly units elsewhere; unit tokens
 *    are units. It is a snapshot at resolution — a unit that arrives later gets nothing.
 *  - Bare [Assault] = Assault 1 (807.1.b.3); on a unit that already has Assault the values SUM
 *    (807.2): Inferna (Assault 2) becomes Assault 3 → 4 Might while attacking.
 *  - The point of Ambush here: played at Reaction speed INTO your own attack, the play effect
 *    resolves before combat damage and every attacker already there swings +1. Ambushed in as a
 *    DEFENDER on the opponent's turn the grant still happens but is worth nothing (attackers only).
 *  - "this turn": the granted keyword is gone after the turn ends; the printed Assault of Inferna
 *    of course stays.
 *  - It is a Play Effect on the chain: the opponent gets a priority window before the grant lands.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-012-219";
const INFERNA = "unl-002-219"; // 1 Might, [Ambush], [Assault 2]

const ASSAULT_TURN = { duration: "turn", keyword: "Assault" };

function inHand(energy = 5, power: Record<string, number> = { fury: 1 }) {
  return scenario().resources(P1, { energy, power }).hand(P1, CARD, "lb");
}

describe("Lord Broadmane (unl-012-219)", () => {
  test("cost & body: 5 energy + [fury]; enters exhausted as a 5-Might unit with Ambush; the play effect goes on the chain and P2 gets a priority window; 4 energy or no fury is not enough", async () => {
    const game = await inHand().unit(P1, "base", { might: 2 }, "pal").build();
    await game.p1.play("lb", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("lb")).toBe("base");
    expect(game.state("lb")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("lb").keywords).toContain("Ambush");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("pal").grantedKeywords).toEqual([]); // not before it resolves
    await game.settle();
    expect(game.state("pal").grantedKeywords).toEqual([ASSAULT_TURN]);
    expect((await inHand(4).build()).p1.can("play", "lb")).toBe(false);
    expect((await inHand(5, {}).build()).p1.can("play", "lb")).toBe(false);
  });

  test("'your other units here': played to base, every other friendly unit in base (tokens included) gains Assault for the turn — not himself, not enemies, not your unit at a battlefield", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "token-recruit-1")
      .unit(P1, "bf1", { might: 2, name: "Far" }, "far")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    await game.p1.play("lb", { to: "base" });
    await game.settle();
    expect(game.state("pal").grantedKeywords).toEqual([ASSAULT_TURN]);
    expect(game.state("token-recruit-1").grantedKeywords).toEqual([ASSAULT_TURN]);
    expect(game.state("far").grantedKeywords).toEqual([]);
    expect(game.state("foe").grantedKeywords).toEqual([]);
    expect(game.state("lb").grantedKeywords).toEqual([]);
    expect(game.state("lb").keywords).not.toContain("Assault");
    // Assault is attacker-only: nobody's Might changes while sitting in base.
    expect(game.state("pal").might).toBe(2);
  });

  test("played to a battlefield you control, 'here' is that battlefield: units there get it, base units do not", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p1.play("lb", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("lb")).toBe("bf1");
    expect(game.state("holder").grantedKeywords).toEqual([ASSAULT_TURN]);
    expect(game.state("home").grantedKeywords).toEqual([]);
  });

  test("bare [Assault] is worth exactly +1 while attacking: a granted 2-Might unit trades into a 3-Might defender", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .build();
    await game.p1.play("lb", { to: "base" });
    await game.settle();
    await game.p1.move("pal", "bf1");
    expect(game.state("pal")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash"); // 3 vs 3
  });

  test("807.2 Assault values sum: Inferna (Assault 2) + the granted Assault attacks with 1+3 = 4 Might and trades with a 4-Might defender", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", INFERNA, "inf")
      .build();
    await game.p1.play("lb", { to: "base" });
    await game.settle();
    expect(game.state("inf").grantedKeywords).toEqual([ASSAULT_TURN]);
    expect(game.state("inf").might).toBe(1);
    await game.p1.move("inf", "bf1");
    expect(game.state("inf").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("inf")).toBe("trash");
  });

  test("'this turn': after the turn passes the granted Assault is gone (Inferna keeps only her printed Assault 2)", async () => {
    const game = await inHand().unit(P1, "base", { might: 2 }, "pal").unit(P1, "base", INFERNA, "inf").build();
    await game.p1.play("lb", { to: "base" });
    await game.settle();
    expect(game.state("pal").grantedKeywords).toEqual([ASSAULT_TURN]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("pal").grantedKeywords).toEqual([]);
    expect(game.state("pal").keywords).toEqual([]);
    expect(game.state("inf").grantedKeywords).toEqual([]);
    expect([...game.state("inf").keywords].sort()).toEqual(["Ambush", "Assault"]);
  });

  test("Ambush INTO your own attack: played at Reaction speed to the battlefield where two 2-Might attackers are, he joins as an attacker and — once the play effect resolves, before damage — both get +1 (3+3+5 = 11 wipes an 11-Might defender)", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 11, name: "Colossus" }, "colossus")
      .unit(P1, "base", { might: 2, name: "A1" }, "a1")
      .unit(P1, "base", { might: 2, name: "A2" }, "a2")
      .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
      .build();
    await game.p1.move(["a1", "a2"], "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.option("playUnit", "lb")?.variants.map((v) => v.params.location)).toEqual(["battlefield-bf1"]);
    await game.p1.play("lb", { to: "bf1" });
    expect(game.state("lb")).toMatchObject({ combatRole: "attacker", isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", triggered: true })]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().pass(); // resolve just the play effect
    }
    expect(game.state("a1")).toMatchObject({ grantedKeywords: [ASSAULT_TURN], might: 3 });
    expect(game.state("a2")).toMatchObject({ grantedKeywords: [ASSAULT_TURN], might: 3 });
    expect(game.state("reserve").grantedKeywords).toEqual([]); // in base, not "here"
    expect(game.state("lb").grantedKeywords).toEqual([]);
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { a1: 3, a2: 3, lb: 5 }, kind: "distribute" } : undefined)]);
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash"); // 2+2+5 = 9 would have bounced off; 11 kills
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  test("Ambushed in as a DEFENDER on the opponent's turn: the grant still lands on your defender but Assault does nothing for defenders (2+5 = 7 < 8 — both die, the attacker conquers)", async () => {
    const game = await inHand()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 8, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("lb", { to: "bf1" });
    expect(game.state("lb").combatRole).toBe("defender");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("guard")).toMatchObject({ combatRole: "defender", grantedKeywords: [ASSAULT_TURN], might: 2 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("lb")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("snapshot at resolution: a friendly unit that reaches his location only afterwards does not pick up Assault", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Late" }, "late")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .build();
    await game.p1.play("lb", { to: "base" });
    await game.settle();
    await game.p1.move("late", "base");
    await game.settle();
    expect(game.locationOf("late")).toBe("base");
    expect(game.state("late").grantedKeywords).toEqual([]);
  });

  test("Ambush limits at Reaction speed: on P2's turn with no P1 unit at any battlefield he cannot be played (base is not an Ambush destination)", async () => {
    const game = await inHand()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P2, "base", { might: 2 }, "pupil")
      .hand(P2, "ogn-004-298", "cleave")
      .build();
    await game.p2.cast("cleave", { targets: "pupil" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "lb")).toBe(false);
  });

  test("registry payload matches the printed text: Ambush keyword + a play-self trigger granting Assault (turn) to all OTHER friendly units 'here'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, might: 5, powerCost: ["fury"] });
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      {
        effect: {
          duration: "turn",
          keyword: "Assault",
          target: { controller: "friendly", excludeSelf: true, location: "here", quantity: "all", type: "unit" },
          type: "grant-keyword",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});
