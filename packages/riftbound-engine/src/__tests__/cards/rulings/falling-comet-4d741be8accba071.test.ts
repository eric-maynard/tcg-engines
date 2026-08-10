/**
 * Ruling 4d741be8accba071 — Falling Comet (OGN-085 → ogn-085-298) · Spell · Mind · 5 · [Action] "Deal 6 to a unit at a
 *   battlefield."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · 2 · [Hidden][Action] "Move a unit from a battlefield to
 *     its base."
 *
 * Q: I Comet an enemy unit at a battlefield; the opponent answers with (a hidden) Fight or Flight moving it home. Does
 *    Comet fizzle, or may I pick a new target?
 * A: Neither — Riftbound has no fizzling. Comet still resolves, re-checks its target, finds it illegal (no longer at a
 *    battlefield) and does nothing. No new target may be chosen.
 * Rules: 355.7 (targets fixed at finalization), 359.3.e.5 (illegal target on resolution → instruction ignored), 811.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_COMET = "ogn-085-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn with exactly 5. P2 controls bf1 with X (3) and Y (2) and has Fight or Flight HIDDEN there. */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "X")
    .unit(P2, "bf1", { might: 2, name: "Unit Y" }, "Y")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, FALLING_COMET, "comet");
}

/** Comet → X; P1 passes; P2 flips Fight or Flight on X; it resolves first (X → base). Comet is left alone on the chain. */
async function cometAnsweredByFlight(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("comet", { targets: "X" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", targets: ["X"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("X");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "fof"]);
  for (let i = 0; i < 4 && game.chain().length === 2; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.locationOf("X")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["comet"]);
  return game;
}

describe("Ruling 4d741be8accba071 — Falling Comet neither fizzles nor re-targets when its target leaves the battlefield", () => {
  test("Comet stays on the chain after Fight or Flight resolves and then RESOLVES itself (goes to trash, cost stays spent) — it is not simply removed", async () => {
    const game = await cometAnsweredByFlight();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("…with no effect: X (now in base) takes no damage, and P1 is never asked to choose Y or anything else instead — Y is untouched too", async () => {
    const game = await cometAnsweredByFlight();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false); // no re-target prompt
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("X").damage).toBe(0);
    expect(game.zoneOf("X")).toBe("base");
    expect(game.state("Y").damage).toBe(0);
    expect(game.zoneOf("Y")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Comet deals 6 to X and kills it", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
  });
});
