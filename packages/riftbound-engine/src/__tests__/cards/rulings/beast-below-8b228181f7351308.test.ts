/**
 * Ruling 8b228181f7351308 — Beast Below (SFD-132 → sfd-132-221) · Unit · Chaos · [7][chaos][chaos] · 8 Might
 *   "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Does Beast Below need a friendly target to work?
 * A: The trigger needs BOTH targets to go on the chain — but you may still play the unit itself when you
 *    cannot supply them. In that case the "when you play" ability simply never becomes a chain item.
 * Rules: 402.4 (a trigger with no legal target for a mandatory target is removed / never placed),
 *        355.8 (target legality is checked for the ability, not for playing the permanent), 383.2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BEAST_BELOW = "sfd-132-221";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .hand(P1, BEAST_BELOW, "beast");
}

describe("Ruling 8b228181f7351308 — Beast Below is playable without targets; only its trigger needs them", () => {
  test("both targets available: the trigger goes on the chain and bounces one friendly and one enemy unit", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Ally" }, "ally").unit(P2, "base", { might: 2, name: "Enemy" }, "enemy").build();
    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("enemy")).toBe("hand");
    expect(game.zoneOf("beast")).toBe("base"); // Beast Below itself stays — "another friendly unit"
    expect(game.violations()).toEqual([]);
  });

  test("no OTHER friendly unit: Beast Below is still playable, and its trigger never reaches the chain", async () => {
    const game = await board().unit(P2, "base", { might: 2, name: "Enemy" }, "enemy").build();
    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("enemy")).toBe("base"); // nothing was returned
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("no ENEMY unit either half is missing: same answer — the unit enters, the trigger is not put on the chain", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Ally" }, "ally").build();
    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("an empty board: Beast Below still enters play by itself", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    await game.settle();
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.state("beast").might).toBe(8);
  });
});
