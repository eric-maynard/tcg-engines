/**
 * Interaction: Crowd Favorite (unl-102-219) · Unit · Body · 3 · 3 Might
 *     "[Hunt] (When I conquer or hold, gain 1 XP.)  Spend 2 XP: [Buff] me."
 *   × Hunter's Machete (unl-096-219) · Equipment · Body · 3 · +2 Might · effect text "[Hunt]"
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · "[Reaction] Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *
 * Question: Hunt arithmetic and a Hunt trigger whose source vanishes. P1 has controlled bfA since last
 * turn; P2 (turn player, about to end the turn) holds Gust and one ready chaos rune.
 *   Case A — the lone holder is a plain Crowd Favorite (3, Hunt). At P1's Beginning Phase the hold is
 *     scored and Hunt goes on the chain; P2 responds with Gust on Crowd Favorite. Does P1 still gain the
 *     XP with the source in hand? Keep the point? Who controls bfA afterwards?
 *   Case B — Crowd Favorite wears Hunter's Machete (+2, effect text [Hunt]). Hunt 2 as ONE keyword or
 *     two Hunt 1 triggers — how many chain items, how much XP, can Gust answer?
 *   Case C — P2 Gusted the plain Crowd Favorite during P2's own turn: does P1 hold/score/Hunt at all?
 *
 * Rules: 471.1 / 471.2.b / 383.4.d.2.a (Hold → point → Hold abilities trigger), 823.1.c.1 (Hunt =
 * "When I conquer or hold, my controller gains X XP"), 823.2 (a unit that has Hunt and is granted Hunt
 * SUMS the values → one Hunt N), 718.3 (Equipment effect text is appended to the equipped unit's text),
 * 355.9.c (an ability on the chain is a separate object from its source), 359.3.e.1 (resolves even if
 * targets went illegal — and Hunt has no target anyway), 191.4.a / 191.4.a.1 (ability controller = the
 * source's controller, or its OWNER once the source is off the board → still P1), 323.6 / 190.4.c (no
 * units at a controlled battlefield in an Open state → control lapses at the next Cleanup), 384.2 (a
 * permanent's trigger conditions are only evaluated while it is on the board), 813 (Gust is a
 * Reaction: playable whenever P2 holds priority).
 *
 * Expected:
 *   A — order: Hold → +1 point → Hunt finalized → P1 passes → P2 taps its rune and Gusts CF (3 ≤ 3, at a
 *       battlefield; 1 energy) → LIFO: CF → P1's hand, then Hunt resolves anyway → +1 XP. Point stands.
 *       At the next Cleanup bfA (no P1 units) becomes uncontrolled.
 *   B — Hunt 1 + granted Hunt 1 = Hunt 2 → ONE triggered ability / one chain item → +2 XP. CF is 5 Might
 *       → Gust has no legal target. Afterwards (main phase, 2 XP) "Spend 2 XP: Buff me" is live.
 *   C — CF already gone → bfA lapsed during P2's turn → at P1's Scoring Step P1 controls nothing: no
 *       hold, no point, no Hunt trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CROWD_FAVORITE = "unl-102-219";
const HUNTERS_MACHETE = "unl-096-219";
const GUST = "ogn-169-298";

/**
 * Turn 2, P2 active (about to end the turn). P1 controls bfA holding only Crowd Favorite (optionally
 * wearing Hunter's Machete). P2: Gust in hand + one ready chaos rune (pools empty at end of turn, so the
 * rune is tapped inside the response window). A second, empty battlefield keeps the map honest.
 */
function board(opts: { machete?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .hand(P2, GUST, "gust")
    .rune(P2, "chaos", { alias: "p2rune" });
  return opts.machete
    ? b
        .unit(P1, "bfA", CROWD_FAVORITE, "cf", { equippedWith: ["machete"] })
        .card("machete", { def: HUNTERS_MACHETE, meta: { attachedTo: "cf" }, owner: P1, zone: "bfA" })
    : b.unit(P1, "bfA", CROWD_FAVORITE, "cf");
}

function gustTargets(game: Game): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P2 ends the turn; P1 (first priority on the Hunt chain) accepts any trigger order and passes; P2 taps its rune. */
async function toP2Window(game: Game): Promise<void> {
  await game.p2.endTurn();
  await game.acceptTriggerOrder(); // no-op unless the engine raised several same-controller triggers
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.tapRune("p2rune");
  expect(game.p2.energy()).toBe(1);
}

describe("Case A — plain Crowd Favorite holds; P2 Gusts it in response to Hunt", () => {
  test("P2 ends turn → P1's Beginning Phase: the hold is already scored (1 point) and exactly one Hunt trigger from CF sits on the chain, XP still 0; P1 has priority first, P2 has no menu yet", async () => {
    const game = await board().build();
    expect(game.state("cf")).toMatchObject({ might: 3, zone: "battlefield-bfA" });
    expect(game.state("cf").keywords).toContain("Hunt");
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // 471.1 — the point precedes the trigger's window
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cf", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("after P1 passes, P2 taps its rune and Gust is castable with CF (3 ≤ 3, at a battlefield) as the offered target for exactly 1 energy; chain = [Hunt, Gust]", async () => {
    const game = await board().build();
    await toP2Window(game);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["cf"]);
    await game.p2.cast("gust", { targets: "cf" });
    expect(game.p2.energy()).toBe(0); // no Deflect on CF → just the 1
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "cf", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "gust", controller: P2, targets: ["cf"], triggered: false }),
    ]);
  });

  test("LIFO: Gust resolves first (CF → P1's hand), then Hunt resolves ANYWAY — the ability is its own object (355.9.c), controller still P1 (191.4.a.1) → XP 0 → 1; the hold point stands", async () => {
    const game = await board().build();
    await toP2Window(game);
    await game.p2.cast("gust", { targets: "cf" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("cf")).toBe("hand");
    expect(game.p1.hand()).toContain("cf");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("afterwards bfA — with no P1 unit on it — has lapsed to UNCONTROLLED at a Cleanup (323.6 / 190.4.c); Gust did not rewind the score", async () => {
    const game = await board().build();
    await toP2Window(game);
    await game.p2.cast("gust", { targets: "cf" });
    await game.settle();
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
  });

  test("control run (P2 lets it resolve): +1 point, +1 XP, CF stays at bfA under P1's control, Gust still in hand", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("cf")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("gust")).toBe("hand");
  });
});

