/**
 * Switcheroo — sfd-145-221 · Spell · Chaos · 2 energy + [chaos][chaos] · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Swap the Might of two units at the same battlefield this turn.
 *
 * Rules: 433 (Swap: compute the difference of the CURRENT values and apply +diff to the lower and
 * −diff to the higher — two independent modifiers with the effect's duration; equal values → no
 * effect), 355.8 (both targets are mandatory: two DISTINCT units, both at ONE battlefield; a base is
 * not a battlefield), 806 (Action: your turn, or any showdown while you hold Focus), 811 (Hidden:
 * hide for [rainbow] at a battlefield you control; from the next turn it has Reaction and plays for
 * 0 ignoring energy AND power; every target must be chosen at THAT battlefield — 811.1.d.2 — and with
 * no legal pair there it cannot be played at all — 811.1.d), 323.5 (a unit whose marked damage now
 * meets its lowered Might dies in the next Cleanup), 317 ("this turn" ends in the Expiration Step).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - Pair legality: {bf1 unit, bf2 unit} and {bf unit, base unit} are never legal; one lone unit at a
 *    battlefield gives no castable pair at all.
 *  - The classic play: as DEFENDER in a combat showdown, swap your 1-Might chump with their 5-Might
 *    attacker — sides may be mixed, and the swap decides the combat.
 *  - Swap reads EFFECTIVE Might (buff / modifiers included) and only touches Might: a buffed unit stays
 *    buffed. Equal Might → nothing changes.
 *  - Swapping a damaged big unit DOWN can kill it on the spot (2 damage on a unit that is now 2 Might).
 *  - 433.1.a independence: if one partner later leaves the board, the other keeps its half.
 *  - From facedown: free (0 energy, 0 chaos), Reaction-speed on the opponent's turn, both picks limited
 *    to that battlefield — and the caster, not the engine, chooses WHICH two of three units there.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-145-221";
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Cull",
  timing: "action",
};

function board(chaos = 2) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "bf2", { might: 6, name: "Far" }, "far")
    .unit(P1, "base", { might: 3, name: "Home" }, "home")
    .hand(P1, CARD, "sw");
}

const pairs = (opts: readonly unknown[] | undefined) => (opts ?? []).map((p) => [...(p as string[])].sort().join("+")).sort();

describe("Switcheroo (sfd-145-221)", () => {
  test("cost: 2 energy + 2 chaos are deducted and the spell waits on the chain; unaffordable with only 1 chaos or 1 energy", async () => {
    const game = await board().build();
    await game.p1.cast("sw", { targets: ["small", "big"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", controller: P1, triggered: false })]);
    expect(game.state("small").might).toBe(1); // nothing happens before resolution
    expect((await board(1).build()).p1.can("cast", "sw")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 1, power: { chaos: 3 } }).build();
    expect(lowEnergy.p1.can("cast", "sw")).toBe(false);
  });

  test("swaps the two Mights for the turn (1↔4 → 4/1 via ±3 modifiers), spell to trash; 'this turn' — both revert after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("sw", { targets: ["small", "big"] });
    await game.settle();
    expect(game.state("small")).toMatchObject({ baseMight: 1, might: 4, mightModifier: 3 });
    expect(game.state("big")).toMatchObject({ baseMight: 4, might: 1, mightModifier: -3 });
    expect(game.state("far").might).toBe(6);
    expect(game.zoneOf("sw")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("small").might).toBe(1);
    expect(game.state("big").might).toBe(4);
  });

  test("355.8 targeting: only pairs of two distinct units at the SAME battlefield are offered — never across battlefields, never with a unit in a base", async () => {
    const game = await board().unit(P2, "bf2", { might: 2, name: "Far Friend" }, "far2").build();
    const offered = game.p1.option("cast", "sw")?.fields.find((f) => f.arg === "targets");
    expect(offered).toMatchObject({ max: 2, min: 2 });
    expect(pairs(offered?.options)).toEqual(["big+small", "far+far2"]);
    expect((await game.p1.try((p) => p.cast("sw", { targets: ["small", "far"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sw", { targets: ["small", "home"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sw", { targets: ["small", "small"] }))).ok).toBe(false);
    expect(game.zoneOf("sw")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 2 } });
  });

  test("no legal pair anywhere (one lone unit per battlefield, the rest in bases) → not castable at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1 }, "a")
      .unit(P2, "bf2", { might: 6 }, "b")
      .unit(P1, "base", { might: 3 }, "c")
      .unit(P2, "base", { might: 3 }, "d")
      .hand(P1, CARD, "sw")
      .build();
    expect(game.p1.can("cast", "sw")).toBe(false);
  });

  test("[Action] as DEFENDER: during the combat showdown swap your 1-Might blocker with their 5-Might attacker — the attacker dies, you hold the field", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Chump" }, "chump")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "sw")
      .build();
    expect(game.p1.can("cast", "sw")).toBe(false); // opponent's turn, Open state: Action gives no permission (806.1.b)
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(pairs(game.p1.option("cast", "sw")?.fields.find((f) => f.arg === "targets")?.options)).toEqual(["chump+raider"]);
    await game.p1.cast("sw", { targets: ["chump", "raider"] });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("chump")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("chump").might).toBe(5); // still swapped for the rest of this turn
  });

  test("negative space for the same combat: without Switcheroo the 5-Might raider kills the chump and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Chump" }, "chump")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("chump")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("433.1: reads EFFECTIVE Might and changes only Might — a buffed 4(+1)=5 swapped with a 2 becomes 2 and stays buffed; the 2 becomes 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Buffed" }, "buffedOne", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .hand(P1, CARD, "sw")
      .build();
    expect(game.state("buffedOne").might).toBe(5);
    await game.p1.cast("sw", { targets: ["plain", "buffedOne"] });
    await game.settle();
    expect(game.state("buffedOne")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("plain").might).toBe(5);
  });

  test("433.1.c: two units with equal Might — the swap does nothing (no modifiers), the spell still resolves to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "x")
      .unit(P1, "bf1", { might: 3 }, "y")
      .hand(P1, CARD, "sw")
      .build();
    await game.p1.cast("sw", { targets: ["x", "y"] });
    await game.settle();
    expect(game.state("x")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("y")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.zoneOf("sw")).toBe("trash");
  });

  test("323.5: swapping a damaged 4-Might unit (2 damage) down to 2 Might makes its damage lethal — it dies in the Cleanup; the partner rises to 4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 })
      .unit(P2, "bf1", { might: 2, name: "Tiny" }, "tiny")
      .hand(P1, CARD, "sw")
      .build();
    await game.p1.cast("sw", { targets: ["hurt", "tiny"] });
    await game.settle();
    expect(game.zoneOf("hurt")).toBe("trash");
    expect(game.state("tiny").might).toBe(4);
    expect(game.zoneOf("tiny")).toBe("battlefield-bf1");
  });

  test("433.1.a independence: after the swap the big partner is killed — the small one keeps its +3 for the turn", async () => {
    const game = await board().hand(P1, KILL, "cull").build();
    await game.p1.cast("sw", { targets: ["small", "big"] });
    await game.settle();
    await game.p1.cast("cull", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.state("small").might).toBe(4);
  });

  test("[Hidden]: hide for [rainbow] only at a battlefield you control; not playable from facedown the same turn", async () => {
    const game = await board(0).resources(P1, { energy: 0, power: { rainbow: 1 } }).build();
    expect(game.p1.option("hide", "sw")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]); // bf2 is P2's
    await game.p1.hide("sw", "bf1");
    expect(game.zoneOf("sw")).toBe("facedown-bf1");
    expect(game.state("sw").isHidden).toBe(true);
    expect(game.p1.power()).toBe(0);
    expect(game.p1.can("reveal", "sw")).toBe(false);
  });

  test("[Hidden] payoff: next turn, when the opponent attacks THAT battlefield, it plays from facedown at Reaction speed for 0 energy and 0 chaos and swaps the pair there", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Chump" }, "chump")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "sw")
      .build();
    await game.p1.hide("sw", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing to pay with — and nothing is needed
    expect(game.p1.can("reveal", "sw")).toBe(true);
    await game.p1.reveal("sw");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", controller: P1 })]);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("chump", "raider");
    }
    await game.settle();
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("chump")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("811.1.d — facedown at a battlefield holding only ONE unit has no legal pair there, so it must not be playable from hidden (engine still offers the reveal)", async () => {
    // Expected: with a single unit at bf1 there is no "two units at the same battlefield" pair under the
    // facedown restriction (811.1.d.2 / 811.1.d.2.a), so revealHidden is not legal. Actual: it is offered.
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1 }, "lonely")
      .unit(P2, "bf2", { might: 6 }, "x")
      .unit(P2, "bf2", { might: 2 }, "y")
      .hand(P1, CARD, "sw")
      .build();
    await game.p1.hide("sw", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sw")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "sw")).toBe(false);
  });

  test.failing("BUG: 811.1.d.2 / 355.5 — played from facedown with THREE units at that battlefield, the caster must choose which two to swap (chump↔raider), not have the engine auto-pair the first two", async () => {
    // Expected: revealing offers a target choice (a targets field on the reveal, or a pick prompt) restricted to
    // bf1's three units; choosing chump+raider yields chump 5 / raider 1 and pal untouched.
    // Actual: no choice is offered — the engine silently swaps chump with pal (the first two it finds).
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Chump" }, "chump")
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "sw")
      .build();
    await game.p1.hide("sw", "bf1");
    await game.advanceTurn();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    const viaField = game.p1.option("reveal", "sw")?.fields.some((f) => f.arg === "targets") ?? false;
    if (viaField) {
      await game.p1.choose("revealHidden:sw", { targets: ["chump", "raider"] });
    } else {
      await game.p1.reveal("sw");
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", seat: P1 });
      expect((d as PickDecision).options.map((o) => o.card ?? o.key).sort()).toEqual(["chump", "pal", "raider"]);
      await game.p1.pick("chump", "raider");
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("raider");
      }
    }
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("pal").might).toBe(2);
    expect(game.state("chump").might).toBe(5);
    expect(game.state("raider").might).toBe(1);
  });

  test("parsed abilities match the printed text: Hidden keyword + an Action spell whose effect is a turn-long swap-might of two units at the same battlefield; cost 2 + [chaos][chaos]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 2, name: "Switcheroo", powerCost: ["chaos", "chaos"], timing: "action" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Hidden", type: "keyword" });
    expect(abilities[1]).toMatchObject({
      effect: { duration: "turn", target1: { location: "battlefield", type: "unit" }, target2: { location: "same", type: "unit" }, type: "swap-might" },
      timing: "action",
      type: "spell",
    });
  });
});
