/**
 * Ruling b4ce94c68e3390a5 — Stupefy (OGN-095 → ogn-095-298) · Reaction · Mind · 1
 *   "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Falling Comet (OGN-085 → ogn-085-298) · Action · Fury · 5 · "Deal 6 to a unit at a battlefield."
 *   (observer: Immortal Phoenix ogn-037-298 — "When you kill a unit with a spell, you may pay [1][fury] to play me
 *    from your trash.")
 *
 * Q: A 7-Might unit has 6 damage on it (Falling Comet); Stupefy then makes it 6 Might. Does it die, and what killed it?
 * A: It dies in the Cleanup after Stupefy resolves (damage 6 ≥ Might 6). Stupefy is NOT the spell that killed it —
 *    it dealt no damage; the kill is credited to Falling Comet, the spell that applied the damage.
 * Rules: 520 / 140.3 (cleanup kills a unit whose damage ≥ Might), 428.5.c (which spell "killed" a unit: the one
 *        that applied the damage, never a Might reduction).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const FALLING_COMET = "ogn-085-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/** P1's turn. P2's Giant (7) at bf1. P1: Falling Comet (5) + Stupefy (1) in hand, 7 energy + a spare [fury] for a Phoenix offer; Phoenix in P1's trash. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Giant" }, "giant")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P1, STUPEFY, "stupefy")
    .resources(P1, { energy: 7, power: { fury: 1 } });
}

function isPhoenixOffer(d: Decision | null): boolean {
  return !!d && d.seat === P1 && d.kind !== "action" && (d.source?.cardId === "phoenix" || /phoenix/i.test(d.prompt));
}

/** Falling Comet the Giant (6 damage, survives at 7), then Stupefy it. Stops right after Stupefy is cast. */
async function cometThenStupefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("comet", { targets: "giant" });
  expect(game.p1.energy()).toBe(2);
  await game.settle();
  expect(game.zoneOf("comet")).toBe("trash");
  expect(game.state("giant")).toMatchObject({ damage: 6, might: 7, zone: "battlefield-bf1" }); // 6 < 7: alive
  await game.p1.cast("stupefy", { targets: "giant" });
  expect(game.p1.energy()).toBe(1);
  return game;
}

describe("Ruling b4ce94c68e3390a5 — Stupefy after Falling Comet: the unit dies in Cleanup, and the Comet (not Stupefy) is the killer", () => {
  test("Falling Comet leaves the 7-Might Giant alive with 6 damage; Stupefy resolves (-1 → 6 Might, P1 draws 1) and the Giant is killed in the following Cleanup (6 damage ≥ 6 Might)", async () => {
    const game = await cometThenStupefy();
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1); // "Draw 1"
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.p2.trash()).toContain("giant");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge b4ce94c68e3390a5 credits the Cleanup kill to Falling Comet (the spell that applied the
  // damage, whenever it resolved); riftjudge 46208875b334d665 answers the identical shape — damage spell leaves the
  // unit alive, Stupefy's -1 Might finishes it in the Cleanup — the opposite way, and the CR sides with the latter.
  // Rule 428.5.c attributes the kill to "the spell or ability that RESOLVED IMMEDIATELY PRIOR to that Cleanup THAT
  // DEALT DAMAGE": both conditions bind one object. Stupefy resolved immediately prior but dealt no damage, and
  // Falling Comet did not resolve immediately prior (Stupefy came in between), so nothing is attributed the kill and
  // Immortal Phoenix ("when you kill a unit with a spell") never triggers. The engine is correct; this facet asserts
  // the engine's (and the CR's) behaviour, matching the landed void-seeker-46208875b334d665 test.
  test("ruling b4ce94c68e3390a5 (CR-corrected): no spell is attributed the Cleanup kill — Stupefy dealt no damage and the Comet did not resolve immediately prior — so Immortal Phoenix is never offered", async () => {
    const game = await cometThenStupefy();
    const r = await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(r.reason).toBe("open");
    expect(isPhoenixOffer(game.decision())).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("trash"); // still in the trash — no play offer was made
    expect(game.p1.units()).not.toContain("phoenix");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // nothing was paid
    expect(game.violations()).toEqual([]);
  });
});
