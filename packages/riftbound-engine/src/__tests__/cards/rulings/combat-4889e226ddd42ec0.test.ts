/**
 * Ruling 4889e226ddd42ec0 — (what happens when neither side wipes the other; no specific card)
 *   Vanilla stand-ins: attackers Raider (4) + a STUNNED Brute (6); defenders Keeper (5) + a STUNNED Sentry (6).
 *   Each side has only its unstunned unit's Might to assign, so neither side can clear the other off the board.
 *
 * Q: If neither side deals enough damage to kill everything opposite, how does combat resolve and who gets
 *    priority?
 * A: Damage is assigned by both sides and dealt simultaneously; survivors stay. The Combat Cleanup then heals
 *    everyone and Recalls the attackers because defenders are still present, which makes the result "No Result" —
 *    and with the attackers recalled no new combat is staged. Nobody conquers and no point is scored.
 * Rules: 465.2.c-d (both sides assign, then damage is dealt simultaneously), 465.3 (the damage step SKIPS the
 *        FEPR process — nobody gets priority between damage and the Resolution Step), 466.1.a.1-2 (heal, then
 *        recall attackers while defenders remain), 466.3.d / 466.3.d.1 (No Result; a restage needs units of both
 *        players still present), 466.5.b (control is settled from who is left).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. P2 holds bf1 with Keeper (5) + stunned Sentry (6); P1 sends in Raider (4) + stunned Brute (6). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Keeper" }, "keeper")
    .unit(P2, "bf1", { might: 6, name: "Sentry" }, "sentry", { stunned: true })
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute", { stunned: true });
}

/** Move both attackers in and let the showdown close; the damage assignments are taken by settle(). */
async function fought(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["raider", "brute"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown" });
  await game.settle();
  return game;
}

describe("Ruling 4889e226ddd42ec0 — survivors on both sides: heal, recall the attackers, No Result, nobody scores", () => {
  test("survivors on both sides: the attackers' 4 cannot make either defender lethal, and the defenders' 5 only reaches the 4-Might Raider — the 6-Might Brute lives", async () => {
    const game = await fought();
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 4 damage ≥ 4 Might
    expect(game.zoneOf("brute")).not.toBe("trash");
    expect(game.state("keeper").damage).toBe(0); // healed in the Combat Cleanup
    expect(game.state("sentry").damage).toBe(0);
  });

  test("the surviving attacker is Recalled to base because defenders are still there, and it comes home healed", async () => {
    const game = await fought();
    expect(game.locationOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["keeper", "sentry"]);
  });

  test("No Result: the defender keeps the battlefield, no new combat is staged there (the attackers are gone), and neither player scores", async () => {
    const game = await fought();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 4889e226ddd42ec0 says that after combat damage "players continue to alternate
  // priority/focus … combat only ends when both players pass priority consecutively"; CR 465.3 ends the Combat
  // Damage Step by SKIPPING the FEPR process and proceeding straight to the Resolution Step, so no priority or
  // Focus is handed out between the damage and the result — engine follows CR.
  test("ruling 4889e226ddd42ec0 (CR-corrected): once the showdown closes there is no further priority window — the damage, the Cleanup and the result run straight through to my open main phase", async () => {
    const game = await fought();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
  });
});
