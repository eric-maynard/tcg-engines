/**
 * Ruling 4ec2ea79fe5cfa7b — Beast Below (SFD-132 → sfd-132-221) · 8 Might
 *   "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Do I need another friendly unit to play Beast Below?
 * A: No. The UNIT is played normally; only its triggered ability needs both targets. With no other
 *    friendly unit the trigger never goes on the Chain at all, so nothing is returned — Beast Below
 *    simply stays on the board.
 * Rules: 402.4 (a trigger with no legal object for a required target is removed / never added),
 *        355.12, 419.4 ("when you play me" is a trigger, not a play requirement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BEAST_BELOW = "sfd-132-221";

const rich = () => scenario().resources(P1, { energy: 7, power: { chaos: 2 } });

describe("Ruling 4ec2ea79fe5cfa7b — Beast Below is playable with no other friendly unit; its trigger just never happens", () => {
  test("no other friendly unit ⇒ the play is legal, the trigger never enters the Chain, and the enemy unit is untouched", async () => {
    const game = await rich()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BEAST_BELOW, "beast")
      .build();

    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast", { to: "base" });

    // 402.4 — the mandatory "another friendly unit" object does not exist, so nothing is put on the Chain.
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");

    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("no ENEMY unit either ⇒ same outcome: Beast Below enters, nothing is returned", async () => {
    const game = await rich()
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, BEAST_BELOW, "beast")
      .build();

    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
  });

  test("control: with another friendly unit AND an enemy unit the trigger does fire and returns both", async () => {
    const game = await rich()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BEAST_BELOW, "beast")
      .build();

    await game.p1.play("beast", { to: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["beast"]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("beast")).toBe("base"); // "another" — it never returns itself
    expect(game.violations()).toEqual([]);
  });
});
