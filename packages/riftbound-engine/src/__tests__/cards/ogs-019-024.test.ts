/**
 * Wuju Bladesman - Starter — ogs-019-024 · Legend (Yi) · Calm/Body
 *
 *   While a friendly unit defends alone, it gets +2 [Might].
 *
 * Rules: 364.3 / 364.3.a ("while …" = a conditional passive, continuously re-evaluated), 740.2.a
 * (a unit is ALONE when there are no OTHER FRIENDLY units at the same location — enemies and gear do
 * not count), 464.2.c.3 ("defends" = holds the Defender designation, which exists only inside a
 * combat at that battlefield), 740.1.a (friendly = shares a controller with the legend), 465.2 (combat
 * damage uses current Might, dealt simultaneously), 466.1.a.1 (survivors are healed in the Combat
 * Cleanup), 466.7.c (combat-scoped modifiers end with the combat), 107/113 (a legend's abilities work
 * from the Legend Zone — no board presence needed).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Only while DEFENDING: the same lone unit standing on its battlefield outside combat is printed
 *     Might, and a lone ATTACKER never gets the bonus.
 *  2. Only ALONE: two friendly defenders → neither gets anything; the moment one of them is moved
 *     home mid-showdown (Fight or Flight) the survivor is alone and jumps by +2 on the spot (364.3).
 *  3. "Alone" ignores non-units: an Equipment attached to the lone defender travels with it (719.3.a)
 *     but is not a unit — the defender is still alone and gets +2 on top of the Might Bonus.
 *  4. FRIENDLY only: the opponent's lone defender gets nothing from MY legend when I attack it.
 *  5. Knife-edges: lone 3 (→5) vs a 4-Might attacker — attacker dies, defender lives; vs 5 — trade;
 *     two 2-Might attackers (sum 4) into the lone 3 (→5) — both attackers die, defender lives.
 *  6. Stacks with Wielder of Water's own "+2 while defending alone" → a 2-Might Wielder defends at 6.
 *  7. Engine note: the static is authored with an `alone-in-combat` CONDITION on a LEGEND source; the
 *     evaluator must read it per target unit (the legend itself is never in combat) and must count only
 *     UNITS when deciding "alone".
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogs-019-024";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // Chaos · 2 · [Action] Move a unit from a battlefield to its base.
const WIELDER_OF_WATER = "ogn-055-298"; // Calm unit · 2 Might · While I'm attacking or defending alone, I have +2 Might.
const DORANS_BLADE = "sfd-095-221"; // Equipment · Body · +2 · [Equip][body]

/** P2's turn. P1 (Wuju legend) holds bf1 with the given defenders; P2 has attackers ready in base. */
function defended(defenders: readonly (readonly [number, string])[], attackers: readonly (readonly [number, string])[]) {
  let b = scenario().active(P2).legend(P1, CARD, "yi").battlefield("bf1", { controller: P1 });
  for (const [might, alias] of defenders) {
    b = b.unit(P1, "bf1", { might, name: alias }, alias);
  }
  for (const [might, alias] of attackers) {
    b = b.unit(P2, "base", { might, name: alias }, alias);
  }
  return b;
}

