/**
 * Ruling e466b98501472a22 — Shadowblade Lurker (VEN-096 → ven-096-166) · Unit · Chaos · 5 · 5 Might
 *   "I cost [2] less for each card with my name in your trash."
 *   × Endless Riches (ven-022-166) · Gear — "… You may play cards from your trash. …" (the enabler used
 *     here to play a Lurker FROM the trash).
 *
 * Q: When I play Shadowblade Lurker from my trash, does it discount its own cost?
 * A: No. Playing it moves it onto the chain first, so it is no longer in the trash when its cost is
 *    determined; only the OTHER copies still in the trash reduce the cost.
 * Rules: 354, 419.1 (playing = putting the card on the chain, then costs are determined).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const LURKER = "ven-096-166";
const ENDLESS_RICHES = "ven-022-166";

function fromHand(opts: { energy: number; copiesInTrash: number }) {
  let s = scenario().resources(P1, { energy: opts.energy }).hand(P1, LURKER, "lurker");
  for (let i = 0; i < opts.copiesInTrash; i++) {
    s = s.trash(P1, LURKER, `copy${i}`);
  }
  return s;
}

/** Endless Riches in P1's base; TWO Lurkers in P1's trash ("lurker" is the one we play, "other" stays). */
function fromTrash(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .gear(P1, ENDLESS_RICHES, "riches")
    .trash(P1, LURKER, "lurker")
    .trash(P1, LURKER, "other");
}

describe("Ruling e466b98501472a22 — Shadowblade Lurker played from trash does not count itself", () => {
  // ── premise: the discount counts same-name cards in YOUR trash ───────────────────────────────

  test("from hand, no copies in trash: costs the full [5] (4 is not enough)", async () => {
    const ok = await fromHand({ energy: 5, copiesInTrash: 0 }).build();
    expect(ok.p1.can("play", "lurker")).toBe(true);
    await ok.p1.play("lurker");
    expect(ok.p1.energy()).toBe(0);
    const poor = await fromHand({ energy: 4, copiesInTrash: 0 }).build();
    expect(poor.p1.can("play", "lurker")).toBe(false);
  });

  test("from hand, ONE Shadowblade Lurker in trash: costs [3] (5 - 2); 2 is not enough", async () => {
    const ok = await fromHand({ energy: 3, copiesInTrash: 1 }).build();
    expect(ok.p1.can("play", "lurker")).toBe(true);
    await ok.p1.play("lurker");
    expect(ok.p1.energy()).toBe(0);
    await ok.settle();
    expect(ok.zoneOf("lurker")).toBe("base");
    const poor = await fromHand({ energy: 2, copiesInTrash: 1 }).build();
    expect(poor.p1.can("play", "lurker")).toBe(false);
  });

  test("from hand, TWO copies in trash: costs [1] (5 - 4)", async () => {
    const game = await fromHand({ energy: 5, copiesInTrash: 2 }).build();
    await game.p1.play("lurker");
    expect(game.p1.energy()).toBe(4);
  });

  // ── the ruling: played FROM the trash ─────────────────────────────────────────────────────────

  // Expected: with Endless Riches ("You may play cards from your trash") on board, the Lurker in the
  // trash is playable. Actual: Endless Riches' static permission is unimplemented (raw text) — no
  // play-from-trash option is offered at all.
  test.failing("BUG: ruling e466b98501472a22 — with Endless Riches in play, a Shadowblade Lurker in the trash is a legal play (engine offers no play-from-trash)", async () => {
    const game = await fromTrash(5).build();
    expect(game.p1.can("play", "lurker")).toBe(true);
  });

  // Expected (354, 419.1): playing "lurker" from the trash moves it to the chain first; only "other" is
  // still in the trash when the cost is worked out → [5] - [2] = [3]. With exactly 3 energy the play
  // succeeds and drains the pool; "other" stays in the trash. Actual: not playable from trash at all.
  test.failing("BUG: ruling e466b98501472a22 — played from trash with one OTHER copy there it costs [3], not [1]: 3 energy → 0", async () => {
    const game = await fromTrash(3).build();
    await game.p1.play("lurker");
    expect(game.p1.energy()).toBe(0);
    expect(["chain", "base"]).toContain(game.zoneOf("lurker"));
    expect(game.zoneOf("other")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("lurker")).toBe("base");
  });

  // Expected: because it does NOT discount itself, [1] (which would suffice if both trash copies
  // counted) is not enough to play it from the trash. Actual: not playable from trash for any amount.
  test.failing("BUG: ruling e466b98501472a22 — played from trash it does not discount itself: with only [1] the play is NOT affordable, with [3] it is", async () => {
    const poor = await fromTrash(1).build();
    expect(poor.p1.can("play", "lurker")).toBe(false);
    const ok = await fromTrash(3).build();
    expect(ok.p1.can("play", "lurker")).toBe(true);
  });
});
