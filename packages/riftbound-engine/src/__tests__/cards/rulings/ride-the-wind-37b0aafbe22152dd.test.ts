/**
 * Ruling 37b0aafbe22152dd — Ride the Wind (OGN-173 → ogn-173-298)
 *   "[Action] Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: Does "attack triggers only fire once per combat" also stop a unit that is recalled and attacks
 *    again later, or only one that attacks twice within the same combat?
 * A: Once per unit PER COMBAT. Riding out and back into the SAME showdown does not re-trigger; attacking
 *    in a new, different combat does.
 * Rules: 464.2.c.3.a / 466 (attack triggers fire as a unit joins a combat, once per combat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";

describe("Ruling 37b0aafbe22152dd — Yasuo's attack trigger fires once per combat, not once per arrival", () => {
  test("SAME combat: ride out to base and back in ⇒ Yasuo attacks again but the trigger does NOT fire a second time", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 30, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout") // keeps the combat alive while Yasuo is away
      .unit(P1, "base", YASUO, "yasuo")
      .hand(P1, RIDE_THE_WIND, "rtw1")
      .hand(P1, RIDE_THE_WIND, "rtw2")
      .build();

    await game.p1.move(["scout", "yasuo"], "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").damage).toBe(6); // first (and only) attack trigger
    expect(game.chain()).toEqual([]);

    // Ride out to base — the showdown carries on because the Scout is still there.
    await game.p1.cast("rtw1", { answers: ["base"], targets: ["yasuo"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, showdownComplete: false });

    // Ride back into the SAME combat.
    await game.p2.passFocus();
    await game.p1.cast("rtw2", { answers: ["bf1"], targets: ["yasuo"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker"); // he is attacking again …
    expect(game.chain()).toEqual([]); // … but nothing triggered …
    expect(game.state("wall").damage).toBe(6); // … and no second 6 was dealt
    expect(game.violations()).toEqual([]);
  });

  test("DIFFERENT combat: after the first showdown ends, attacking a second battlefield fires the trigger again", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "GuardA" }, "a")
      .unit(P2, "bf2", { might: 5, name: "GuardB" }, "b")
      .unit(P1, "base", YASUO, "yasuo")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();

    // Combat 1 at bf1 — the trigger kills the 5-Might guard outright.
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("a")).toBe("trash");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    // Combat 2 at bf2 — a brand new combat, so the same unit triggers again.
    await game.p1.cast("rtw", { answers: ["bf2"], targets: ["yasuo"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true }),
    ]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
