/**
 * Interaction: four points in flight on one Hold — does the game end mid-chain at exactly 8?
 *   Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · 5 + [calm] · 4 Might — "When I hold, you score 1 point."
 *   Shen, Leader of the Kinkou Order (ven-138-166) · Champion Unit · Order · 6 + [order][order] · 7 Might
 *     "[Shield] · When I hold, if there is exactly one other unit you control here, you score 1 point."
 *   Trinity Force (sfd-115-221) · Gear/Equipment · Body · 4 — "[Equip] [body] · When I hold, score 1 point."
 *
 * Question. P1 is on 6 points and, in its Beginning Phase, maintains control of one battlefield where
 * Ahri and Shen stand with Trinity Force attached to Ahri. Four points are in flight: the Hold itself
 * plus three simultaneous triggers. Is an ORDER prompt raised, is every option in it legal, and does
 * the game END the moment the score crosses 8 in the cleanup after the FIRST trigger resolves — leaving
 * the other two unresolved on the chain — or does the engine resolve all three to 10 first?
 *
 * Expected.
 *   1) The Hold scores 1 (469.2), once per battlefield per turn (470): 6 → 7.
 *   2) The Hold puts three triggers on the chain simultaneously. Shen's "exactly one other unit you
 *      control here" counts UNITS: Trinity Force is Equipment, so with Ahri and Shen there the count is
 *      exactly 1 and Shen's clause is satisfied. The controller orders them (383.3.d); every listed
 *      order must be answerable.
 *   3) The chain resolves LIFO. After the FIRST of the three resolves P1 is at 8; that item leaving the
 *      chain makes a cleanup an outstanding task (319.5), and in that cleanup P1 has points ≥ the
 *      Victory Score (8, rule 486.3) and more than the opponent, so P1 WINS (194.2). The other two
 *      triggers never resolve.
 *   4) The final score reads exactly 8 — not 9, not 10 — and every facedown card is revealed (421.4).
 *   5) Ordering cannot change the outcome here (all three give +1), but the prompt is still offered.
 *   6) Concede stays reachable throughout, including while the order prompt is open (650).
 *
 * Rules: 469.2, 470, 194.1.c, 194.2, 319.5, 421.4, 486.3, 486.6, 355.8, 358.3.a, 650, 383.3.d.
 *
 * The Bo3 game-over box ("Continue to game 2", the match score line — 486.6) is a match-layer surface;
 * it is covered by the sibling files bo3-climb-victory-track-9-then-8 and bo3-loser-chooses-first-vs-g1-roll.
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-066-298";
const SHEN = "ven-138-166";
const TRINITY_FORCE = "sfd-115-221";

/**
 * Turn 2, P2 active and about to end the turn. P1 is on 6 points and controls bf1 with Ahri (wearing
 * Trinity Force) and Shen; P2 sits on 2 with a bystander in base.
 */
function board(opts: { trinity?: boolean; thirdUnit?: boolean; facedown?: boolean; points?: number } = {}) {
  const withTrinity = opts.trinity !== false;
  const b = scenario()
    .turn(2)
    .active(P2)
    .points(P1, opts.points ?? 6)
    .points(P2, 2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI, "ahri", withTrinity ? { equippedWith: ["trinity"] } : undefined)
    .unit(P1, "bf1", SHEN, "shen");
  if (withTrinity) {
    b.card("trinity", { def: TRINITY_FORCE, meta: { attachedTo: "ahri" }, owner: P1, zone: "bf1" });
  }
  if (opts.thirdUnit) {
    b.unit(P1, "bf1", { might: 2, name: "Third" }, "third");
  }
  if (opts.facedown) {
    b.facedown(P1, "bf1", { cardType: "spell", energyCost: 1, name: "Hidden Blade" }, "hidden");
  }
  return b.unit(P2, "base", { might: 1, name: "Bystander" }, "grunt");
}

/** P2 ends the turn → P1's Beginning Phase: the Hold has scored and the trigger order is pending. */
async function atOrderOffer(opts: Parameters<typeof board>[0] = {}): Promise<{ game: Game; order: OrderDecision }> {
  const game = await board(opts).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  const d = game.decision();
  expect(d?.kind).toBe("order");
  return { game, order: d as OrderDecision };
}

