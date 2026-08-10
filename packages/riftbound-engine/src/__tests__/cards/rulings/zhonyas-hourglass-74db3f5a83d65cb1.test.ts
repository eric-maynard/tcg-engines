/**
 * Ruling 74db3f5a83d65cb1 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *   × Sprite token (unl-t07) · 3 Might · "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *
 * Q: If a unit with Temporary is saved by Zhonya's during the opponent's turn, does it still die at the start of my next turn?
 * A: Yes. Temporary is a triggered ability that stays on the unit; being saved once (by Zhonya's) does not remove it, so at
 *    the start of your next Beginning Phase it triggers (again) and kills the unit — Zhonya's is gone by then.
 * Rules: 816 (Temporary = "at the start of your Beginning Phase, kill this" trigger; a characteristic of the permanent),
 *        366–371 (Zhonya's replaces one death event, nothing more), 186.1 (a killed token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SPRITE = "unl-t07";

const gone = (game: Game, id: string) => !game.has(id) || game.zoneOf(id) === "trash" || game.zoneOf(id) === "gone";

describe("Ruling 74db3f5a83d65cb1 — saved by Zhonya's on the opponent's turn, the Temporary unit still dies at the start of your next turn", () => {
  /** P2's turn 3. P1 holds bf1 with a Sprite (3, Temporary) and has Zhonya's face up in base; P2's Brute (7) attacks it. */
  function combatBoard() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .gear(P1, ZHONYAS, "zhonyas")
      .unit(P2, "base", { might: 7, name: "Brute" }, "brute");
  }

  test("during P2's turn the Sprite takes lethal combat damage → Zhonya's is killed instead; the Sprite is healed, exhausted and recalled to base — and it STILL has [Temporary]", async () => {
    const game = await combatBoard().build();
    expect(game.state("sprite").keywords).toContain("Temporary");
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("sprite")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("sprite").keywords).toContain("Temporary");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("P2 ends the turn → at the start of P1's Beginning Phase Temporary triggers and kills the Sprite (no Zhonya's left to save it); the non-Temporary Plain unit is untouched", async () => {
    const game = await combatBoard().build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("base");
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(gone(game, "sprite")).toBe(true);
    expect(game.p1.units()).toEqual(["plain"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 74db3f5a83d65cb1 — the sequence in the answer: Zhonya's absorbs ONE Temporary trigger; the status remains and the next one kills it", () => {
  /** P2's turn 3. P1: Sprite + Plain in base, Zhonya's face up. Nothing attacks; the only lethal event is Temporary itself. */
  function quietBoard() {
    return scenario()
      .turn(3)
      .active(P2)
      .unit(P1, "base", SPRITE, "sprite")
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .gear(P1, ZHONYAS, "zhonyas");
  }

  test("P1's Beginning Phase #1: Temporary tries to kill the Sprite → Zhonya's dies instead and the Sprite survives that trigger (exhausted, in base, still Temporary)", async () => {
    const game = await quietBoard().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(gone(game, "sprite")).toBe(false);
    expect(game.state("sprite")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("sprite").keywords).toContain("Temporary");
  });

  test("P1's Beginning Phase #2 (a full round later): Temporary triggers again and this time the Sprite is killed", async () => {
    const game = await quietBoard().build();
    await game.advanceTurn(); // → P1 (saved)
    expect(gone(game, "sprite")).toBe(false);
    await game.advanceTurn(); // → P2
    expect(gone(game, "sprite")).toBe(false); // not the opponent's Beginning Phase
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(gone(game, "sprite")).toBe(true);
    expect(game.p1.units()).toEqual(["plain"]);
    expect(game.violations()).toEqual([]);
  });
});
