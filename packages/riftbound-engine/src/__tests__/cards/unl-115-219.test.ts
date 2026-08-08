/**
 * Nilah, Joyful Ascetic — unl-115-219 · Champion Unit (Nilah) · Body · 3 energy + [body] · 4 Might
 *
 *   [Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   When I move, gain 1 XP.
 *
 * Rules: 805 (Accelerate = optional additional cost [1][C], C must match her domain, she enters ready
 * via a replacement — never "becomes ready"), 810 / 144.4.c (Ganking only adds bf→bf to the Standard
 * Move; still costs exhausting her), 446/449 ("move" = any change of location on the board, whether by
 * her Standard Move or by a spell — direction does not matter), 456.1 (a Recall is NOT a move and does
 * not fire move triggers), 144.3 (a multi-unit Standard Move is one action; she moves once), 446.3.c +
 * 460 (moves don't use the chain but her trigger does; a staged combat opens only once it resolved),
 * 728–733 (XP is a persistent player resource gained by the trigger's controller).
 *
 * Head-judge corner cases for THIS card:
 *   1. "When I move" has no direction: base→bf, bf→base and bf→bf (Ganking) each give exactly 1 XP;
 *      PLAYING her (even accelerated, ready) is not a move → 0 XP.
 *   2. Being moved by an effect is still a move: Ride the Wind on her → XP; an OPPONENT's Void Assault
 *      dragging her as "an enemy unit" → HER controller (not the caster) gains the XP.
 *   3. Recall ≠ move: she attacks a stunned 5-Might wall, both survive, attackers are recalled home →
 *      total XP is 1 (the move in), not 2.
 *   4. Moving her together with another unit is one Standard Move → one trigger → 1 XP, not 2.
 *   5. Gank into an enemy-held battlefield: her trigger sits on the chain BEFORE the combat opens; XP is
 *      banked even if she then dies in that combat; XP persists into later turns.
 *   6. Cost edge: 3 energy + exactly one BODY power; Accelerate needs a 4th energy AND a 2nd body power —
 *      an off-domain power cannot pay either pip; Ganking needs her ready and exhausts her.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-115-219";
const RIDE_THE_WIND = "ogn-173-298"; // Chaos Action 2+[chaos]: Move a friendly unit and ready it.
const VOID_ASSAULT = "unl-202-219"; // Body/Chaos 2+[rainbow]: Move a friendly unit, then move an enemy unit.

describe("Nilah, Joyful Ascetic (unl-115-219)", () => {
  test("registry payload: Accelerate([1][body]) + Ganking keywords and a self 'move' trigger that gains 1 XP", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 3, isChampion: true, might: 4, tags: ["Nilah"] });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["body"] }, keyword: "Accelerate", type: "keyword" },
      { keyword: "Ganking", type: "keyword" },
      { effect: { amount: 1, type: "gain-xp" }, trigger: { event: "move", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 3 energy + 1 body, enters exhausted with 0 XP (playing is not moving); 2 energy or an off-domain power cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "nilah").build();
    await game.p1.play("nilah");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("nilah")).toBe("base");
    expect(game.state("nilah")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("nilah").keywords).toEqual(expect.arrayContaining(["Accelerate", "Ganking"]));
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.xp()).toBe(0);
    expect((await scenario().resources(P1, { energy: 2, power: { body: 1 } }).hand(P1, CARD, "n").build()).p1.can("play", "n")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "n").build()).p1.can("play", "n")).toBe(false);
  });

  test("[Accelerate]: 4 energy + 2 body total → enters READY, still 0 XP; she can then Standard-Move the same turn for her first XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "nilah")
      .build();
    await game.p1.play("nilah", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("nilah")).toMatchObject({ isReady: true, location: "base" });
    expect(game.p1.xp()).toBe(0); // entering the board (even ready) is not a move
    await game.p1.move("nilah", "bf1");
    await game.settle();
    expect(game.locationOf("nilah")).toBe("bf1");
    expect(game.state("nilah").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(1);
  });

  test("[Accelerate] cost edges: with 3 energy + 2 body, or 4 energy + body + chaos, the accelerated play is refused and nothing is spent", async () => {
    const shortEnergy = await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "nilah").build();
    expect((await shortEnergy.p1.try((p) => p.play("nilah", { accelerate: true }))).ok).toBe(false);
    expect(shortEnergy.zoneOf("nilah")).toBe("hand");
    expect(shortEnergy.p1.resources()).toEqual({ energy: 3, power: { body: 2 } });
    const wrongPower = await scenario().resources(P1, { energy: 4, power: { body: 1, chaos: 1 } }).hand(P1, CARD, "nilah").build();
    const r = await wrongPower.p1.try((p) => p.play("nilah", { accelerate: true }));
    if (r.ok) {
      await wrongPower.settle(); // engine accepted the request: it must not have used chaos for the body pip
      expect(wrongPower.state("nilah").isExhausted).toBe(true);
      expect(wrongPower.p1.power("chaos")).toBe(1);
    } else {
      expect(wrongPower.zoneOf("nilah")).toBe("hand");
    }
  });

  test("base → battlefield: the trigger goes on the chain (opponent may respond), resolves to exactly 1 XP for her controller", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "nilah").build();
    await game.p1.move("nilah", "bf1");
    expect(game.locationOf("nilah")).toBe("bf1"); // the move itself is instantaneous (446.3)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nilah", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("battlefield → base is also 'I move': 1 XP (no direction restriction)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "nilah").build();
    await game.p1.move("nilah", "base");
    await game.settle();
    expect(game.locationOf("nilah")).toBe("base");
    expect(game.p1.xp()).toBe(1);
  });

  test("[Ganking] bf1 → open bf2: legal while ready, exhausts her, 1 XP, and she conquers the empty battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "nilah")
      .unit(P1, "bf1", { might: 1 }, "plain")
      .build();
    expect(game.p1.can("gank", "nilah")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false); // no Ganking → only base is offered to it
    await game.p1.gank("nilah", "bf2");
    expect(game.state("nilah").isExhausted).toBe(true);
    await game.settle();
    expect(game.locationOf("nilah")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    // Exhausted now: no second gank this turn.
    expect(game.p1.can("gank", "nilah")).toBe(false);
  });

  test("[Ganking] into an enemy-held battlefield: XP trigger resolves on the chain BEFORE the combat; she kills a 3-Might defender and conquers (XP 1, 1 point)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "nilah")
      .unit(P2, "bf2", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.gank("nilah", "bf2");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nilah", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(1); // banked before any combat damage is dealt
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("nilah")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1); // conquering is not moving
  });

  test("XP is kept even if she dies in the combat her move started (attack into a 6-Might wall)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "nilah")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move("nilah", "bf1");
    await game.settle();
    expect(game.zoneOf("nilah")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
  });

  test("Recall is not a move (456.1): attacking a STUNNED 5-Might wall, both survive, she is recalled home — total XP stays 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "nilah")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .build();
    await game.p1.move("nilah", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.locationOf("nilah")).toBe("base"); // recalled, not moved
    expect(game.zoneOf("nilah")).toBe("base");
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toHaveLength(0);
  });

  test("a multi-unit Standard Move (Nilah + a vanilla ally) is ONE move of her → exactly 1 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "nilah")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .build();
    await game.p1.move(["nilah", "pal"], "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.units("bf1").sort()).toEqual(["nilah", "pal"]);
    expect(game.p1.xp()).toBe(1);
  });

  test("moved by a spell (Ride the Wind) is still a move: exhausted Nilah is moved to bf1, readied, and gains 1 XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", CARD, "nilah", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    // rule 355.4 — the destination is chosen as the spell is played, before priority
    await game.p1.cast("rtw", { targets: "nilah", answers: ["battlefield-bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nilah", triggered: true })]);
    await game.settle();
    expect(game.locationOf("nilah")).toBe("bf1");
    expect(game.p1.xp()).toBe(1);
  });

  test("controller ≠ mover: the OPPONENT's Void Assault drags Nilah as its enemy unit — Nilah's controller (P1) gains the XP, the caster gains none", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "nilah")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P2, VOID_ASSAULT, "va")
      .build();
    await game.p2.cast("va", { targets: ["foe", "nilah"] });
    // Drain: pass priority, answer every destination prompt with bf2, pass focus.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options.find((o) => o.key.endsWith("bf2"))?.key ?? d.options[0]!.key);
      } else {
        await game.seat(d.seat).pass();
      }
    }
    await game.settle();
    expect(game.locationOf("nilah")).toBe("bf2");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("XP persists across turns and stacks: move in (1), next own turn move home (2)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "nilah").build();
    await game.p1.move("nilah", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn(); // P2
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn(); // P1 again (she readied in Awaken; holding bf1 is not a move)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    expect(game.state("nilah").isReady).toBe(true);
    await game.p1.move("nilah", "base");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
