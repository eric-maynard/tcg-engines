/**
 * Ruling c5da40cccac40a0f — Cleave (OGN-004 → ogn-004-298) · [Action] · Fury · [1]
 *     "Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)"
 *   × Crackshot Corsair (OGN-130 → ogn-130-298) · 3 Might · "When I attack, deal 1 to an enemy unit here."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it." (to bring a unit
 *     into an already-running combat)
 *
 * Q: Does [Assault] work when granted during combat, after attackers were designated — and how do "when I
 *    attack" triggers behave for a unit that joins the combat late?
 * A: [Assault] is a passive "while I am an attacker, +X [Might]", so it applies the moment the unit has the
 *    Attacker designation, whenever the keyword arrived. Attack triggers fire the FIRST time a unit gains the
 *    Attacker designation — including a late arrival — and only once per combat.
 * Rules: 727 ([Assault] = a while-attacking static), 464.2 (designations are re-checked at each cleanup step),
 *        383.4.e (an attack trigger becomes fulfilled once per combat per unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const CRACKSHOT_CORSAIR = "ogn-130-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn 3. P2 holds bf1 with an unkillable 9-Might Wall; P1 has a Striker (2) and a Corsair (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5, power: { chaos: 2, fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Striker" }, "striker")
    .unit(P1, "base", CRACKSHOT_CORSAIR, "corsair")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Resolve the open chain by passing priority. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
      continue;
    }
    break;
  }
}

describe("Ruling c5da40cccac40a0f — [Assault] granted mid-combat applies at once; a late arrival's attack trigger fires when it first becomes an attacker", () => {
  test("Cleave cast on a unit that is ALREADY an attacker gives it the +3 immediately: 2 → 5", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    expect(game.state("striker")).toMatchObject({ combatRole: "attacker", might: 2 });
    await game.p1.cast("cleave", { targets: "striker" });
    await resolveChain(game);
    expect(game.state("striker").keywords).toContain("Assault");
    expect(game.state("striker").might).toBe(5);
  });

  test("…and it really is a while-attacking passive: the same [Assault 3] on a unit sitting in base adds nothing", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "corsair" });
    await resolveChain(game);
    expect(game.state("corsair").keywords).toContain("Assault");
    expect(game.state("corsair").combatRole).toBeNull();
    expect(game.state("corsair").might).toBe(3); // printed 3, no bonus while not attacking
  });

  test("a unit that joins the combat LATE (ridden in during the showdown) becomes an attacker and its 'when I attack' trigger fires then", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    expect(game.state("wall").damage).toBe(0);
    await game.p1.cast("rtw", { answers: ["bf1"], targets: "corsair" });
    await resolveChain(game);
    expect(game.locationOf("corsair")).toBe("bf1");
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("wall").damage).toBe(1); // the Corsair's attack trigger went off after it arrived
    expect(game.violations()).toEqual([]);
  });

  test("…and Cleave cast on that late arrival works exactly the same: it is an attacker, so 3 + 3 = 6", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    await game.p1.cast("rtw", { answers: ["bf1"], targets: "corsair" });
    await resolveChain(game);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.seat === P2 && d.context === "showdown") {
        await game.p2.pass();
        continue;
      }
      break;
    }
    await game.p1.cast("cleave", { targets: "corsair" });
    await resolveChain(game);
    expect(game.state("corsair").might).toBe(6);
  });

  test("the attack trigger is once per combat: it does not fire a second time just because the combat continues", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    await game.p1.cast("rtw", { answers: ["bf1"], targets: "corsair" });
    await resolveChain(game);
    expect(game.state("wall").damage).toBe(1);
    expect(game.chain().filter((c) => c.cardId === "corsair")).toEqual([]);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.seat === P2 && d.context === "showdown") {
        await game.p2.pass();
        continue;
      }
      break;
    }
    await game.p1.cast("cleave", { targets: "corsair" });
    await resolveChain(game);
    expect(game.state("wall").damage).toBe(1); // still just the one
  });
});
