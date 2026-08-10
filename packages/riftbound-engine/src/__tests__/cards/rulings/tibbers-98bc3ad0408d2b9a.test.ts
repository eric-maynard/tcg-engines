/**
 * Ruling 98bc3ad0408d2b9a — Tibbers (OGS-018 → ogs-018-024) · 8 · 7 Might · "When you play me, deal 3 to all units at battlefields."
 *   × Annie, Fiery (ogs-001-024) · "Your spells and abilities deal 1 Bonus Damage."
 *
 * Q: Does Tibbers' "When you play me" text count as an ability that Annie boosts?
 * A: Yes. It is a triggered ability that goes on the chain when Tibbers is played, so Annie adds 1: it deals 4 to each unit
 *    at a battlefield. All functional text is an ability (keyword or not); flavour text is not.
 * Rules: 376 / 383 (triggered abilities are abilities and become chain items), 712–715 (Bonus Damage applies to each Deal
 *        instance of your spells AND abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TIBBERS = "ogs-018-024";
const ANNIE_FIERY = "ogs-001-024";

/** P1's turn with Annie in base and Tibbers in hand; big units at bf1 on both sides (so nobody dies), a P2 unit in base. */
function board(withAnnie: boolean) {
  const b = scenario()
    .resources(P1, { energy: 8, power: { chaos: 2, fury: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 12, name: "Foe" }, "foe")
    .unit(P1, "bf1", { might: 12, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 12, name: "Homebody" }, "home")
    .hand(P1, TIBBERS, "tibbers");
  return withAnnie ? b.unit(P1, "base", ANNIE_FIERY, "annie") : b;
}

describe("Ruling 98bc3ad0408d2b9a — Tibbers' play trigger is an ability, so Annie, Fiery adds Bonus Damage to it", () => {
  test("'When you play me' is a triggered ABILITY: playing Tibbers puts a triggered Tibbers item on the chain", async () => {
    const game = await board(true).build();
    await game.p1.play("tibbers");
    // The unit itself resolves at once (units don't linger on the chain); its play trigger is a chain item.
    expect(game.zoneOf("tibbers")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tibbers", controller: P1, triggered: true })]);
  });

  test("with Annie on board the trigger deals 3 + 1 = 4 to every unit at a battlefield (friend and foe); units in a base take nothing", async () => {
    const game = await board(true).build();
    await game.p1.play("tibbers");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("foe").damage).toBe(4);
    expect(game.state("ally").damage).toBe(4);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("annie").damage).toBe(0);
    expect(game.state("tibbers").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: without Annie the same trigger deals exactly 3", async () => {
    const game = await board(false).build();
    await game.p1.play("tibbers");
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
    expect(game.state("ally").damage).toBe(3);
    expect(game.state("home").damage).toBe(0);
  });
});
