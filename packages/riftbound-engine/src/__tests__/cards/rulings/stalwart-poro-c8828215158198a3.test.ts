/**
 * Ruling c8828215158198a3 — Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *   × Taric, Protector (OGN-074 → ogn-074-298) · 4 Might · "[Shield] [Tank] Other friendly units here have [Shield]."
 *
 * Q: Do Shields stack — with Stalwart Poro and Taric together, is the Poro at +1 or +2 while defending?
 * A: They stack additively (rule 814.2): the Poro's own Shield 1 plus Taric's granted Shield 1 sum to
 *    Shield 2, so as a defender the Poro is 2 + 2 = 4. (Taric only grants OTHER units, so he is 4 + 1.)
 * Rules: 814 (Shield), 814.2 (multiple Shield sources sum their values).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const TARIC_PROTECTOR = "ogn-074-298";

/** P2's turn. P1 holds bf1 with Stalwart Poro + Taric; P2 has a 3-Might Raider ready in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .unit(P1, "bf1", TARIC_PROTECTOR, "taric")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

describe("Ruling c8828215158198a3 — Shield stacks: Stalwart Poro next to Taric defends with Shield 2", () => {
  test("out of combat neither Shield applies: Poro reads 2, Taric reads 4; the Poro carries Shield (printed) and Taric's grant", async () => {
    const game = await board().build();
    expect(game.state("poro").might).toBe(2);
    expect(game.state("taric").might).toBe(4);
    expect(game.state("poro").keywords).toContain("Shield");
    expect(game.state("poro").combatRole).toBeNull();
  });

  test("Raider attacks bf1 → Poro is a defender with Shield 1 (own) + Shield 1 (Taric) = +2 → 4 Might; Taric (own Shield only) is 5", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("taric").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(4);
    expect(game.state("taric").might).toBe(5); // "Other friendly units" — Taric does not grant himself a second Shield
  });

  test("control without Taric: the lone defending Poro has just its own Shield → 3", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", STALWART_PORO, "poro")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
