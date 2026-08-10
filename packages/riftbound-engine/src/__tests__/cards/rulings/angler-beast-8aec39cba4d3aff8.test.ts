/**
 * Ruling 8aec39cba4d3aff8 — Angler Beast (UNL-132 → unl-132-219) · Unit · Chaos · [5]+[chaos] · 5 Might
 *     "When you play me, return all units with 2 [Might] or less to their owners' hands."
 *
 * Q: Does Angler Beast return units based on printed Might or current Might?
 * A: CURRENT Might. A printed-2 unit buffed to 3+ is not returned; a printed-3 unit reduced to 2 or less is returned.
 * Rules: 135.2.e (Might = current value after modifiers), 702 (buff +1), 432 (Might modifiers), 108.2 (owner's hand).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ANGLER_BEAST = "unl-132-219";

/**
 * P1's turn with [5]+chaos and the Beast in hand. Probes (both players, base and battlefield):
 *   printed 2, buffed → 3   (stays)      · printed 3, −1 this turn → 2 (returned)
 *   printed 2, plain        (returned)   · printed 3, plain           (stays)
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Buffed Two" }, "buffedTwo", { buffed: true })
    .unit(P2, "bf1", { might: 3, name: "Weakened Three" }, "weakThree", { mightModifier: -1 })
    .unit(P2, "base", { might: 3, name: "Plain Three" }, "plainThree")
    .unit(P1, "bf2", { might: 2, name: "Plain Two" }, "plainTwo")
    .unit(P1, "base", { might: 2, name: "My Buffed Two" }, "myBuffedTwo", { buffed: true })
    .hand(P1, ANGLER_BEAST, "beast");
}

describe("Ruling 8aec39cba4d3aff8 — Angler Beast reads CURRENT Might, not printed Might", () => {
  test("premise: the probes' current Mights — Buffed Two 3, Weakened Three 2, Plain Three 3, Plain Two 2, My Buffed Two 3", async () => {
    const game = await board().build();
    expect(game.state("buffedTwo")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("weakThree")).toMatchObject({ baseMight: 3, might: 2 });
    expect(game.state("plainThree").might).toBe(3);
    expect(game.state("plainTwo").might).toBe(2);
    expect(game.state("myBuffedTwo")).toMatchObject({ baseMight: 2, might: 3 });
  });

  test("play the Beast and let its trigger resolve: the printed-3-now-2 unit and the plain 2 go to their owners' hands; the printed-2-now-3 units (buffed) and the plain 3 STAY; the Beast (5) stays", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", controller: P1, triggered: true })]);
    await game.settle();
    // returned (current ≤ 2)
    expect(game.zoneOf("weakThree")).toBe("hand");
    expect(game.p2.hand()).toContain("weakThree");
    expect(game.zoneOf("plainTwo")).toBe("hand");
    expect(game.p1.hand()).toContain("plainTwo");
    // kept (current ≥ 3 despite printed 2, or plain 3)
    expect(game.zoneOf("buffedTwo")).toBe("battlefield-bf1");
    expect(game.zoneOf("myBuffedTwo")).toBe("base");
    expect(game.zoneOf("plainThree")).toBe("base");
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