/** All orderings of `keys`. */
function permutations<T>(keys: readonly T[]): T[][] {
  if (keys.length <= 1) {
    return [[...keys]];
  }
  return keys.flatMap((k, i) => permutations([...keys.slice(0, i), ...keys.slice(i + 1)]).map((rest) => [k, ...rest]));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The Hold and the three triggers
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("the Hold itself (469.2 / 470) and the batch of three triggers it fires", () => {
  test("the Hold scores exactly one point — 6 → 7, capped at once per battlefield per turn — before any trigger has resolved", async () => {
    const { game } = await atOrderOffer();
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(2);
    expect(game.isOver()).toBe(false);
  });

  test("all three triggers are on the chain simultaneously, all P1's, none countered — Ahri, Trinity Force (attached to Ahri) and Shen", async () => {
    const { game, order } = await atOrderOffer();
    expect(order.seat).toBe(P1);
    expect(order.items).toHaveLength(3);
    expect(game.chain()).toHaveLength(3);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    expect(order.items.map((i) => i.card).filter((c) => c === "shen")).toEqual(["shen"]);
    // Trinity Force's trigger is sourced on its HOST, so two of the three items read "Ahri, Alluring
    // trigger" — mechanically distinct items with the same label.
    expect(order.items.filter((i) => i.card === "ahri")).toHaveLength(2);
  });

  test("every listed order is answerable and P2 decides nothing here (383.3.d — one controller orders their own batch)", async () => {
    const { game, order } = await atOrderOffer();
    expect(game.p2.decision()).toBeNull();
    for (const keys of permutations(order.items.map((i) => i.key))) {
      const fresh = await atOrderOffer();
      await fresh.game.p1.order(keys);
      expect(fresh.game.decision()).toMatchObject({ context: "chain", kind: "action" });
    }
  });

  test("Shen's clause counts UNITS only: Trinity Force is Equipment, so with Ahri + Shen the 'exactly one other unit' count is 1 and Shen triggers", async () => {
    const { order } = await atOrderOffer();
    expect(order.items.some((i) => i.card === "shen")).toBe(true);
  });

  test("control: add a THIRD unit at bf1 and the count is 2 — Shen's trigger is not created at all, leaving only Ahri's and Trinity Force's", async () => {
    const { game, order } = await atOrderOffer({ thirdUnit: true });
    expect(order.items.map((i) => i.card)).toEqual(["ahri", "ahri"]);
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().some((c) => c.cardId === "shen")).toBe(false);
  });

  test("concede stays reachable while the order prompt is open (650) — it is on P1's menu and on the prompt's own action list", async () => {
    const { game, order } = await atOrderOffer();
    expect(game.p1.can("concede")).toBe(true);
    expect(order.actions?.map((a) => a.verb)).toContain("concede");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The win lands mid-chain, at exactly 8
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("194.2 / 319.5 — the FIRST trigger to resolve ends the game at 8; the other two never resolve", () => {
  test("P1 wins at exactly 8 — not 9, not 10 — with the two unresolved triggers still sitting on the chain", async () => {
    const { game, order } = await atOrderOffer();
    await game.p1.order(order.items.map((i) => i.key));
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.status).toBe("finished");
    expect(game.chain()).toHaveLength(2); // the two that never resolved
    expect(game.p2.points()).toBe(2);
  });

  test("the game really ends there: no decision is pending for anybody and neither seat has a legal move left (196)", async () => {
    const { game, order } = await atOrderOffer();
    await game.p1.order(order.items.map((i) => i.key));
    await game.settle();
    expect(game.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    expect(game.phase()).toBe("beginning"); // it never reached Channel or Draw
    expect(game.violations()).toEqual([]);
  });

  test("EVERY ordering gives the same answer: 8 points, P1 wins, exactly two triggers left unresolved (all three are +1)", async () => {
    const { order } = await atOrderOffer();
    for (const keys of permutations(order.items.map((i) => i.key))) {
      const fresh = await atOrderOffer();
      await fresh.game.p1.order(keys);
      await fresh.game.settle();
      expect(fresh.game.p1.points()).toBe(8);
      expect(fresh.game.winner()).toBe(P1);
      expect(fresh.game.chain()).toHaveLength(2);
    }
  });

  test("contrast from 5: the Hold makes 6 and the three triggers resolve one after another to 7, 8 — the win lands on the SECOND trigger and the third never resolves", async () => {
    const { game, order } = await atOrderOffer({ points: 5 });
    expect(game.p1.points()).toBe(6);
    await game.p1.order(order.items.map((i) => i.key));
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.chain()).toHaveLength(1);
  });

  test("contrast from 4: nothing reaches 8 at all — the Hold makes 5 and all three triggers resolve to 8… which then wins on the last one, chain empty", async () => {
    const { game, order } = await atOrderOffer({ points: 4 });
    expect(game.p1.points()).toBe(5);
    await game.p1.order(order.items.map((i) => i.key));
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  test("every facedown card is revealed when the game ends — P1's hidden card at bf1 is still marked hidden after the points win (421.4)", async () => {
    // Expected (421.4, second limb: "…or if the game ends, its owner reveals it to all players").
    // Actual: the card stays in `facedown-bf1` with `isHidden: true`. Same defect as the dedicated
    // file game-end-reveals-facedown-teemo-zhonyas.test.ts, asserted here on the points-win path.
    const { game, order } = await atOrderOffer({ facedown: true });
    await game.p1.order(order.items.map((i) => i.key));
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.state("hidden").isHidden).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// When no order prompt is raised at all
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("383.3.d — two INTERCHANGEABLE score triggers are not offered an order", () => {
  // DESIGN (rule 383.3.d): the engine offers the order prompt only when the batch contains at least two
  // items whose effects are actually distinguishable (`trigger-finalization.ts raiseTriggerOrderPrompt`
  // — "interchangeable items leave nothing to order"). Ahri's and Shen's triggers are both a
  // source-independent "you score 1 point", so with Trinity Force off the board there is nothing to
  // order and both are placed in the listed order without asking. Trinity Force's trigger is NOT
  // interchangeable with Ahri's, which is why the three-trigger batch above does raise the prompt.
  test("with Trinity Force removed the two remaining triggers are identical 'you score 1 point' items: no order Decision is raised, they are simply placed", async () => {
    const game = await board({ trinity: false }).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["ahri", "shen"]);
    expect(game.p1.points()).toBe(7);
  });

  test("…and the outcome is the same as with the prompt: the first to resolve takes P1 to 8 and wins, one trigger left unresolved", async () => {
    const game = await board({ trinity: false }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.chain()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
