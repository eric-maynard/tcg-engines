/**
 * Rules Audit: optional ("you may ...") triggered abilities (Core Rules
 * 2026-03-30 change — "may triggered abilities").
 *
 * The 2026-03-30 patch made "may" triggered abilities *optional to place on
 * the chain*: when the trigger condition is fulfilled the controller of the
 * ability chooses whether to add it to the chain. The engine adds it by
 * default so headless / auto play does not stall on a prompt, but:
 *   - the chain item is flagged `optional: true`, and
 *   - the controller may invoke the `declineTrigger` move to opt out before
 *     it resolves, which marks the item as countered (effect skipped on
 *     resolve, item still leaves the chain normally).
 *
 * Rules covered:
 *   addToChain      — propagates the `optional` flag onto the chain item
 *   fireTriggers    — an optional triggered ability lands on the chain flagged
 *   declineTrigger  — only the item's controller may decline, only `optional`
 *                     items are eligible, and the result is `countered: true`
 */

import { describe, expect, it } from "bun:test";
import { addToChain, createInteractionState } from "../../chain/chain-state";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createCard,
  createMinimalGameState,
  fireTrigger,
  getChainItems,
  setInteractionStateForTest,
} from "./helpers";
import type { CardId } from "../../types";

describe("Unleashed — optional ('you may ...') triggered abilities", () => {
  it("addToChain: an item built with optional:true keeps the flag on the chain", () => {
    const state = createInteractionState();
    const next = addToChain(
      state,
      {
        cardId: "src" as string,
        controller: P1,
        effect: { amount: 1, type: "draw" },
        optional: true,
        triggered: true,
        type: "ability",
      },
      [P1, P2],
    );
    expect(next.chain?.items).toHaveLength(1);
    expect(next.chain?.items[0]).toMatchObject({ optional: true, triggered: true });
  });

  it("addToChain: a non-optional triggered ability is not flagged optional", () => {
    const state = createInteractionState();
    const next = addToChain(
      state,
      {
        cardId: "src" as string,
        controller: P1,
        effect: { amount: 1, type: "draw" },
        triggered: true,
        type: "ability",
      },
      [P1, P2],
    );
    expect(next.chain?.items[0]?.optional).toBeUndefined();
  });

  it("fireTriggers: a 'you may' triggered ability lands on an active chain flagged optional", () => {
    const engine = createMinimalGameState();
    const src = "u-maybe" as CardId;
    createCard(engine, src, {
      abilities: [
        {
          effect: { amount: 1, type: "draw" },
          optional: true,
          trigger: { event: "conquer", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      controller: P1,
      might: 3,
      owner: P1,
      zone: "base",
    });

    // A chain must already exist for triggers to be *added* to it (rule 541);
    // Otherwise they resolve inline. Install a minimal active chain.
    const chain = createInteractionState();
    const seeded = addToChain(
      chain,
      { cardId: "seed" as string, controller: P1, effect: undefined, type: "spell" },
      [P1, P2],
    );
    setInteractionStateForTest(engine, seeded);

    const fired = fireTrigger(engine, { cardId: src, playerId: P1, type: "conquer" } as never);
    expect(fired).toBe(1);

    const items = getChainItems(engine);
    const optItem = items.find((i) => i.cardId === src);
    expect(optItem).toBeDefined();
    expect(optItem?.triggered).toBe(true);
    expect(optItem?.optional).toBe(true);
  });

  it("declineTrigger: the item's controller may decline an optional chain item — it becomes countered", () => {
    const engine = createMinimalGameState();
    const seeded = addToChain(
      createInteractionState(),
      {
        cardId: "u-maybe" as string,
        controller: P1,
        effect: { amount: 1, type: "draw" },
        optional: true,
        triggered: true,
        type: "ability",
      },
      [P1, P2],
    );
    setInteractionStateForTest(engine, seeded);
    const itemId = seeded.chain!.items[0]!.id;

    expect(checkMoveLegal(engine, "declineTrigger", { playerId: P1, targetChainItemId: itemId }))
      .toBe(true);
    const res = applyMove(engine, "declineTrigger", { playerId: P1, targetChainItemId: itemId });
    expect(res.success).toBe(true);

    const items = getChainItems(engine);
    expect(items[0]?.countered).toBe(true);
  });

  it("declineTrigger: a player who does not control the item may not decline it", () => {
    const engine = createMinimalGameState();
    const seeded = addToChain(
      createInteractionState(),
      {
        cardId: "u-maybe" as string,
        controller: P1,
        effect: { amount: 1, type: "draw" },
        optional: true,
        triggered: true,
        type: "ability",
      },
      [P1, P2],
    );
    setInteractionStateForTest(engine, seeded);
    const itemId = seeded.chain!.items[0]!.id;

    expect(checkMoveLegal(engine, "declineTrigger", { playerId: P2, targetChainItemId: itemId }))
      .toBe(false);
  });

  it("declineTrigger: a mandatory (non-optional) triggered item cannot be declined", () => {
    const engine = createMinimalGameState();
    const seeded = addToChain(
      createInteractionState(),
      {
        cardId: "u-must" as string,
        controller: P1,
        effect: { amount: 1, type: "draw" },
        triggered: true,
        type: "ability",
      },
      [P1, P2],
    );
    setInteractionStateForTest(engine, seeded);
    const itemId = seeded.chain!.items[0]!.id;

    expect(checkMoveLegal(engine, "declineTrigger", { playerId: P1, targetChainItemId: itemId }))
      .toBe(false);
  });
});
