/**
 * Core rules — ordering SIMULTANEOUS triggered abilities on the Chain (rule 383.3.d).
 *
 *   383.3.d    the player controlling several simultaneously triggered abilities selects the order
 *              they are placed on the Chain (last placed = top = resolves first, 337.1.b).
 *   383.3.d.1  different controllers: turn player first, then turn order — nobody with a single
 *              trigger is asked anything.
 *   808.2      copies of one trigger (two identical Deathknells) are interchangeable — no question.
 *
 * Engine model: once a batch is finalized, the same-controller items are offered to that player as a
 * SOFT `order` decision (`defaultable: true`, timing FIN). `seat.order([...keys])` (first = bottom,
 * last = top) rearranges them; ANY other verb / settle() keeps the listed scan order, so tests that do
 * not care are unaffected. `game.acceptTriggerOrder()` accepts the listed order explicitly.
 *
 * Cards: Undercover Agent ogn-178-298 ([Deathknell] — Discard 2, then draw 2), Watchful Sentry
 * ogn-096-298 ([Deathknell] — Draw 1), The Ruination unl-180-219 (Kill all units), Flurry of Blades
 * ogn-133-298.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const AGENT = "ogn-178-298";
const SENTRY = "ogn-096-298";
const RUINATION = "unl-180-219";
const FLURRY = "ogn-133-298";
const FILLER = "ogn-175-298";

/** P2's turn. P1: Agent + Sentry at bf1, hand [H], deck D1 D2 D3. P2 resolves The Ruination. */
function agentAndSentry() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AGENT, "agent")
    .unit(P1, "bf1", SENTRY, "sentry")
    .hand(P1, FILLER, "H")
    .deck(P1, [FILLER, FILLER, FILLER], ["D1", "D2", "D3"])
    .hand(P2, RUINATION, "ruin");
}

async function resolveRuination(game: Game): Promise<void> {
  await game.p2.cast("ruin");
  await game.p2.passPriority();
  await game.p1.passPriority();
}

function orderDecision(game: Game): Extract<Decision, { kind: "order" }> {
  const d = game.decision();
  expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1, timing: "FIN" });
  return d as Extract<Decision, { kind: "order" }>;
}

describe("383.3.d — same-controller simultaneous triggers are offered to their controller for ordering", () => {
  test("after The Ruination resolves, P1 (controller of both Deathknells) sees a soft order decision naming both items; P2 is not asked", async () => {
    const game = await agentAndSentry().build();
    await resolveRuination(game);
    const d = orderDecision(game);
    expect(d.items.map((i) => i.card).sort()).toEqual(["agent", "sentry"]);
    // The items are already on the chain in scan order (agent appended first, sentry on top).
    expect(game.chain().map((c) => c.cardId)).toEqual(["agent", "sentry"]);
    // The seat's own actions stay available beside the offer.
    expect((d.actions ?? []).some((o) => o.moveId === "passChainPriority")).toBe(true);
  });

  test("unanswered = scan order: passing priority accepts it (sentry on top resolves first → Agent discards H + D1 → hand {D2, D3})", async () => {
    const game = await agentAndSentry().build();
    await resolveRuination(game);
    orderDecision(game);
    await game.p1.passPriority(); // any other verb accepts the listed order
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.pendingTriggerOrder).toBeUndefined();
    await game.settle({ policy: "first" });
    expect(game.p1.hand().sort()).toEqual(["D2", "D3"]);
  });

  test("settle() also keeps the listed order (passive policy answers the soft offer with no keys)", async () => {
    const game = await agentAndSentry().build();
    await resolveRuination(game);
    const r = await game.settle({ policy: "first" });
    expect(r.reason).toBe("open");
    expect(game.p1.hand().sort()).toEqual(["D2", "D3"]);
    expect(game.violations()).toEqual([]);
  });

  test("explicit order [sentry, agent] puts the Agent on TOP: it resolves first (discard H only, draw D1 D2), then Sentry draws D3 → hand {D1, D2, D3}", async () => {
    const game = await agentAndSentry().build();
    await resolveRuination(game);
    const d = orderDecision(game);
    const keyOf = (card: string) => d.items.find((i) => i.card === card)?.key as string;
    await game.p1.order([keyOf("sentry"), keyOf("agent")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry", "agent"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle({ policy: "first" });
    expect(game.p1.hand().sort()).toEqual(["D1", "D2", "D3"]);
    expect(game.p1.trash()).toContain("H");
    expect(game.p1.trash()).not.toContain("D1");
  });

  test("game.acceptTriggerOrder() takes the listed order and returns to the priority window", async () => {
    const game = await agentAndSentry().build();
    await resolveRuination(game);
    expect(await game.acceptTriggerOrder()).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(await game.acceptTriggerOrder()).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["agent", "sentry"]);
  });
});

describe("383.3.d.1 / 808.2 — no question when there is nothing to order", () => {
  test("two IDENTICAL Deathknells (two Sentries) of one controller: interchangeable, no offer", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "s1")
      .unit(P1, "bf1", SENTRY, "s2")
      .hand(P2, FLURRY, "flurry")
      .build();
    await game.p2.cast("flurry");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.pendingTriggerOrder).toBeUndefined();
  });

  test("one trigger per controller (P1's Sentry, P2's Sentry): turn player's item goes on first, the other on top; nobody is asked", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "mine")
      .unit(P2, "bf1", SENTRY, "theirs")
      .hand(P2, FLURRY, "flurry")
      .build();
    await game.p2.cast("flurry");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain().map((c) => `${c.cardId}:${c.controller}`)).toEqual([`theirs:${P2}`, `mine:${P1}`]);
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
