/**
 * Ruling eede0d429131e480 — Sun Disc (OGN-021 → ogn-021-298) · Gear · "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · 3 Might · "When you discard me, you may pay [fury] to play me."
 *   × Chemtech Enforcer (OGN-003 → ogn-003-298) · 2 Might · "[Assault 2] When you play me, discard 1."
 *
 * Q: Enforcer discards Flame Chompers, which plays itself — can I squeeze a Sun Disc activation in so the Chompers enter ready?
 * A: No. There is no window: Sun Disc's ability is not a Reaction, and from Enforcer's play trigger through the discard to the
 *    Chompers' own play the state is Closed. The Chompers enter exhausted (Sun Disc is only usable again once everything resolved).
 * Rules: 377 / 813 (non-Reaction activated abilities need an Open State), 383 (play/discard triggers on the chain), 143.4 (units enter
 *        exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const FLAME_CHOMPERS = "ogn-006-298";
const CHEMTECH_ENFORCER = "ogn-003-298";

/** P1's turn: ready Sun Disc in base; Enforcer + Chompers in hand; exactly [2] + [fury]. Nothing played yet this turn. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .gear(P1, SUN_DISC, "disc")
    .hand(P1, CHEMTECH_ENFORCER, "enforcer")
    .hand(P1, FLAME_CHOMPERS, "chompers");
}

/**
 * Play Enforcer and walk every decision until the Chompers are on the board, recording whether Sun Disc was EVER activatable
 * in between (it must not be). Answers: discard → Chompers (forced), Chompers' "you may pay [fury]" → yes, destination → base.
 */
async function enforcerIntoChompers(game: Game): Promise<{ discWindows: number; steps: number }> {
  let discWindows = 0;
  let steps = 0;
  await game.p1.play("enforcer", { to: "base" });
  for (let i = 0; i < 16 && game.zoneOf("chompers") !== "base"; i++) {
    steps += 1;
    if (game.p1.can("activate", "disc")) {
      discWindows += 1;
    }
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => (o.card ?? o.key) === "chompers") ?? d.options.find((o) => o.key === "base") ?? d.options[0]!;
      await game.p1.pick(want.key);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      expect(d.source?.cardId).toBe("chompers");
      await game.p1.yes();
    } else if (d.kind === "action" && d.context === "main") {
      break;
    } else {
      await game.settle();
    }
  }
  return { discWindows, steps };
}

describe("Ruling eede0d429131e480 — no Sun Disc window between Enforcer's discard and the Chompers playing themselves", () => {
  test("premise: before anything is played Sun Disc is not usable (Legion unmet), so it cannot be pre-loaded for free here", async () => {
    const game = await board().build();
    expect(game.state("disc").isReady).toBe(true);
    expect(game.p1.can("activate", "disc")).toBe(false);
  });

  test("Enforcer → discard Chompers → pay [fury] → Chompers played: at NO decision point in that sequence is Sun Disc activatable, and the Chompers enter EXHAUSTED", async () => {
    const game = await board().build();
    const { discWindows, steps } = await enforcerIntoChompers(game);
    expect(steps).toBeGreaterThan(0); // there were intermediate decision points (chain priority / prompts)…
    expect(discWindows).toBe(0); // …but never one where Sun Disc could be used
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("base");
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("chompers").isExhausted).toBe(true);
    expect(game.state("enforcer").isExhausted).toBe(true);
    expect(game.state("disc").isReady).toBe(true); // never got used
    expect(game.violations()).toEqual([]);
  });

  test("only AFTER everything resolved (Open State, Legion now met) does Sun Disc become activatable — too late for the Chompers, which stay exhausted", async () => {
    const game = await board().build();
    await enforcerIntoChompers(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.state("chompers").isExhausted).toBe(true); // "the NEXT unit you play" — not one already on the board
  });
});
