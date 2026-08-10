/**
 * Ruling 702f8c518c53d85b — Recruit the Vanguard (OGS-015 → ogs-015-024) · Spell · Order · 6
 *     "[Action] Play four 1 [Might] Recruit unit tokens."
 *   × Gemcraft Seer (OGN-100 → ogn-100-298) "[Vision] … Other friendly units have [Vision]."
 *   × Lady of Luminosity (Lux legend, ogs-021-024) "When you play a spell that costs [5] or more, draw 1."
 *
 * Q: Casting Recruit the Vanguard with Lux as legend and Gemcraft Seer on board — do the four Vision
 *    triggers (from the Recruit tokens) resolve before or after Lux's draw trigger?
 * A: The four Vision triggers ALWAYS resolve before Lux's draw. The tokens were pending first, finalize and
 *    resolve, and their Vision triggers become pending; Lux's draw finalizes onto the chain next; only then
 *    do the four Visions finalize above it. Chain top→bottom: Vision ×4, then Draw. No ordering choice.
 * Rules: 338/339 (pending items finalize FIFO), 340.1/340.3/340.4 (newest item resolves; loop), 383.3.d.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECRUIT_THE_VANGUARD = "ogs-015-024";
const GEMCRAFT_SEER = "ogn-100-298";
const LUX_LEGEND = "ogs-021-024";

function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .legend(P1, LUX_LEGEND, "lux")
    .unit(P1, "base", GEMCRAFT_SEER, "seer")
    .hand(P1, RECRUIT_THE_VANGUARD, "recruit");
}

/** Cast Recruit the Vanguard and let the spell itself resolve (both pass once). */
async function spellResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("recruit");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "recruit", triggered: false, type: "spell" })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  // rule 383.3.d — same-controller simultaneous triggers may surface a soft order offer; the ruling says the
  // relative order of Vision vs Draw is NOT a choice, so accepting the listed order must still give it.
  await game.acceptTriggerOrder();
  return game;
}

function tokens(game: Game): string[] {
  return game.p1.base().filter((c) => game.state(c).isToken);
}

describe("Ruling 702f8c518c53d85b — Recruit tokens' Vision triggers resolve before Lux's draw", () => {
  test("the spell resolves: four 1-Might Recruit tokens in base, each with [Vision] from the Seer; five triggered items hit the chain (4 Vision + Lux draw) and nothing has been drawn yet", async () => {
    const game = await spellResolved();
    expect(game.zoneOf("recruit")).toBe("trash");
    const toks = tokens(game);
    expect(toks).toHaveLength(4);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ might: 1, name: "Recruit" });
      expect(game.state(t).keywords).toContain("Vision");
    }
    const chain = game.chain();
    expect(chain).toHaveLength(5);
    expect(chain.every((c) => c.triggered)).toBe(true);
    expect(chain.filter((c) => c.cardId === "lux")).toHaveLength(1);
    expect(chain.filter((c) => toks.includes(c.cardId))).toHaveLength(4);
    expect(game.p1.hand()).toEqual([]);
    // No ordering prompt: the sequence is dictated by finalize timing, not a player choice.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected: chain bottom→top = [lux draw, Vision, Vision, Vision, Vision]; the newest item (a Vision) holds
  // priority first. Actual: the engine finalizes Lux's draw LAST, so it sits on top and resolves first.
  test("ruling 702f8c518c53d85b — Lux's draw sits at the BOTTOM of the chain, the four Vision triggers above it", async () => {
    const game = await spellResolved();
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "lux", triggered: true });
    expect(chain.slice(1).every((c) => tokens(game).includes(c.cardId))).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "action", source: { cardId: expect.not.stringMatching(/^lux$/) } });
  });

  // Expected: resolving the top item is a Vision (look at top card, may recycle) — the hand is still empty
  // and stays empty until all four Visions are done. Actual: the first resolution is Lux's draw (hand 0 → 1).
  test("ruling 702f8c518c53d85b — the first trigger to resolve is a Vision look; the draw comes last", async () => {
    const game = await spellResolved();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // A Vision resolved: P1 is looking at the top card (may recycle) and has drawn nothing.
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    // Drain the remaining three Visions (decline each recycle); the draw must still be waiting below them.
    for (let i = 0; i < 3; i++) {
      expect(game.p1.hand()).toEqual([]);
      await game.p1.passPriority();
      await game.p2.passPriority();
      await game.p1.decline();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lux" })]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("control: everything drained, the net result is the same either way — 4 tokens, exactly 1 card drawn by Lux, spell in trash", async () => {
    const game = await spellResolved();
    game.script(P1, Array.from({ length: 4 }, () => "decline"));
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(tokens(game)).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
