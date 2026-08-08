/**
 * Syndra, Transcendent — unl-146-219 · Champion Unit (Syndra) · Chaos · 6 energy + [chaos] · 6 Might
 *
 *   While I'm in a showdown, your spells have [Repeat] [2][chaos]. (You may pay the additional cost
 *   to repeat the spell's effect.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "While I'm in a showdown": Syndra herself must be AT the battlefield whose showdown is open
 *      (as attacker OR defender). Syndra sitting in base while a showdown rages elsewhere grants
 *      nothing; no showdown at all (plain main phase) grants nothing.
 *   2. "your spells": the opponent's spells in the very same showdown get no Repeat.
 *   3. Repeat [2][chaos] (820) is OPTIONAL: the spell stays castable at its printed cost; paying
 *      adds exactly 2 energy + 1 chaos and executes the instructions one extra time (Hextech Ray:
 *      3 → 6 damage), still ONE chain item (820.3.a). Short of the surcharge → no repeat offered.
 *   4. A spell that already has Repeat (Feral Strength, Repeat [2]) gains a SECOND, separately
 *      payable instance (820.1.c.2 / 820.3): pay both → three executions.
 *   5. The grant ends with the showdown: after combat resolves, a main-phase spell has no Repeat.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-146-219";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield
const FERAL_STRENGTH = "sfd-034-221"; // [Reaction] 2, Repeat [2]: give a unit +2 Might this turn

/** P1: Syndra in base ready to attack bf1 where P2's 6-Might Wall defends; Ray in hand. */
function board(p1: { energy: number; power?: Record<string, number> } = { energy: 3, power: { fury: 1, chaos: 1 } }) {
  return scenario()
    .resources(P1, p1)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", CARD, "syndra")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .hand(P1, HEXTECH_RAY, "ray");
}

const repeatField = (game: { p1: { option(v: string, c?: string): { fields: readonly { arg: string; max?: number }[] } | undefined } }, card: string) =>
  game.p1.option("cast", card)?.fields.find((f) => f.arg === "repeat");

