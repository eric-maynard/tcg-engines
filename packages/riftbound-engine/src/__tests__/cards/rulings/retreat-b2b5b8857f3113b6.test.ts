/**
 * Ruling b2b5b8857f3113b6 — Retreat (OGN-104 → ogn-104-298) · Spell · [1] · [Reaction]
 *   "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Kai'Sa, Survivor (OGN-039 → ogn-039-298) · Champion unit · [4] · 4 Might (the champion in question).
 *
 * Q: Can Retreat be cast on a champion that was played from the Chosen Champion Zone rather than from hand?
 * A: Yes. Once the champion is played onto the board it is an ordinary unit and a legal target; it goes to
 *    its owner's HAND, not back to the Champion Zone. While it still sits in the Champion Zone nothing can
 *    target it — that zone is only reachable by cards that call it out.
 * Rules: 355.8/355.9 (legal targets are on the board), 190/141 (Chosen Champion Zone is its own zone),
 *        421 (return to owner's hand).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const KAISA = "ogn-039-298";

/** P1 has Kai'Sa waiting in the Champion Zone, a spare body on board, Retreat and the energy for both. */
function championWaiting() {
  return scenario()
    .resources(P1, { energy: 5 })
    .champion(P1, KAISA, "kaisa")
    .unit(P1, "base", { might: 2, name: "Spare" }, "spare")
    .hand(P1, RETREAT, "retreat");
}

describe("Ruling b2b5b8857f3113b6 — a champion played from the Champion Zone is an ordinary Retreat target", () => {
  test("while it sits in the Champion Zone the champion is NOT a legal target (only the board unit is)", async () => {
    const game = await championWaiting().build();
    expect(game.zoneOf("kaisa")).toBe("championZone");
    expect(game.p1.champion()).toBe("kaisa");
    const targets = game.p1.option("cast", "retreat")?.fields.find((f) => f.arg === "targets");
    expect((targets?.options ?? []).flat()).toEqual(["spare"]);
    const attempt = await game.p1.try((p) => p.cast("retreat", { targets: "kaisa" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("kaisa")).toBe("championZone");
  });

  test("once played to the board it becomes a legal target and Retreat sends it to its owner's HAND", async () => {
    const game = await championWaiting().build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("base");
    const targets = game.p1.option("cast", "retreat")?.fields.find((f) => f.arg === "targets");
    expect((targets?.options ?? []).flat().toSorted()).toEqual(["kaisa", "spare"]);
    await game.p1.cast("retreat", { targets: "kaisa" });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("hand"); // hand, not back to the Champion Zone
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the rest of Retreat still applies to the champion's owner — they channel 1 rune exhausted", async () => {
    const game = await championWaiting().build();
    await game.p1.playChampion("base");
    await game.settle();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "kaisa" });
    await game.settle();
    const runes = game.p1.runes();
    expect(runes.length).toBe(runesBefore + 1);
    expect(game.state(runes[runes.length - 1]!).isExhausted).toBe(true);
  });
});
