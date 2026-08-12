/**
 * Ruling c2f59f19bb30879f — Lucian, Gunslinger (SFD-028 → sfd-028-221) · Unit · [3] · 2 [Might]
 *   "[Assault]. When I attack, deal damage equal to my [Assault] to an enemy unit here."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · Unit · 2 [Might] · "[Shield] (+1 [Might] while I'm a defender.)"
 *
 * Q: Can Lucian's attack trigger deal its damage BEFORE the defender's [Shield] applies?
 * A: No. [Shield] is a passive: it uses no Chain and does not trigger, so the moment a unit is designated defender
 *    its [Might] already includes the bonus. Lucian's trigger only goes on the Chain after that, and there is no
 *    window in which the unit is a defender but unshielded.
 * Rules: 814.1 ([Shield] is passive, defender-only), 471 (layers / continuous effects), 383.3 (triggers use the Chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUCIAN_GUNSLINGER = "sfd-028-221";
const STALWART_PORO = "ogn-052-298";

/** P1's turn: Lucian in base, a Stalwart Poro holding P2's bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", STALWART_PORO, "poro")
    .unit(P1, "base", LUCIAN_GUNSLINGER, "lucian");
}

describe("Ruling c2f59f19bb30879f — [Shield] is already on when Lucian's attack trigger is put on the Chain", () => {
  test("out of combat the Poro is its printed 2 — [Shield] is a defender-only passive", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ combatRole: null, might: 2 });
    expect(game.state("poro").keywords).toContain("Shield");
  });

  test("the instant the attack is declared the Poro is a 3, and only THEN is Lucian's trigger on the Chain", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("lucian")).toMatchObject({ combatRole: "attacker", might: 3 }); // 2 + [Assault]
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lucian", controller: P1, targets: ["poro"], triggered: true }),
    ]);
  });

  test("when the trigger resolves it deals [Assault] = 1, which a shielded 3-[Might] Poro shrugs off", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ damage: 1, might: 3 });
    expect(game.zoneOf("poro")).toBe("battlefield-bf1"); // still alive — the [Shield] was never absent
  });

  test("combat then trades them: 3 vs 3 kills both, and the Poro was never a 2 while defending", async () => {
    const game = await board().build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
