/**
 * Ruling a980e8eb8970f89f — Showstopper (OGN-270 → ogn-270-298) · Spell · [1][rainbow] · Action
 *   "Buff a friendly unit in your base, then move it to a battlefield."
 *
 * Q: Can Showstopper be used on a unit that is already at a battlefield, or must the unit be in base?
 * A: It must be in base. The first sentence ("Buff a friendly unit in your base") is what chooses the
 *    object for the whole card, so a unit at a battlefield is never a legal choice — and with no unit in
 *    base at all the spell cannot be played.
 * Rules: 355.5/355.8 (an object is chosen once, against the descriptor, when the spell is played;
 *        no legal choice ⇒ the play is illegal), 355.10 ("then move IT" reuses the same object).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";

/** P1's turn with exactly [1][rainbow]: one unit in base, one already out at bf1, an enemy at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Vanguard" }, "front")
    .unit(P2, "bf2", { might: 9, name: "Ogre" }, "ogre")
    .unit(P1, "base", { might: 2, name: "Understudy" }, "home")
    .hand(P1, SHOWSTOPPER, "ss");
}

describe("Ruling a980e8eb8970f89f — Showstopper only chooses a unit in your BASE", () => {
  test("ruling: the target field lists the base unit only — the friendly unit already at bf1 is not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ss")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat().sort()).toEqual(["home"]);
    expect(targets.flat()).not.toContain("front");
  });

  test("ruling: naming the battlefield unit is illegal — Showstopper cannot be used on a unit at a battlefield", async () => {
    const game = await board().build();
    const bad = await game.p1.try((p) => p.cast("ss", { targets: "front" }));
    expect(bad.ok).toBe(false);
    expect(game.zoneOf("ss")).toBe("hand");
    expect(game.state("front").isBuffed).toBe(false);
  });

  test("ruling: with NO unit in base the spell cannot be played at all (the enemy unit is not friendly either)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Vanguard" }, "front")
      .unit(P2, "bf2", { might: 9, name: "Ogre" }, "ogre")
      .hand(P1, SHOWSTOPPER, "ss")
      .build();
    expect(game.p1.can("cast", "ss")).toBe(false);
    expect((await game.p1.try((p) => p.cast("ss", { targets: "front" }))).ok).toBe(false);
  });

  test("contrast: on the base unit it works — it is buffed and then moved to a battlefield of P1's choosing", async () => {
    const game = await board().build();
    await game.p1.cast("ss", { targets: "home", answers: ["bf1"] });
    await game.settle();
    expect(game.state("home").isBuffed).toBe(true);
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.zoneOf("ss")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
