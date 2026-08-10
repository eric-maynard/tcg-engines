/**
 * Ruling 44813559bf2d1124 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards
 *   from the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Scuttle Crab (UNL-053 → unl-053-219) · 0 Might · "When you play me, draw 1. [Deathknell] …"
 *
 * Q: Aurora flips a Scuttle Crab at end of turn; I control no battlefield so it lands in base (ready). Can I then
 *    move it to a battlefield?
 * A: No. Aurora's trigger happens in your Ending Phase; a Standard Move is only available in your Main Phase, so
 *    even a ready unit that arrives now cannot be walked to a battlefield — the turn simply passes.
 * Rules: 144.1.a (Standard Move only in your Main Phase), 144.2 (cost: exhaust), 317 (Ending Phase triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SCUTTLE_CRAB = "unl-053-219";
const CLEAVE = "ogn-004-298";

/** P1's turn (12 XP, as in the question). Aurora in base, no unit at any battlefield; deck: Scuttle Crab, Cleave, … */
function board() {
  return scenario()
    .xp(P1, 12)
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [SCUTTLE_CRAB, CLEAVE], ["crab", "next"]);
}

/** End P1's turn; pass priority through Aurora's trigger until the Crab is on the board (answering a destination prompt with base). */
async function endTurnIntoCrab(game: Game): Promise<void> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 12 && game.zoneOf("crab") === "mainDeck"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => o.key === "base" || o.zone === "base" || o.label === "base") ?? d.options[0]!;
      await game.p1.answer({ keys: [base.key], kind: "pick" });
    } else {
      break;
    }
  }
}

describe("Ruling 44813559bf2d1124 — an Aurora-played Scuttle Crab arrives in the Ending Phase: no Standard Move for it", () => {
  test("Aurora fires at end of turn and plays the Crab, ignoring its cost, into P1's base — it is still P1's ENDING phase, not Main", async () => {
    const game = await board().build();
    await endTurnIntoCrab(game);
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.p1.units("base")).toContain("crab");
    expect(game.p1.energy()).toBe(0);
    // Whatever is left to do now happens inside P1's Ending Phase (or the turn has already passed) — never P1's Main Phase again.
    if (game.turnPlayer() === P1) {
      expect(game.phase()).toBe("ending");
    } else {
      expect(game.turnPlayer()).toBe(P2);
    }
  });

  test("P1 is never offered a Standard Move for the Crab: from its arrival until P2's turn opens, no standardMove option exists for P1 (144.1.a)", async () => {
    const game = await board().build();
    await endTurnIntoCrab(game);
    expect(game.zoneOf("crab")).toBe("base");
    // Walk the rest of the turn hand-over step by step, checking P1's menu at every stop.
    for (let i = 0; i < 12; i++) {
      expect(game.p1.legal().some((o) => o.verb === "move" || o.moveId === "standardMove")).toBe(false);
      const r = await game.p1.try((p) => p.move("crab", "bf2"));
      expect(r.ok).toBe(false);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      const s = await game.settle({ maxSteps: 1 });
      if (s.reason === "unanswered" && d.seat === P1 && d.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      }
    }
    await game.settle();
    // The turn simply passed: it is P2's main phase and the Crab is still sitting in P1's base.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.locationOf("crab")).toBe("base");
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p1.can("move")).toBe(false); // and of course not on the opponent's turn either
    expect(game.violations()).toEqual([]);
  });

  test("the Crab's own 'When you play me, draw 1' still resolves off Aurora's free play (it WAS played) — Cleave, next in the deck, ends in P1's hand", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await endTurnIntoCrab(game);
    await game.settle();
    expect(game.zoneOf("next")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
