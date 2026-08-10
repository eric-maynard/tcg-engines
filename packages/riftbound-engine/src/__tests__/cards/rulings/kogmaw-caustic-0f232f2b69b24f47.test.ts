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

  // RULING-CONFLICT: riftjudge 0f232f2b69b24f47 has the Brute still carrying Kog'Maw's 1 combat damage while the
  // Deathknell waits on the chain; CR 466.1.a.1 fixes the combat-cleanup order as 3a queue the Deathknell, 3b kill,
  // 3c heal ALL units, with rule 466.2 resolving that chain only afterwards — so the damage is already gone when the
  // priority window opens. Engine follows CR.
  test("CR 466.1.a.1 (contra the ruling) — combat damage is healed in step 3c, before the queued Deathknell's priority window: the Brute shows 0 damage while Kog'Maw's trigger is pending", async () => {
    const game = await bruteBoard().build();
    await attackAndTradeBlows(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", triggered: true })]);
    expect(game.state("brute").damage).toBe(0); // healed in 466.1.a.1 step 3c
  });

  // RULING-CONFLICT (same ruling, downstream): riftjudge expects 1 (uncleared combat damage) + 4 ≥ 5 to kill the
  // Brute; under CR 466.1.a.1 step 3c the combat damage is gone first, so the Deathknell's 4 alone is < 5 and the
  // Brute survives at 4 damage, keeping bf1 for P2. Engine follows CR.
  test("CR 466.1.a.1 (contra the ruling) — the Deathknell's 4 lands on an already-healed Brute (4 < 5): it survives and P2 keeps bf1", async () => {
    const game = await bruteBoard().build();
    await attackAndTradeBlows(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(4);
    // The Brute holds bf1 alone: P1 conquers nothing and P2 keeps the battlefield it already held.
    expect(game.cardsAt("bf1")).toEqual(["brute"]);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
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
