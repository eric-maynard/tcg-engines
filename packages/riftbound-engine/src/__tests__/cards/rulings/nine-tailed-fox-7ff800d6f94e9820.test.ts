/**
 * Ruling 7ff800d6f94e9820 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri)
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1."
 *   × Shen, Kinkou (ogn-241-298) · [Reaction] unit "…including to a battlefield you control."
 *
 * Q: Can Shen be played as a reaction onto the ATTACKER's side of the battlefield during a showdown, and
 *    would Ahri's legend then give him -1?
 * A: He cannot. A unit may only be played where you have permission — your base or a battlefield YOU
 *    control — and the attacker never controls the contested battlefield. A unit that does later become an
 *    attacker at a battlefield Ahri's controller holds does get the -1.
 * Rules: 419.1.a / 366.1 (play permissions: base or a battlefield you control), 190.4 (the attacker does not
 *        control it), 464.2.c (attack designations), 355 (a permanent entering play is not respondable).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHEN = "ogn-241-298";
const NINE_TAILED_FOX = "ogn-255-298";

/** P2's turn. P1's legend is Ahri and P1 holds bf1; P2 holds bf2 and has Shen in hand. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { order: 1 } })
    .legend(P1, NINE_TAILED_FOX, "ahri")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SHEN, "shen");
}

describe("Ruling 7ff800d6f94e9820 — Shen cannot be played to the attacker's side; Ahri taxes whoever does attack her battlefield", () => {
  test("attacking P1's battlefield triggers Ahri: the 3-Might Raider is knocked to 2 for the turn", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    expect(game.state("raider").might).toBe(3); // not yet — the trigger has to resolve
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("raider").might).toBe(2);
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("during that showdown, Shen may only be played to P2's base or to bf2 (which P2 controls) — never to the contested bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    const locations = game.p2.option("play", "shen")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(locations).toContain("base");
    expect(locations).toContain("battlefield-bf2");
    expect(locations).not.toContain("battlefield-bf1");
    expect((await game.p2.try((p) => p.play("shen", { to: "bf1" }))).ok).toBe(false);
  });

  test("Shen played to P2's own base is NOT an attacker, so Ahri's -1 never touches him", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    await game.p2.play("shen", { to: "base" });
    expect(game.locationOf("shen")).toBe("base");
    expect(game.state("shen").combatRole).toBeNull();
    expect(game.state("shen").might).toBe(3); // printed Might, untaxed
    expect(game.violations()).toEqual([]);
  });
});
