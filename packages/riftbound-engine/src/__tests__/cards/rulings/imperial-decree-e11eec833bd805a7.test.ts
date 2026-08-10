/**
 * Ruling e11eec833bd805a7 — Imperial Decree (OGN-221 → ogn-221-298) · [Action] 5 + [order][order] · "When any unit takes damage
 *     this turn, kill it."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · [Action] 1 + [mind] · "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *   × Stellacorn Herder (SFD-048 → sfd-048-221) · 3 Might · "When I move, draw 1."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: Imperial Decree, then a Repeated Bellows Breath on a Stellacorn Herder wearing Guardian Angel — does she die?
 * A: Yes. Two damage instances ⇒ two Decree kill-triggers (ID1, ID2). LIFO: ID2 resolves first — GA replaces that death
 *    (GA killed; Herder healed, exhausted, recalled to base). ID1 then resolves, tracks her to base and kills her; GA is
 *    single-use. Recall is not a move, so "When I move" never draws.
 * Rules: 820 (Repeat → two damage events), 383, 331 (LIFO), 371–373 (replacement consumed), 359.3.e.3, 450 (recall ≠ move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const BELLOWS_BREATH = "sfd-080-221";
const STELLACORN_HERDER = "sfd-048-221";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn with [7] + 2 order + 2 mind. P2's Herder (3 +1 GA = 4) wearing Guardian Angel at P2's bf1 with a Holder. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", STELLACORN_HERDER, "herder", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "herder" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, BELLOWS_BREATH, "breath");
}

/** Decree resolves; the Repeated Breath on {Herder} resolves → two Decree triggers are on the chain. */
async function twoTriggers(): Promise<Game> {
  const game = await board().build();
  expect(game.state("herder")).toMatchObject({ attachments: ["ga"], might: 4 });
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  await game.p1.cast("breath", { repeat: 1, targets: ["herder"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Breath resolves: 1 + 1 to the Herder
  return game;
}

describe("Ruling e11eec833bd805a7 — two Decree triggers vs one Guardian Angel: Stellacorn Herder dies", () => {
  test("the Repeated Breath is two damage instances: Herder has 2 damage (alive at 4 Might) and TWO Decree kill-triggers sit on the chain", async () => {
    const game = await twoTriggers();
    expect(game.zoneOf("breath")).toBe("trash");
    expect(game.state("herder")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    const hits = (game.gameState.damageLog ?? []).filter((r) => r.target === "herder");
    expect(hits.map((r) => r.amount)).toEqual([1, 1]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "decree", triggered: true }),
      expect.objectContaining({ cardId: "decree", triggered: true }),
    ]);
  });

  test("ID2 resolves first: Guardian Angel replaces the death — GA killed (P2's trash), Herder healed, exhausted and RECALLED to base at 3 Might (no 'When I move' draw); ID1 still waits", async () => {
    const game = await twoTriggers();
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.state("herder")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 3, zone: "base" });
    expect(game.p2.hand()).toHaveLength(p2Hand); // recall is not a move (450)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", triggered: true })]);
  });

  test("ruling: ID1 then resolves, follows the Herder to base and kills her — no Guardian Angel left to save her", async () => {
    const game = await twoTriggers();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("herder")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.units("base")).toEqual([]);
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // untouched bystander
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an UN-repeated Breath is one damage instance ⇒ one Decree trigger ⇒ Guardian Angel saves the Herder (alive in base)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("breath", { repeat: 0, targets: ["herder"] });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("herder")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });
});
