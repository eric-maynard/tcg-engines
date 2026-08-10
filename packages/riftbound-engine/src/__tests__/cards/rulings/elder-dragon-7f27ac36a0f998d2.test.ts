/**
 * Ruling 7f27ac36a0f998d2 — Elder Dragon (UNL-118 → unl-118-219) · 10 Might · "Any amount of your damage is enough to
 *     kill enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Vilemaw (UNL-060 → unl-060-219) · 8 Might · "[Ambush] Enemy units here with less Might than me don't deal combat
 *     damage. When I hold, draw 1."
 *
 * Q: Does Elder Dragon's "any damage is lethal" get through Vilemaw when my unit has less Might than Vilemaw?
 * A: No. Vilemaw stops the weaker unit from dealing combat damage AT ALL; Elder Dragon only lowers the lethal
 *    threshold for damage that is actually dealt. No damage dealt → nothing for Elder Dragon to make lethal.
 * Rules: 142.4.c (lethal-damage modification applies to dealt damage), 465.2 (combat damage), prevention statics.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const VILEMAW = "unl-060-219";

/** P1's turn. Elder Dragon sits in P1's base (its passive is live); P2 holds bf1 with Vilemaw (8). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ELDER_DRAGON, "elder")
    .unit(P2, "bf1", VILEMAW, "vilemaw");
}

describe("Ruling 7f27ac36a0f998d2 — Vilemaw's prevention beats Elder Dragon's any-damage-is-lethal (nothing is dealt)", () => {
  test("a 3-Might attacker (less than Vilemaw's 8) with Elder Dragon on P1's board: it deals NO combat damage — Vilemaw ends on 0 damage and survives; Vilemaw's 8 kills the attacker; bf1 stays P2's", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Whelp" }, "whelp").build();
    await game.p1.move("whelp", "bf1");
    expect(game.state("whelp").combatRole).toBe("attacker");
    expect(game.state("vilemaw").combatRole).toBe("defender");
    await game.settle();
    expect(game.state("vilemaw")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("whelp")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — damage that IS dealt is lethal at any amount: Elder Dragon's own play trigger deals 1 to Vilemaw (8 Might) and that 1 kills it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", VILEMAW, "vilemaw")
      .hand(P1, ELDER_DRAGON, "elder")
      .build();
    await game.p1.play("elder");
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "elder" } });
      await game.p1.pick("vilemaw");
      await game.settle();
    }
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.zoneOf("vilemaw")).toBe("trash");
  });

  test("contrast — an attacker NOT weaker than Vilemaw (an 8-Might Drake, equal Might) does deal its combat damage: 8 to Vilemaw kills it (they trade)", async () => {
    const game = await board().unit(P1, "base", { might: 8, name: "Drake" }, "drake").build();
    await game.p1.move("drake", "bf1");
    await game.settle();
    expect(game.zoneOf("vilemaw")).toBe("trash");
    expect(game.zoneOf("drake")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
  });
});
