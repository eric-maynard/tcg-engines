/**
 * Ruling 175e63203f2ffc60 — Possession (OGN-203 → ogn-203-298, Action, 8 + [chaos]x3)
 *   "[Action] Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment +1) "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: I Possess a unit wearing Guardian Angel — do I benefit from the GA replacement effect?
 * A: Yes. The gear stays attached and its text stays active. If the possessed unit would die, GA is killed
 *    instead (→ its OWNER's, i.e. the opponent's, trash) and the unit is healed, exhausted and recalled to MY base;
 *    I keep control because the unit never left the board. The opponent still controls the GA gear itself.
 * Rules: 369–373 (replacement effects are mandatory; 370.1.a.1), 428.2 (killed → owner's trash), 455 (control),
 *        719 (attached equipment stays attached through a change of control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** Inline P2 Action spell: deal 6 to a unit — lethal for the 4-Might possessed unit. */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "action",
} as const;

/** P1's turn. P2's Unit U (3) wearing P2's Guardian Angel (→ 4) stands at P2's bf1. P1 has exactly 8 + [chaos]x3 for Possession. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit U" }, "U", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "U" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .hand(P1, POSSESSION, "possession")
    .hand(P2, BIG_BOLT, "bolt");
}

async function possessed(): Promise<Game> {
  const game = await board().build();
  expect(game.state("U")).toMatchObject({ attachments: ["ga"], controller: P2, might: 4 });
  await game.p1.cast("possession", { targets: "U" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("possession")).toBe("trash");
  return game;
}

describe("Ruling 175e63203f2ffc60 — a Possessed unit keeps its Guardian Angel and P1 benefits from the replacement", () => {
  test("Possession: P1 takes control of U and recalls it to P1's base; Guardian Angel remains attached (U is still 4) and is still OWNED by P2", async () => {
    const game = await possessed();
    expect(game.state("U")).toMatchObject({ attachments: ["ga"], controller: P1, location: "base", might: 4, owner: P2 });
    expect(game.p1.units("base")).toContain("U");
    expect(game.p2.units("bf1")).not.toContain("U");
    expect(game.state("ga")).toMatchObject({ attachedTo: "U", owner: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the opponent (P2) still controls the Guardian Angel gear itself", async () => {
    const game = await possessed();
    expect(game.state("ga")).toMatchObject({ attachedTo: "U", controller: P2, owner: P2 });
  });

  test("lethal damage to the possessed U: Guardian Angel is killed INSTEAD (→ P2's trash); U is healed, exhausted and stays in P1's base under P1's control", async () => {
    const game = await possessed();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("U")).toMatchObject({ attachments: ["ga"], controller: P1, location: "base" });
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("bolt", { targets: "U" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("bolt")).toBe("trash");
    // GA died instead → its owner's (P2's) trash.
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.p1.trash()).not.toContain("ga");
    // U never left the board: healed, exhausted, in P1's base, P1 still controls it; back to 3 Might.
    expect(game.zoneOf("U")).toBe("base");
    expect(game.p2.trash()).not.toContain("U");
    expect(game.p1.trash()).not.toContain("U");
    expect(game.state("U")).toMatchObject({ attachments: [], controller: P1, damage: 0, isExhausted: true, location: "base", might: 3, owner: P2 });
    expect(game.p1.units("base")).toContain("U");
    expect(game.p2.units("base")).not.toContain("U");
    expect(game.violations()).toEqual([]);
  });
});
