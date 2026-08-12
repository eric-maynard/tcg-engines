/**
 * Ruling 8fefeab5f4f7907a — does the combat heal come before or after [Deathknell]?
 *   Cards: Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1 [Might] "[Deathknell] — Deal 4 to all units at
 *     my battlefield." × an inline 5-Might survivor standing next to him.
 *
 * Q: In a close showdown, do units heal before or after Deathknell abilities resolve?
 * A: Before. Deathknell triggers are only QUEUED during the Combat Cleanup; the Cleanup finishes —
 *    including "heal all units" — and the chain resolves afterwards. So the Deathknell's damage lands
 *    on a unit whose combat damage has already been wiped.
 * Rules: 466.1 / 466.1.a.1 (Combat Cleanup inserts "3c. Heal all Units"), 808.1.d.2 ([Deathknell]
 *    triggers are added as Pending Items during cleanup), 320/320.1 (nothing resolves inside a
 *    Cleanup), 466.2 (the chain from the damage step and the cleanup resolves next).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW_CAUSTIC = "ogn-190-298";

/** P2's turn. P1 defends bf1 with Kog'Maw (1) and a 5-Might survivor; P2 attacks with a 3-Might raider. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KOGMAW_CAUSTIC, "kogmaw")
    .unit(P1, "bf1", { might: 5, name: "Survivor" }, "survivor")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Attack, pass focus both ways, and assign 1 (lethal) to Kog'Maw and 2 to the survivor. */
async function fight(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  await game.p2.distribute({ kogmaw: 1, survivor: 2 });
  return game;
}

describe("Ruling 8fefeab5f4f7907a — units heal first, then the Deathknell resolves", () => {
  test("Kog'Maw dies to its 1 lethal damage; the survivor's 2 is not lethal on 5", async () => {
    const game = await fight();
    await game.settle();
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.zoneOf("survivor")).toBe("battlefield-bf1");
  });

  test("the survivor ends on 4 damage — exactly the Deathknell's 4, with the 2 combat damage already healed away", async () => {
    const game = await fight();
    await game.settle();
    // 2 (combat) + 4 (Deathknell) would be 6 ≥ 5 and lethal. The survivor is alive on 4, which is
    // only possible if the heal ran BEFORE the Deathknell resolved.
    expect(game.state("survivor")).toMatchObject({ damage: 4, might: 5 });
  });

  test("the Deathknell really did resolve — it is not that it was skipped", async () => {
    const game = await fight();
    await game.settle();
    expect(game.state("survivor").damage).toBe(4); // the 4 landed
    expect(game.chain()).toEqual([]);
  });

  test("P1 keeps the battlefield: the survivor is still standing when control is settled", async () => {
    const game = await fight();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 1 + 5 combat damage on a 3-Might raider
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the Deathknell damage is real marked damage — it persists after the combat and clears only at the next heal (end of turn)", async () => {
    const game = await fight();
    await game.settle();
    expect(game.state("survivor").damage).toBe(4); // still marked once the combat is over
    await game.advanceTurn(); // the Ending Phase heal — the other time units heal
    expect(game.state("survivor").damage).toBe(0);
    expect(game.zoneOf("survivor")).toBe("battlefield-bf1");
  });
});
