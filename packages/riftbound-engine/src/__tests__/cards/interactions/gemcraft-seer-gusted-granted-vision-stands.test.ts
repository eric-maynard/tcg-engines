/**
 * Interaction: Gemcraft Seer (ogn-100-298) · Unit · Mind · 3+[mind] · 3 Might
 *     "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *      Other friendly units have [Vision]."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ Sprite Burst unl-069-219 "Play two ready 3 [Might] Sprite unit tokens with [Temporary]" for the
 *    simultaneous-play facet; inline vanilla units X / Y / Z.)
 *
 * Question: P1's turn; P1's Gemcraft Seer sits at bf1 (a battlefield → Gust-able, 3 Might).
 *   (a) P1 plays vanilla X to base. X has granted Vision, so its "when you play me, look/recycle" trigger goes on
 *       the chain. P2 responds with Gust on the Seer. LIFO: Seer → hand, grant ends, X no longer has Vision. Does
 *       X's already-finalized Vision trigger still resolve?
 *   (b) P2 Gusts the Seer in an EARLIER chain, before X is played: any Vision for X?
 *   (c) P1 replays the Seer from hand while X is already on the board: does X retroactively look? Does the
 *       replayed Seer's own printed Vision fire? Do later units get Vision again?
 *   (d) Two units played simultaneously (Sprite Burst) with the Seer out: how many Vision triggers, and if P2
 *       Gusts the Seer in response, do both still resolve?
 *
 * Rules: 477.2.b ("Other friendly units have [Vision]" — ability-granting passive), 817.1 / 817.2 (Vision is a
 * triggered ability; instances trigger separately), 419.4.a + 337.2 (a unit resolves immediately; play triggers
 * fire on completion), 337 (all pending items finalize before priority), 340.1 (newest item resolves first),
 * 365.1 (passives only active on the board), 124 (zone change → new object), 383.2.a.1 / 359.3.f.3 (a finalized
 * triggered ability resolves independently of its source/grantor still existing), 383.2.c (trigger conditions
 * are evaluated when the event happens — no retroactive triggering).
 *
 * Expected: (a) YES — Gust resolves first, Seer → P1's hand, X loses Vision, but X's trigger stays on the chain
 * and resolves: P1 looks at the top card and may recycle it. (b) NO trigger. (c) No look for X; the replayed Seer
 * (new object) fires its OWN Vision once; a unit played afterwards gets Vision again. (d) Two triggers; Gusting
 * the Seer in response removes the grant but both finalized triggers still resolve (two looks).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GEMCRAFT_SEER = "ogn-100-298";
const GUST = "ogn-169-298";
const SPRITE_BURST = "unl-069-219";
const FILLER = "ogn-175-298"; // vanilla deck cards with known aliases

/**
 * P1's turn. P1: Seer at bf1 (P1's battlefield), vanilla X / Y / Z (1 energy each) + Sprite Burst (5) in hand,
 * 12 energy + 1 mind (enough for everything incl. a Seer replay), deck top d1 d2 d3.
 * P2: Gust in hand with exactly 1 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { mind: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GEMCRAFT_SEER, "seer")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Unit X" }, "x")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Unit Y" }, "y")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Unit Z" }, "z")
    .hand(P1, SPRITE_BURST, "burst")
    .hand(P2, GUST, "gust")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

function isVisionLook(d: Decision | null, source?: string): boolean {
  return !!d && d.kind === "pick" && d.seat === P1 && (source === undefined || d.source?.cardId === source);
}

/** Pass priority (whoever holds it) until a non-priority prompt appears or the chain is empty. */
async function passToPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.acting().pass();
  }
}

/** Hand priority to P2 and have P2 Gust the Seer; then pass until Gust (the newest item) has resolved. */
async function p2GustsSeerAndItResolves(game: Game): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "seer" });
  const chain = game.chain();
  expect(chain[chain.length - 1]).toMatchObject({ cardId: "gust", controller: P2 });
  const below = chain.length - 1;
  // Both players pass once → only the top item (Gust) resolves (340.1).
  for (let i = 0; i < 4 && game.chain().length > below; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().pass();
  }
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.zoneOf("seer")).toBe("hand");
}

