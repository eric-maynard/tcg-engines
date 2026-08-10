/**
 * Ruling 6aca98f228230f55 — Hidden Blade (OGN-213 → ogn-213-298) · Action · Order · [2][order] · [Hidden]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment — "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: Does Hidden Blade's draw still happen when Guardian Angel saves the unit?
 * A: Yes. The target was legal (a unit at a battlefield) when Hidden Blade resolved; the kill is REPLACED by Guardian
 *    Angel's effect, but the spell still resolves and the unit's controller is known — they draw 2.
 * Rules: 369–373 (replacement effects replace the event, not the spell's resolution), 359.3.e (legality checked at
 *        resolution start), Hidden Blade's draw keys off the targeted unit's controller.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn. P2 holds bf1 with Champ (3) wearing Guardian Angel, plus a Sentry (2). P1: Hidden Blade + [2][order]. P2's deck top known. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Champ" }, "champ", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "champ" } as Record<string, unknown>, owner: P2, zone: "base" })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .deck(P1, ["ogn-175-298"], ["a1"]);
}

async function bladeAtChampResolves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("champ").attachments).toEqual(["ga"]);
  await game.p1.cast("blade", { targets: "champ" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["champ"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.settle({ policy: "first" }); // accept a replacement prompt if one is surfaced
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("blade")).toBe("trash");
  return game;
}

describe("Ruling 6aca98f228230f55 — Guardian Angel saves the unit from Hidden Blade, and its controller STILL draws 2", () => {
  test("the kill is replaced: Guardian Angel is killed instead; Champ is healed, exhausted and recalled to P2's base (alive)", async () => {
    const game = await bladeAtChampResolves();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("champ")).toBe("base");
    expect(game.state("champ")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.state("champ").attachments).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
  });

  test("…and Hidden Blade still completes: Champ's controller (P2) draws exactly 2; the caster (P1) draws nothing", async () => {
    const game = await bladeAtChampResolves();
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.p2.deck()[0]).toBe("d3");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("a1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
