/**
 * Interaction: Smoke and Mirrors (unl-083-219) · Spell · Mind · 2 · [Hidden] [Action]
 *     "Choose a unit you control and another unit you control at a different location. If at least one of
 *      them has [Temporary], move each to the other's location. Draw 1."
 *   × Sprite (ogn-274-298) · 3 [Might] unit token · "[Temporary] (Kill me at the start of your Beginning
 *      Phase, before scoring.)" — 816.1.b
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · "[Reaction] Return a unit at a battlefield with 3 [Might] or
 *      less to its owner's hand." — the reaction that removes the Temporary half of the pair.
 *
 * Question: P1 controls vanilla A at bfA and a 3-Might Sprite token (Temporary) at bfB, and casts Smoke and
 * Mirrors naming A and the Sprite.
 *   (a) P2 Gusts the Sprite in reaction — the Temporary gate was TRUE at finalization and is now
 *       unsatisfiable. Does A still move? Does P1 still draw?
 *   (b) P1 instead Flashes A from bfA to his own base in reaction. The gate is still TRUE. Where do the two
 *       units end up — does the Sprite go to bfA (the location A occupied when the spell was finalized) or
 *       follow A to the base ("the other's location" read at resolution)? Is the pair still legal once A is
 *       in the base?
 *
 * Expected: finalization chooses BOTH units (355.5) and, because this is a Move effect, a destination for
 * EACH move right now (355.4) — A→bfB and Sprite→bfA — and those choices cannot change afterwards (355.15).
 * The [Temporary] clause is a condition on the effect, not a targeting restriction, so it filters neither
 * menu (355.9.b): a Temporary-free pair is a legal (if inert) choice.
 *   (a) The gate is the condition of its own instruction and is read when that instruction executes
 *       (135.2.b.5.a). The departed Sprite is an illegal target whose characteristics read null
 *       (359.3.e.12, 359.3.f.2.a), so "at least one of them has [Temporary]" is FALSE and the swap
 *       instruction is ignored (359.3.e.6). "Draw 1" is a separate, unlinked instruction with no complement
 *       (135.2.b.5.a) and still executes; the spell is still played and trashed (359.3.e.10, 359.3.e.11).
 *       A does not move.
 *   (b) Both remain legal targets: A carries no location restriction and "at a different location" still
 *       holds because P1's base ≠ bfB (359.3.e.2). The gate is TRUE, so the moves run — using the LOCKED
 *       destinations: A moves base→bfB and the Sprite moves bfB→bfA (355.4, 355.15, 446.3). The Sprite does
 *       NOT follow A into the base; "the other's location" is not re-derived at resolution. The swap is no
 *       longer a mutual exchange, and that is correct.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_AND_MIRRORS = "unl-083-219";
const SPRITE = "ogn-274-298";
const FLASH = "ogs-011-024";
const GUST = "ogn-169-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — deck filler, so "Draw 1" is identifiable

/**
 * P1's turn 2. P1 holds bfA with vanilla A and bfB with a Temporary Sprite token, plus a Homebody in base
 * (a second, Temporary-free pairing so the menu can be inspected). P1: Smoke and Mirrors + Flash in hand and
 * 4 energy (2 + 2). P2: Gust in hand and 1 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 2, name: "Vanilla A" }, "A")
    .unit(P1, "bfB", SPRITE, "sprite")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, SMOKE_AND_MIRRORS, "sm")
    .hand(P1, FLASH, "flash")
    .hand(P2, GUST, "gust")
    .deckTop(P1, FILLER, "top");
}

/** The unordered pairs Smoke and Mirrors offers for its `targets` field, as sorted "x+y" strings. */
function pairsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "sm")?.fields.find((f) => f.name === "targets");
  return ((field?.options ?? []) as unknown as string[][]).map((p) => [...p].sort().join("+")).sort();
}

