/**
 * Ruling 1a721c651c023e03 — Not So Fast (SFD-045 → sfd-045-221) · Reaction [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Can you Not So Fast a Defy?
 * A: No. Defy chooses a SPELL on the chain, not a unit or gear, so it never meets Not So Fast's requirement —
 *    the same reason Not So Fast can't counter another Not So Fast.
 * Rules: 355 (choosing/targets), 425 (counter).
 *
 * Setup: P1 casts Discipline (ogn-058-298, [2], "+2 Might, draw 1") on P1's own unit; P2 Defies it. P1 holds
 * Not So Fast. Control: P2 instead answers with Smoke Screen (ogn-093-298) on P1's unit — THAT is counterable.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const DEFY = "ogn-045-298";
const DISCIPLINE = "ogn-058-298";
const SMOKE_SCREEN = "ogn-093-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P2, DEFY, "defy")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1, mind: 1 } });
}

/** P1 casts Discipline on Ally and passes; P2 answers with Defy on Discipline. Priority now with P2. */
async function defyLine(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("discipline", { targets: "ally" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "discipline" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["discipline", "defy"]);
  return game;
}

describe("Ruling 1a721c651c023e03 — Not So Fast cannot counter Defy (Defy chooses a spell, not a unit or gear)", () => {
  test("with Defy on the chain P1 gets priority but Not So Fast has no legal target: it is not castable / Defy is not offered", async () => {
    const game = await defyLine();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const opt = game.p1.option("cast", "nsf");
    const offered = (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("defy");
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "defy" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline", "defy"]);
    expect(game.p1.hand()).toContain("nsf");
  });

  test("so Defy resolves and counters Discipline: no +2, no draw, both spells to trash; Not So Fast stays in hand", async () => {
    const game = await defyLine();
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("ally").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(hand); // nothing drawn (Discipline already left the hand before)
    expect(game.p1.hand()).toContain("nsf");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: an enemy spell that DOES choose a friendly unit (Smoke Screen on Ally) is a legal Not So Fast target and gets countered", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("smoke");
    expect(offered).not.toContain("discipline"); // own spell is not "enemy"
    await game.p1.cast("nsf", { targets: "smoke" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline", "smoke", "nsf"]);
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("ally").might).toBe(5); // Smoke countered, Discipline resolved
    expect(game.violations()).toEqual([]);
  });
});