describe("Syndra, Transcendent (unl-146-219)", () => {
  test("registry payload: one static — while-in-showdown, grant Repeat {2 energy + chaos} to friendly spells", async () => {
    const game = await scenario().hand(P1, CARD, "syndra").build();
    expect(game.state("syndra")).toMatchObject({ baseMight: 6, cardType: "unit", energyCost: 6, name: "Syndra, Transcendent" });
    expect(game.state("syndra").powerCost).toEqual(["chaos"]);
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        condition: { type: "while-in-showdown" },
        effect: { cost: { energy: 2, power: ["chaos"] }, keyword: "Repeat", target: { controller: "friendly", type: "spell" }, type: "grant-keyword" },
        type: "static",
      },
    ]);
  });

  test("cost: 6 energy + 1 chaos, enters base exhausted; short on either → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 1 } }).hand(P1, CARD, "syndra").build();
    await game.p1.play("syndra");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("syndra")).toBe("base");
    expect(game.state("syndra").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]); // a static, nothing triggers
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "syndra").build()).p1.can("play", "syndra")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "syndra").build()).p1.can("play", "syndra")).toBe(false);
  });

  test("no showdown (open main phase): your spell has NO Repeat even with Syndra on the board and plenty of resources", async () => {
    const game = await board({ energy: 9, power: { chaos: 3, fury: 1 } }).build();
    expect(game.p1.can("cast", "ray")).toBe(true);
    expect(repeatField(game, "ray")).toBeUndefined();
    const r = await game.p1.try((p) => p.cast("ray", { repeat: 1, targets: "wall" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
  });

  test("Syndra attacks → in the combat showdown Hextech Ray gains Repeat [2][chaos]: paying it costs 3 energy + fury + chaos total and deals 6, killing the 6-Might Wall", async () => {
    const game = await board().build();
    await game.p1.move("syndra", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.battlefieldId).toBe("bf1");
    expect(game.actingSeat()).toBe(P1); // attacker has Focus
    expect(repeatField(game, "ray")?.max).toBe(1);
    await game.p1.cast("ray", { repeat: 1, targets: "wall" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "ray", controller: P1, triggered: false });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves: 3 + 3
    expect(game.zoneOf("wall")).toBe("trash");
    await game.settle(); // combat: no defender left → Syndra conquers
    expect(game.locationOf("syndra")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("Repeat is optional: in the same showdown Ray cast WITHOUT it costs only 1 + fury and deals 3 (Wall survives, Syndra and Wall trade)", async () => {
    const game = await board().build();
    await game.p1.move("syndra", "bf1");
    await game.p1.cast("ray", { targets: "wall" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1, fury: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
  });

  test("cannot afford the surcharge (no chaos left / only 2 energy): the spell is castable but no repeat is offered", async () => {
    const noChaos = await board({ energy: 3, power: { fury: 1 } }).build();
    await noChaos.p1.move("syndra", "bf1");
    expect(noChaos.p1.can("cast", "ray")).toBe(true);
    expect(repeatField(noChaos, "ray")).toBeUndefined();
    expect((await noChaos.p1.try((p) => p.cast("ray", { repeat: 1, targets: "wall" }))).ok).toBe(false);
    const lowEnergy = await board({ energy: 2, power: { fury: 1, chaos: 1 } }).build();
    await lowEnergy.p1.move("syndra", "bf1");
    expect(lowEnergy.p1.can("cast", "ray")).toBe(true);
    expect(repeatField(lowEnergy, "ray")).toBeUndefined();
  });

  test("'While I'M in a showdown': Syndra in base while another unit fights at bf1 → no Repeat for your spells there", async () => {
    const game = await board({ energy: 9, power: { fury: 1, chaos: 3 } }).build();
    await game.p1.move("scout", "bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.battlefieldId).toBe("bf1");
    expect(game.locationOf("syndra")).toBe("base");
    expect(game.p1.can("cast", "ray")).toBe(true);
    expect(repeatField(game, "ray")).toBeUndefined();
  });

  test("Syndra as DEFENDER is also 'in a showdown': when P2 attacks her battlefield, P1's Ray (once P1 has Focus) has Repeat", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1, chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "syndra")
      .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p2.move("bruiser", "bf1");
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(repeatField(game, "ray")?.max).toBe(1);
    await game.p1.cast("ray", { repeat: 1, targets: "bruiser" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("bruiser").damage).toBe(6); // 3 + 3 before any combat damage
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  test("'YOUR spells': the opponent's spell in Syndra's showdown gets no Repeat", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { fury: 1, chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "syndra")
      .unit(P2, "base", { might: 3, name: "Poker" }, "poker")
      .hand(P2, HEXTECH_RAY, "theirRay")
      .build();
    await game.p2.move("poker", "bf1");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "theirRay")).toBe(true);
    expect(game.p2.option("cast", "theirRay")?.fields.find((f) => f.arg === "repeat")).toBeUndefined();
    expect((await game.p2.try((p) => p.cast("theirRay", { repeat: 1, targets: "syndra" }))).ok).toBe(false);
    await game.p2.cast("theirRay", { targets: "syndra" });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { chaos: 2, fury: 0 } });
  });

  test("the grant ends with the showdown: after Syndra's combat resolves, a follow-up main-phase Ray has no Repeat", async () => {
    const game = await board({ energy: 6, power: { fury: 2, chaos: 2 } }).hand(P1, HEXTECH_RAY, "ray2").unit(P2, "bf2", { might: 5 }, "far").build();
    await game.p1.move("syndra", "bf1");
    expect(repeatField(game, "ray")?.max).toBe(1);
    await game.settle(); // both pass focus → combat: 6 v 6 trade
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).not.toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ray2")).toBe(true);
    expect(repeatField(game, "ray2")).toBeUndefined();
  });

  test("a spell with its own Repeat (Feral Strength, Repeat [2]) gains a SECOND payable instance in Syndra's showdown: both paid → +6 (three executions), 6 energy + 1 chaos", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "syndra")
      .unit(P2, "bf1", { might: 9, name: "Titan" }, "titan")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(repeatField(game, "fs")?.max).toBe(1); // main phase: only its printed instance
    await game.p1.move("syndra", "bf1");
    expect(repeatField(game, "fs")?.max).toBe(2);
    await game.p1.cast("fs", { repeat: 2, targets: "syndra" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("syndra").might).toBe(12);
  });
});
