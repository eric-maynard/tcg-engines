/**
 * Ruling 5dfde12a5397fc7b — Cleave (OGN-004 → ogn-004-298) · Action · [1] · "Give a unit [Assault 3] this turn. (+3 [Might] while
 *     it's an attacker.)"
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Kai'Sa, Survivor (ogn-039-298) 4 Might "When I conquer, draw 1."  × Watchful Sentry (ogn-096-298) 1 Might "[Deathknell] — Draw 1."
 *
 * Q: Kai'Sa (Cleave'd, so 7 while attacking) attacks the Sentry's battlefield; the opponent Void Seekers her for 4. She conquers —
 *    does the damage stay on her so that she dies when she drops back to 4 Might after the showdown?
 * A: No, she survives. Damage is cleared in the combat cleanup at the end of the showdown, BEFORE her attacker status (and with it
 *    Assault's +3) goes away. Sequence: attack → Void Seeker → Sentry dies, conquer, draw 1 → cleanup heals Kai'Sa → attacker
 *    status removed (back to 4) → alive.
 * Rules: 466.1.a.1 (combat cleanup heals all units) before 466.7 (combat roles/Assault end), 801 (Assault), 428 (lethal damage check).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const VOID_SEEKER = "ogn-024-298";
const KAISA_SURVIVOR = "ogn-039-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn: Kai'Sa ready in base, Cleave + [1]. P2 holds bf1 with Watchful Sentry and has Void Seeker + [3][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, VOID_SEEKER, "vs");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cleave Kai'Sa, attack bf1, P1 passes Focus, P2 Void Seekers Kai'Sa and the spell resolves (showdown still open). */
async function cleaveAttackSeeker(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "kaisa" });
  await game.settle();
  expect(game.state("kaisa").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("kaisa").might).toBe(4); // not attacking yet
  await game.p1.move("kaisa", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.state("kaisa")).toMatchObject({ combatRole: "attacker", might: 7 });
  // Drain any initial chain, then P1 (Focus) passes and P2 plays Void Seeker at Kai'Sa.
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("vs", { targets: "kaisa" });
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("vs")).toBe("trash");
  return game;
}

describe("Ruling 5dfde12a5397fc7b — Cleave'd Kai'Sa survives Void Seeker: combat cleanup heals before Assault falls off", () => {
  test("mid-showdown: Void Seeker marks 4 damage on Kai'Sa, who is 7 Might while attacking (4 + Assault 3) and therefore stays on the board", async () => {
    const game = await cleaveAttackSeeker();
    expect(game.state("kaisa")).toMatchObject({ combatRole: "attacker", damage: 4, might: 7, zone: "battlefield-bf1" });
    expect(showdown(game)?.active).toBe(true);
  });

  test("combat: the Sentry dies (P2 draws off Deathknell), Kai'Sa conquers bf1 and draws 1; cleanup clears her 4+1 damage, THEN she returns to 4 Might — alive at bf1", async () => {
    const game = await cleaveAttackSeeker();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa")).toMatchObject({ combatRole: null, damage: 0, might: 4 });
    expect(game.p1.trash()).toEqual(["cleave"]); // Kai'Sa is not in it
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // "When I conquer, draw 1"
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Sentry's Deathknell
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("and she is still alive after the turn ends (Assault's 'this turn' grant expires harmlessly)", async () => {
    const game = await cleaveAttackSeeker();
    await game.settle();
    await game.advanceTurn();
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa")).toMatchObject({ damage: 0, grantedKeywords: [], might: 4 });
  });
});
