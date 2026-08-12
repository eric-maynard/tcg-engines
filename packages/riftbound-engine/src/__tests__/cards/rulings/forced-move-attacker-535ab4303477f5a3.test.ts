/**
 * Ruling 535ab4303477f5a3 — Charm (OGN-043 → ogn-043-298) "Move an enemy unit."
 *
 * Q: When an opponent's card forces my unit from one battlefield to a battlefield THEY control, who
 *    gets focus for the first Action/Reaction of the resulting showdown?
 * A: The player whose unit was forced to move. That unit is the one that applied Contested, so its
 *    controller is the ATTACKER of the new showdown and takes Focus first — even though it is the
 *    opponent's turn and the opponent cast the spell.
 * Rules: 445 (the arriving unit applies Contested), 464.2 (attacker designation),
 *        345 (Focus goes to the player who applied Contested).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** [Reaction] "Give a unit +1 [Might] this turn." — something for the forced player to actually cast. */
const BRACE = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Brace",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

function activeShowdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** P2's turn. P1 holds bf1 (Victim + Anchor); P2 holds bf2 with a Guard and casts Charm on the Victim. */
async function forced(): Promise<Game> {
  const game = await scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .hand(P2, CHARM, "charm")
    .hand(P1, BRACE, "brace")
    .build();
  await game.p2.cast("charm", { targets: "victim" });
  // The destination is a choice of the spell's controller, made at finalization (355.4).
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
  await game.p2.pick("battlefield-bf2");
  await game.p2.passPriority();
  await game.p1.passPriority(); // Charm resolves
  expect(game.locationOf("victim")).toBe("bf2");
  return game;
}

describe("Ruling 535ab4303477f5a3 — the forced mover's controller is the attacker and gets Focus first", () => {
  test("the showdown at bf2 designates P1 (whose unit was moved) as the attacker, and P2 as the defender", async () => {
    const game = await forced();
    const showdown = activeShowdown(game);
    expect(showdown?.battlefieldId).toBe("bf2");
    expect(showdown?.attackingPlayer).toBe(P1);
    expect(showdown?.defendingPlayer).toBe(P2);
    expect(showdown?.isCombatShowdown).toBe(true);
  });

  test("Focus is P1's even though it is P2's turn and P2 cast the spell — P1 acts first", async () => {
    const game = await forced();
    expect(game.turnPlayer()).toBe(P2);
    expect(activeShowdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "brace")).toBe(true);
    await game.p1.cast("brace", { targets: "victim" });
    await game.settle();
    // 3 + 1 = 4 vs the 4-Might Guard: both are lethal to each other, so both die and nobody holds bf2.
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the unit really left P1's own battlefield: bf1 keeps its Anchor and stays P1's", async () => {
    const game = await forced();
    expect(game.p1.units("bf1")).toEqual(["anchor"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