/** Cast Smoke and Mirrors naming A + the Sprite; P1 keeps priority with the spell on the chain. */
async function cast(game: Game): Promise<void> {
  await game.p1.cast("sm", { targets: ["A", "sprite"] });
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "sm", controller: P1, triggered: false }),
  ]);
  expect(game.locationOf("A")).toBe("bfA"); // nothing has moved: the spell is only on the chain
  expect(game.locationOf("sprite")).toBe("bfB");
}

describe("Smoke and Mirrors — the [Temporary] gate is re-read at resolution, the swap destinations are not", () => {
  // ── finalization ──────────────────────────────────────────────────────────────────────────────

  test("premise: the Sprite token carries [Temporary] (816.1.b), A does not, and both are P1's at different locations", async () => {
    const game = await board().build();
    expect(game.state("sprite")).toMatchObject({ controller: P1, isToken: true, might: 3 });
    expect(game.state("sprite").keywords).toContain("Temporary");
    expect(game.state("A").keywords).not.toContain("Temporary");
    expect(game.locationOf("A")).toBe("bfA");
    expect(game.locationOf("sprite")).toBe("bfB");
  });

  test("the [Temporary] clause is a condition on the effect, not a targeting restriction — it filters NEITHER menu (355.9.b): the Temporary-free pair {A, Homebody} is offered too", async () => {
    const game = await board().build();
    expect(pairsOffered(game)).toEqual(["A+home", "A+sprite", "home+sprite"]);
  });

  test("baseline, no reaction: the gate is TRUE, so each unit moves to the other's location (446.3) and P1 draws 1; the spell is trashed", async () => {
    const game = await board().build();
    await cast(game);
    await game.settle();
    expect(game.locationOf("A")).toBe("bfB");
    expect(game.locationOf("sprite")).toBe("bfA");
    expect(game.p1.hand().toSorted()).toEqual(["flash", "top"]);
    expect(game.zoneOf("sm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (a) the Temporary half is Gusted away in reaction ──────────────────────────────────────────

  test("(a) P2 Gusts the Sprite in reaction: the token ceases to exist (186.1) and — the gate being read as its own instruction executes (135.2.b.5.a) over a target whose characteristics are now null (359.3.e.12 / 359.3.f.2.a) — the swap instruction is IGNORED (359.3.e.6): A does not move", async () => {
    const game = await board().build();
    await cast(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "sprite" });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    expect(game.locationOf("A")).toBe("bfA");
    expect(game.p1.units("bfA")).toEqual(["A"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("sm")).toBe("trash"); // still played, still trashed (359.3.e.10)
    expect(game.violations()).toEqual([]);
  });

  test('"Draw 1" still happens when the swap is ignored: it is a separate instruction with no complement (135.2.b.5.a), unlinked to the move, so 359.3.e.10 / 359.3.e.11 make it execute anyway', async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await cast(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "sprite" });
    await game.settle();
    expect(game.p1.hand()).toContain("top");
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
  });

  // ── (b) the OTHER half is Flashed home in reaction ─────────────────────────────────────────────

  test("(b) P1 Flashes A from bfA to base in reaction: both remain legal targets — A carries no location restriction and 'at a different location' still holds (base ≠ bfB, 359.3.e.2) — so the gate is TRUE and A completes its LOCKED move to bfB (355.4 / 355.15); P1 still draws 1", async () => {
    const game = await board().build();
    await cast(game);
    await game.p1.cast("flash", { targets: ["A"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sm" }),
      expect.objectContaining({ cardId: "flash" }),
    ]);
    await game.settle();
    expect(game.locationOf("A")).toBe("bfB");
    expect(game.p1.hand().toSorted()).toEqual(["top"]);
    expect(game.zoneOf("sm")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the Sprite takes A's FINALIZED location, not A's new one: move destinations are chosen when the spell is played (355.4) and cannot change afterwards (355.15), so the locked pair stays A\u2192bfB and Sprite\u2192bfA", async () => {
    const game = await board().build();
    await cast(game);
    await game.p1.cast("flash", { targets: ["A"] });
    await game.settle();
    expect(game.locationOf("sprite")).toBe("bfA");
    expect(game.p1.units("bfA")).toEqual(["sprite"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  });
});
