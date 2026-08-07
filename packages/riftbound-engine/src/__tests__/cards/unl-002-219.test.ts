/**
 * Inferna — unl-002-219 · Unit · Fury · 2 energy (no power) · 1 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - Ambush (822.1.b) is TWO permissions: an extra play LOCATION (a battlefield where you have
 *    units, even one you don't control / mid-combat) and REACTION timing — but the Reaction half
 *    only applies while she is being played to such a battlefield. At Reaction speed the base is
 *    never a legal destination, and with no units at any battlefield she is not playable at all.
 *  - Reaction (813.1.c.1) = Closed states on any turn + showdowns (Action's permission). It does
 *    NOT let the non-turn player act in the opponent's Neutral Open state (310.1.a).
 *  - Ambushed into a combat she takes her controller's designation (323.2.a): as an ATTACKER on your
 *    turn Assault 2 applies immediately (1 → 3); as a DEFENDER on the opponent's turn it does not.
 *  - Assault (807.1.c) is Might, so it also raises her lethal threshold while attacking: she
 *    survives 2 damage from a 2-Might defender and conquers; defending, 1 damage kills her.
 *  - She still enters exhausted when Ambushed (143.4) — irrelevant for the current combat, but she
 *    cannot move away next.
 *  - Partner: Lord Broadmane (unl-012-219) grants [Assault] — values sum (807.2) → Assault 3
 *    (covered in unl-012-219.test.ts).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-002-219";
const CLEAVE = "ogn-004-298"; // 1-energy [Action] spell P2 uses to open a chain on its own turn

const destinations = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  (game.p1.option("playUnit", "inf")?.variants.map((v) => v.params.location as string) ?? []).sort();

describe("Inferna (unl-002-219)", () => {
  test("cost & body: 2 energy, no power; enters the base exhausted as a 1-Might unit with Ambush and Assault; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "inf").build();
    expect(destinations(game)).toEqual(["base"]);
    await game.p1.play("inf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("inf")).toBe("base");
    expect(game.state("inf")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1 });
    expect([...game.state("inf").keywords].sort()).toEqual(["Ambush", "Assault"]);
    expect(game.chain()).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "inf").build()).p1.can("play", "inf")).toBe(false);
  });

  test("Assault 2 while attacking: 1 → 3 Might during the combat; she kills a 2-Might defender, survives its 2 damage (lethal threshold is 3 while attacking) and conquers; back to 1 Might afterwards", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry").unit(P1, "base", CARD, "inf").build();
    expect(game.state("inf").might).toBe(1); // not attacking yet
    await game.p1.move("inf", "bf1");
    expect(game.state("inf")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("inf")).toBe("bf1");
    expect(game.state("inf")).toMatchObject({ damage: 0, might: 1 }); // healed at combat end, Assault off
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Assault is exact: into a 3-Might defender it is a 3-vs-3 trade (both die), into a 4-Might defender she dies alone", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "d3").unit(P1, "base", CARD, "inf").build();
    await trade.p1.move("inf", "bf1");
    await trade.settle();
    expect(trade.zoneOf("inf")).toBe("trash");
    expect(trade.zoneOf("d3")).toBe("trash");

    const short = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4 }, "d4").unit(P1, "base", CARD, "inf").build();
    await short.p1.move("inf", "bf1");
    await short.settle();
    expect(short.zoneOf("inf")).toBe("trash");
    expect(short.locationOf("d4")).toBe("bf1");
    expect(short.state("d4").damage).toBe(0); // 3 damage marked, then healed at combat end
    expect(short.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("no Assault while DEFENDING: a 2-Might attacker kills her (1 Might) and keeps the battlefield contested result for P2", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "inf").unit(P2, "base", { might: 2 }, "atk").build();
    await game.p2.move("atk", "bf1");
    expect(game.state("inf")).toMatchObject({ combatRole: "defender", might: 1 });
    await game.settle();
    expect(game.zoneOf("inf")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Ambush on the OPPONENT's turn: when P1 gets Focus in P2's combat showdown she can be played to the defended battlefield (only there — not to base), joins as an exhausted 1-Might DEFENDER", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "inf")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("inf", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.locationOf("inf")).toBe("bf1");
    expect(game.state("inf")).toMatchObject({ combatRole: "defender", isExhausted: true, might: 1 });
    await game.settle(); // 4 vs 2+1: both defenders die, Raider survives and conquers
    expect(game.zoneOf("inf")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Ambush on YOUR turn into your own attack: played to the battlefield where your attacker is, she becomes an ATTACKER with Assault live (3 Might) and swings the combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 2, name: "Lead" }, "lead")
      .hand(P1, CARD, "inf")
      .build();
    await game.p1.move("lead", "bf1"); // 2 vs 4 alone would lose
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1"]);
    await game.p1.play("inf", { to: "bf1" });
    expect(game.state("inf")).toMatchObject({ combatRole: "attacker", might: 3 });
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { inf: 3, lead: 1 }, kind: "distribute" } : undefined)]);
    await game.settle(); // 2+3 = 5 ≥ 4: Warden dies
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.p1.units("bf1").length).toBeGreaterThan(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Ambush as a true Reaction: on P2's turn, in response to P2's spell, she can be played to a battlefield where P1 has a unit and is on the board before the spell resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "inf")
      .build();
    await game.p2.cast("cleave", { targets: "pupil" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(destinations(game)).toEqual(["battlefield-bf1"]); // never "base" at Reaction speed
    await game.p1.play("inf", { to: "bf1" });
    expect(game.locationOf("inf")).toBe("bf1"); // a permanent leaves the chain at once (359.2)
    expect(game.zoneOf("cleave")).toBe("chain"); // the spell is still waiting
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.locationOf("inf")).toBe("bf1");
    expect(game.state("inf").isExhausted).toBe(true);
  });

  test("Ambush needs a battlefield 'where you have units': on P2's turn with P1's units only in base she is not playable at all, even in response to a spell", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 }) // controlled but EMPTY
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "inf")
      .build();
    await game.p2.cast("cleave", { targets: "pupil" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "inf")).toBe(false);
  });

  test("on your own turn Ambush also widens WHERE she may go: base, a battlefield you control, and an enemy battlefield where you merely have a unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P2 })
      .unit(P1, "bf2", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "bf2", { might: 5 }, "foe2")
      .unit(P2, "bf3", { might: 5 }, "foe3")
      .hand(P1, CARD, "inf")
      .build();
    expect(destinations(game)).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]); // not bf3 (no P1 unit there)
    const t = await game.p1.try((p) => p.play("inf", { to: "bf3" }));
    expect(t.ok).toBe(false);
  });

  test("Reaction timing is Closed states / showdowns only (813.1.c.1, 310.1.a) — during P2's Neutral OPEN main phase P1 must not be able to Ambush her in; the engine offers the play", async () => {
    // Expected: no chain, no showdown, not P1's turn → P1 has no priority and cannot play anything.
    // Actual: playUnit:inf → battlefield-bf1 is offered to P1 in P2's open main phase.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .hand(P1, CARD, "inf")
      .build();
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("play", "inf")).toBe(false);
  });

  test("registry payload matches the printed text: keyword Ambush + keyword Assault with value 2, nothing else; 2 energy, no power, 1 Might", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 2, might: 1 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Ambush", type: "keyword" },
      { keyword: "Assault", type: "keyword", value: 2 },
    ]);
  });
});
