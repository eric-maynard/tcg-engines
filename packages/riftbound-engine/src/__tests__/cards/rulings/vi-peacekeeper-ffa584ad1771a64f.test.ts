/**
 * Ruling ffa584ad1771a64f — Vi, Peacekeeper (UNL-176 → unl-176-219) · Champion Unit · Order · [5][order] · 5 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) When I attack, [Stun] an enemy
 *      unit here."
 *   (× Hidden Blade OGN-213 → ogn-213-298 — cited only as the "remove her in response and the stun fails" caveat, which
 *    ruling 53dd52983a776d06 covers.)
 *
 * Q: I moved into an occupied battlefield and am the attacker. If I now play Vi, Peacekeeper (Ambush), is she attacking
 *    too, and can she stun a unit?
 * A: Yes. Played into the ongoing combat she joins it on my side and gains the Attacker designation; gaining it fulfils
 *    "When I attack", the trigger goes on the chain and — if she is still there when it resolves — stuns an enemy unit
 *    at that battlefield. It happens once, when she becomes an attacker.
 * Rules: Ambush (Reaction-speed play to a battlefield where you have units), 464.2.c.3 (late arrival gains its side's
 *        designation), 383.4.e (attack trigger on gaining Attacker), 359.3.f ("here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-176-219";

/** P1's turn with exactly [5][order]. P1's Scout (2) ready in base, Vi in hand. P2 holds bf1 with Grunt (3) and Pal (2). */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, VI, "vi");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout attacks bf1 (combat showdown, P1 has Focus); P1 ambushes Vi into bf1 and aims her stun at the Grunt. */
async function ambushVi(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.state("scout").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "vi")).toBe(true);
  const where = (game.p1.option("playUnit", "vi")?.fields.find((f) => f.name === "location")?.options ?? []) as string[];
  expect(where).toContain("battlefield-bf1"); // Ambush: to a battlefield where you have units
  await game.p1.play("vi", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.source?.cardId).toBe("vi");
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["grunt", "pal"]); // "an enemy unit here"
      await game.p1.pick("grunt");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling ffa584ad1771a64f — Vi ambushed into my attack is an attacker and her stun trigger fires", () => {
  test("mid-combat Ambush: Vi enters bf1, is designated an ATTACKER, and her 'When I attack' trigger is on the chain naming the Grunt", async () => {
    const game = await ambushVi();
    expect(game.zoneOf("vi")).toBe("battlefield-bf1");
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, targets: ["grunt"], triggered: true })]);
    expect(game.state("grunt").isStunned).toBe(false); // not before it resolves
  });

  test("nobody removes her: the trigger resolves and the Grunt IS stunned; the showdown is still the same combat at bf1", async () => {
    const game = await ambushVi();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").isStunned).toBe(true);
    expect(game.state("pal").isStunned).toBe(false);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("it triggers exactly ONCE: through the rest of the combat no second Vi item appears; the stunned Grunt deals no damage, so Scout (2) + Vi (5) = 7 beat Grunt (3) + Pal (2) taking only Pal's 2, and P1 conquers bf1", async () => {
    const game = await ambushVi();
    let viItems = 0;
    for (let i = 0; i < 12; i++) {
      viItems = Math.max(viItems, game.chain().filter((c) => c.cardId === "vi").length);
      const d = game.decision();
      if (d?.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(viItems).toBe(1);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("vi")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
