/**
 * Ahri, Inquisitive — ven-sp3-006 · Champion Unit (Ahri) · Mind · 3 energy + [mind] · 3 Might
 *
 *   When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rules: 383.4.e/f (attack/defend triggers fire once per combat when the unit gains the designation —
 * walking onto an EMPTY battlefield is a conquer, not an attack), 383.4 (the trigger is a chain item:
 * nothing changes until it resolves), 359.3.f.4 ("enemy"/"here" are read from the trigger), ogn-097
 * precedent ("to a minimum of 1": the penalty is clamped so the unit never drops below 1 and is never
 * RAISED by it), 432.1.a ("this turn" ends with the turn, whoever's turn it is), 327 (LIFO: a Reaction
 * played on top of the trigger resolves first).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The floor: 5 → 3, 2 → 1 (only -1 lands), 1 → 1 (nothing lands). The clamp is not a buff.
 *  2. Timing: while the trigger waits on the chain the defender is still full size; the shrink decides
 *     the combat (3-Might Ahri into a 4 → the 4 becomes 2, dies to 3, Ahri takes 2 and lives).
 *  3. "HERE": enemies in base / at another battlefield are never legal; two enemies here → P1 picks
 *     exactly one; the other keeps its Might.
 *  4. Defend half on the opponent's turn, and the "this turn" expiry when the shrunken enemy survives.
 *  5. Counter-play (Calm partner Discipline, ogn-058-298): P2 answers the trigger with +2 on the 2-Might
 *     defender; LIFO → 4 first, then -2 → 2 (the floor is not involved), and the 3-vs-2 fight still
 *     goes Ahri's way.
 *  6. No combat, no trigger: moving onto an open battlefield conquers silently.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-sp3-006";
const DISCIPLINE = "ogn-058-298"; // [Reaction] Give a unit +2 [Might] this turn. Draw 1. (2 energy)

function attackInto(defenders: number[]) {
  const b = scenario().battlefield("bf1", { controller: P2 }).battlefield("bf2", { controller: P2 }).unit(P1, "base", CARD, "ahri");
  defenders.forEach((m, i) => b.unit(P2, "bf1", { might: m, name: `Def${i}` }, `def${i}`));
  return b.unit(P2, "base", { might: 2, name: "Homebody" }, "home").unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "far");
}

describe("Ahri, Inquisitive (ven-sp3-006)", () => {
  test("registry payload: Mind champion, 3+[mind], 3 Might; ONE attack-or-defend trigger → modify-might -2 (turn, minimum 1) on an enemy unit here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, isChampion: true, might: 3, name: "Ahri, Inquisitive", tags: ["Ahri"] });
    expect(def?.powerCost).toEqual(["mind"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: -2, duration: "turn", minimum: 1, target: { controller: "enemy", location: "here", type: "unit" }, type: "modify-might" },
      trigger: { event: "attack-or-defend", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 3 energy + 1 mind from hand (enters exhausted, nothing triggers); short of either → not playable; offered from the champion zone", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "ahri").build();
    await game.p1.play("ahri");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("ahri")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 2 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
    const champ = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).champion(P1, CARD, "ahri").build();
    expect(champ.p1.can("playChampion")).toBe(true);
  });

  test("When I ATTACK: trigger on the chain (defender still 4) → resolves to 4-2=2 → Ahri (3) kills it, takes 2, survives and conquers", async () => {
    const game = await attackInto([4]).build();
    await game.p1.move("ahri", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.state("ahri").combatRole).toBe("attacker");
    expect(game.state("def0").might).toBe(4);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def0");
    }
    expect(game.state("def0").might).toBe(2);
    expect(game.state("home").might).toBe(2);
    expect(game.state("far").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.state("ahri")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("'to a minimum of 1': a 2-Might defender drops only to 1, a 1-Might defender stays 1 (never raised, never 0 or below)", async () => {
    const two = await attackInto([2]).build();
    await two.p1.move("ahri", "bf1");
    await two.p1.passPriority();
    await two.p2.passPriority();
    if (two.decision()?.kind === "pick") {
      await two.p1.pick("def0");
    }
    expect(two.state("def0").might).toBe(1);

    const one = await attackInto([1]).build();
    await one.p1.move("ahri", "bf1");
    await one.p1.passPriority();
    await one.p2.passPriority();
    if (one.decision()?.kind === "pick") {
      await one.p1.pick("def0");
    }
    expect(one.state("def0").might).toBe(1);
  });

  test("'an enemy unit HERE': with two defenders P1 picks exactly one of THEM (base / other-battlefield enemies and Ahri herself are not offered); the other keeps its Might", async () => {
    const game = await attackInto([5, 3]).build();
    await game.p1.move("ahri", "bf1");
    // rule 402 (finalization): the target is picked before anyone gets priority
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["def0", "def1"]);
    await game.p1.pick("def0");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("def0").might).toBe(3);
    expect(game.state("def1").might).toBe(3);
    expect(game.state("ahri").might).toBe(3);
  });

  test("negative space — moving onto an EMPTY enemy battlefield is a conquer, not an attack: nothing on the chain, nobody shrinks", async () => {
    const game = await attackInto([]).build();
    await game.p1.move("ahri", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("home").might).toBe(2);
    expect(game.state("far").might).toBe(2);
  });

  test("'this turn': into a 6 → it fights as a 4, kills Ahri and survives; it stays 4 for the rest of P1's turn and is 6 again once the turn passes", async () => {
    const game = await attackInto([6]).build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def0");
    }
    expect(game.state("def0").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.state("def0")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" }); // healed, still shrunk
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("def0").might).toBe(6);
  });

  test("When I DEFEND (opponent's turn): a 4-Might raider becomes 2, dies to Ahri's 3; Ahri takes 2, holds bf1; a raider left in base is not a legal 'here' target", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ahri")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    await game.p1.passPriority(); // the trigger's controller (P1) holds priority first
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ options: [expect.objectContaining({ card: "raider" })], seat: P1 });
      await game.p1.pick("raider");
    }
    expect(game.state("raider").might).toBe(2);
    expect(game.state("reserve").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("ahri")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("defend, exactly-lethal edge: a 5-Might raider becomes 3 — a 3-vs-3 trade kills both; with no units left bf1 becomes uncontrolled (466.5.b) and P2 scores nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ahri")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("raider");
    }
    expect(game.state("raider").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("counter-play (LIFO): P2 answers the attack trigger with Discipline (+2) on its 2-Might defender → resolves first to 4, then Ahri's -2 → 2 (floor untouched); Ahri still wins 3 vs 2", async () => {
    const game = await attackInto([2]).resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.move("ahri", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "def0" });
    expect(game.chain()).toHaveLength(2);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves
    expect(game.state("def0").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ahri's trigger resolves
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def0");
    }
    expect(game.state("def0").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("def0")).toBe("trash");
    expect(game.state("ahri")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("once per combat (383.4.e.2.a): a single attack puts exactly one Ahri trigger on the chain even with an escorting ally", async () => {
    const game = await attackInto([4]).unit(P1, "base", { might: 1, name: "Escort" }, "escort").build();
    await game.p1.move(["ahri", "escort"], "bf1");
    expect(game.chain().filter((i) => i.cardId === "ahri")).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
  });
});
