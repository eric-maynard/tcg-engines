/**
 * Ruling b340ee201c962ad4 — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · 3+[fury] · Action
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Stupefy (OGN-095 → ogn-095-298) · Spell · Mind · 1 · Reaction "Give a unit -1 Might this turn, to a minimum of 1. Draw 1."
 *   (+ Retreat, ogn-104-298 · Reaction · "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *    — the opponent's response that "retreats" the targeted unit.)
 *
 * Q: For Void Seeker / Stupefy, do you still draw if the opponent retreats the targeted unit in response?
 * A: Yes. The spell still resolves; only the instruction that needs the (now illegal) target does nothing — the
 *    independent "Draw 1" resolves normally.
 * Rules: 359.3.f (illegal/missing target → that instruction is skipped), 355.8 (targets locked; spell still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const STUPEFY = "ogn-095-298";
const RETREAT = "ogn-104-298";

/** P1's turn. P2 holds bf1 with a 5-Might Brute and has Retreat + exactly 1 energy. */
function board(p1: { energy: number; power: Record<string, number> }, spell: string) {
  return scenario()
    .resources(P1, p1)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 1, name: "Squire" }, "squire") // keeps bf1 occupied so nothing else changes
    .hand(P1, spell, "spell")
    .hand(P2, RETREAT, "retreat")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

/** P1 casts `spell` at the Brute; P2 answers with Retreat on the Brute; everything resolves. */
async function castThenRetreated(game: Game): Promise<void> {
  await game.p1.cast("spell", { targets: "brute" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", controller: P1, targets: ["brute"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "retreat")).toBe(true);
  await game.p2.cast("retreat", { targets: "brute" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "retreat"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Ruling b340ee201c962ad4 — the target retreating does not stop the 'Draw 1'", () => {
  test("Void Seeker: Retreat resolves first (Brute → P2's hand); Void Seeker then deals no damage anywhere but P1 STILL draws 1; costs stay paid", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }, VOID_SEEKER).build();
    const p1Hand0 = game.p1.hand().length;
    await castThenRetreated(game);
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("hand");
    expect(game.p2.hand()).toContain("brute");
    expect(game.zoneOf("spell")).toBe("trash"); // resolved, not countered
    expect(game.state("squire").damage).toBe(0); // the 4 damage did not go anywhere else
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1); // cast Void Seeker, drew 1
    expect(game.p1.hand()).toContain("p1top");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Stupefy: same — the -1 Might has no legal object (Brute is in hand), yet P1 STILL draws 1", async () => {
    const game = await board({ energy: 1, power: {} }, STUPEFY).build();
    const p1Hand0 = game.p1.hand().length;
    await castThenRetreated(game);
    expect(game.zoneOf("brute")).toBe("hand");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("squire").might).toBe(1); // untouched
    expect(game.state("squire").mightModifier).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1);
    expect(game.p1.hand()).toContain("p1top");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no response: Void Seeker deals its 4 to the Brute AND P1 draws 1", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }, VOID_SEEKER).build();
    const p1Hand0 = game.p1.hand().length;
    await game.p1.cast("spell", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
    expect(game.p1.hand()).toContain("p1top");
  });
});
