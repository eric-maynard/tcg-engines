/**
 * Ruling 991ed1b4cdcb7c57 — Mutated Mouser (UNL-036 → unl-036-219, 1 Might: "[Shield 2] [Tank]") × Charm (OGN-043 →
 *   ogn-043-298, [1][calm]: "Move an enemy unit.") × Sharkling (UNL-006 → unl-006-219, 1 Might: "[Accelerate] [Assault 4]")
 *
 * Q: I have Mutated Mouser at my battlefield and Charm an enemy Sharkling into it — who attacks, who defends?
 * A: The Sharkling (moved onto a battlefield you control) is the attacker — even though your spell moved it — and you,
 *    the controller, defend. The attacking player becomes the showdown's active player with Focus/priority first.
 *    Sharkling's [Assault 4] is on (attacker), Mouser's [Shield 2] is on (defender), and [Tank] means combat damage must
 *    be assigned to the Mouser first.
 * Rules: 464.2 (the unit applying Contested attacks; the controller defends), 341/347 (attacker gets Focus first),
 *        807 (Assault), 727 (Shield), 731 / 465.2.c.5 (Tank).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MUTATED_MOUSER = "unl-036-219";
const CHARM = "ogn-043-298";
const SHARKLING = "unl-006-219";

/** P1's turn, [1][calm]. P1 holds bf1 with Mutated Mouser (+ optional Buddy); P2's Sharkling idles in P2's base; P1 holds Charm. */
function board(withBuddy: boolean) {
  const b = scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MUTATED_MOUSER, "mouser")
    .unit(P2, "base", SHARKLING, "shark")
    .hand(P1, CHARM, "charm");
  return withBuddy ? b.unit(P1, "bf1", { might: 3, name: "Buddy" }, "buddy") : b;
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Charm the Sharkling into bf1 and let Charm resolve. */
async function charmSharkIn(withBuddy: boolean): Promise<Game> {
  const game = await board(withBuddy).build();
  expect(game.state("shark").might).toBe(1);
  expect(game.state("mouser").might).toBe(1);
  await game.p1.cast("charm", { targets: "shark" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  await game.acting().pass();
  await game.acting().pass();
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("shark")).toBe("bf1");
  return game;
}

describe("Ruling 991ed1b4cdcb7c57 — a Charmed-in Sharkling ATTACKS my Mouser's battlefield; I defend", () => {
  test("designations: Sharkling = attacker (P2 is the attacking player), Mouser = defender (P1, the controller, defends); bf1 stays P1's while contested", async () => {
    const game = await charmSharkIn(false);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("shark").combatRole).toBe("attacker");
    expect(game.state("mouser").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("the ATTACKING player (P2) becomes the showdown's active player: Focus and the first decision are P2's, on P1's turn", async () => {
    const game = await charmSharkIn(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("keywords follow the designations: Sharkling has [Assault 4] live (1 → 5), Mouser has [Shield 2] live (1 → 3)", async () => {
    const game = await charmSharkIn(false);
    expect(game.state("shark").might).toBe(5);
    expect(game.state("mouser").might).toBe(3);
  });

  test("[Tank]: with Buddy (3) beside the Mouser, Sharkling's 5 combat damage must go to the Mouser first (3 lethal, only 2 left for Buddy) — Mouser dies, Buddy lives; the defenders' 6 kill the Sharkling and P1 keeps bf1", async () => {
    const game = await charmSharkIn(true);
    await game.p2.passFocus();
    await game.p1.passFocus();
    // If the attacker is asked to split damage, Tank pins the Mouser as the first recipient.
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.seat).toBe(P2);
      expect((await game.p2.try((p) => p.distribute({ buddy: 3, mouser: 2 }))).ok).toBe(false); // can't skip the Tank
      await game.p2.distribute({ buddy: 2, mouser: 3 });
    }
    await game.settle();
    expect(game.zoneOf("mouser")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.zoneOf("shark")).toBe("trash"); // 3 + 3 = 6 ≥ 5
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
