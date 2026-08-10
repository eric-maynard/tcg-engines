/**
 * Ruling bf4b8fd7e8d646d9 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Champion Unit · Calm · 5+[calm] · 5 Might
 *     "[Tank] When you play me to a battlefield, you may move an enemy unit to here. When I hold, return me to my owner's hand."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · 1+[calm] "Move an enemy unit."
 *
 * Q: When Blitzcrank yoinks an enemy unit to MY battlefield, do my units get defender bonuses like Shield?
 * A: Yes — same as Charm. You control the battlefield; the pulled unit's controller is now contesting it (involuntarily but
 *    still contesting), so they are the attacker and your units there are defenders (Shield applies).
 * Rules: 454 / 190.4 (an opposing unit arriving at a battlefield you control contests it → combat), 464.2 (attacker =
 *        contesting player's units, defender = controller's units), 812 (Shield: +1 Might while a defender).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bf1 with a 2-Might Shieldbearer ([Shield]). P2 has Raider (4) and Scout (1) in base. P1: Blitzcrank + Charm in hand, [6]+[calm][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { keywords: ["Shield"], might: 2, name: "Shieldbearer" }, "sb")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P1, CHARM, "charm");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Play Blitzcrank to bf1, say yes, pick the Raider, resolve the trigger. Stops in the resulting showdown. */
async function blitzPullsRaider(game: Game): Promise<void> {
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "blitz" } });
  await game.p1.yes();
  let picked = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["raider", "scout"]); // enemy units only
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "raider")!.key);
      picked = true;
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(picked).toBe(true);
  expect(game.locationOf("raider")).toBe("bf1");
}

describe("Ruling bf4b8fd7e8d646d9 — a unit pulled onto your battlefield is the ATTACKER; your units defend and get Shield", () => {
  test("Blitzcrank played to bf1 pulls the Raider there: bf1 (still P1's) becomes contested BY P2, a combat showdown opens with P2 attacking and P1 defending", async () => {
    const game = await board().build();
    await blitzPullsRaider(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
    expect(game.state("sb").combatRole).toBe("defender");
    // The (involuntary) attacker is the contesting player and holds Focus first.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("defender bonuses apply: the Shieldbearer is 2 → 3 while defending against the pulled Raider (and Blitzcrank's Tank makes him soak first)", async () => {
    const game = await board().build();
    expect(game.state("sb").might).toBe(2);
    await blitzPullsRaider(game);
    expect(game.state("sb")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("blitz")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.state("blitz").keywords).toContain("Tank");
  });

  test("the combat then resolves normally: Raider (4) deals 4 into Tank Blitzcrank (5, survives), takes 5+3 = 8 and dies; P1 keeps bf1", async () => {
    const game = await board().build();
    await blitzPullsRaider(game);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
    expect(game.zoneOf("sb")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("sb").might).toBe(2); // Shield only while defending
    expect(game.violations()).toEqual([]);
  });

  test("'works the same way as Charm': Charm moving the Raider onto bf1 likewise makes P2 the attacker and the Shieldbearer a 3-Might defender", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "raider" });
    for (let i = 0; i < 8 && game.zoneOf("charm") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? "battlefield-bf1");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? "battlefield-bf1");
    }
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("sb")).toMatchObject({ combatRole: "defender", might: 3 });
  });
});
