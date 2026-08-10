/**
 * Ruling caeb6b581e6fc094 — Blind Fury (ogn-025-298) × Time Warp (ogn-122-298)
 *   Blind Fury — [Action] · [4][fury][fury]: "Each opponent reveals the top card of their Main Deck. Choose one and
 *   banish it, then play it, ignoring its cost. Then recycle the rest."
 *   Time Warp — Spell · Mind · [10]: "Take a turn after this one. Banish this."
 *
 * Q: I play Blind Fury during a showdown and the revealed card I play is Time Warp — what happens?
 * A: Time Warp resolves normally and QUEUES an extra turn; you don't take it immediately. The current showdown, its
 *    combat and the rest of the turn proceed as usual; only after this turn ends do you take the extra turn.
 * Rules: 734 (additional turn inserted after the current one), 341–348 (showdown continues), 356.1.b.1 (ignoring cost).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const TIME_WARP = "ogn-122-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly [4] + 2 fury (nothing near Time Warp's [10]). P2 holds bf1 with a stunned 2-Might Blocker;
 * P1's 4-Might Raider attacks from base. Time Warp is the top card of P2's Main Deck.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker", { stunned: true })
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BLIND_FURY, "fury")
    .deckTop(P2, TIME_WARP, "warp");
}

/** Raider attacks bf1; drain any initial chain; stop with the combat showdown open and P1 holding Focus. */
async function openShowdown(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("raider").combatRole).toBe("attacker");
}

/** Cast Blind Fury inside the showdown and drive it: choose the revealed Time Warp; stop when the chain is empty again. */
async function furyIntoTimeWarp(game: Game): Promise<Decision[]> {
  const seen: Decision[] = [];
  expect(game.p1.can("cast", "fury")).toBe(true);
  await game.p1.cast("fury");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break; // back to the showdown's Focus window (or main)
    }
    seen.push(d);
    if (d.kind === "pick") {
      const opt = d.options.find((o) => o.card === "warp") ?? d.options[0]!;
      await game.seat(d.seat).pick(opt.key);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling caeb6b581e6fc094 — Time Warp played off Blind Fury mid-showdown queues the extra turn; the showdown finishes first", () => {
  test("Blind Fury is castable in the showdown; P2's Time Warp is revealed, chosen, and played by P1 ignoring its [10] cost — it resolves: extra turn queued for P1, Time Warp banished", async () => {
    const game = await board().build();
    await openShowdown(game);
    const seen = await furyIntoTimeWarp(game);
    const offer = seen.find((d) => d.kind === "pick" && d.seat === P1);
    expect(offer?.kind === "pick" ? offer.options.map((o) => o.card) : []).toContain("warp");
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.zoneOf("warp")).toBe("banishment");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // nothing paid for Time Warp
    expect((game.gameState as { pendingExtraTurns?: string[] }).pendingExtraTurns ?? []).toEqual([P1]);
  });

  test("…but the extra turn does NOT start now: it is still P1's SAME turn, the showdown at bf1 is still open with the Raider attacking", async () => {
    const game = await board().build();
    await openShowdown(game);
    const turnBefore = game.turnNumber();
    await furyIntoTimeWarp(game);
    expect(game.turnNumber()).toBe(turnBefore);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("the showdown and combat then resolve normally (Raider 4 kills the stunned Blocker and conquers bf1), still inside the current turn", async () => {
    const game = await board().build();
    await openShowdown(game);
    const turnBefore = game.turnNumber();
    await furyIntoTimeWarp(game);
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.turnNumber()).toBe(turnBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("only after P1 ends this turn does the queued extra turn begin: the NEXT turn is P1's again (not P2's), and the one after that is P2's", async () => {
    const game = await board().build();
    await openShowdown(game);
    await furyIntoTimeWarp(game);
    await game.settle();
    const turnBefore = game.turnNumber();
    const next = await game.advanceTurn();
    expect(next.next).toBe(P1);
    expect(next.turn).toBe(turnBefore + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect((game.gameState as { pendingExtraTurns?: string[] }).pendingExtraTurns ?? []).toEqual([]);
    const after = await game.advanceTurn();
    expect(after.next).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
