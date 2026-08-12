/**
 * Ruling 7c4793e5f778261d — Defy (OGN-045 → ogn-045-298) · Reaction · Calm · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Siphon Power (ogn-266-298) · Reaction · [2][rainbow] "Choose a battlefield. Give friendly units there
 *     +1 [Might] this turn and enemy units there -1 [Might] this turn, to a minimum of 1."
 *
 * Q: Can Defy counter Siphon (Power), which costs 2 Energy and 1 Power?
 * A: Yes. 2 Energy ≤ [4] and one Power pip ≤ [rainbow]. A split/any-domain Power pip still counts as
 *    exactly one Power for Defy's restriction.
 * Rules: 206 (a card's cost is its printed cost), 355.8 (a spell needs a legal target), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const SIPHON_POWER = "ogn-266-298";
const DIVINE_JUDGMENT = "ogn-244-298"; // [7][order][order] — far over Defy's ceiling

/** P2's turn. P2 holds Siphon Power and the runes for it; P1 waits with Defy. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 2, rainbow: 1 } })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf1", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SIPHON_POWER, "siphon")
    .hand(P1, DEFY, "defy");
}

describe("Ruling 7c4793e5f778261d — Defy can counter Siphon Power: [2] + one Power pip is inside 'no more than [4] and [rainbow]'", () => {
  test("Siphon Power's printed cost really is 2 Energy and exactly ONE Power pip (a split pip still counts once)", async () => {
    const game = await board().build();
    expect(game.state("siphon").energyCost).toBe(2);
    expect(game.state("siphon").powerCost).toHaveLength(1);
  });

  test("Defy names Siphon Power as a legal target and counters it — no Might is changed and Siphon goes to the trash", async () => {
    const game = await board().build();
    await game.p2.cast("siphon", { targets: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "siphon", controller: P2 })]);
    await game.p2.passPriority(); // the caster keeps priority first; now P1 may respond

    const targets = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    const flat = targets.flat();
    expect(flat).toContain("siphon");

    await game.p1.cast("defy", { targets: "siphon" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves: Siphon Power is countered
    expect(game.zoneOf("siphon")).toBe("trash");
    await game.settle();
    expect(game.state("holder").might).toBe(3); // no +1
    expect(game.state("raider").might).toBe(3); // no -1
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a [7][order][order] spell is NOT a legal Defy target (both halves of the restriction bite)", async () => {
    const game = await board().hand(P2, DIVINE_JUDGMENT, "judgment").build();
    await game.p2.cast("judgment");
    await game.p2.passPriority();
    const targets = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    const flat = targets.flat();
    expect(flat).not.toContain("judgment");
    const attempt = await game.p1.try((p) => p.cast("defy", { targets: "judgment" }));
    expect(attempt.ok).toBe(false);
  });

  test("control — left uncountered, Siphon Power does exactly what it says (+1 friendly / -1 enemy at bf1)", async () => {
    const game = await board().build();
    await game.p2.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.state("holder").might).toBe(4);
    expect(game.state("raider").might).toBe(2);
  });
});
