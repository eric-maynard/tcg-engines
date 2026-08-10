/**
 * Ruling 7dd396ee7237afaf — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · [5][calm] · 5 Might "[Tank] When you play me to a battlefield,
 *   you may move an enemy unit to here. When I hold, return me to my owner's hand."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: Blitzcrank is played (to a battlefield I hold) and pulls an enemy unit into combat. Can the opponent Ride the Wind another
 *    unit into that battlefield, and what happens to combat?
 * A: The pulled unit's controller is the ATTACKER there and receives Focus first, so they may play Ride the Wind (an Action) to
 *    move another unit in. Its target is chosen on play. Only one Action per chain (it must start it) — responses are Reactions.
 *    When Ride the Wind resolves mid-showdown no damage step happens then; Focus keeps passing until both pass.
 * Rules: 450 / 464.2.c (unit moved onto a held battlefield → its controller attacks), 464.4 (attacker has Focus first),
 *        309.1.a (chain open → Reactions only), 355.5 (targets on play), 465 (damage only when the showdown's chain-less passes complete).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const RIDE_THE_WIND = "ogn-173-298";
const CLEAVE = "ogn-004-298"; // an Action P1 might want to answer with (illegal on an open chain)
const DISCIPLINE = "ogn-058-298"; // a Reaction P1 may answer with

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P1's turn. P1 holds bf1 with a Sentinel (3) and has Blitzcrank + [5][calm] (+[3] spare for Cleave/Discipline).
 * P2 has Raider (3) and Pal (2) in base and Ride the Wind + [2][chaos].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 8, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** P1 plays Blitzcrank to bf1, accepts the hook and pulls the Raider in; the trigger resolves → combat at bf1. */
async function blitzHooksRaider(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("raider");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
  expect(game.locationOf("raider")).toBe("bf1");
  return game;
}

describe("Ruling 7dd396ee7237afaf — Blitzcrank's hook makes the opponent the attacker with Focus; they may Ride the Wind another unit in", () => {
  test("after the hook a COMBAT showdown opens at bf1 with P2 (the pulled Raider's controller) as attacker — and P2 receives Focus first, on P1's turn", async () => {
    const game = await blitzHooksRaider();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("with Focus P2 may play Ride the Wind (an Action) — its target (Pal) is chosen as it is played and shows on the chain item", async () => {
    const game = await blitzHooksRaider();
    expect(game.p2.can("cast", "rtw")).toBe(true);
    await game.p2.cast("rtw", { targets: "pal" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, targets: ["pal"] })]);
  });

  test("only one Action per chain: with Ride the Wind on the chain P1 may respond with a Reaction (Discipline) but NOT with another Action (Cleave)", async () => {
    const game = await blitzHooksRaider();
    await game.p2.cast("rtw", { targets: "pal" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    expect(game.p1.can("cast", "disc")).toBe(true);
  });

  test("Ride the Wind resolves mid-showdown: Pal arrives at bf1 ready as another attacker, NO damage is assigned at that point, and Focus continues (back and forth) in the still-open showdown", async () => {
    const game = await blitzHooksRaider();
    await game.p2.cast("rtw", { targets: "pal" });
    for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("battlefield-bf1");
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("pal")).toBe("bf1");
    expect(game.state("pal")).toMatchObject({ combatRole: "attacker", isReady: true });
    for (const u of ["pal", "raider", "blitz", "sentinel"]) {
      expect(game.state(u).damage).toBe(0);
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("once both players pass with nothing pending, combat damage is finally dealt: attackers 3+2 into Tank Blitzcrank (5) — Blitzcrank dies, both attackers die to 8, P1 keeps bf1", async () => {
    const game = await blitzHooksRaider();
    await game.p2.cast("rtw", { targets: "pal" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
      await game.settle();
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("trash"); // [Tank]: the 5 attacking damage must go to him first — exactly lethal
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
