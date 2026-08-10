/**
 * Ruling 58fff2824e0b0d56 — Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] "Deal 3 to a unit at a battlefield."
 *   × Falling Star (OGN-029 → ogn-029-298) — same family ("Deal 3 to a unit. Deal 3 to a unit."), cited as another example.
 *
 * Q: When does healing happen around combat — do units heal between a spell's damage and the combat showdown?
 * A: No. Units only heal at end of turn or after a COMBAT ends. Spell/ability damage stays marked through the
 *    showdown, so a smaller attacker can finish off a unit softened by Hextech Ray. When combat ends, lethally
 *    damaged units die and then ALL units everywhere are healed. Playing a spell opens no healing window.
 * Rules: 142 (marked damage persists), 465.2 (combat damage uses current Might, adds to marked damage),
 *        466.1.a.1 (Combat Cleanup: "Heal all Units"), 318 (Cleanup after a chain item — no heal step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn. P2 holds bf1 with a `bruiserMight`-Might Bruiser. P1: 2-Might Poker in base (the "smaller unit"), a
 * 3-Might Bystander in base already carrying 1 damage (a witness for "all units everywhere heal"), Hextech Ray in
 * hand and exactly [1][fury].
 */
function board(bruiserMight = 4) {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: bruiserMight, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
    .unit(P1, "base", { might: 3, name: "Bystander" }, "bystander", { damage: 1 })
    .hand(P1, HEXTECH_RAY, "ray");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Poker attacks bf1 (combat showdown, P1 has Focus); P1 casts Hextech Ray on the Bruiser and it resolves. */
async function attackThenRay(game: Game): Promise<void> {
  await game.p1.move("poker", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "ray")).toBe(true); // spells can be played during combat
  await game.p1.cast("ray", { targets: "bruiser" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Ray resolves
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling 58fff2824e0b0d56 — no healing between a spell's damage and combat; everything heals after combat ends", () => {
  test("premise: the Bystander starts with 1 damage marked and nothing heals it in the open main phase", async () => {
    const game = await board().build();
    expect(game.state("bystander").damage).toBe(1);
    expect(game.state("bruiser").damage).toBe(0);
  });

  test("Hextech Ray cast DURING the showdown: its 3 damage stays marked on the 4-Might Bruiser (no heal window after the spell), the showdown is still the same one, and the Bystander is still damaged", async () => {
    const game = await board().build();
    await attackThenRay(game);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // 3 < 4 — alive
    expect(game.state("bruiser").damage).toBe(3); // persists
    expect(game.state("bystander").damage).toBe(1); // a spell resolving is not a healing window
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.chain()).toEqual([]);
  });

  test("…so the SMALLER 2-Might Poker finishes it: combat adds 2 to the marked 3 (5 ≥ 4) and the Bruiser dies; after combat every unit everywhere is healed (Bystander → 0)", async () => {
    const game = await board().build();
    await attackThenRay(game);
    await game.settle(); // both pass focus → combat damage → resolution
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.trash()).toContain("bruiser");
    // Poker took 4 ≥ 2 from the Bruiser and died too — the point is the Bruiser did not shrug off the Ray damage.
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.state("bystander").damage).toBe(0); // 466.1.a.1 — Heal all Units
    expect(game.violations()).toEqual([]);
  });

  test("same with the Ray cast in the main phase BEFORE attacking: the 3 damage is still there when Poker walks in, and the Bruiser dies in that combat", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "bruiser" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("bruiser").damage).toBe(3); // no heal between the spell and the attack
    expect(game.state("bystander").damage).toBe(1);
    await game.p1.move("poker", "bf1");
    expect(game.state("bruiser").damage).toBe(3); // still marked as the showdown opens
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.state("bystander").damage).toBe(0);
  });

  test("the healing window is the END OF COMBAT: a 6-Might Bruiser takes 3 (Ray) + 2 (Poker) = 5 < 6, survives, and is healed to 0 once combat resolves — as is the Bystander in P1's base", async () => {
    const game = await board(6).build();
    await attackThenRay(game);
    expect(game.state("bruiser").damage).toBe(3);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser").damage).toBe(0); // healed after combat
    expect(game.zoneOf("poker")).toBe("trash"); // took 6
    expect(game.state("bystander").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with no combat at all the marked damage simply stays until end of turn: Ray in main phase, no attack → Bruiser keeps 3 and Bystander keeps 1 through P1's turn; both are clean next turn", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "bruiser" });
    await game.settle();
    expect(game.state("bruiser").damage).toBe(3);
    expect(game.state("bystander").damage).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0);
  });
});
