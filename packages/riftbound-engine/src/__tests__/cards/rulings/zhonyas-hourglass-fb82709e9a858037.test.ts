/**
 * Ruling fb82709e9a858037 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can I let my units at a battlefield die and only THEN flip the hidden Zhonya's there, so the units die but
 *    Zhonya's still makes it to base?
 * A: Yes — during a COMBAT showdown. If my last unit there is killed by a spell/ability mid-showdown I still control
 *    the battlefield until the showdown ends, Focus keeps passing back and forth, so I can flip Zhonya's at Reaction
 *    speed when I next have priority (before the end-of-combat cleanup removes hidden cards); it goes to base.
 * Rules: 190.4.b (control frozen while a combat is ongoing there), 811 (Hidden play), 323.7 (facedown cleanup),
 *        466.5 (combat with no defenders left → attacker conquers at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn. P1: lone Guard (3) at bf1 + Zhonya's facedown there. P2: Raider (4) in base, Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, BOLT, "bolt");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1 (combat showdown, P2 has Focus); P2 Bolts the Guard; P1 lets it resolve WITHOUT flipping. */
async function guardDiesToBoltMidCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("bolt", { targets: "guard" });
  await game.p2.passPriority();
  expect(game.p1.can("reveal", "zhonya")).toBe(true); // could save it here — but chooses not to
  await game.p1.passPriority(); // Bolt resolves: Guard dies
  expect(game.zoneOf("bolt")).toBe("trash");
  expect(game.zoneOf("guard")).toBe("trash");
  return game;
}

describe("Ruling fb82709e9a858037 — last defender killed by a spell mid-combat: the defender keeps the battlefield until the showdown ends and may still flip Zhonya's", () => {
  test("after the Guard dies to Bolt the combat showdown is STILL open at bf1, P1 STILL controls bf1, and the facedown Zhonya's is still there (not cleaned up)", async () => {
    const game = await guardDiesToBoltMidCombat();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("Focus passes on: when P1 next holds it, revealing Zhonya's is LEGAL; it is played for [0] and ends up in P1's base — the Guard stays dead (nothing to replace any more)", async () => {
    const game = await guardDiesToBoltMidCombat();
    // Drive passes until P1 is the acting seat inside the showdown.
    for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(showdown(game)?.active).toBe(true);
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.gear()).toContain("zhonya");
    expect(game.zoneOf("guard")).toBe("trash");
    // The showdown then ends with no defender: Raider takes bf1.
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 never flips it, the showdown closes, P2 conquers bf1 and the orphaned facedown Zhonya's is trashed", async () => {
    const game = await guardDiesToBoltMidCombat();
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("zhonya")).toBe("trash");
  });
});
