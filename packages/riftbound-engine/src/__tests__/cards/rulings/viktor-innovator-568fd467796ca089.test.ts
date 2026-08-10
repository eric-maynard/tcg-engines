/**
 * Ruling 568fd467796ca089 — Viktor, Innovator (OGN-117 → ogn-117-298) · Unit · Mind · 4+[mind] · 3 "When you play a card on an
 *   opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · 1+[calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (+ Fight or Flight ogn-168-298 · 2 · [Hidden][Action] "Move a unit from a battlefield to its base." as the hidden card)
 *
 * Q: With Viktor out, I flip a hidden card on the opponent's turn. Does Viktor trigger on the reveal, or when it resolves?
 * A: When the card has fully resolved ("played" = finished the play process). While it is merely revealed/finalized on the
 *    chain nothing triggers; if it is countered (Defy) it never resolves, so Viktor never triggers and no token is made.
 * Rules: 350.1 / 419.4.a (a card is "played" when it resolves), 811 (Hidden), 354 (counter: leaves the chain unresolved).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-117-298";
const DEFY = "ogn-045-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });
const viktorTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "viktor" && c.triggered).length;

/** P2's turn. P1: Viktor in base, Sentry (3) holding bf1 with Fight or Flight hidden there. P2: Raider (5), Defy + 1+[calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, DEFY, "defy");
}

/** Raider attacks bf1; P2 (Focus) passes; P1 flips the hidden Fight or Flight at the Raider. FoF now sits finalized on the chain. */
async function revealOnOpponentsTurn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
    await game.acting().pass();
  }
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1 })]);
  return game;
}

describe("Ruling 568fd467796ca089 — Viktor triggers when the flipped card RESOLVES, not when it is revealed", () => {
  test("revealed and finalized on the chain (Pending → Finalized): Viktor has NOT triggered — no trigger on the chain, no Recruit yet", async () => {
    const game = await revealOnOpponentsTurn();
    expect(game.state("fof").isHidden).toBe(false);
    expect(viktorTriggers(game)).toBe(0);
    expect(recruits(game)).toEqual([]);
  });

  test("once Fight or Flight resolves (Raider sent home) Viktor's ability triggers and a 1-Might Recruit token is played in P1's base", async () => {
    const game = await revealOnOpponentsTurn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // FoF resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    // The trigger is created now (it may sit on the chain first).
    expect(viktorTriggers(game) + recruits(game).length).toBeGreaterThan(0);
    await game.settle();
    expect(recruits(game)).toHaveLength(1);
    expect(game.state(recruits(game)[0]!)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    expect(game.turnPlayer()).toBe(P2); // all of this happened on the opponent's turn
  });

  test("if instead P2 Defies the flipped Fight or Flight, it is countered and never resolves: Viktor never triggers and no token is ever created (Raider stays and fights)", async () => {
    const game = await revealOnOpponentsTurn();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "fof" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof", "defy"]);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(viktorTriggers(game)).toBe(0);
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1"); // not moved: countered
    expect(recruits(game)).toEqual([]);
    await game.settle(); // combat: Raider 5 vs Sentry 3
    expect(recruits(game)).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
