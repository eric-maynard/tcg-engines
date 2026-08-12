/**
 * Ruling 92108f80ebeef647 — (general non-combat showdown; exercised with Lucian, Gunslinger, SFD-028 →
 *   sfd-028-221 · 2 Might · "[Assault] When I attack, deal damage equal to my [Assault] to an enemy unit here.")
 *
 * Q: Does moving onto a neutral (open) battlefield open a showdown where spells can be played?
 * A: Yes — a NON-COMBAT showdown. Both players may play actions/reactions; the moving player has Focus and
 *    priority first because they applied Contested. Nobody is designated attacker or defender, it is not combat,
 *    and "when I attack" / combat-referencing abilities do not trigger.
 * Rules: 323.11 / 344 (applying Contested opens a Non-Combat Showdown), 464.2 (a showdown becomes COMBAT only
 *        when opposing units meet), 464.2.c.3 (designations are stamped then), 348.2.a (control settles at the
 *        showdown's close), 807.1 ([Assault] applies while designated an attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUCIAN = "sfd-028-221"; // [Assault] · "When I attack, deal damage equal to my [Assault] to an enemy unit here."

const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** P1's turn: bf1 is neutral and empty; Lucian waits in P1's base; P2 has a unit at bf2 and a Bolt in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 4 } })
    .resources(P2, { energy: 4, power: { fury: 4 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
    .unit(P1, "base", LUCIAN, "lucian")
    .hand(P2, BOLT, "bolt");
}

/** Lucian walks onto the empty neutral battlefield. */
async function walkIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("lucian", "bf1");
  return game;
}

describe("Ruling 92108f80ebeef647 — walking onto a neutral battlefield opens a non-combat showdown", () => {
  test("a showdown really opens, and the moving player is the one on the clock", async () => {
    const game = await walkIn();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.locationOf("lucian")).toBe("bf1");
  });

  test("no attacker/defender designation is made — this is not combat", async () => {
    const game = await walkIn();
    expect(game.state("lucian").combatRole ?? "none").toBe("none");
  });

  test("'when I attack' does not trigger, and [Assault] adds nothing: Lucian stays at 2 Might with an empty chain", async () => {
    const game = await walkIn();
    expect(game.chain()).toEqual([]);
    expect(game.state("lucian").might).toBe(2);
  });

  test("both players may act in it: P1 passes Focus and P2 casts an Action into the showdown", async () => {
    const game = await walkIn();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "bolt")).toBe(true);
    await game.p2.cast("bolt", { targets: "lucian" });
    await game.settle();
    expect(game.state("lucian").damage).toBe(1);
  });

  test("when the showdown closes P1 is left standing there: control is established and the battlefield is conquered for a point", async () => {
    const game = await walkIn();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
