/**
 * Ruling 3b71c390ca124617 — Wuju Bladesman - Starter (OGS-019 → ogs-019-024) · Legend (Yi)
 *     "While a friendly unit defends alone, it gets +2 [Might]."
 *   × Mutated Mouser (unl-036-219) · 1 Might · "[Shield 2] [Tank]" — the lone defender.
 *   × Crackshot Corsair (ogn-130-298) · 3 Might · "When I attack, deal 1 to an enemy unit here." — an attack trigger.
 *
 * Q: When do Shield and the Yi legend's bonus switch on — before or after attack/defend triggers resolve?
 * A: As soon as the unit gains the Defender designation, which happens when combat opens — BEFORE the attack/defend
 *    triggers on the initial combat chain resolve. (Yi additionally needs the unit to defend alone; Shield does not.)
 * Rules: 464.2.c.3 (designations assigned as combat opens) → 464.2.e (only then are triggers added to the chain),
 *        814.1.d (Shield while a Defender), 364.3 (Yi's "while" passive is continuous).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WUJU = "ogs-019-024";
const MUTATED_MOUSER = "unl-036-219";
const CRACKSHOT_CORSAIR = "ogn-130-298";

/** P2's turn. P1 (Yi legend) holds bf1 with a lone Mutated Mouser (1, Shield 2); P2's Crackshot Corsair (3) is ready in base. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU, "yi")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MUTATED_MOUSER, "mouser")
    .unit(P2, "base", CRACKSHOT_CORSAIR, "corsair");
}

describe("Ruling 3b71c390ca124617 — Shield and Yi's +2 are live the moment the Defender designation lands, before the attack trigger resolves", () => {
  test("outside combat the parked Mouser is its printed 1 (no designation → no Shield, no Yi)", async () => {
    const game = await board().build();
    expect(game.state("mouser")).toMatchObject({ combatRole: null, might: 1 });
  });

  test("Corsair attacks: with its 'When I attack' trigger still UNRESOLVED on the chain, the Mouser is already a Defender at 1 + 2 (Shield) + 2 (Yi, alone) = 5", async () => {
    const game = await board().build();
    await game.p2.move("corsair", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", controller: P2, triggered: true })]);
    expect(game.state("corsair")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state("mouser")).toMatchObject({ combatRole: "defender", damage: 0, might: 5 });
  });

  test("so the trigger's 1 damage lands on a 5-Might defender (survives), and in combat 3 → Mouser (4 total < 5, lives) while 5 → Corsair kills it; P1 keeps bf1 — had the bonuses come 'after triggers', the 1-Might Mouser would have died to the ping", async () => {
    const game = await board().build();
    await game.p2.move("corsair", "bf1");
    await game.p2.passPriority();
    await game.p1.passPriority(); // the attack trigger resolves
    expect(game.state("mouser")).toMatchObject({ damage: 1, might: 5, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.zoneOf("mouser")).toBe("battlefield-bf1");
    expect(game.state("mouser")).toMatchObject({ combatRole: null, damage: 0, might: 1 }); // healed, bonuses off after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Yi needs 'alone', Shield does not: with a second friendly defender the Mouser is 1 + 2 (Shield only) = 3 while the trigger is pending", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p2.move("corsair", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("mouser"); // the Corsair's "an enemy unit here" now has two candidates
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", triggered: true })]);
    expect(game.state("mouser")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("buddy")).toMatchObject({ combatRole: "defender", might: 2 });
  });
});
