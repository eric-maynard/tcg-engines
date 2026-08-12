/**
 * Ruling 7771836dd08e3bb9 — Akali, Deadly Weapon (VEN-021 → ven-021-166) · Unit · Fury · [3] · 3 Might
 *     "When I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead."
 *   × Stalwart Poro (ogn-052-298) · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *
 * Q: Does Akali's movement trigger deal its damage before [Shield] becomes active?
 * A: Yes. The "When I move" trigger fires and resolves before the showdown officially begins, so nothing has the
 *    Defender designation yet and [Shield] — a "while I am a defender" static — is not applying. The damage is
 *    measured against the unit's plain Might; if that is lethal the unit dies and never defends at all.
 * Rules: 814.1.c ([Shield] applies while the unit is a defender), 464.2 (designations are granted when the showdown
 *        begins, after the move trigger's chain empties), 383.3 (move triggers go on the chain at once).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const STALWART_PORO = "ogn-052-298";

/** P1's turn. P2 holds bf1 with a lone Stalwart Poro (2 Might, [Shield] ⇒ 3 while defending). Akali waits in P1's base. */
function board(empowered: boolean) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", STALWART_PORO, "poro")
    .unit(P1, "base", AKALI, "akali", empowered ? { empowered: true } : {});
}

/** Move Akali in and opt into her trigger, aimed at the Poro; stops just before the trigger resolves. */
async function moveInAndAim(empowered: boolean): Promise<Game> {
  const game = await board(empowered).build();
  expect(game.state("poro").might).toBe(2); // no designation yet ⇒ no [Shield]
  await game.p1.move("akali", "bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["akali"]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("poro");
  }
  return game;
}

describe("Ruling 7771836dd08e3bb9 — Akali's move damage lands before the Showdown starts, so [Shield] is not yet active", () => {
  test("while the move trigger is on the Chain nobody is a defender yet and the Poro is still only 2 [Might]", async () => {
    const game = await moveInAndAim(false);
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.state("akali").combatRole).toBeNull();
    expect(game.state("poro").might).toBe(2); // [Shield] inactive
    expect(game.state("poro").keywords).toContain("Shield");
  });

  test("Empowered Akali deals 2 — lethal against the Poro's unshielded 2 [Might]: it dies before it can ever defend", async () => {
    const game = await moveInAndAim(true);
    expect(game.state("akali").isEmpowered).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — non-Empowered Akali deals only 1: the Poro survives, the showdown then begins and only NOW does [Shield] lift it to 3 [Might]", async () => {
    const game = await moveInAndAim(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(1);
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(3); // [Shield] now applies
    expect(game.violations()).toEqual([]);
  });
});