describe("Case B — Crowd Favorite wearing Hunter's Machete: Hunt 1 + Hunt 1 = Hunt 2", () => {
  test("setup: CF is 3 + 2 = 5 Might with the Machete attached and still reads Hunt", async () => {
    const game = await board({ machete: true }).build();
    expect(game.state("cf")).toMatchObject({ attachments: ["machete"], baseMight: 3, might: 5, zone: "battlefield-bfA" });
    expect(game.state("machete")).toMatchObject({ attachedTo: "cf", zone: "battlefield-bfA" });
    expect(game.state("cf").keywords).toContain("Hunt");
  });

  // Expected (823.2 / 718.3): the appended Hunt sums with the printed one into a single "Hunt 2" keyword,
  // i.e. ONE triggered ability → ONE chain item worth 2 XP (one response window, one "ability" for
  // anything that counts abilities). Actual: the engine raises TWO separate Hunt-1 triggers (two chain
  // items from CF, plus a trigger-order offer) — same XP total, wrong object count.
  test("at the hold exactly ONE Hunt chain item appears (Hunt values are summed into Hunt 2, 823.2), not two Hunt-1 items", async () => {
    const game = await board({ machete: true }).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    const huntItems = game.chain().filter((i) => i.cardId === "cf" && i.triggered);
    expect(huntItems).toHaveLength(1);
    expect(game.decision()?.kind).not.toBe("order"); // nothing to order with a single trigger
  });

  test("whatever the item count, the hold is worth 1 point and the Hunt total is +2 XP (0 → 2); CF stays put", async () => {
    const game = await board({ machete: true }).build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0); // still on the chain
    expect(game.chain().every((i) => i.cardId === "cf" && i.triggered && i.controller === P1)).toBe(true);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(1);
    expect(game.state("cf")).toMatchObject({ might: 5, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("P2's response window exists but Gust has NO legal target: CF is 5 Might (> 3) — not offered, a forced cast is rejected, the rune's energy is simply wasted", async () => {
    const game = await board({ machete: true }).build();
    await toP2Window(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(gustTargets(game)).toEqual([]);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "cf" }))).ok).toBe(false);
    expect(game.zoneOf("gust")).toBe("hand");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.zoneOf("cf")).toBe("battlefield-bfA");
  });

  test("payoff: in P1's Main Phase the 2 XP fund CF's own 'Spend 2 XP: [Buff] me' — legal now, XP 2 → 0 on activation, CF buffed to 6 on resolution", async () => {
    const game = await board({ machete: true }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.can("activate", "cf")).toBe(true);
    await game.p1.activate("cf");
    expect(game.p1.xp()).toBe(0); // cost paid up front
    await game.settle();
    expect(game.state("cf")).toMatchObject({ isBuffed: true, might: 6 });
    // …whereas with a single XP (Case A's outcome) the ability is not even offered.
    const one = await scenario().xp(P1, 1).unit(P1, "base", CROWD_FAVORITE, "cf").build();
    expect(one.p1.can("activate", "cf")).toBe(false);
  });
});

describe("Case C (NO side) — P2 Gusted the plain Crowd Favorite during P2's own turn", () => {
  test("Gust is a Reaction, so P2 may cast it in its own Main Phase: CF → P1's hand, and bfA lapses to uncontrolled at the very next Cleanup — still during P2's turn (323.6)", async () => {
    const game = await board().resources(P2, { energy: 1 }).build();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["cf"]);
    await game.p2.cast("gust", { targets: "cf" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("cf")).toBe("hand");
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("P2 then ends the turn → P1's Beginning Phase raises NOTHING: no hold (P1 controls no battlefield), no point, no Hunt trigger (384.2 — CF is in hand); P1 lands in its Main Phase 0 points / 0 XP", async () => {
    const game = await board().resources(P2, { energy: 1 }).build();
    await game.p2.cast("gust", { targets: "cf" });
    await game.settle();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.zoneOf("cf")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