describe("Gemcraft Seer × Gust — a granted Vision trigger already on the chain survives the grantor leaving", () => {
  // ── (a) ────────────────────────────────────────────────────────────────────────────────────────

  test("(a) setup: X played to base has granted [Vision] and exactly one Vision trigger (source X) is on the chain; the Seer at bf1 is a legal Gust target for P2", async () => {
    const game = await board().build();
    await game.p1.play("x", { to: "base" });
    expect(game.zoneOf("x")).toBe("base"); // 337.2 — the unit itself resolved immediately
    expect(game.state("x").keywords).toContain("Vision"); // 477.2.b
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "x", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    const offered = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("seer");
  });

  test("(a) Gust resolves first (LIFO): Seer → P1's hand, X's granted Vision is gone (365.1) — but X's finalized trigger is STILL on the chain", async () => {
    const game = await board().build();
    await game.p1.play("x", { to: "base" });
    await p2GustsSeerAndItResolves(game);
    expect(game.p1.hand()).toContain("seer");
    expect(game.state("x").keywords).not.toContain("Vision");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "x", triggered: true })]);
  });

  test("(a) …and it resolves: P1 looks at d1 and may recycle it (383.2.a.1 / 359.3.f.3) — recycling puts d1 on the bottom, d2 on top", async () => {
    const game = await board().build();
    await game.p1.play("x", { to: "base" });
    await p2GustsSeerAndItResolves(game);
    await passToPrompt(game);
    const d = game.decision();
    expect(isVisionLook(d, "x")).toBe(true);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d1"]);
    expect(d).toMatchObject({ allowDecline: true });
    await game.p1.pick("d1");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d2");
    expect(deck[deck.length - 1]).toBe("d1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) ────────────────────────────────────────────────────────────────────────────────────────

  test("(b) Seer Gusted in an EARLIER chain (in response to Y's Vision): X played afterwards has no Vision and puts nothing on the chain", async () => {
    const game = await board().build();
    await game.p1.play("y", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "y", triggered: true })]);
    await p2GustsSeerAndItResolves(game);
    // Y's own (already finalized) look still happens — decline the recycle.
    await passToPrompt(game);
    expect(isVisionLook(game.decision(), "y")).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Now X: the grant is gone before X's play completes → no trigger at all.
    await game.p1.play("x", { to: "base" });
    expect(game.state("x").keywords).not.toContain("Vision");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck()[0]).toBe("d1"); // nobody looked / recycled
  });

  // ── (c) ────────────────────────────────────────────────────────────────────────────────────────

  test("(c) replaying the Gusted Seer with X already on board: exactly ONE trigger — the Seer's own printed Vision — and no retroactive look for X (383.2.c)", async () => {
    const game = await board().build();
    await game.p1.play("x", { to: "base" });
    await p2GustsSeerAndItResolves(game);
    await passToPrompt(game);
    await game.p1.decline(); // X's look from (a), declined → d1 still on top
    await game.settle();
    expect(game.zoneOf("seer")).toBe("hand");
    const energyBefore = game.p1.energy();
    await game.p1.play("seer", { to: "base" });
    expect(game.p1.energy()).toBe(energyBefore - 3);
    expect(game.p1.power("mind")).toBe(0);
    // X regains the keyword (grant re-registers on board entry) but its play is in the past: no trigger for X.
    expect(game.state("x").keywords).toContain("Vision");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seer", triggered: true })]);
    expect(game.chain().filter((c) => c.cardId === "x")).toEqual([]);
    await passToPrompt(game);
    expect(isVisionLook(game.decision(), "seer")).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) after the replay, a unit played LATER (Z) gets Vision again — one trigger sourced from Z", async () => {
    const game = await board().build();
    await game.p1.play("x", { to: "base" });
    await p2GustsSeerAndItResolves(game);
    game.script(P1, ["decline", "decline"]); // X's look, then the replayed Seer's own look
    await game.settle();
    await game.p1.play("seer", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.play("z", { to: "base" });
    expect(game.state("z").keywords).toContain("Vision");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "z", triggered: true })]);
    await passToPrompt(game);
    expect(isVisionLook(game.decision(), "z")).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) ────────────────────────────────────────────────────────────────────────────────────────

  /** Cast Sprite Burst, resolve the spell (tokens → base), stop at the priority window over the Vision triggers. */
  async function burstResolved(game: Game): Promise<string[]> {
    await game.p1.cast("burst");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "burst", triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick("base");
        continue;
      }
      break;
    }
    await game.acceptTriggerOrder();
    expect(game.zoneOf("burst")).toBe("trash");
    return game.p1.units("base").filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");
  }

  test("(d) Sprite Burst with the Seer out: two Sprites, each with its own granted Vision → TWO Vision triggers on the chain (817.2)", async () => {
    const game = await board().build();
    const sprites = await burstResolved(game);
    expect(sprites).toHaveLength(2);
    for (const s of sprites) {
      expect(game.state(s).keywords).toContain("Vision");
    }
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain.every((c) => c.triggered && sprites.includes(c.cardId))).toBe(true);
    expect(new Set(chain.map((c) => c.cardId))).toEqual(new Set(sprites));
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(d) P2 Gusts the Seer in response to the Sprites' triggers: grant gone, but BOTH finalized Vision triggers still resolve — two separate looks", async () => {
    const game = await board().build();
    const sprites = await burstResolved(game);
    await p2GustsSeerAndItResolves(game);
    for (const s of sprites) {
      expect(game.state(s).keywords).not.toContain("Vision");
    }
    expect(game.chain()).toHaveLength(2);
    let looks = 0;
    const sources: string[] = [];
    for (let i = 0; i < 4; i++) {
      await passToPrompt(game);
      const d = game.decision();
      if (!isVisionLook(d)) {
        break;
      }
      looks += 1;
      sources.push(String(d?.source?.cardId));
      // 817.2.b — not recycling: each instance sees the same card.
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d1"]);
      await game.p1.decline();
    }
    expect(looks).toBe(2);
    expect(new Set(sources)).toEqual(new Set(sprites));
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("(d) control: a unit played AFTER that Gust (Z) gets nothing", async () => {
    const game = await board().build();
    await burstResolved(game);
    await p2GustsSeerAndItResolves(game);
    game.script(P1, ["decline", "decline"]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.play("z", { to: "base" });
    expect(game.state("z").keywords).not.toContain("Vision");
    expect(game.chain()).toEqual([]);
  });
});
