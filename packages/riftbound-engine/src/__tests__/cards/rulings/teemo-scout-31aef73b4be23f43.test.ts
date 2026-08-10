/**
 * Ruling 31aef73b4be23f43 — Teemo, Scout (OGN-197 → ogn-197-298) · Champion Unit · Chaos · 2 · 1 Might
 *   "[Hidden] When you play me, give me +3 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: When Teemo is revealed (played) from hidden, can the opponent respond to the on-play ability with Gust before
 *    it resolves?
 * A: Yes. Reveal → Teemo is played → his on-play trigger goes on the chain → Gust may be played above it → Gust
 *    resolves first (Teemo, still 1 Might, returns to hand) → then the on-play ability resolves.
 * Rules: 811 (play from Hidden), 383.3 (triggers use the chain), 336/337 (LIFO; Reactions in response).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const GUST = "ogn-169-298";

/** Turn 3, P1 active. P1 holds bf1 and hid Teemo there on an earlier turn. P2: Gust in hand, [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

async function revealTeemo(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("reveal", "teemo")).toBe(true);
  await game.p1.reveal("teemo");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    // (a destination / self-target prompt, if any — Teemo's only sensible answer)
    await game.p1.pick("teemo");
  }
  return game;
}

describe("Ruling 31aef73b4be23f43 — Gust can answer Teemo, Scout's on-play trigger after he is revealed from hidden", () => {
  test("revealed from hidden: Teemo is on the board at bf1 as a 1-Might unit and his on-play trigger is ON THE CHAIN (not yet resolved)", async () => {
    const game = await revealTeemo();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo")).toMatchObject({ isHidden: false, might: 1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
  });

  test("P2 gets priority with the trigger pending and Gust (≤3 Might, at a battlefield) is legal on Teemo; it lands ABOVE the trigger", async () => {
    const game = await revealTeemo();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
  });

  test("Gust resolves first — Teemo returns to P1's hand while his trigger is still on the chain; then the trigger resolves harmlessly", async () => {
    const game = await revealTeemo();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "teemo" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
    // Now the on-play ability resolves with its source gone.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.state("teemo").mightModifier).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — nobody responds: the trigger resolves and Teemo is 4 Might this turn (now out of Gust range)", async () => {
    const game = await revealTeemo();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").might).toBe(4);
  });
});
