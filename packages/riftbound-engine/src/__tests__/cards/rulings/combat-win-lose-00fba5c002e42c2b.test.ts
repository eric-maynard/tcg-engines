/**
 * Ruling 00fba5c002e42c2b — (general) "What does it mean to win or lose a combat?"
 *   Illustrated with Draven, Vanquisher (sfd-020-221) · 4 Might · "When I win a combat, play a Gold gear token exhausted. When I attack or
 *   defend, you may pay [fury]. If you do, give me +2 [Might] this turn." and Glorious Executioner (sfd-185-221, legend) · "When you win a
 *   combat, draw 1. (You win if only your units remain after combat.)"
 *
 * A: After combat damage: neither player or BOTH players have units left → tie (if both, attackers are recalled). Only one player has units
 *    left → that player wins, the other loses. "When I win a combat" fires if the unit is among the survivors — whether or not combat damage
 *    was actually dealt (kill every opposing unit with spells first and you still win "by default"). You can win on offense or on defense.
 * Rules: 466.1.a.2 (defenders remain → attackers recalled), 466.3 / 740.3.a (winner / tie = no result), 466.3.a (win-combat triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_VANQUISHER = "sfd-020-221";
const GLORIOUS_EXECUTIONER = "sfd-185-221";
/** [Action] 1: deal 3 to a unit — used to clear the defender during the showdown. */
const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Bolt", timing: "action" } as const;

/** P1 = Draven's side with the Glorious Executioner legend and a named deck top (to see the legend's draw). */
function base() {
  return scenario().legend(P1, GLORIOUS_EXECUTIONER, "ge").deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Draven (P1) attacks P2's bf1 held by a Foe of `might` (optionally stunned). */
function dravenAttacks(might: number, meta: { stunned?: boolean } = {}) {
  return base().battlefield("bf1", { controller: P2 }).unit(P1, "base", DRAVEN_VANQUISHER, "draven").unit(P2, "bf1", { might, name: "Foe" }, "foe", meta);
}

/** Drive a combat to its end: decline Draven's optional [fury] pump, pass priority/focus, let settle() resolve damage. */
async function fight(game: Game, during?: (g: Game) => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "action" && d.context === "showdown") {
      if (during && (await during(game))) {
        continue;
      }
      await game.seat(d.seat).passFocus();
    } else {
      break;
    }
  }
  await game.settle();
}

const gold = (game: Game) => game.p1.gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold");

describe("Ruling 00fba5c002e42c2b — winning, losing and tying a combat", () => {
  test("only the ATTACKER's units remain (Draven 4 kills Foe 2): the attacker WINS — Draven's 'win a combat' makes a Gold token, the legend draws 1, and P1 conquers", async () => {
    const game = await dravenAttacks(2).build();
    await game.p1.move("draven", "bf1");
    await fight(game);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(gold(game)).toHaveLength(1);
    expect(game.state(gold(game)[0]!).isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("only the DEFENDER's units remain (Draven 4 dies to Foe 5, which survives 4 damage): the defender wins, the attacker LOSES — no Gold, no draw, P2 keeps bf1", async () => {
    const game = await dravenAttacks(5).build();
    await game.p1.move("draven", "bf1");
    await fight(game);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.state("foe")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(gold(game)).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("BOTH players have units left (stunned Foe 5 deals nothing, survives Draven's 4): a TIE — the attacker Draven is RECALLED to base, nobody 'won' (no Gold, no draw), P2 keeps bf1", async () => {
    const game = await dravenAttacks(5, { stunned: true }).build();
    await game.p1.move("draven", "bf1");
    await fight(game);
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(gold(game)).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("NEITHER player has units left (Draven 4 and Foe 4 kill each other): a TIE — no win trigger, and the emptied battlefield is left uncontrolled", async () => {
    const game = await dravenAttacks(4).build();
    await game.p1.move("draven", "bf1");
    await fight(game);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(gold(game)).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("you can win on DEFENSE: P2's Foe 3 attacks Draven 4 holding bf1 and dies — Draven (defender) wins: Gold token + legend draw, P1 keeps bf1 (no conquer point)", async () => {
    const game = await base()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DRAVEN_VANQUISHER, "draven")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .build();
    await game.p2.move("foe", "bf1");
    expect(game.state("draven").combatRole).toBe("defender");
    await fight(game);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(gold(game)).toHaveLength(1);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("winning 'by default': P1 Bolts the lone Foe 3 dead DURING the showdown, before any combat damage — only Draven remains, so he still WINS the combat (Gold + draw) and conquers", async () => {
    const game = await dravenAttacks(3).hand(P1, BOLT, "bolt").resources(P1, { energy: 1 }).build();
    await game.p1.move("draven", "bf1");
    let bolted = false;
    await fight(game, async (g) => {
      if (!bolted && g.decision()?.seat === P1 && g.p1.can("cast", "bolt")) {
        await g.p1.cast("bolt", { targets: "foe" });
        bolted = true;
        return true;
      }
      return false;
    });
    expect(bolted).toBe(true);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("draven")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // never took a punch
    expect(gold(game)).toHaveLength(1);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
