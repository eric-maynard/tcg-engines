/**
 * Ruling 96699d65334428f4 — Daring Poro (OGN-210 → ogn-210-298) · Unit · 2 · 2 [Might]
 *   "[Assault] (+1 [Might] while I'm an attacker.)"
 *
 * Q: Do you get the Attacker designation when you move into an OPEN (unoccupied) battlefield?
 * A: No. Moving to an open battlefield opens a NON-COMBAT Showdown; Attacker/Defender designations
 *    are only stamped when a Combat Showdown opens. With no designation, [Assault] does nothing.
 * Rules: 464.2.c.3 (designations stamped when the showdown becomes a Combat Showdown), 344.2
 *    (an empty uncontrolled battlefield gives a Non-Combat Showdown), 807.1.d ([Assault] is tied to
 *    the Attacker designation).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARING_PORO = "ogn-210-298";

function showdownOf(game: Game) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** bf1 is empty and uncontrolled; bf2 is P2's with a defender. The Poro starts in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", DARING_PORO, "poro");
}

describe("Ruling 96699d65334428f4 — walking onto an open battlefield is not attacking", () => {
  test("the Poro has [Assault] printed but sits at its plain 2 Might in base", async () => {
    const game = await board().build();
    expect(game.state("poro").keywords).toContain("Assault");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 2, combatRole: null });
  });

  test("moving to the OPEN battlefield opens a NON-COMBAT showdown — no Attacker designation, no [Assault]", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(showdownOf(game)?.isCombatShowdown).toBe(false);
    expect(game.state("poro").combatRole).toBe(null);
    expect(game.state("poro").might).toBe(2); // NOT 3
  });

  test("it stays 2 Might all the way through the showdown and the conquer that follows", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(showdownOf(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("poro")).toMatchObject({ combatRole: null, might: 2 });
  });

  test("contrast — moving into an OCCUPIED battlefield is a Combat Showdown: the Poro IS the attacker and gets +1", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf2");
    expect(showdownOf(game)?.isCombatShowdown).toBe(true);
    expect(game.state("poro").combatRole).toBe("attacker");
    expect(game.state("poro").might).toBe(3); // 2 + [Assault]
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });
});
