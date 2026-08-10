/**
 * Ruling 8ec412b2032696aa — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *   × Dazzling Aurora (ogn-160-298) · Gear — "At the end of your turn, reveal cards from the top of your Main Deck until
 *     you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (ogn-161-298) · 8 Might — "[Deflect] … You may play me to an occupied enemy battlefield."
 *
 * Q: Aurora's end-of-turn trigger plays Deadbloom Predator into Targon's Peak and it conquers. Does the Peak ready 2 runes,
 *    or was the end-of-turn timing missed?
 * A: Missed. "End of turn" triggers happen once, at the start of the Ending Step; the Peak's conquer trigger does go on the
 *    chain, but its "at the end of THIS turn" moment has already passed, so no runes are readied — and not on the
 *    opponent's next end of turn either ("this turn").
 * Rules: 317.1 (end-of-turn triggers occur once at the start of the Ending Step), 390.2 (delayed triggers), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const TARGONS_PEAK = "ogn-289-298";

/**
 * P1's turn. P1: Dazzling Aurora in base, Deadbloom Predator on top of the deck, two EXHAUSTED body runes, and an 8-Might
 * Bruiser in base (for the in-turn contrast). bf1 = Targon's Peak (live), held by P2 with a 2-Might Sentinel.
 * P2 also has two exhausted runes (to show nothing readies on THEIR end of turn either).
 */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deckTop(P1, DEADBLOOM_PREDATOR, "deadbloom")
    .runes(P1, "body", 2, { exhausted: true })
    .runes(P2, "fury", 2, { exhausted: true })
    .unit(P1, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .battlefield("bf1", { controller: P2, def: TARGONS_PEAK, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Sentinel" }, "sentinel");
}

/** Drive every prompt until `stopSeat`'s open main phase, sending Deadbloom to bf1; returns all non-action prompts seen. */
async function driveToMainOf(game: Game, stopSeat: string): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main" && game.turnPlayer() === stopSeat)) {
      break;
    }
    if (d.kind === "action" && d.context === "main") {
      await game.seat(d.seat).endTurn();
      continue;
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
      await game.seat(d.seat).pick(...d.options.slice(0, Math.max(1, d.max)).map((o) => o.key));
    } else if (d.kind === "order") {
      await game.seat(d.seat).order(d.items.map((it) => it.key));
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute(d.defaultAllocation);
    } else {
      break;
    }
  }
  return prompts;
}

const isRuneReadyPrompt = (game: Game, p: Decision, seat: "p1" | "p2") => p.kind === "pick" && p.options.some((o) => game[seat].runes().includes((o.card ?? o.key) as string));

describe("Ruling 8ec412b2032696aa — Deadbloom conquers Targon's Peak via Aurora at end of turn: the rune-ready moment was already missed", () => {
  test("ending the turn puts Aurora's end-of-turn trigger on the chain (Ending Step); it reveals Deadbloom and asks P1 where to play it — the occupied enemy Peak is offered", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "deadbloom" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["base", "battlefield-bf1"]);
  });

  test("Deadbloom goes to the Peak (still P1's Ending Step), wins the showdown and P1 CONQUERS (+1) — and the Peak's conquer trigger DOES go on the chain (it can be responded to)", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    let sawPeakTrigger = false;
    for (let i = 0; i < 40; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (game.chain().some((c) => c.cardId === "bf1" && c.triggered)) {
        sawPeakTrigger = true;
        expect(game.phase()).toBe("ending");
        expect(game.turnPlayer()).toBe(P1);
        expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a priority window on it
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.semantics === "destination") {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key as string);
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(...d.options.slice(0, Math.max(1, d.max)).map((o) => o.key));
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).yes();
      } else if (d.kind === "order") {
        await game.seat(d.seat).order(d.items.map((it) => it.key));
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

  test("…but 'the end of this turn' already happened: no rune-ready choice is ever offered and P1's two runes are still exhausted when P2's turn opens", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    const prompts = await driveToMainOf(game, P2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(prompts.filter((p) => isRuneReadyPrompt(game, p, "p1"))).toEqual([]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nor does it slide to the opponent's end of turn ('this turn'): through P2's whole turn and Ending Step no rune prompt appears for anyone, and P1's runes only become ready by P1's own next Awaken", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await driveToMainOf(game, P2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    // P2 ends the turn: still nothing from the Peak.
    const prompts = await driveToMainOf(game, P1);
    expect(prompts.filter((p) => isRuneReadyPrompt(game, p, "p1") || isRuneReadyPrompt(game, p, "p2"))).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("control — conquering the Peak DURING the turn (Bruiser walks in) does install the delayed ready: at the end of that turn P1 is offered the rune choice and 2 runes end up ready", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.runes({ ready: true })).toEqual([]); // delayed to end of turn
    await game.p1.endTurn();
    const prompts = await driveToMainOf(game, P2);
    expect(prompts.some((p) => p.seat === P1 && isRuneReadyPrompt(game, p, "p1"))).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
