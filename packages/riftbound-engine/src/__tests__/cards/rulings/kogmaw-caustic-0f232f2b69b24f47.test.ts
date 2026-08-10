/**
 * Ruling 0f232f2b69b24f47 — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Machine Evangel (OGN-239 → ogn-239-298) · Unit · Order · [5][order] · 4 Might
 *     "[Deathknell] — Play three 1 [Might] Recruit unit tokens into your base."
 *
 * Q: When a unit dies to COMBAT damage, does its Deathknell trigger and resolve right when it is put in the trash
 *    (during the resolution step's "units die" sub-step), or only after the whole resolution step?
 * A: Right away: the Deathknell goes on a (new) chain as the unit hits the trash, players may respond, the chain
 *    resolves fully — and only afterwards does combat continue and damage get cleared. Hence Kog'Maw's Deathknell
 *    can finish off a 5-Might unit still carrying his 1 combat damage, and chained Deathknells (Machine Evangel)
 *    work through the same chain/cleanup system.
 * Rules: 808 / 323.4 / 428.1.a.1.b (Deathknell pending as the unit dies), 466.1–466.2 (combat cleanup: chain from
 *        combat deaths resolves before the result is determined; healing comes later), 330–332 (Closed state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const MACHINE_EVANGEL = "ogn-239-298";

/** P1's turn. P2 holds bf1 with a vanilla 5-Might Brute; Kog'Maw (1) is ready in P1's base. */
function bruteBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", KOGMAW, "kog");
}

/** P1's turn. P2 holds bf1 with Machine Evangel (4); Kog'Maw (1) is ready in P1's base. */
function evangelBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MACHINE_EVANGEL, "evangel")
    .unit(P1, "base", KOGMAW, "kog");
}

/** Kog'Maw attacks bf1; both pass Focus → combat damage is dealt (Kog'Maw dies). Stops at the first chain prompt. */
async function attackAndTradeBlows(game: Game): Promise<void> {
  await game.p1.move("kog", "bf1");
  expect(game.state("kog").combatRole).toBe("attacker");
  await game.p1.passFocus();
  await game.p2.passFocus();
  // A combat-damage assignment is forced here (one unit each side); take it if it is surfaced anyway.
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    if (d?.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute({ ...d.defaultAllocation });
    }
  }
}

const recruitsOf = (game: Game) => game.p2.base().filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

describe("Ruling 0f232f2b69b24f47 — combat-death Deathknells chain and resolve before damage is cleared", () => {
  test("Kog'Maw (1) into Brute (5): combat damage kills Kog'Maw; his Deathknell is immediately ON THE CHAIN (a new chain inside the resolution step) with a priority window for responses", async () => {
    const game = await bruteBoard().build();
    await attackAndTradeBlows(game);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // players may respond (Closed state)
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
  });

  // Expected: the Deathknell chain is created and resolved during the "units die" sub-step, BEFORE the combat
  // cleanup heals anyone — so while Kog'Maw's trigger waits on the chain the Brute still carries the 1 combat
  // damage Kog'Maw dealt. Actual: the engine heals all units (Brute damage 0) before opening the Deathknell's
  // priority window.
  test.failing("BUG: ruling 0f232f2b69b24f47 — engine clears combat damage BEFORE the Deathknell chain: Brute should still show 1 damage while Kog'Maw's trigger is pending", async () => {
    const game = await bruteBoard().build();
    await attackAndTradeBlows(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", triggered: true })]);
    expect(game.state("brute").damage).toBe(1); // NOT yet healed — the resolution step has not finished
  });

  // Expected: 1 (combat, uncleared) + 4 (Deathknell) ≥ 5 → Brute dies; bf1 ends with no units. Actual: Brute was
  // already healed, takes only 4 < 5 and survives; P2 keeps bf1.
  test.failing("BUG: ruling 0f232f2b69b24f47 — the Deathknell's 4 onto the still-damaged Brute (1 + 4 ≥ 5) should KILL it; engine healed first so Brute survives", async () => {
    const game = await bruteBoard().build();
    await attackAndTradeBlows(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    // Nobody has units left at bf1: no winner, no conquer, bf1 no longer P2's.
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 0f232f2b69b24f47 says the Brute carrying 1 combat damage dies to the Deathknell's 4
  // while an undamaged 5-Might Bystander survives; CR 466.1.a.1 fixes the combat-cleanup order as 3a queue the
  // Deathknell, 3b kill, 3c heal ALL units, and only rule 466.2 then resolves that chain — so the combat damage is
  // gone before the Deathknell's 4 lands and BOTH 5-Might units survive. Engine follows CR.
  test("both 5-Might units survive the Deathknell (CR): combat damage is healed in step 3c before the chain resolves", async () => {
    const game = await bruteBoard().unit(P2, "bf1", { might: 5, name: "Bystander" }, "bystander").build();
    // Kog'Maw (attacker, P1) assigns his 1 damage among Brute/Bystander — put it on Brute.
    game.script(P1, [(d) => (d.kind === "distribute" ? { allocation: { brute: 1 }, kind: "distribute" } : undefined)]);
    await game.p1.move("kog", "bf1");
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // healed first, so only 4 < 5
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1"); // 0 + 4 < 5
    expect(game.state("brute").damage).toBe(4);
    expect(game.state("bystander").damage).toBe(4);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("chained Deathknells: Kog'Maw (1) into Machine Evangel (4) — Evangel takes 1, kills Kog'Maw; Kog'Maw's Deathknell (4) then kills the damaged Evangel, whose own Deathknell gives P2 three 1-Might Recruit tokens in base", async () => {
    const game = await evangelBoard().build();
    expect(recruitsOf(game)).toEqual([]);
    await attackAndTradeBlows(game);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", triggered: true })]);
    expect(game.zoneOf("evangel")).toBe("battlefield-bf1"); // alive while Kog'Maw's trigger is pending
    // Resolve Kog'Maw's Deathknell (4 ≥ Evangel's 4 either way) → Evangel dies → its Deathknell goes on the chain next.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "kog"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "evangel", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ controller: P2, isToken: true, might: 1, zone: "base" });
    }
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
