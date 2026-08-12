/**
 * Ruling 784108ef3259607d — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · Body · [3][body] · 3 Might
 *     "When I attack or defend one on one, double my Might this combat."
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024) · Legend (Yi) · "While a friendly unit defends alone, it
 *     gets +2 [Might]."
 *   × Inferna (UNL-002 → unl-002-219) · 2 Might · "[Ambush] (You may play me as a [Reaction] to a battlefield where
 *     you have units.) [Assault 2]"
 *
 * Q: I attack a buffed Fiora (4 Might) who is the lone defender under Yi's legend. If I then play an Ambush unit,
 *    does her doubling still happen — and does she double the Yi bonus?
 * A: The doubling still happens: the "one on one" condition is checked only when she is designated, and the
 *    trigger is locked in on the initial chain. It doubles whatever her Might is AT RESOLUTION. The riftjudge
 *    answer adds that the arriving Ambush unit strips Yi's +2 first, so 4 doubles to 8.
 * Rules: 383.3 (a trigger's condition is checked when it triggers), 359.3 (values read at resolution),
 *        150.4 (current Might), 806 ([Ambush] is played as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const WUJU_BLADESMAN = "ogs-019-024";
const INFERNA = "unl-002-219";

/** P1's turn. P2's legend is Yi; a buffed Fiora (3 + 1 = 4) holds bf1. P1 has a 5-Might Attacker and Inferna + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .legend(P2, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FIORA, "fiora", { buffed: true })
    .unit(P1, "base", { might: 5, name: "Attacker" }, "atk")
    .hand(P1, INFERNA, "inferna");
}

/** P1 attacks: Fiora becomes the lone defender, Yi's passive switches on, her defend trigger hits the chain. */
async function attackFiora(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
  await game.p1.move("atk", "bf1");
  return game;
}

describe("Ruling 784108ef3259607d — an Ambush unit does not cancel Fiora's doubling; it doubles her Might at resolution", () => {
  test("as the lone defender Fiora picks up Yi's +2 at once (4 → 6) and her 'when I defend' trigger is on the initial chain", async () => {
    const game = await attackFiora();
    expect(game.state("fiora")).toMatchObject({ combatRole: "defender", might: 6 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P2, triggered: true })]);
  });

  test("with that trigger still pending P1 may [Ambush] Inferna in as a Reaction — the trigger is NOT cancelled by the newcomer", async () => {
    const game = await attackFiora();
    await game.p2.passPriority();
    expect(game.p1.can("play", "inferna")).toBe(true);
    await game.p1.play("inferna", { to: "bf1" });
    expect(game.locationOf("inferna")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toContain("fiora"); // still there
  });

  test("her trigger then resolves and doubles her CURRENT Might for the combat", async () => {
    const game = await attackFiora();
    await game.p2.passPriority();
    await game.p1.play("inferna", { to: "bf1" });
    await game.acting().passPriority();
    await game.acting().passPriority(); // the defend trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("inferna").combatRole).toBe("attacker");
    expect(game.state("fiora").might).toBe(12); // 6 (4 + Yi's +2, still applying here) doubled
  });

  test("the doubling lasts the combat and no longer: Fiora survives two attackers and drops back to her 4 afterwards", async () => {
    const game = await attackFiora();
    await game.p2.passPriority();
    await game.p1.play("inferna", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("inferna")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.state("fiora").might).toBe(4); // "this combat" expired
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 784108ef3259607d says the arriving [Ambush] unit strips Yi's +2, so Fiora
  // doubles 4 into 8; CR 740.2.a defines "alone" as no OTHER FRIENDLY unit at the same location, and the
  // newcomer is an ENEMY unit — Fiora is still defending alone — so the +2 stays and 6 doubles into 12
  // (the passing facets above). Engine follows CR. What DOES strip the bonus is a second friendly defender.
  test("rule 740.2.a — an enemy arrival leaves Fiora 'defending alone'; a second FRIENDLY defender is what turns Yi's +2 off", async () => {
    const game = await attackFiora();
    await game.p2.passPriority();
    await game.p1.play("inferna", { to: "bf1" });
    expect(game.state("fiora").might).toBe(6); // an ENEMY unit here does not break "alone"

    // The same attack with a second friendly unit already holding bf1: Fiora is no
    // longer alone, so Yi's passive never switches on and she stays at 4.
    const crowded = await board()
      .unit(P2, "bf1", { might: 2, name: "Second Guard" }, "guard2")
      .build();
    await crowded.p1.move("atk", "bf1");
    expect(crowded.state("fiora").might).toBe(4);
  });
});
