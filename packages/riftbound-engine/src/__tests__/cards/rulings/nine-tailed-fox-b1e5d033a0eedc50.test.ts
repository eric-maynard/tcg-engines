/**
 * Ruling b1e5d033a0eedc50 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri)
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: I attack a battlefield Ahri's controller holds and my units take -1. If I then use Ride the Wind to
 *    bring ANOTHER unit onto that battlefield mid-combat, does Ahri's Legend ability trigger again?
 * A: Yes. Ahri triggers each time a unit gains the attacker designation there for the first time in that
 *    combat, whenever that happens — attack triggers are not restricted to the start of combat.
 * Rules: 464.2.c.3.a (a unit arriving at an ongoing combat gains a role and its attack/defend triggers fire
 *        then), 383 (once per unit per combat: the FIRST time it gains the designation).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 has the Ahri legend and durably holds bf1 with a Sentry. P1: two 4-Might raiders + RTW. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .legend(P2, NINE_TAILED_FOX, "ahri")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 4, name: "Raider A" }, "ra")
    .unit(P1, "base", { might: 4, name: "Raider B" }, "rb")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Raider A attacks bf1; Ahri's trigger resolves. */
async function firstAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ra", "bf1");
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  return game;
}

describe("Ruling b1e5d033a0eedc50 — Ahri re-triggers for each unit that becomes an attacker, whenever it does", () => {
  test("baseline: the first attacker takes Ahri's -1 (4 → 3); the second is still in base and untouched", async () => {
    const game = await firstAttack();
    expect(game.state("ra")).toMatchObject({ combatRole: "attacker", might: 3, mightModifier: -1 });
    expect(game.state("rb").might).toBe(4);
  });

  test("ruling: Ride the Wind brings Raider B into the ongoing combat — it becomes an attacker mid-combat", async () => {
    const game = await firstAttack();
    await game.p1.cast("rtw", { targets: "rb", answers: ["bf1"] });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.locationOf("rb")).toBe("bf1");
    expect(game.state("rb").combatRole).toBe("attacker");
  });

  test("ruling: Ahri's Legend ability triggers AGAIN for that newcomer — Raider B is also -1 (4 → 3)", async () => {
    const game = await firstAttack();
    await game.p1.cast("rtw", { targets: "rb", answers: ["bf1"] });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("rb")).toMatchObject({ might: 3, mightModifier: -1 });
    // …and the first raider is not debuffed a second time.
    expect(game.state("ra")).toMatchObject({ might: 3, mightModifier: -1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the second trigger really is Ahri's — it appears on the chain, controlled by P2, after the move", async () => {
    const game = await firstAttack();
    expect(game.chain()).toEqual([]);
    await game.p1.cast("rtw", { targets: "rb", answers: ["bf1"] });
    for (let i = 0; i < 8; i++) {
      if (game.chain().some((c) => c.cardId === "ahri")) {
        break;
      }
      await game.acting().pass();
    }
    expect(game.chain()).toContainEqual(
      expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true }),
    );
  });

  test("ruling: 'to a minimum of 1' still applies — the two attackers end on 3 each, not below", async () => {
    const game = await firstAttack();
    await game.p1.cast("rtw", { targets: "rb", answers: ["bf1"] });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect([game.state("ra").might, game.state("rb").might]).toEqual([3, 3]);
  });
});
