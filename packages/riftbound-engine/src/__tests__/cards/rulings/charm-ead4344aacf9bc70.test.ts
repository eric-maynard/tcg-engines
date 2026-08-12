/**
 * Ruling ead4344aacf9bc70 — Charm (OGN-043 → ogn-043-298) · spell · [1][calm] · "Move an enemy unit."
 *
 * Q: If MY unit is Charmed into a battlefield the opponent is defending, who gets priority first?
 * A: The moved unit is the one applying Contested, so its controller is the ATTACKER — and the attacker takes
 *    focus (and with it the first priority) when the showdown opens. Being dragged in by the opponent's spell
 *    does not hand the initiative to the spell's caster.
 * Rules: 187.3.a.1 (an arriving unit applies Contested), 459.2.b.1 (the attacker starts with focus), 459.2.b.1.a (and priority).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P1's turn. P1 defends bf1 with a Guard and Charms P2's Puppet in from P2's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Puppet" }, "puppet")
    .hand(P1, CHARM, "charm")
    .resources(P1, { energy: 1, power: { calm: 1 } });
}

async function charmed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { answers: ["bf1"], targets: "puppet" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  await game.acting().passPriority();
  await game.acting().passPriority(); // Charm resolves and the showdown opens
  return game;
}

describe("Ruling ead4344aacf9bc70 — the Charmed unit's controller is the attacker and acts first in the showdown", () => {
  test("while Charm is still on the Chain nothing is contested yet — the caster holds priority", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { answers: ["bf1"], targets: "puppet" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.locationOf("puppet")).toBe("base");
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
  });

  test("after Charm resolves the moved unit is the ATTACKER even though the opponent moved it", async () => {
    const game = await charmed();
    expect(game.locationOf("puppet")).toBe("bf1");
    expect(game.state("puppet")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("focus and the first action of the showdown belong to P2 — the Charmed unit's controller, not the caster", async () => {
    const game = await charmed();
    expect(game.actingSeat()).toBe(P2);
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(d.prompt).toContain("Focus");
  });

  test("P1 (the caster / defender) only acts after P2 passes focus", async () => {
    const game = await charmed();
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
