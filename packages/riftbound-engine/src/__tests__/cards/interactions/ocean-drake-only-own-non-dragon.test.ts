/**
 * Interaction: Ocean Drake (ven-115-166) · Unit · Dragon · Chaos · 8+[chaos][chaos] · 7 Might
 *     "You may play me to an open battlefield.
 *      When you play me, you may return a non-Dragon unit to its owner's hand."
 *   × Eclipse Dragon (ven-016-166) · Unit · Dragon · Fury · 8 · 8 Might   — never a legal object
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla) — the only non-Dragon(s)
 *
 * Rules: 383.3.a / 383.3.a.1 / 402.1 / 402.1.a ("you may" as the FIRST words = whether to perform the
 * trigger at all, decided by its controller at finalization; No → removed from the chain), 402.4 (no
 * legal option → removed during finalization, never a Finalized item), 402.4.b (once performing it,
 * the controller MUST choose among legal options — no declining the pick), 355.9.b (targeting
 * restriction "non-Dragon"), 355.10.d.2 (a lone valid object is still a chosen target).
 *
 * Q: P1 plays Ocean Drake.
 *   (a) Every other unit is a Dragon (both players' Eclipse Dragons).            → nothing can be chosen: the
 *       trigger just leaves the chain; the engine should not even ask Yes/No; no unit moves.
 *   (b) The ONLY non-Dragon anywhere is P1's own Skulker.                        → P1 is still asked Yes/No
 *       (the "may" is independent of target count; no auto-resolve). No → Skulker stays. Yes → the
 *       Skulker is bound (auto-bind fine, no way to refuse the pick), P2 gets priority, and it returns
 *       to its OWNER's (P1's) hand.
 *   (c) P2 also has a Skulker.                                                   → Yes yields a real pick
 *       {own Skulker, P2's Skulker}; P2's goes to P2's hand. Eclipse Dragons / the Drake are never offered.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../../harness";

const OCEAN_DRAKE = "ven-115-166";
const ECLIPSE_DRAGON = "ven-016-166";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn with exactly Ocean Drake's 8 + [chaos][chaos]. Dragons on both sides: P1's Eclipse Dragon
 * in base, P2's Eclipse Dragon on P2's bf1. `skulkers` adds the non-Dragon(s): P1's in base ("mine"),
 * P2's in P2's base ("theirs").
 */
