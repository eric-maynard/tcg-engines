/**
 * Ruling b928d9e0a3fc16f0 — Portal Rescue (OGN-102 → ogn-102-298) · Spell · Mind · 3+[mind] · Action
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *   × Vanguard Captain (OGN-218 → ogn-218-298) · Unit · Order · 3 · 3 Might
 *     "[Legion] — When you play me, play two 1 Might Recruit unit tokens here."
 *   × Viktor, Innovator (OGN-117 → ogn-117-298) · Unit · Mind · 3 Might
 *     "When you play a card on an opponent's turn, play a 1 Might Recruit unit token in your base."
 *
 * Q: On the opponent's turn, with my Viktor in base, I Portal Rescue my own Vanguard Captain. Do I get Legion, and how
 *    many Recruits do I end up with?
 * A: Legion is on: the Captain is played during Portal Rescue's resolution and is the SECOND card played this turn.
 *    Total 4 Recruits — Viktor triggers twice (Portal Rescue, Captain) and Legion makes two more. If Portal Rescue is
 *    countered, nothing executes: the Captain never leaves and there are no Viktor triggers.
 * Rules: 724 (Legion — another card played this turn), 350/419 (an effect that "plays" a card plays it), 383 (triggers
 *        are put on the chain after the resolving spell finishes), 425.1 (countered → no instructions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PORTAL_RESCUE = "ogn-102-298";
const VANGUARD_CAPTAIN = "ogn-218-298";
const VIKTOR_INNOVATOR = "ogn-117-298";
const WIND_WALL = "ogn-064-298"; // Reaction · 3+[calm][calm] · "Counter a spell."

/**
 * P2's turn (the opponent's). P1: Viktor in base; Vanguard Captain + Buddy holding bf1; Portal Rescue with exactly
 * 3+[mind]. P2: a 4-Might Attacker in base and Wind Wall with exactly 3+[calm][calm].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VANGUARD_CAPTAIN, "captain")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", VIKTOR_INNOVATOR, "viktor")
    .unit(P2, "base", { might: 4, name: "Attacker" }, "attacker")
    .hand(P1, PORTAL_RESCUE, "portal")
    .hand(P2, WIND_WALL, "windwall");
}

const recruitsIn = (game: Game, loc: "base" | "bf1") => game.p1.units(loc).filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

/** P2 attacks bf1 and passes Focus; P1 (Focus, empty chain) casts Portal Rescue on the Captain. */
async function portalRescueOnCaptain(game: Game): Promise<void> {
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p2.move("attacker", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("portal", { targets: "captain" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "portal", controller: P1, targets: ["captain"] })]);
}

describe("Ruling b928d9e0a3fc16f0 — Portal Rescue on your own Vanguard Captain on the opponent's turn: Legion on, 4 Recruits", () => {
  test("Portal Rescue resolves: the Captain is banished and re-played to P1's base for free; it counts as the SECOND card P1 played this turn, and the resulting triggers (Viktor ×2, Captain's Legion) are put on the chain only after Portal Rescue finished", async () => {
    const game = await board().build();
    await portalRescueOnCaptain(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Portal Rescue resolves completely …
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.p1.banishment()).not.toContain("captain");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // "ignoring its cost"
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Portal Rescue, then the Captain
    // … and only now are the pending triggers on the chain: two Viktor triggers and the Captain's Legion trigger.
    const items = game.chain();
    expect(items.every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(items.map((c) => c.cardId).sort()).toEqual(["captain", "viktor", "viktor"]);
    expect(recruitsIn(game, "base")).toHaveLength(0); // nothing made yet — they are chain items
  });

  test("everything resolves: exactly FOUR Recruit tokens in P1's base (2 from Viktor + 2 from Legion 'here' = the base the Captain was played to); none at bf1", async () => {
    const game = await board().build();
    await portalRescueOnCaptain(game);
    for (let i = 0; i < 16 && !(game.chain().length === 0 && game.decision()?.kind === "action" && game.zoneOf("portal") === "trash"); i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(recruitsIn(game, "base")).toHaveLength(4);
    expect(recruitsIn(game, "bf1")).toHaveLength(0);
    expect(game.p1.units("base").map((id) => game.state(id).name).sort()).toEqual(["Recruit", "Recruit", "Recruit", "Recruit", "Vanguard Captain", "Viktor, Innovator"]);
    expect(game.p1.units("bf1")).toEqual(["buddy"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Portal Rescue COUNTERED (Wind Wall): none of its instructions execute — the Captain never leaves bf1, no re-play, no Legion, and no Viktor trigger at all (a countered spell was not 'played'); zero Recruits", async () => {
    const game = await board().build();
    await portalRescueOnCaptain(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    await game.p2.cast("windwall", { targets: "portal" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.zoneOf("captain")).toBe("battlefield-bf1");
    expect(recruitsIn(game, "base")).toHaveLength(0);
    expect(recruitsIn(game, "bf1")).toHaveLength(0);
    expect(game.p1.units("base")).toEqual(["viktor"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
