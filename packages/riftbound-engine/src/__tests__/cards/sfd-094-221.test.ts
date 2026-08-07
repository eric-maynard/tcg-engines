/**
 * Direwing — sfd-094-221 · Unit · Body · 7 energy · 7 might · (Dragon)
 *
 *   I enter ready if you control another Dragon.
 *
 * Rules: 143.4 (units enter the board exhausted) / 143.4.a ("similar game effects" may alter
 * this); the condition is a play-time check of the board ("control" = a permanent you control on
 * the board — hand / trash / the opponent's board do not count); "another" excludes Direwing
 * itself and implies Direwing carries the Dragon tag (763.1).
 *
 * Head-judge corner cases considered:
 *   - NO Dragon at all → must enter EXHAUSTED (the condition is not decorative). The engine's
 *     enter-ready evaluator has no `control` case, so an unknown condition falls back to
 *     "unconditional" — the most likely mis-implementation.
 *   - "another": a lone Direwing never satisfies itself; a SECOND Direwing does (Direwing is a
 *     Dragon) — needs the Dragon tag on the card data.
 *   - "you control": an ENEMY Dragon on the board, or a friendly Dragon in hand/trash, is not
 *     enough; a friendly Dragon at a battlefield (not just base) is.
 *   - The check is made as Direwing enters: a Dragon that left the board earlier this turn does
 *     not count; playing Direwing to a controlled battlefield applies the same check.
 *   - Cost sanity: 7 energy, no power; 6 energy is not enough.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-094-221";
const DRAGON = { energyCost: 2, might: 2, name: "Test Whelp", tags: ["Dragon"], domain: "body" };
const NOT_DRAGON = { energyCost: 2, might: 2, name: "Plain Recruit", domain: "body" };

function withBoard() {
  return scenario()
    .resources(P1, { energy: 7 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, CARD, "dw");
}

describe("Direwing (sfd-094-221)", () => {
  test("cost: 7 energy, no power; a 7-might unit; 6 energy is not enough", async () => {
    const game = await withBoard().unit(P1, "base", DRAGON, "whelp").build();
    expect(game.p1.can("play", "dw")).toBe(true);
    await game.p1.play("dw", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("dw")).toBe("base");
    expect(game.state("dw").might).toBe(7);
    const poor = await withBoard().resources(P1, { energy: 6 }).build();
    expect(poor.p1.can("play", "dw")).toBe(false);
  });

  test("enters READY when you control another Dragon (in base)", async () => {
    const game = await withBoard().unit(P1, "base", DRAGON, "whelp").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.state("dw").isReady).toBe(true);
    expect(game.state("dw").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("enters READY when the other Dragon you control is at a battlefield (control = anywhere on your board)", async () => {
    const game = await withBoard().unit(P1, "bf1", DRAGON, "whelp").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.state("dw").isReady).toBe(true);
  });

  test("played to a battlefield you control with another Dragon on board: ready there and may move at once", async () => {
    const game = await withBoard().unit(P1, "base", DRAGON, "whelp").build();
    await game.p1.play("dw", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("dw")).toBe("bf1");
    expect(game.state("dw").isReady).toBe(true);
    await game.p1.move("dw", "base");
    expect(game.locationOf("dw")).toBe("base");
  });

  test("with NO other Dragon under your control Direwing must enter EXHAUSTED (rule 143.4)", async () => {
    // Expected: no Dragon anywhere → the condition fails → default rule 143.4 applies (exhausted).
    // Actual: evaluateEnterReadyCondition has no `control` case → undefined → "legacy
    // unconditional" → Direwing enters ready for free.
    const game = await withBoard().unit(P1, "base", NOT_DRAGON, "plain").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dw")).toBe("base");
    expect(game.state("dw").isExhausted).toBe(true);
    expect(game.state("dw").isReady).toBe(false);
  });

  test("an ENEMY Dragon does not satisfy 'you control' — Direwing must enter exhausted", async () => {
    // Expected: only permanents YOU control count. Actual: enters ready unconditionally.
    const game = await withBoard().unit(P2, "bf2", DRAGON, "theirWhelp").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.state("dw").isExhausted).toBe(true);
  });

  test("a Dragon in your HAND or TRASH is not 'controlled' — Direwing must enter exhausted", async () => {
    // Expected: control refers to the board. Actual: enters ready unconditionally.
    const game = await withBoard().hand(P1, DRAGON, "handWhelp").trash(P1, DRAGON, "deadWhelp").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.state("dw").isExhausted).toBe(true);
  });

  test.failing("BUG: 'another' — a lone Direwing does not count itself; the first of two Direwings enters exhausted, the second ready", async () => {
    // Expected: first Direwing (no other Dragon) exhausted; second Direwing sees the first (a
    // Dragon) and enters ready. Actual: the first already enters ready (unconditional), and the
    // card data carries no Dragon tag so the second could not see it either.
    const game = await scenario()
      .resources(P1, { energy: 14 })
      .hand(P1, CARD, "dw1")
      .hand(P1, CARD, "dw2")
      .build();
    await game.p1.play("dw1", { to: "base" });
    await game.settle();
    expect(game.state("dw1").isExhausted).toBe(true);
    await game.p1.play("dw2", { to: "base" });
    await game.settle();
    expect(game.state("dw2").isReady).toBe(true);
    expect(game.state("dw1").isExhausted).toBe(true); // the first is not retroactively readied
  });

  test.failing("BUG: Direwing itself is a Dragon (card data should carry the Dragon tag implied by 'another Dragon')", async () => {
    const pool = await loadDefaultCardPool();
    expect(pool.get(CARD)?.tags ?? []).toContain("Dragon");
  });

  test("the check is made as Direwing enters — a Dragon that died in combat earlier this turn no longer counts, so Direwing enters exhausted", async () => {
    // The whelp is killed in combat first; then Direwing is played with no Dragon on board.
    // Expected: exhausted (rule 143.4). Actual: enters ready (same unconditional-entry bug).
    const game = await withBoard()
      .unit(P1, "base", DRAGON, "whelp")
      .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move("whelp", "bf2");
    await game.settle();
    expect(game.zoneOf("whelp")).toBe("trash");
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dw")).toBe("base");
    expect(game.state("dw").isExhausted).toBe(true);
  });

  test("no trigger / chain item beyond the play itself: after settling the chain is empty and it is still P1's action", async () => {
    const game = await withBoard().unit(P1, "base", DRAGON, "whelp").build();
    await game.p1.play("dw", { to: "base" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test("parsed ability: exactly one static enter-ready on self, gated on controlling a Dragon", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 7, might: 7, domain: "body" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { target: { filter: { tag: "Dragon" } }, type: "control" },
      effect: { target: "self", type: "enter-ready" },
      type: "static",
    });
  });
});
