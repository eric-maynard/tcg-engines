/**
 * Ruling b53aa7b581ae8432 — Cleave (OGN-004 → ogn-004-298) · Spell · [1] · [Action]
 *   "Give a unit [Assault 3] this turn."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 [Might] · [Shield] and × Taric, Protector (OGN-074 → ogn-074-298)
 *     "…Other friendly units here have [Shield]" as the two [Shield] sources.
 *
 * Q: Do [Shield] values stack (Shield 1 + Shield 2), and do several [Assault] grants like Cleave stack?
 * A: Both stack and are summed. Two Cleaves on one unit are [Assault 3] twice = +6 [Might] while attacking; a unit
 *    with printed [Shield] that is also granted [Shield] defends with the sum.
 * Rules: 813 ([Assault]), 814 ([Shield]), 809.2 (keyword values from several sources are added), 317.2.c ("this turn").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const STALWART_PORO = "ogn-052-298";
const TARIC_PROTECTOR = "ogn-074-298";

/** P1's turn: a 2-[Might] attacker in base, two Cleaves, 2 energy, an enemy-held bf1 to attack. */
function assaultBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Defender" }, "def")
    .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
    .hand(P1, CLEAVE, "cleave1")
    .hand(P1, CLEAVE, "cleave2")
    .resources(P1, { energy: 2 });
}

describe("Ruling b53aa7b581ae8432 — [Assault] grants and [Shield] values are summed", () => {
  test("two Cleaves land as two separate [Assault 3] grants on the same unit", async () => {
    const game = await assaultBoard().build();
    await game.p1.cast("cleave1", { targets: "atk" });
    await game.settle();
    await game.p1.cast("cleave2", { targets: "atk" });
    await game.settle();
    expect(game.state("atk").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 3 },
      { duration: "turn", keyword: "Assault", value: 3 },
    ]);
    expect(game.state("atk").might).toBe(2); // nothing while it sits at home — [Assault] is attacker-only
  });

  test("attacking, the doubled Cleave is worth +6: a printed 2-[Might] unit swings at 8", async () => {
    const game = await assaultBoard().build();
    await game.p1.cast("cleave1", { targets: "atk" });
    await game.settle();
    await game.p1.cast("cleave2", { targets: "atk" });
    await game.settle();
    await game.p1.move("atk", "bf1");
    expect(game.state("atk").combatRole).toBe("attacker");
    expect(game.state("atk").might).toBe(8);
  });

  test("one Cleave alone is +3, so the stacking is really additive and not 'highest wins'", async () => {
    const game = await assaultBoard().build();
    await game.p1.cast("cleave1", { targets: "atk" });
    await game.settle();
    await game.p1.move("atk", "bf1");
    expect(game.state("atk").might).toBe(5);
  });

  test("[Shield] sums too — Stalwart Poro's own [Shield] plus Taric's granted [Shield] defends at 2 + 1 + 1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", STALWART_PORO, "poro")
      .unit(P1, "bf1", TARIC_PROTECTOR, "taric")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    expect(game.state("poro").might).toBe(2); // no combat yet, [Shield] is defender-only
    await game.p2.move("atk", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("both stacks are 'this turn' / role-bound: after the turn ends the Cleaves are gone", async () => {
    const game = await assaultBoard().build();
    await game.p1.cast("cleave1", { targets: "atk" });
    await game.settle();
    await game.p1.cast("cleave2", { targets: "atk" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("atk").grantedKeywords).toEqual([]);
  });
});
