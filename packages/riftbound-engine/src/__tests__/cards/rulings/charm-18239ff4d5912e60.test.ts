/**
 * Ruling 18239ff4d5912e60 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] · "Move an enemy unit."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: A STUNNED Yasuo is dragged into a battlefield by Charm — does his "when I attack" ability still trigger and
 *    still deal his Might in damage?
 * A: Yes. Being stunned removes only COMBAT damage. Yasuo is still moved, still gains the Attacker designation,
 *    his attack trigger still fires and its ability damage (equal to his Might) is dealt in full. Only the
 *    Combat Damage step treats him as dealing 0.
 * Rules: 423.1.b (stun zeroes combat damage only), 383.4.e (Attack Triggers fire on gaining the designation),
 *        190.3/450/464.2.c (the arriving unit's controller applies Contested → it is the attacker),
 *        714 (damage from an ability is not combat damage), 465 (Combat Damage step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const YASUO = "ogn-076-298";

/** P1's turn with exactly [1][calm]. P1 holds bf1 with a Pawn (2) and a Wall (8); bf2 is open. Yasuo sits STUNNED in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P2, "base", YASUO, "yasuo", { stunned: true })
    .hand(P1, CHARM, "charm");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 Charms the stunned Yasuo into bf1 and lets it resolve; stops with the attack trigger pending. */
async function charmYasuoIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("yasuo").isStunned).toBe(true);
  await game.p1.cast("charm", { targets: "yasuo" });
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves — the stun did not stop the move
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("yasuo")).toBe("bf1");
  return game;
}

describe("Ruling 18239ff4d5912e60 — a stunned Yasuo still attacks and still deals his Might as ability damage", () => {
  test("stun does not stop the move or the designation: Yasuo arrives at P1's bf1, contests it, and is the ATTACKER while still stunned", async () => {
    const game = await charmYasuoIn();
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", controller: P2, isStunned: true, location: "bf1" });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("pawn").combatRole).toBe("defender");
    expect(game.state("wall").combatRole).toBe("defender");
  });

  test("his 'When I attack' trigger DOES fire off the stunned attack — a Yasuo item controlled by P2 is on the chain", async () => {
    const game = await charmYasuoIn();
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "yasuo", controller: P2, triggered: true }));
    expect(game.state("yasuo").isStunned).toBe(true);
  });

  test("the trigger's 'an enemy unit here' is Yasuo's controller's choice: P2 is asked and both P1 defenders are offered", async () => {
    const game = await charmYasuoIn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? (d.options.map((o) => o.card).sort() as string[]) : []).toEqual(["pawn", "wall"]);
  });

  test("ability damage ignores the stun: P2 aims it at the Pawn and 6 (Yasuo's Might) is dealt — the Pawn dies before any combat damage happens", async () => {
    const game = await charmYasuoIn();
    await game.p2.pick("pawn");
    await game.acting().passPriority();
    await game.acting().passPriority(); // the attack trigger resolves
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isStunned: true, location: "bf1" }); // combat hasn't happened yet
    expect(game.state("wall").damage).toBe(0);
  });

  test("only the COMBAT damage is lost: aimed at the Wall (8), the 6 ability damage lands, then the stunned Yasuo deals 0 in combat and dies to the Wall's 8 — the Wall ends with 0 damage taken", async () => {
    const game = await charmYasuoIn();
    await game.p2.pick("wall");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("wall").damage).toBe(6); // ability damage — dealt in full despite the stun
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash"); // took the Wall's 8
    expect(game.state("wall")).toMatchObject({ damage: 0, location: "bf1" }); // healed at combat cleanup; Yasuo dealt 0
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