function board(skulkers: { mine?: boolean; theirs?: boolean } = {}) {
  let b = scenario()
    .resources(P1, { energy: 8, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ECLIPSE_DRAGON, "myDragon")
    .unit(P2, "bf1", ECLIPSE_DRAGON, "theirDragon")
    .hand(P1, OCEAN_DRAKE, "drake");
  if (skulkers.mine) {
    b = b.unit(P1, "base", SHIPYARD_SKULKER, "mySkulker");
  }
  if (skulkers.theirs) {
    b = b.unit(P2, "base", SHIPYARD_SKULKER, "theirSkulker");
  }
  return b;
}

const pickKeys = (d: Decision | null): string[] => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Play the Drake to base (pays 8 + 2 chaos); it lands and its play trigger is pending. */
async function playDrake(game: Game): Promise<void> {
  await game.p1.play("drake", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("drake")).toBe("base");
}

describe("Ocean Drake's optional 'return a non-Dragon unit' among Dragons", () => {
  test("premise: Ocean Drake and Eclipse Dragon both carry the Dragon tag in the card pool; Shipyard Skulker does not", async () => {
    const pool = await loadDefaultCardPool();
    expect(pool.get(OCEAN_DRAKE)?.tags).toEqual(["Dragon"]);
    expect(pool.get(ECLIPSE_DRAGON)?.tags).toEqual(["Dragon"]);
    expect(pool.get(SHIPYARD_SKULKER)?.tags ?? []).toEqual([]);
  });

  // ── (a) every unit is a Dragon ────────────────────────────────────────────────────────────────
  test("(a) all-Dragon board: whatever is asked, no unit is ever offered or moved — the trigger leaves the chain unperformed and every Dragon (Drake included) stays put (402.4, 355.9.b)", async () => {
    const game = await board().build();
    await playDrake(game);
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind).not.toBe("pick"); // there is nothing legal to pick from
      if (d.kind === "yes-no") {
        await game.p1.yes(); // even an eager "yes" cannot conjure a target
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.zoneOf("myDragon")).toBe("base");
    expect(game.zoneOf("theirDragon")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Expected (402.4, prompt hygiene): with no non-Dragon unit anywhere the optional trigger cannot be
  // performed, so it is removed during finalization WITHOUT a Yes/No — P1 goes straight back to an open
  // main phase. Actual: the engine first asks "Use Ocean Drake's optional ability?" and only then drops it.
  test("(a) no Yes/No is asked for a 'you may return a non-Dragon unit' that has no possible object — it should be removed silently (402.4)", async () => {
    const game = await board().build();
    await playDrake(game);
    const d = game.decision();
    expect(d?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (b) the only non-Dragon is P1's own Skulker ───────────────────────────────────────────────
  test("(b) a single (friendly) legal target does NOT auto-resolve the bounce: P1 is asked Yes/No first, with the Skulker untouched and nothing bound yet (383.3.a.1, 402.1)", async () => {
    const game = await board({ mine: true }).build();
    await playDrake(game);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("drake");
    expect(game.zoneOf("mySkulker")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? null).toBeNull();
  });

  test("(b) NO: the trigger is removed (402.1.a) — chain empty, P1's Skulker stays in base, P1 back in an open main phase", async () => {
    const game = await board({ mine: true }).build();
    await playDrake(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect((await game.settle()).reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("mySkulker")).toBe("base");
    expect(game.p1.hand()).not.toContain("mySkulker");
  });

  test("(b) YES: P1 cannot then refuse — the lone Skulker is bound (auto-bind or a forced single pick, never a decline; Dragons not offered), the item stays on the chain and P2 receives priority before it resolves (402.4.b, 355.10.d.2)", async () => {
    const game = await board({ mine: true }).build();
    await playDrake(game);
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ allowDecline: false, min: 1, seat: P1 });
      expect(pickKeys(d)).toEqual(["mySkulker"]);
      expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
      await game.p1.pick("mySkulker");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", targets: ["mySkulker"], triggered: true })]);
    expect(game.zoneOf("mySkulker")).toBe("base"); // not resolved yet
    // P1 (controller / turn player) holds priority first; passing hands it to P2 with the item still pending.
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
  });

  test("(b) YES resolves: the Skulker returns to its OWNER's hand — P1's — and is a card in hand again (replayable later); Drake and Dragons unmoved", async () => {
    const game = await board({ mine: true }).build();
    await playDrake(game);
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("mySkulker")).toBe("hand");
    expect(game.p1.hand()).toContain("mySkulker");
    expect(game.p2.hand()).not.toContain("mySkulker");
    expect(game.p1.units()).not.toContain("mySkulker");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.zoneOf("myDragon")).toBe("base");
    expect(game.zoneOf("theirDragon")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) P2 also has a Skulker ─────────────────────────────────────────────────────────────────
  test("(c) with a Skulker on each side, YES yields a real two-way pick — exactly {own Skulker, P2's Skulker}: no Eclipse Dragon, not the Drake itself; no decline at this stage", async () => {
    const game = await board({ mine: true, theirs: true }).build();
    await playDrake(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(pickKeys(d).sort()).toEqual(["mySkulker", "theirSkulker"]);
    expect(pickKeys(d)).not.toContain("myDragon");
    expect(pickKeys(d)).not.toContain("theirDragon");
    expect(pickKeys(d)).not.toContain("drake");
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("theirDragon"))).ok).toBe(false);
  });

  test("(c) choosing P2's Skulker returns it to P2's hand (its owner), P1's Skulker stays", async () => {
    const game = await board({ mine: true, theirs: true }).build();
    await playDrake(game);
    await game.p1.yes();
    await game.p1.pick("theirSkulker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", targets: ["theirSkulker"] })]);
    await game.settle();
    expect(game.zoneOf("theirSkulker")).toBe("hand");
    expect(game.p2.hand()).toContain("theirSkulker");
    expect(game.p1.hand()).not.toContain("theirSkulker");
    expect(game.p2.units()).not.toContain("theirSkulker");
    expect(game.zoneOf("mySkulker")).toBe("base");
  });

  test("(c) choosing your own Skulker instead is equally legal: it goes to P1's hand and P2's stays on the board", async () => {
    const game = await board({ mine: true, theirs: true }).build();
    await playDrake(game);
    await game.p1.yes();
    await game.p1.pick("mySkulker");
    await game.settle();
    expect(game.p1.hand()).toContain("mySkulker");
    expect(game.zoneOf("theirSkulker")).toBe("base");
  });

  test("(c) NO with two legal targets around: still simply removed — neither Skulker moves", async () => {
    const game = await board({ mine: true, theirs: true }).build();
    await playDrake(game);
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mySkulker")).toBe("base");
    expect(game.zoneOf("theirSkulker")).toBe("base");
  });
});
