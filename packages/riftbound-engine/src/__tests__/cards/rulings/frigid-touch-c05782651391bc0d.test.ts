/**
 * Ruling c05782651391bc0d — Frigid Touch (SFD-066 → sfd-066-221) · Spell · Mind · 2 · Reaction
 *     "[Repeat] [2] … Give a unit -2 Might this turn."
 *   × Fiora, Victorious (OGN-232 → ogn-232-298) · Unit · 4 Might "While I'm Mighty, I have [Deflect], [Ganking], and
 *     [Shield]. (I'm Mighty while I have 5+ Might.)"
 *
 * Q: Frigid Touch with Repeat, both executions on a BUFFED Fiora (5 Might → Mighty → Deflect). Must I pay Deflect twice,
 *    given she stops being Mighty after the first -2? And is it a recycle?
 * A: Pay Deflect for BOTH choices — both targets are chosen while playing the spell, when she still has Deflect; losing
 *    Mighty during resolution changes nothing retroactively. Deflect adds a POWER cost (not a recycle):
 *    2 (base) + 2 (Repeat) energy + 2 power total.
 * Rules: 820.2 (Repeat targets chosen at play), 809.1.c / 809.1.c.1 (Deflect: extra [rainbow] power per time chosen),
 *        356 (costs fixed and paid at play, not at resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_TOUCH = "sfd-066-221";
const FIORA_VICTORIOUS = "ogn-232-298";

/** P1's turn. P2's Fiora is BUFFED (4 + 1 = 5 → Mighty) in P2's base. P1 holds Frigid Touch and two ready runes (to show nothing is recycled). */
function board(p1: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, p1)
    .runes(P1, "mind", 2)
    .unit(P2, "base", FIORA_VICTORIOUS, "fiora", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Other" }, "other")
    .hand(P1, FRIGID_TOUCH, "frigid");
}

describe("Ruling c05782651391bc0d — Repeated Frigid Touch on a Mighty Fiora pays Deflect twice, in Power", () => {
  test("premise: buffed Fiora is 5 Might and currently has Deflect (Mighty)", async () => {
    const game = await board({ energy: 4, power: { mind: 2 } }).build();
    expect(game.state("fiora")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.state("fiora").keywords).toContain("Deflect");
  });

  test("casting it with Repeat choosing Fiora both times costs exactly 4 energy + 2 power (2 base + 2 Repeat; Deflect ×2) — all paid up front, no rune recycled — and it is ONE chain item targeting [fiora, fiora]", async () => {
    const game = await board({ energy: 4, power: { mind: 2 } }).build();
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("frigid", { repeat: 1, targets: ["fiora", "fiora"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.runes()).toHaveLength(runesBefore); // Deflect is a Power cost, not a Recycle
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "frigid", controller: P1, targets: ["fiora", "fiora"] })]);
  });

  test("on resolution the first -2 drops her to 3 (no longer Mighty, Deflect gone) and the second still applies: 5 → 1 — nothing extra is charged or refunded at that point", async () => {
    const game = await board({ energy: 4, power: { mind: 2 } }).build();
    await game.p1.cast("frigid", { repeat: 1, targets: ["fiora", "fiora"] });
    await game.settle();
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ might: 1, mightModifier: -4 });
    expect(game.state("fiora").keywords).not.toContain("Deflect");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("the second Deflect pip is mandatory: with 4 energy but only ONE power, [fiora, fiora] with Repeat is not a legal cast — it is listed-but-unaffordable and dispatching it is refused (single Fiora, or Fiora + the vanilla Other, still is legal)", async () => {
    const game = await board({ energy: 4, power: { mind: 1 } }).build();
    const field = game.p1.option("cast", "frigid")?.fields.find((f) => f.name === "targets");
    const offered = (field?.options ?? []) as string[][];
    // rule 809.1.d — the double-Fiora tuple is dimmed, not hidden: a rune Add could fund the
    // second pip, and 809.1.d drops a candidate only when NOTHING could.
    const bothIdx = offered.findIndex((o) => Array.isArray(o) && o.join("|") === "fiora|fiora");
    if (bothIdx >= 0) {
      expect(field?.unaffordable?.[bothIdx]).toBe(true);
    }
    expect(offered).toContainEqual(["fiora"]);
    expect(offered).toContainEqual(["fiora", "other"]);
    const r = await game.p1.try((p) => p.cast("frigid", { repeat: 1, targets: ["fiora", "fiora"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("frigid")).toBe("hand");
  });
});
