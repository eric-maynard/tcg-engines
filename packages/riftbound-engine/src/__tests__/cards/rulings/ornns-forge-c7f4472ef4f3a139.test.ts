/**
 * Ruling c7f4472ef4f3a139 — Ornn's Forge (SFD-213 → sfd-213-221) · Battlefield
 *   "While you control this battlefield, the first friendly non-token gear played each turn costs [1] less."
 *
 * Q: If an opponent attacks a battlefield I control, do I still control it (and can I use control-dependent abilities
 *    like Ornn's Forge) while defending?
 * A: Yes. The attacked battlefield is Contested AND still controlled by you at the same time; abilities that require
 *    control (the Forge's discount) keep working while you defend.
 * Rules: 181/187 (control persists until the combat resolves), 190.3 (Contested is applied on arrival — it does not
 *        remove control), 464 (defender = the controller), 466.5 (control changes only at combat resolution).
 *
 * Note: printed gear has no Reaction timing, so the discount is exercised with an inline [Reaction] test gear ("Quick
 * Trinket", cost [2]) that P1 can legally play while holding Focus in the showdown.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ORNNS_FORGE = "sfd-213-221";
const QUICK_TRINKET = { cardType: "gear", energyCost: 2, keywords: ["Reaction"], name: "Quick Trinket", timing: "reaction" } as const;

/** P2's turn. P1 controls the Forge (live text) with a 4-Might Smith and has [4]; P2's 3-Might Raider attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4 })
    .battlefield("forge", { controller: P1, def: ORNNS_FORGE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P1, "forge", { might: 4, name: "Smith" }, "smith")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, QUICK_TRINKET, "trinket")
    .hand(P1, { ...QUICK_TRINKET, name: "Second Trinket" }, "trinket2");
}

async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "forge");
  return game;
}

describe("Ruling c7f4472ef4f3a139 — an attacked battlefield is contested AND still yours; Ornn's Forge keeps discounting while you defend", () => {
  test("during the attack the Forge is simultaneously CONTESTED (by P2) and CONTROLLED by P1; Smith defends, Raider attacks", async () => {
    const game = await raiderAttacks();
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("smith").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker has Focus first
  });

  test("with Focus passed to the defender, P1 plays a [Reaction] gear mid-combat and the Forge's 'while you control this battlefield' discount APPLIES: [2] → [1]", async () => {
    const game = await raiderAttacks();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.forge?.controller).toBe(P1); // still ours while choosing
    expect(game.p1.can("play", "trinket")).toBe(true);
    await game.p1.play("trinket");
    expect(game.p1.energy()).toBe(4 - 1);
    expect(game.zoneOf("trinket")).toBe("base");
    // only the FIRST gear each turn: a second one in the same showdown costs full [2]
    if (game.decision()?.seat === P2) await game.p2.passFocus();
    expect(game.p1.can("play", "trinket2")).toBe(true);
    await game.p1.play("trinket2");
    expect(game.p1.energy()).toBe(3 - 2);
  });

  test("and control never flickered: the combat resolves (4 kills the 3-Might Raider), P1 still controls the Forge, no points to P2", async () => {
    const game = await raiderAttacks();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
  });

  test("contrast: at a Forge P1 does NOT control (P2's, P1 attacking on P1's turn) the same Reaction gear costs the full [2]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("forge", { controller: P2, def: ORNNS_FORGE, inert: false })
      .unit(P2, "forge", { might: 4, name: "Their Smith" }, "ts")
      .unit(P1, "base", { might: 3, name: "My Raider" }, "mr")
      .hand(P1, QUICK_TRINKET, "trinket")
      .build();
    await game.p1.move("mr", "forge");
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: true, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.play("trinket");
    expect(game.p1.energy()).toBe(4 - 2);
  });
});
