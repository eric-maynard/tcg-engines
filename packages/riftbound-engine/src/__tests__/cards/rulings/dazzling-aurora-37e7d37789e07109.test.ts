/**
 * Ruling 37e7d37789e07109 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from
 *   the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · "[Deflect] … You may play me to an occupied enemy battlefield."
 *   × Targon's Peak (OGN-289 → ogn-289-298) · Battlefield · "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * Q: Aurora's end-of-turn trigger flips Deadbloom Predator into Targon's Peak and it conquers in the resulting
 *    showdown. Do I ready 2 runes?
 * A: No. The conquer trigger does fire, but "at the end of this turn" is a single moment (start of the Ending Step)
 *    that has already passed, so the delayed rune-ready never happens this turn.
 * Rules: 517.1 / 317.1 (end-of-turn triggers happen once, simultaneously, at the start of the Ending Step),
 *        390.2 (delayed triggers), 383 (triggers only for events that occur while they exist).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const TARGONS_PEAK = "ogn-289-298";

/**
 * P1's turn. P1: Dazzling Aurora in base, Deadbloom Predator on top of the deck, two EXHAUSTED body runes, and an
 * 8-Might Bruiser in base (for the control). bf1 = Targon's Peak (live), held by P2 with a 2-Might Sentinel.
 */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deckTop(P1, DEADBLOOM_PREDATOR, "deadbloom")
    .runes(P1, "body", 2, { exhausted: true })
    .unit(P1, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .battlefield("bf1", { controller: P2, def: TARGONS_PEAK, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Sentinel" }, "sentinel");
}

/** Drive every prompt until P2's open main phase, sending Deadbloom to bf1 and recording all non-action prompts. */
async function driveToP2Main(game: Game): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    prompts.push(d);
    if (d.kind === "pick" && d.semantics === "destination") {
      const key = d.options.find((o) => o.key.includes("bf1"))?.key as string;
      await game.seat(d.seat).pick(key);
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(...d.options.slice(0, d.max).map((o) => o.key));
    } else if (d.kind === "order") {
      await game.seat(d.seat).order(d.items.map((it) => it.key));
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 37e7d37789e07109 — conquering Targon's Peak via Aurora's end-of-turn flip is too late to ready runes this turn", () => {
  test("ending the turn: Aurora's trigger reveals Deadbloom Predator and P1 is asked where to play it — the occupied enemy Targon's Peak is offered", async () => {
    const game = await board().build();
    expect(game.p1.runes({ ready: true })).toEqual([]);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "deadbloom" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["base", "battlefield-bf1"]);
  });

  test("Deadbloom is played to the Peak (still in P1's Ending Step), wins the showdown, P1 conquers and scores — and Targon's Peak's conquer trigger DOES go on the chain", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    let sawPeakTrigger = false;
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (game.chain().some((c) => c.cardId === "bf1" && c.triggered)) {
        sawPeakTrigger = true;
        expect(game.phase()).toBe("ending");
        expect(game.turnPlayer()).toBe(P1);
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.semantics === "destination") {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key as string);
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(...d.options.slice(0, d.max).map((o) => o.key));
      } else {
        break;
      }
    }
    expect(sawPeakTrigger).toBe(true);
    expect(game.zoneOf("deadbloom")).toBe("battlefield-bf1");
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("…but the 'end of this turn' moment already passed: no rune-ready choice is ever offered and P1's two runes are still exhausted when P2's turn opens", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    const prompts = await driveToP2Main(game);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    const runePrompts = prompts.filter((p) => p.kind === "pick" && p.options.some((o) => game.p1.runes().includes((o.card ?? o.key) as string)));
    expect(runePrompts).toEqual([]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — conquering Targon's Peak DURING the turn (Bruiser walks in) does ready up to 2 runes at the end of that turn", async () => {
    const game = await board().build();
    // Conquer in the main phase, THEN end the turn (Aurora's own flip still happens but is irrelevant here).
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.runes({ ready: true })).toEqual([]); // nothing readied yet — it is delayed to end of turn
    await game.p1.endTurn();
    const prompts = await driveToP2Main(game);
    expect(game.turnPlayer()).toBe(P2);
    const runePrompt = prompts.find((p) => p.kind === "pick" && p.seat === P1 && p.options.some((o) => game.p1.runes().includes((o.card ?? o.key) as string)));
    expect(runePrompt).toBeDefined();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
