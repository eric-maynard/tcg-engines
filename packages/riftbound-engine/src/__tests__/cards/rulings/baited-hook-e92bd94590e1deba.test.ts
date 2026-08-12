/**
 * Ruling e92bd94590e1deba — Baited Hook (OGN-242 → ogn-242-298) · gear · [3]
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … You may banish a unit from among them … and
 *    play it, ignoring its cost."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me."
 *
 * Q: Does a unit put onto the board by Baited Hook count as a card you PLAYED (e.g. for Darius's ready), and can you
 *    pay Accelerate on it?
 * A: Yes to both. Hook uses the word "play", so the unit goes through a real play: play-a-card triggers see it and the
 *    optional Accelerate cost is offered (only the BASE cost is ignored).
 * Rules: 355 (playing a card), 383 ("when you play" triggers), 356.4 (optional additional costs survive "ignoring its cost").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const DARIUS = "ogn-027-298";
const KAISA = "ogn-039-298"; // 4 Might — within "Might up to 1 more than the killed unit" for a 3-Might bait
const CLEAVE = "ogn-004-298";

/** P1's turn. Darius stands EXHAUSTED, a 3-Might Bait waits to be sacrificed, Kai'Sa is on top of the deck. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Bait" }, "bait")
    .gear(P1, BAITED_HOOK, "hook")
    .hand(P1, CLEAVE, "cleave")
    .deck(P1, [KAISA], ["kaisa"])
    .resources(P1, { energy: 4, power: { fury: 1, order: 1 } });
}

/** Play Cleave as the FIRST card of the turn, then fish with the Hook. */
async function hookFired(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "darius" });
  await game.settle();
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // one card played: nothing yet
  await game.p1.activate("hook", 0, { targets: "bait" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.zoneOf("bait")).toBe("trash");
  return game;
}

describe("Ruling e92bd94590e1deba — a unit put into play by Baited Hook was PLAYED, so play-triggers see it", () => {
  test("the Hook's ability kills the bait and offers the revealed Kai'Sa", async () => {
    const game = await hookFired();
    const d = game.decision() as { options: { key: string }[] };
    expect(d.options.map((o) => o.key)).toContain("kaisa");
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.p1.power("order")).toBe(0);
  });

  test("playing Kai'Sa from the Hook is P1's SECOND card this turn: Darius gets +2 Might and readies", async () => {
    const game = await hookFired();
    await game.p1.pick("kaisa");
    await game.p1.no(); // decline Accelerate — irrelevant to the count
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("darius")).toMatchObject({ isExhausted: false, isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("declining the Hook's play means no second card was played and Darius stays exhausted", async () => {
    const game = await hookFired();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("kaisa")).not.toBe("base");
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("nuance: the play is a real play, so Kai'Sa's optional Accelerate cost is offered on it", async () => {
    const game = await hookFired();
    await game.p1.pick("kaisa");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt).toContain("Accelerate");
  });
});