describe("Wuju Bladesman - Starter (ogs-019-024)", () => {
  test("registry payload: a Calm/Body Yi legend with exactly one static: +2 Might to a friendly unit that is defending alone", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Yi", domain: ["calm", "body"], name: "Wuju Bladesman - Starter" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 2, target: { controller: "friendly", type: "unit" }, type: "modify-might" },
      type: "static",
    });
    // The subject restriction ("defends alone") must be encoded somewhere on the ability.
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/defending/);
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/alone/);
  });

  test("only while DEFENDING: a lone friendly unit parked at bf1 outside combat is its printed 3; so is a unit in base", async () => {
    const game = await scenario().legend(P1, CARD, "yi").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry").unit(P1, "base", { might: 2, name: "Home" }, "home").build();
    expect(game.state("sentry")).toMatchObject({ combatRole: null, might: 3, staticMightBonus: 0 });
    expect(game.state("home").might).toBe(2);
  });

  test("lone 3-Might defender fights at 5 — a 4-Might attacker dies, the defender lives and P1 keeps bf1; afterwards it is a plain 3 again (466.7.c)", async () => {
    const game = await defended([[3, "sentry"]], [[4, "raider"]]).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("sentry")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.state("sentry")).toMatchObject({ damage: 0, might: 3 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("knife-edge — against a 5-Might attacker the lone 3 (→5) trades: both die and nobody scores", async () => {
    const game = await defended([[3, "sentry"]], [[5, "brute"]]).build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p2.points()).toBe(0);
  });

  test("enemies don't break 'alone' (740.2.a) — two 2-Might attackers (sum 4) into the lone 3 (→5): both attackers die, the defender survives", async () => {
    const game = await defended([[3, "sentry"]], [[2, "a1"], [2, "a2"]]).build();
    await game.p2.move(["a1", "a2"], "bf1");
    expect(game.state("sentry").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.locationOf("sentry")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("only ALONE: two friendly defenders (3 and 1) get nothing — they fight as 3 and 1, so a 4-Might attacker trades with both", async () => {
    const game = await defended([[3, "sentry"], [1, "page"]], [[4, "raider"]]).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("sentry")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("page")).toMatchObject({ combatRole: "defender", might: 1 });
    await game.settle();
    // 4 damage from the raider is exactly lethal across 3 + 1; the defenders' 4 kills the raider.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("page")).toBe("trash");
  });

  test("continuous (364.3) — Fight or Flight sends the second defender home mid-showdown; the survivor is now alone and reads 5 at once, then wins the fight", async () => {
    const game = await defended([[3, "sentry"], [1, "page"]], [[4, "raider"]])
      .resources(P1, { energy: 2 })
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("sentry").might).toBe(3);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("fof", { targets: "page" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("page")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("sentry")).toBe("bf1");
  });

  test("only DEFENDING, not attacking: my lone 3-Might attacker into an enemy 4 stays 3 and dies", async () => {
    const game = await scenario()
      .legend(P1, CARD, "yi")
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist")
      .build();
    await game.p1.move("duelist", "bf2");
    expect(game.state("duelist")).toMatchObject({ combatRole: "attacker", might: 3, staticMightBonus: 0 });
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf2");
    expect(game.p1.points()).toBe(0);
  });

  test("FRIENDLY only (740.1.a): the opponent's lone 3-Might defender gets nothing from my legend — my 4-Might attacker kills it and conquers", async () => {
    const game = await scenario()
      .legend(P1, CARD, "yi")
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Their Sentry" }, "theirs")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf2");
    expect(game.state("theirs")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("gear is not a unit — a lone defender wearing Doran's Blade (+2) is still alone: 2 printed + 2 blade + 2 legend = 6 beats a 5-Might attacker", async () => {
    const game = await scenario()
      .legend(P1, CARD, "yi")
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, DORANS_BLADE, "blade")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "squire" } });
    await game.settle();
    expect(game.state("squire")).toMatchObject({ attachments: ["blade"], might: 4 });
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    expect(game.locationOf("blade")).toBe("bf1");
    expect(game.state("squire")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("squire")).toBe("bf1");
  });

  test("stacks with Wielder of Water — a lone 2-Might Wielder defends at 2 + 2 (own) + 2 (legend) = 6 and kills a 5-Might attacker", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "yi")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WIELDER_OF_WATER, "ww")
      .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    expect(game.state("ww").might).toBe(2);
    await game.p2.move("brute", "bf1");
    expect(game.state("ww")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
  });

  test("negative space: an enemy legend of the same name never helps MY defenders — P2's Wuju, P1's lone 3 vs a 4-Might attacker: the defender dies", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P2, CARD, "theirYi")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("sentry").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
