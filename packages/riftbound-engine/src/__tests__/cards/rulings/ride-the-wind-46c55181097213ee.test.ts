/**
 * Ruling 46c55181097213ee — Ride the Wind (OGN-173 → ogn-173-298)
 *   "[Action] Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: Does Yasuo's "When I attack" trigger when Ride the Wind drops him into a combat that is already
 *    running (after the normal attack triggers have gone)?
 * A: Yes. Joining an ongoing combat on the attacking side makes him an attacker, and his trigger goes
 *    on the SAME Chain as the effect that moved him — it becomes pending as Ride the Wind resolves and
 *    is finalized and resolved right there.
 * Rules: 464.2.c.3.a (a unit joining an ongoing showdown takes a role and its attack/defend triggers
 *        fire), 337.1 (a trigger produced during a resolution is queued on the same Chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";

/** A combat is already running at bf1 (P1's Scout vs P2's Wall); Yasuo waits exhausted at P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", YASUO, "yasuo", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 46c55181097213ee — Yasuo's attack trigger fires when Ride the Wind adds him to a running combat", () => {
  test("step by step: Yasuo arrives mid-showdown as an attacker and his trigger resolves on the same Chain", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1"); // opens the combat; Yasuo is not in it
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.state("yasuo").isExhausted).toBe(true);
    expect(game.state("wall").damage).toBe(0);

    await game.p1.cast("rtw", { answers: ["bf1"], targets: ["yasuo"] });
    // While Ride the Wind is on the Chain nothing has moved yet.
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    expect(game.locationOf("yasuo")).toBe("base");

    await game.p1.passPriority();
    await game.p2.passPriority();

    // Ride the Wind resolved: Yasuo is at bf1, READY, and an attacker — and his trigger is on the Chain.
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").isExhausted).toBe(false);
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true }),
    ]);
    expect(game.state("wall").damage).toBe(0); // not resolved yet

    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").damage).toBe(6); // Might 6 dealt to the enemy unit here
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Ride the Wind aimed at the Scout instead, no attack trigger fires and the Wall is untouched", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("rtw", { answers: ["bf1"], targets: ["scout"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]); // the Scout has no attack trigger
    expect(game.state("wall").damage).toBe(0);
    expect(game.locationOf("yasuo")).toBe("base");
  });
});
