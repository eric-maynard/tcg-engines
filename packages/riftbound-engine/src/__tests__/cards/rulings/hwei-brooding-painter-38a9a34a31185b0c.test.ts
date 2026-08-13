/**
 * Ruling 38a9a34a31185b0c — Hwei, Brooding Painter (UNL-080 → unl-080-219) · Champion · 5 Might
 *   × Moonfall (UNL-198 → unl-198-219) · Action · 3 + [C] "Choose a battlefield where you have units. You may move up
 *     to one enemy unit to that battlefield. Then give enemy units there -2 [Might] this turn."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · Champion · 5 Might "[Ambush] When I attack, [Stun] an enemy unit here."
 *
 * Q: I hold a battlefield with Hwei and Moonfall an enemy Vi, Peacekeeper into it — who attacks, who defends?
 * A: The opponent (Vi's controller) is the Attacker — Vi is the unit that applied Contested to your battlefield —
 *    and you (the controller) are the Defender. Consequently Vi's "When I attack" triggers.
 * Rules: 459.2.b.1-2 (whose units applied Contested attacks; the controller defends), 190.3.a / 323.13
 *        (a Combat begins in Cleanup when a controlled battlefield becomes contested), 383 ("When I attack").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";
const MOONFALL = "unl-198-219";
const VI_PEACEKEEPER = "unl-176-219";

/** P1's turn, exactly Moonfall's cost. P1 holds bf1 with Hwei; P2's Vi, Peacekeeper sits in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", HWEI, "hwei")
    .unit(P2, "base", VI_PEACEKEEPER, "vi")
    .hand(P1, MOONFALL, "moonfall");
}

/** Cast Moonfall (bf1 is the only battlefield with P1 units), pass it through, and pick Vi as the unit to move. */
async function moonfallVi(auto = true): Promise<Game> {
  const game = await board().autoProcedures(auto).build();
  await game.p1.cast("moonfall");
  {
      // rule 355.10.b (unl-198-219) — the anchor battlefield is a target of the
      // spell, chosen as it is played: answer it before the pull is offered.
      const anchor = game.decision();
      if (
        anchor?.kind === "pick" &&
        anchor.options.every((o) => game.gameState.battlefields[o.key] !== undefined)
      ) {
        await game.p1.pick(anchor.options[0]?.key as string);
      }
    }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // "You may move up to one enemy unit" — P1's choice on resolution.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  const d = game.decision();
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["vi"]);
  await game.p1.pick("vi");
  expect(game.zoneOf("moonfall")).toBe("trash");
  return game;
}

describe("Ruling 38a9a34a31185b0c — Moonfall drags Vi into Hwei's battlefield: Vi's controller attacks, Hwei's defends", () => {
  test("Moonfall resolves: Vi is moved to bf1 and gets -2 (5 → 3); bf1 becomes contested BY P2 while P1 still controls it", async () => {
    const game = await moonfallVi(false);
    expect(game.locationOf("vi")).toBe("bf1");
    expect(game.state("vi").might).toBe(3);
    expect(game.state("hwei").might).toBe(5); // only ENEMY units there are debuffed
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("designations: the Combat that begins has P2 (Vi) as Attacker and P1 (Hwei, the controller) as Defender", async () => {
    const game = await moonfallVi(false);
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("hwei").combatRole).toBe("defender");
  });

  test("because Vi gained the Attacker designation, her 'When I attack' triggers: it goes on the chain and stuns Hwei (the only enemy unit there)", async () => {
    const game = await moonfallVi(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P2, triggered: true })]);
    expect(game.state("hwei").isStunned).toBe(false);
    // Both pass → the trigger resolves onto Hwei.
    while (game.decision()?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("hwei");
    }
    expect(game.state("hwei").isStunned).toBe(true);
    expect(game.state("vi").isStunned).toBe(false);
    // The Attacker (P2) holds Focus first in the showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("played out: stunned Hwei deals no combat damage, Vi (3) can't kill Hwei (5) — attacker P2 fails, Vi is recalled, P1 keeps bf1, nobody scores", async () => {
    const game = await moonfallVi(true);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("hwei")).toBe("battlefield-bf1");
    expect(game.zoneOf("vi")).toBe("base"); // surviving attackers are recalled when the defender holds
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
