/**
 * Ruling 64a68481f6779d7c — Hidden Blade (OGN-213 → ogn-213-298) · Order Action · [2][order] · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · [2] · +1 Might "[Equip] [calm] — If I would die, kill Guardian
 *     Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: Hidden Blade on a unit wearing Guardian Angel — does its controller still draw 2?
 * A: Yes. The unit is a legal target at a battlefield when the Blade begins to resolve; Guardian Angel's replacement turns
 *    the kill into "kill GA instead; heal, exhaust, recall the unit", and the Blade finishes resolving — the unit's
 *    controller draws 2.
 * Rules: 359.3.e (legality checked as resolution begins), 369–373 (replacement effects), 454 (recall is not a move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/**
 * P1's turn with exactly [2][order]. P2 holds bf1 with a 3-Might Ward wearing Guardian Angel (→ 4) and a 2-Might Sentry.
 * P2's deck top known: q1..q4. P1's deck top known too (nobody but the controller should draw).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Ward" }, "ward", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "ward" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["q1", "q2", "q3", "q4"])
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p1a", "p1b", "p1c"]);
}

/** Cast the Blade at the Ward and let it resolve, accepting a replacement prompt if the engine surfaces one. */
async function bladeTheWard(): Promise<Game> {
  const game = await board().build();
  expect(game.state("ward")).toMatchObject({ attachments: ["ga"], might: 4 });
  await game.p1.cast("blade", { targets: "ward" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["ward"] })]);
  await game.settle({ policy: "first" });
  return game;
}

describe("Ruling 64a68481f6779d7c — Guardian Angel saves the Hidden-Bladed unit and its controller still draws 2", () => {
  test("Guardian Angel replaces the kill: GA goes to P2's trash INSTEAD, the Ward lives — healed, exhausted, recalled to P2's base (bare 3 Might again)", async () => {
    const game = await bladeTheWard();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.state("ward")).toMatchObject({ attachments: [], controller: P2, damage: 0, isExhausted: true, location: "base", might: 3 });
    expect(game.p2.trash()).not.toContain("ward");
  });

  test("ruling: the Blade still resolved on a legal target — 'its controller draws 2': P2 draws q1, q2 (P1 draws nothing)", async () => {
    const game = await bladeTheWard();
    expect(game.p2.hand()).toEqual(["q1", "q2"]);
    expect(game.p2.deck()[0]).toBe("q3");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("p1a");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same Blade on the unprotected Sentry simply kills it — and P2 likewise draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand()).toEqual(["q1", "q2"]);
    expect(game.zoneOf("ga")).toBe("battlefield-bf1"); // untouched, still on the Ward
    expect(game.state("ward").attachments).toEqual(["ga"]);
  });
});
