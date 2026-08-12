/**
 * Ruling c1e05840717871da — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *   × Cleave (ogn-004-298) — "Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)"
 *
 * Q: If a unit is [Mighty] only because of [Assault], has it lost Mighty by the time Sunken Temple's
 *    effect could be used after conquering?
 * A: Yes. The attacker and defender tags are removed in the Combat Cleanup that happens BEFORE the conquer,
 *    so an [Assault]-only bonus is already gone: the unit is no longer Mighty and the Temple cannot be used.
 * Rules: 466.4 (Combat Cleanup strips the attacker/defender tags), 715.1 ([Assault] applies only while the
 *        unit is an attacker), 471.2 (the Conquer effect is checked after that cleanup), 709 ([Mighty] = 5+).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const CLEAVE = "ogn-004-298";

/** P1's turn. bf1 IS the Sunken Temple, held by P2 with a stunned 2-Might Guard that dies to the attack. */
function board(attackerMight: number) {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2, def: SUNKEN_TEMPLE, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: attackerMight, name: "Raider" }, "raider");
}

describe("Ruling c1e05840717871da — an [Assault]-only [Mighty] unit is no longer Mighty when Sunken Temple checks", () => {
  test("control: a naturally 5-Might attacker conquers the Temple and IS offered the draw", async () => {
    const game = await board(5).build();
    await game.p1.move("raider", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("bf1");

    const deckBefore = game.p1.deck().length;
    await game.p1.yes();
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1);
    expect(game.p1.points()).toBe(1);
  });

  test("setup: Cleave really does make the 3-Might Raider a 6-Might attacker during the combat", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("raider").might).toBe(6); // 3 + [Assault 3]
  });

  test("supporting fact: once the combat is over the attacker tag is gone and the Raider is a plain 3 Might again", async () => {
    const game = await board(3).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.state("raider").might).toBe(3); // never [Mighty] outside the attack
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(1);
  });

  test.failing(
    "BUG: ruling c1e05840717871da — an [Assault]-only Mighty attacker should NOT enable Sunken Temple (tags are stripped before the conquer); the engine still offers the draw",
    async () => {
      const game = await board(3).hand(P1, CLEAVE, "cleave").build();
      await game.p1.cast("cleave", { targets: "raider" });
      await game.settle();
      await game.p1.move("raider", "bf1");
      const stop = await game.settle();

      // Ruling: no Mighty unit remains at the moment the Temple checks, so nothing is offered.
      expect(stop.reason).toBe("open");
      expect(game.decision()?.kind).not.toBe("yes-no");
    },
  );

  test.failing(
    "BUG: ruling c1e05840717871da — and therefore no card should be drawn from the Temple after such a conquer",
    async () => {
      const game = await board(3).hand(P1, CLEAVE, "cleave").build();
      await game.p1.cast("cleave", { targets: "raider" });
      await game.settle();
      const deckBefore = game.p1.deck().length;
      await game.p1.move("raider", "bf1");
      await game.settle();
      if (game.decision()?.kind === "yes-no") {
        await game.p1.yes(); // engine lets P1 take it; the ruling says this was never on offer
      }
      await game.settle();
      expect(game.p1.deck().length).toBe(deckBefore);
    },
  );
});
