/**
 * Interaction: Brynhir Thundersong (ogn-026-298) · Unit · Fury · [6] · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Consult the Past (ogn-083-298) · Spell · Mind · [4] · "[Hidden] [Reaction] Draw 2."  — FACEDOWN at bf2
 *   × Seal of Focus (ogn-081-298) · Gear · Calm · [0] · "[Exhaust]: [Reaction] — [Add] [calm]."
 *   (+ Defy ogn-045-298 · Reaction spell in P2's hand; Hextech Ray ogn-009-298 as P1's follow-up.)
 *
 * Question — permission is not entitlement. P1's turn. P2 controls bf2 with U (3), has Consult the Past
 * facedown at bf2 since last turn, a ready Seal of Focus in base and Defy in hand with 1 energy.
 *   (a) P1 plays Brynhir. Is there a window in which P2 can still flip Consult before the lockout starts?
 *   (b) P2 lets the trigger resolve. Later P1 plays Hextech Ray at U and passes. Can P2 flip the facedown
 *       Consult (it "has Reaction")? Play Defy from hand? Activate Seal of Focus?
 *   (c) Ray resolves and U dies — what happens to the never-flipped facedown Consult?
 *   (d) On P2's next turn, is the restriction gone?
 *
 * Rules: 337.2 (a unit resolves immediately; her trigger is then put on the chain — 383), 054.1 (can't
 * beats can), 813.3 / 811.6 (Reaction / Hidden are only permissions about WHEN), 811.1.c.3 (playing from
 * facedown is playing a card), 813.1.c.1 vs 813.1.c.2 (playing a card vs activating an ability),
 * 309.1.a ("this turn"), 323.6 / 323.7 (lose an unoccupied battlefield; hidden cards there go to trash),
 * 358.4 (legality is checked when the play would begin).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const CONSULT_THE_PAST = "ogn-083-298";
const SEAL_OF_FOCUS = "ogn-081-298";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn (turn 2). P1: Brynhir + Hextech Ray in hand, [7] + [fury] (6 for Brynhir, 1 for Ray).
 * P2: controls bf2 with U (3), Consult the Past facedown at bf2 (hidden on an earlier turn), a ready
 * Seal of Focus in base, Defy in hand, 1 energy; plus a cheap unit in hand for the next-turn control.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "U" }, "u")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "consult")
    .gear(P2, SEAL_OF_FOCUS, "seal")
    .hand(P2, DEFY, "defy")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" }, "recruit")
    .hand(P1, BRYNHIR, "brynhir")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** P1 plays Brynhir and passes priority with her trigger on the chain: P2 now holds priority. */
async function triggerPending(): Promise<G> {
  const game = await board().build();
  await game.p1.play("brynhir");
  await game.p1.passPriority();
  return game;
}

/** Brynhir's trigger has resolved (lockout in force); P1 casts Hextech Ray at U and passes → P2's priority. */
async function lockedOutRayWindow(): Promise<G> {
  const game = await board().build();
  await game.p1.play("brynhir");
  await game.settle(); // trigger resolves unopposed
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  await game.p1.cast("ray", { targets: "u" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Brynhir lockout × facedown Consult the Past × Seal of Focus", () => {
  // ── (a) the one window before the lockout ─────────────────────────────────────────────────

  test("(a) Brynhir resolves immediately as a unit (337.2); her 'When you play me' trigger is the only chain item and P1 holds priority first", async () => {
    const game = await board().build();
    await game.p1.play("brynhir");
    expect(game.zoneOf("brynhir")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "brynhir", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) P1 passes → P2 holds priority BEFORE the trigger resolves: the restriction does not exist yet, so flipping the facedown Consult (Reaction via 811.6, cost 0) is legal", async () => {
    const game = await triggerPending();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "consult")).toBe(true);
    expect(game.p2.can("activate", "seal")).toBe(true);
    // Defy counters SPELLS only — a triggered ability is not a legal object, so it is not offered.
    expect(game.p2.can("cast", "defy")).toBe(false);
  });

  test("(a) P2 flips Consult in that window: it goes on the chain above the trigger, resolves first (LIFO) → P2 draws 2 for [0]; then the trigger resolves and the lockout starts", async () => {
    const game = await triggerPending();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p2.reveal("consult");
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} }); // played from hidden for [0]
    expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir", "consult"]);
    await game.settle();
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
    expect(game.p2.deck()).toHaveLength(deck - 2);
    expect(game.chain()).toEqual([]);
    // The trigger resolved after Consult: for the rest of the turn P2 can't play cards.
    await game.p1.cast("ray", { targets: "u" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) after the trigger resolved: card plays vs ability activations ─────────────────────

  test("(b) facedown Consult is NOT playable once the lockout is in force — playing from facedown is still 'playing a card' (811.1.c.3); Hidden/Reaction only say WHEN (811.6, 813.3); can't beats can (054.1)", async () => {
    const game = await lockedOutRayWindow();
    expect(game.p2.can("reveal", "consult")).toBe(false);
    const r = await game.p2.try((p) => p.reveal("consult"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bf2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  });

  test("(b) Defy from hand is NOT playable either (P2 can afford it and Ray is a legal ≤4-cost spell to counter — only Brynhir forbids it)", async () => {
    const game = await lockedOutRayWindow();
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.can("cast", "defy")).toBe(false);
    await expect(game.p2.cast("defy", { targets: "ray" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("(b) Seal of Focus IS activatable — an activated ability of a permanent is not a card being played (813.1.c.2 vs 813.1.c.1): P2 exhausts it and adds [calm]; the Add resolves immediately and P2 keeps priority", async () => {
    const game = await lockedOutRayWindow();
    expect(game.p2.can("activate", "seal")).toBe(true);
    await game.p2.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p2.power("calm")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]); // [Add] abilities don't use the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    // …and the calm power buys nothing: Defy is still locked out.
    expect(game.p2.can("cast", "defy")).toBe(false);
  });

  // ── (c) the lockout costs P2 the hidden card ─────────────────────────────────────────────

  test("(c) Ray resolves: U (3) takes 3 and dies; at the next Cleanup P2 has no unit at bf2 → loses control (323.6) and the never-flipped facedown Consult is put in P2's trash (323.7)", async () => {
    const game = await lockedOutRayWindow();
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p2.trash()).toContain("consult");
    expect(game.p2.facedown("bf2")).toEqual([]);
    // It was removed, not played: P2 drew nothing from it.
    expect(game.p2.hand().sort()).toEqual(["defy", "recruit"].sort());
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) "this turn" ends with P1's turn ──────────────────────────────────────────────────

  test("(d) the restriction is 'this turn' only (309.1.a): on P2's next turn P2 can play cards again (Recruit from hand after tapping a rune)", async () => {
    const game = await lockedOutRayWindow();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    await game.p2.tapRune();
    expect(game.p2.can("play", "recruit")).toBe(true);
    await game.p2.play("recruit", { to: "base" });
    expect(game.zoneOf("recruit")).toBe("base");
    // Seal readied at Awaken and is usable as ever.
    expect(game.state("seal").isReady).toBe(true);
  });
});
