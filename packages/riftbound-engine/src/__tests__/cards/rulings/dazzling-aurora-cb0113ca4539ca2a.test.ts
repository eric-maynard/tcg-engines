/**
 * Ruling cb0113ca4539ca2a — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · 9
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it,
 *      ignoring its cost, and recycle the rest."
 *   × Carnivorous Snapvine (OGN-149 → ogn-149-298) 6 Might "When you play me, choose an enemy unit at a battlefield. We deal
 *     damage equal to our Mights to each other."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) 8 Might "[Deflect] You may play me to an occupied enemy battlefield."
 *
 * Q: If Aurora plays a Snapvine at end of turn, can I play an Action card after Snapvine's effect resolves?
 * A: No. End-of-turn triggers resolve and the turn ends; you never get priority to play Actions there (no showdown
 *    exists). Contrast: a Deadbloom Predator played to an occupied enemy battlefield DOES open a combat showdown even in
 *    the Ending Step, and Actions can be played in that showdown.
 * Rules: 316–317 (Ending Phase: end-of-turn triggers, then expiration; no Action window), 335 (Action timing: your Main
 *        Phase open state or a showdown), 460/464 (a staged combat opens a showdown at the next Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SNAPVINE = "ogn-149-298";
const DEADBLOOM = "ogn-161-298";
/** A 1-cost [Action] spell so "can P1 play an Action now?" is observable. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with Target (3). P1: Aurora in base, Spark + 3 energy in hand, deck = [topUnit, fillers…]. */
function board(topUnit: string, alias: string) {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .gear(P1, DAZZLING_AURORA, "aurora")
    .hand(P1, SPARK, "spark")
    .deck(P1, [topUnit, "ogn-175-298", "ogn-175-298", "ogn-175-298"], [alias, "d2", "d3", "d4"]);
}

/** Step through every decision until P2's main phase, recording whether P1 could ever cast Spark and in what context. */
async function endTurnAndWatch(game: Game): Promise<{ sparkWindows: string[]; sawShowdown: boolean }> {
  const sparkWindows: string[] = [];
  let sawShowdown = false;
  expect(game.p1.can("cast", "spark")).toBe(true); // baseline: legal in P1's own main phase
  await game.p1.endTurn();
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (game.p1.can("cast", "spark")) {
      sparkWindows.push(d.kind === "action" ? d.context : d.kind);
    }
    if (d.kind === "action" && d.context === "showdown") {
      sawShowdown = true;
      await game.seat(d.seat).passFocus();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      await game.seat(d.seat).pick(keys.includes("battlefield-bf1") ? "battlefield-bf1" : keys.includes("target") ? "target" : (keys[0] as string));
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "order") {
      await game.seat(d.seat).order([]);
    } else if (d.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else {
      break;
    }
  }
  return { sawShowdown, sparkWindows };
}

describe("Ruling cb0113ca4539ca2a — after Aurora's end-of-turn Snapvine resolves the turn just ends; no Action window", () => {
  test("Aurora triggers at end of turn (Ending Phase), banishes-then-plays the Snapvine for free; its play trigger fights Target (6 ↔ 3: Target dies)", async () => {
    const game = await board(SNAPVINE, "snap").build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("snap")).toBe("base"); // played, cost ignored
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", targets: ["target"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("target")).toBe("trash");
  });

  test("P1 never gets to play the Action: from endTurn until P2's main phase Spark is never legal (only chain-priority windows, no showdown), and the game lands in P2's turn with Spark still in hand", async () => {
    const game = await board(SNAPVINE, "snap").build();
    const seen = await endTurnAndWatch(game);
    expect(seen.sawShowdown).toBe(false); // Snapvine's fight is not a showdown
    expect(seen.sparkWindows).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("spark")).toBe("hand");
    expect(game.p1.can("cast", "spark")).toBe(false);
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Aurora flips a Deadbloom Predator played to P2's occupied bf1: a combat showdown opens during the Ending Step and there P1 CAN play the Action", async () => {
    const game = await board(DEADBLOOM, "dead").build();
    const seen = await endTurnAndWatch(game);
    expect(game.zoneOf("dead")).toBe("battlefield-bf1");
    expect(seen.sawShowdown).toBe(true);
    expect(seen.sparkWindows).toContain("showdown");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
