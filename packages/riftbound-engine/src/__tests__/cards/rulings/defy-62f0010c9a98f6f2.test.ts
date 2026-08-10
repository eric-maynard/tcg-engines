/**
 * Ruling 62f0010c9a98f6f2 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no
 *     more than [rainbow]."
 *   × Abandon (UNL-131 → unl-131-219) · Reaction · [2] · "Counter a spell. Return it to its owner's hand instead of putting it in their
 *     trash. [Predict]."
 *   Spell being fought over: Void Seeker (ogn-024-298) · [3][fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: I Defy a spell; my opponent Abandons my Defy back to my hand. Can I let Abandon resolve and then recast Defy on the original spell?
 * A: Yes. The chain resolves one item at a time; after Abandon resolves (Defy → hand) a priority window opens before the original
 *    spell resolves. Defy is a Reaction, so it can be played again in that window (paying its cost again) targeting the original
 *    spell, which is still on the chain and still meets Defy's cost limit — and it counters it.
 * Rules: 340.1 (priority after each resolution), 337 (Reactions on a chain), 412 (Counter), 124 (returned card is a new object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const ABANDON = "unl-131-219";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn. P2: Void Seeker + Abandon with [5][fury]. P1: Defy with [2] + calm×2 (enough for two casts); P1's Target (3) at bf1. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 1 } })
    .resources(P1, { energy: 2, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Target" }, "target")
    .hand(P2, VOID_SEEKER, "vs")
    .hand(P2, ABANDON, "abandon")
    .hand(P1, DEFY, "defy");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Void Seeker → Defy on it → Abandon on Defy; then both pass so that ONLY Abandon resolves (P2 declines the Predict recycle). */
async function abandonResolves(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vs", { targets: "target" });
  await game.p2.passPriority();
  await game.p1.cast("defy", { targets: "vs" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  await game.p1.passPriority();
  await game.p2.cast("abandon", { targets: "defy" });
  expect(chainIds(game)).toEqual(["vs", "defy", "abandon"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Abandon resolves
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d && d.kind !== "action" && d.seat === P2) {
      await game.p2.decline(); // Predict: leave the top card
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 62f0010c9a98f6f2 — after Abandon returns Defy to hand, Defy can be recast on the original spell before it resolves", () => {
  test("Abandon resolves alone: Defy is back in P1's hand, Void Seeker is STILL on the chain unresolved, and a priority window is open", async () => {
    const game = await abandonResolves();
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("hand");
    expect(chainIds(game)).toEqual(["vs"]);
    expect(game.state("target").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("in that window P1 may cast Defy AGAIN (paying [1][calm] again) at Void Seeker — still a legal ≤4 / ≤1-power target", async () => {
    const game = await abandonResolves();
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "defy")).toBe(true);
    const field = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("vs");
    await game.p1.cast("defy", { targets: "vs" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(chainIds(game)).toEqual(["vs", "defy"]);
  });

  test("the recast Defy resolves and counters Void Seeker: no damage to Target, P2 draws nothing, both spells in their owners' trash", async () => {
    const game = await abandonResolves();
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("defy", { targets: "vs" });
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
