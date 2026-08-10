/**
 * Ruling 2d07311f8d21128d — Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · "[Deflect] When I conquer, draw 1 or
 *     channel 1 rune exhausted."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Draven, Showboat (ogn-028-298) · 3 Might · "My Might is increased by your points." (the Draven of the question)
 *
 * Q: Can you react to an ON CONQUER effect before the conquer happens — e.g. kill Draven before he grows from the point?
 * A: No. By the time Qiyana's conquer trigger is on the chain the conquer already happened, the point is scored and
 *    Draven's PASSIVE has already updated his Might (no chain). Sequence: combat resolves (Sentry dies) → conquer + point
 *    → Qiyana's trigger goes on the chain → Draven is already bigger → only now can players react.
 * Rules: 466.2–466.6 (combat result / establish control after the damage-step chain empties), 469.1 (conquer scores),
 *        383 (triggered → chain), 361/522 (passive abilities apply continuously, no chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const SENTRY = "ogn-096-298";
const DRAVEN_SHOWBOAT = "ogn-028-298";

/** A 1-cost Reaction "Deal 3 to a unit." — P2's would-be answer aimed at a 3-Might Draven. */
const ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap (Reaction: deal 3)",
  timing: "reaction",
} as const;

/** P1's turn, 0 points. P2 holds bf1 with Watchful Sentry (1). P1: Qiyana (4) + Draven, Showboat (3 + 0) in base. P2 holds Zap + [1]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SENTRY, "sentry")
    .unit(P1, "base", QIYANA, "qiyana")
    .unit(P1, "base", DRAVEN_SHOWBOAT, "draven")
    .resources(P2, { energy: 1 })
    .hand(P2, ZAP, "zap");
}

/** Qiyana attacks the Sentry alone; both pass focus → combat damage is dealt (Sentry dies). */
async function combat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("draven").might).toBe(3);
  await game.p1.move("qiyana", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

/** …then both pass on the Sentry's Deathknell → it resolves → control is established (the conquer). */
async function conquered(): Promise<Game> {
  const game = await combat();
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 2d07311f8d21128d — no reaction window between the conquer and Qiyana's ON CONQUER trigger; Draven has already grown", () => {
  test("step 1: combat resolves — the Sentry dies and its Deathknell is the only thing on the chain; the conquer has NOT happened yet (0 points, bf1 still P2's, Draven still 3)", async () => {
    const game = await combat();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("draven").might).toBe(3);
  });

  test("steps 2–4: once the Deathknell resolves the conquer happens at once — point scored (1), bf1 is P1's, Qiyana's trigger is on the chain, and Draven's passive ALREADY reads 4 — all before anyone has been given priority", async () => {
    const game = await conquered();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "qiyana", controller: P1, triggered: true })]);
    expect(game.state("draven").might).toBe(4); // passive: 3 + 1 point, no chain involved
    // The very first decision after the conquer is P1 finalizing Qiyana's "draw 1 or channel 1" choice — not a P2 window.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
  });

  test("step 5: the first moment P2 may react is with Qiyana's trigger on the chain — Draven is 4 there, so a 'deal 3' Reaction no longer kills him", async () => {
    const game = await conquered();
    await game.p1.chooseMode(0); // draw 1
    // P1 (controller) holds priority first, then P2.
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["qiyana"]);
    expect(game.p1.points()).toBe(1);
    expect(game.state("draven").might).toBe(4);
    expect(game.p2.can("cast", "zap")).toBe(true);
    await game.p2.cast("zap", { targets: "draven" });
    await game.settle();
    expect(game.zoneOf("draven")).toBe("base"); // 3 damage on a 4-Might unit
    expect(game.state("draven")).toMatchObject({ damage: 3, might: 4 });
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same 'deal 3' cast in the EARLIER window (on the Sentry's Deathknell, before the conquer) does kill the still-3-Might Draven — that window exists, but it is before the point, not between the point and the trigger", async () => {
    const game = await combat();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("draven").might).toBe(3);
    await game.p2.cast("zap", { targets: "draven" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Zap resolves
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p1.points()).toBe(0); // still no conquer at this point
  });
});
