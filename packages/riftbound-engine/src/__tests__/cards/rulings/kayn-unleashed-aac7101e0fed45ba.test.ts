/**
 * Ruling aac7101e0fed45ba — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · [Ganking]
 *   "[Ganking] (I can move from battlefield to battlefield.) If I have moved twice this turn, I don't take damage."
 *
 * Q: Kayn attacks one battlefield, is then moved to another battlefield, and fails to conquer there. Does he
 *    return to the battlefield he came from, or to base?
 * A: To BASE. When attackers fail to conquer (defenders are still present after combat damage) the attacking
 *    units are Recalled to base, never to wherever they set out from. Ganking only widens the legal
 *    destinations of a Standard Move; it changes nothing about the recall.
 * Rules: 461.1.a.2 (defenders remain ⇒ attackers are Recalled), 453 (Recall = to base, state unchanged),
 *        451/823 ([Ganking] modifies the Standard Move only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";

/**
 * P1's turn. P1 already holds bf2 (Kayn + a Keeper there). P2 holds bf1 with a 7-Might Guard that is
 * STUNNED: Kayn's 6 cannot break through, and the Guard deals no combat damage, so nobody dies — exactly
 * the "moved in, failed to conquer, survived" case.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "bf2", KAYN, "kayn")
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper");
}

describe("Ruling aac7101e0fed45ba — an attacker that fails to conquer is recalled to BASE, not to the battlefield it came from", () => {
  test("[Ganking] lets Kayn move battlefield → battlefield (bf2 → bf1), opening a combat showdown there", async () => {
    const game = await board().build();
    await game.p1.gank("kayn", "bf1");
    expect(game.locationOf("kayn")).toBe("bf1");
    expect(game.state("kayn").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("ruling: Kayn deals 6 to a 7-Might Guard, fails to conquer, and comes home to BASE — not back to bf2", async () => {
    const game = await board().build();
    await game.p1.gank("kayn", "bf1");
    await game.settle();

    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // defender survived ⇒ no conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);

    expect(game.locationOf("kayn")).toBe("base");
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.locationOf("kayn")).not.toBe("bf2");
    expect(game.state("kayn").damage).toBe(0); // the stunned Guard dealt nothing
    expect(game.violations()).toEqual([]);
  });

  test("nuance: [Ganking] only widens the Standard Move — a unit without it cannot walk battlefield → battlefield", async () => {
    const game = await board().build();
    expect(game.state("keeper").keywords).not.toContain("Ganking");
    const r = await game.p1.try((p) => p.move("keeper", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("keeper")).toBe("bf2");
  });

  test("contrast: when the defenders are gone Kayn STAYS at the battlefield he attacked and conquers it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire", { stunned: true })
      .unit(P1, "bf2", KAYN, "kayn")
      .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
      .build();
    await game.p1.gank("kayn", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.locationOf("kayn")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
