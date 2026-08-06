/**
 * Symbol of the Solari — ogn-227-298 · Gear · Order · 1 energy
 *
 *   If a combat where you are the attacker ends in a tie, recall ALL units instead.
 *   (Send them to base. This isn't a move. Ties are calculated after combat damage is dealt.)
 *
 * Rules: 740.3.a — a tie = units of different players are still at the battlefield in step 3d
 * of the Combat Cleanup; 466.1.a.2 — normally only the attackers are recalled then; 466.5.b — a
 * battlefield left with no units becomes uncontrolled. Tie generator used here: Vilemaw
 * (unl-060-219, 8 Might, "Enemy units here with less Might than me don't deal combat damage")
 * attacking two 5-Might defenders kills one, leaves the other, and takes no damage.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-227-298";
const VILEMAW = "unl-060-219";

/** `attacker` sends Vilemaw from base into a battlefield the other player holds with two 5s. */
function tieBoard(attacker: typeof P1 | typeof P2, symbolFor?: typeof P1 | typeof P2) {
  const defender = attacker === P1 ? P2 : P1;
  const b = scenario()
    .active(attacker)
    .battlefield("bf1", { controller: defender })
    .unit(attacker, "base", VILEMAW, "vile")
    .unit(defender, "bf1", { might: 5, name: "Guard One" }, "d1")
    .unit(defender, "bf1", { might: 5, name: "Guard Two" }, "d2");
  return symbolFor ? b.gear(symbolFor, CARD, "sym") : b;
}

describe("Symbol of the Solari (ogn-227-298)", () => {
  test("costs 1 energy and sits in the base as gear; 0 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "sym").build();
    await game.p1.play("sym");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("sym")).toBe("base");
    expect(game.p1.gear()).toEqual(["sym"]);
    const poor = await scenario().resources(P1, { energy: 0 }).hand(P1, CARD, "sym").build();
    expect(poor.p1.can("play", "sym")).toBe(false);
  });

  test("control (no Symbol): a tie recalls only the attacker; the surviving defender stays and keeps control", async () => {
    const game = await tieBoard(P1).build();
    await game.p1.move("vile", "bf1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("vile")).toBe("base");
    expect(game.zoneOf("d2")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test.failing("BUG: with the Symbol, a tie where you attacked recalls ALL units — the defender goes home too and the battlefield empties", async () => {
    // Expected: Vilemaw → P1 base AND the surviving Guard Two → P2 base; bf1 has no units left, so
    // it becomes uncontrolled (466.5.b); nobody scores. Actual: the combat-tie replacement is never
    // consulted — only the attacker is recalled and P2 keeps the battlefield.
    const game = await tieBoard(P1, P1).build();
    await game.p1.move("vile", "bf1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("vile")).toBe("base");
    expect(game.zoneOf("d2")).toBe("base");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // "This isn't a move": the recalled defender is not exhausted by it.
    expect(game.state("d2").isExhausted).toBe(false);
  });

  test("only when YOU are the attacker: if the Symbol's controller is defending, a tie recalls just the enemy attacker", async () => {
    const game = await tieBoard(P2, P1).build();
    await game.p2.move("vile", "bf1");
    await game.settle();
    expect(game.zoneOf("vile")).toBe("base");
    expect(game.zoneOf("d2")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("not a tie: when the attack simply wins, the Symbol changes nothing (conquer + 1 point)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "sym")
      .unit(P1, "base", { might: 4 }, "atk")
      .unit(P2, "bf1", { might: 2 }, "def")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
