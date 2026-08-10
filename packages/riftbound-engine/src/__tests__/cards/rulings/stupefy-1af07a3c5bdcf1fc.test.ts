/**
 * Ruling 1af07a3c5bdcf1fc — Stupefy (OGN-095 → ogn-095-298) · Reaction spell · Mind · [1]
 *     "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Frigid Touch (SFD-066 → sfd-066-221) · Reaction spell · Mind · [2] · Repeat [2] — "Give a unit -2 [Might] this turn."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · Unit · Fury · 3 Might
 *     "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *
 * Q: Does Stupefy or Frigid Touch (Might reduction that makes a damaged unit die) trigger Immortal Phoenix?
 * A: No. Phoenix only triggers when a spell KILLS a unit — via a "kill" instruction or via damage the spell deals.
 *    A stat reduction that leaves damage ≥ Might is a system-rules death in the cleanup, not "killing with a spell".
 * Rules: 428.5.c (killed by a spell), 520 (cleanup death from damage ≥ Might), FAQ #2625.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const FRIGID_TOUCH = "sfd-066-221";
const IMMORTAL_PHOENIX = "ogn-037-298";
/** Inline damage spell as the positive control: "Deal 2 to a unit." */
const BOLT = { abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Bolt", timing: "action" };

/**
 * P1's turn. P2's Victim at bf1: 3 Might with 1 damage already marked (so -2 kills it via cleanup) — or 2 Might
 * with 1 damage for Stupefy's -1. Immortal Phoenix in P1's trash; P1 has the spell's cost PLUS a spare [1][fury]
 * so a Phoenix offer, if it came, would be payable.
 */
function board(victimMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: victimMight, name: "Victim" }, "victim", { damage: 1 })
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, FRIGID_TOUCH, "frigid")
    .hand(P1, BOLT, "bolt")
    .resources(P1, { energy: 3, power: { fury: 1 } });
}

function isPhoenixOffer(d: Decision | null): boolean {
  return !!d && d.seat === P1 && d.kind !== "action" && (d.source?.cardId === "phoenix" || /phoenix/i.test(d.prompt));
}

/** Settle; report whether a Phoenix offer ever surfaced (declining nothing — an offer stops settle). */
async function settleWatchingPhoenix(game: Game): Promise<boolean> {
  const r = await game.settle();
  return r.reason === "unanswered" && isPhoenixOffer(game.decision());
}

describe("Ruling 1af07a3c5bdcf1fc — Might-reduction deaths (Stupefy / Frigid Touch) do not trigger Immortal Phoenix", () => {
  test("Frigid Touch: 3-Might Victim with 1 damage gets -2 → 1 Might, 1 damage ⇒ dies in cleanup; NO Phoenix offer, Phoenix stays in trash, spare [1][fury] untouched", async () => {
    const game = await board(3).build();
    expect(game.state("victim")).toMatchObject({ damage: 1, might: 3 });
    await game.p1.cast("frigid", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    const offered = await settleWatchingPhoenix(game);
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash"); // it did die…
    expect(offered).toBe(false); // …but not "killed with a spell"
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.units()).not.toContain("phoenix");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Stupefy: 2-Might Victim with 1 damage gets -1 → 1 Might, 1 damage ⇒ dies in cleanup (P1 draws 1); NO Phoenix offer", async () => {
    const game = await board(2).build();
    const hand = game.p1.hand().length;
    await game.p1.cast("stupefy", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    const offered = await settleWatchingPhoenix(game);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(offered).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("positive control: a spell that DEALS DAMAGE and thereby kills the Victim does trigger Phoenix — P1 is offered to pay [1][fury] and Phoenix comes back from the trash", async () => {
    const game = await board(3).build();
    await game.p1.cast("bolt", { targets: "victim" }); // 1 marked + 2 dealt = 3 ≥ 3
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    const offered = await settleWatchingPhoenix(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(offered).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle({ policy: "first" });
    expect(game.p1.units()).toContain("phoenix");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  });
});
