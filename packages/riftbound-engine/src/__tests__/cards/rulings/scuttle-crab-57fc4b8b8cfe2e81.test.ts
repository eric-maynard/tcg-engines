/**
 * Ruling 57fc4b8b8cfe2e81 — Scuttle Crab (UNL-053 → unl-053-219) · Unit · Calm · 2 · 0 Might "When you play me, draw 1.
 *   [Deathknell] Choose an opponent. They reveal their hand. … Gain 1 XP."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and
 *     recall me." × Imperial Decree (OGN-221 → ogn-221-298) · [Action] · 5+[order][order] "When any unit takes damage this turn,
 *     kill it." × Bellows Breath (SFD-080 → sfd-080-221) · [Action] · 1+[mind] "Deal 1 to up to three units at the same location."
 *
 * Q: My Crab wears Guardian Angel; the opponent plays Imperial Decree, then a non-repeated Bellows Breath on it. Result?
 * A: The Crab dies. Bellows deals 1 → Decree's delayed trigger is created; the lethal damage would kill the Crab in cleanup and
 *    Guardian Angel replaces THAT death (GA killed, Crab healed/exhausted/recalled); then the Decree trigger finalizes, resolves,
 *    follows the Crab to base and kills it — GA is gone and cannot save it twice.
 * Rules: 382 (delayed trigger), 372–373 (single-use replacement), 320–323 (cleanup kills lethal-damaged units), 808.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";
const GUARDIAN_ANGEL = "sfd-051-221";
const IMPERIAL_DECREE = "ogn-221-298";
const BELLOWS_BREATH = "sfd-080-221";

/** P2's turn with exactly 5+[order][order] + 1+[mind]. P1's Scuttle Crab holds bf1 wearing Guardian Angel. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 1, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SCUTTLE_CRAB, "crab", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "crab" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P2, IMPERIAL_DECREE, "decree")
    .hand(P2, BELLOWS_BREATH, "bellows");
}

/** Decree resolves (delayed trigger armed for the turn); then Bellows (not repeated) on the Crab resolves. */
async function decreeThenBellows(): Promise<Game> {
  const game = await board().build();
  expect(game.state("crab").attachments).toEqual(["ga"]);
  await game.p2.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  await game.p2.cast("bellows", { targets: ["crab"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } }); // no Repeat paid
  await game.p2.passPriority();
  await game.p1.passPriority(); // Bellows resolves: 1 to the Crab
  expect(game.zoneOf("bellows")).toBe("trash");
  return game;
}

describe("Ruling 57fc4b8b8cfe2e81 — Guardian Angel eats the damage death, then Imperial Decree's trigger kills the Crab anyway", () => {
  test("right after Bellows resolves: Guardian Angel has replaced the lethal-damage death (GA in trash; Crab healed, exhausted, recalled to base) AND Imperial Decree's kill trigger is waiting on the chain", async () => {
    const game = await decreeThenBellows();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.state("crab")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("crab").attachments).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the Decree trigger then resolves, tracks the Crab to base and kills it there — with GA already spent nothing saves it; its Deathknell still pays out (P1 gains 1 XP)", async () => {
    const game = await decreeThenBellows();
    const xpBefore = game.p1.xp();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p1.xp()).toBe(xpBefore + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Bellows alone (no Decree this turn): Guardian Angel's one save is enough; the Crab lives on in base, exhausted", async () => {
    const game = await board().build();
    await game.p2.cast("bellows", { targets: ["crab"] });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.state("crab")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.chain()).toEqual([]);
  });
});
