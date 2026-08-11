/**
 * Interaction: Tricksy Tentacles (unl-054-219) "Move any number of enemy units with the same
 *   controller and a total Might of 8 or less to a single location."
 *   × Discipline (ogn-058-298) [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Gust (ogn-169-298)       [Reaction] "Return a unit at a battlefield with 3 [Might] or less
 *                                          to its owner's hand."
 *
 * P2 has three units at bf2 — 1, 3 and 4 Might, total exactly 8. P1 casts Tricksy choosing all
 * three, with bf1 as the single destination. Then the group is broken in two different ways.
 *
 * Q: when the GROUP restriction stops holding, is the spell fizzled, does it move everyone anyway,
 *    or is something re-chosen — and is the destination reopened along with it?
 *
 * A — the two halves have DIFFERENT policies:
 *  - the target GROUP is re-checked with a fresh but BOUNDED choice. 355.7/355.11.a: the three
 *    units are targets chosen at finalization and must collectively fulfil "same controller,
 *    total Might ≤ 8" (355.11, evaluated on CURRENT Might — 710). 355.11.b: if the group no longer
 *    fulfils it at resolution, the controller picks a SUBSET **of the original targets** — never a
 *    unit that was not chosen, never a set still over the cap.
 *  - the DESTINATION is frozen. It is a play-time choice (355.4, legal locations per 355.4.a /
 *    449.1) and 355.15 forbids changing it afterwards; no rule reopens it during a 355.11.b re-pick.
 *  - a single target that merely became illegal (Gusted to hand) is dropped silently
 *    (359.3.e.2/.4/.5) and the instruction still executes on the rest (359.3.e.8); with the
 *    survivors under the cap, 355.11.b never engages at all. Arrivals are simultaneous (446.3).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TENTACLES = "unl-054-219"; // Spell · Calm · 4 + [calm] · standard timing
const DISCIPLINE = "ogn-058-298";
const GUST = "ogn-169-298";

/**
 * P1's turn. bf1 is P1's battlefield (with no P1 unit standing there its control lapses at the
 * first Open-State Cleanup — 323.6 — which is irrelevant here: destination legality is about
 * locations, not control), bf3 is empty, and P2's units are massed at bf2. "Extra" is a fourth
 * enemy unit that never gets chosen, used to prove nothing new can be added later.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 4, power: { calm: 2, chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf2", { might: 1, name: "One" }, "one")
    .unit(P2, "bf2", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf2", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf2", { might: 2, name: "Extra" }, "extra")
    .hand(P1, TENTACLES, "tt")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, GUST, "gust");
}

/** Legal `targets` groups offered for the cast, normalised to sorted "a+b" strings. */
function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "tt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

/** Cast at {One, Three, Four} and lock bf1 as the single destination. */
async function castAllThreeAtBf1(game: Game): Promise<void> {
  await game.p1.cast("tt", { targets: ["one", "three", "four"] });
  await game.p1.pick("battlefield-bf1");
}

describe("Tricksy Tentacles — group re-check vs locked destination", () => {
  test("finalization (355.11.a / 710): every same-controller group with total CURRENT Might ≤ 8 is offered; over-cap groups are not", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toContain("four+one+three"); // 4+3+1 = exactly 8
    expect(sets).toContain("four+three"); // 7
    expect(sets).toContain("extra+four+one"); // 2+4+1 = 7
    expect(sets).not.toContain("extra+four+three"); // 9
    expect(sets).not.toContain("extra+four+one+three"); // 10
    const over = await game.p1.try((p) => p.cast("tt", { targets: ["one", "three", "four", "extra"] }));
    expect(!over.ok && over.error.code).toBe("ILLEGAL_ARGS");
    expect(game.zoneOf("tt")).toBe("hand");
  });

  test("the single destination is chosen at play (355.4) from locations other than the group's own (355.4.a / 449.1) — one prompt for the whole group", async () => {
    const game = await board().build();
    await game.p1.cast("tt", { targets: ["one", "three", "four"] });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "destination", timing: "FIN" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf3"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()?.kind).not.toBe("pick"); // no second destination for the other two movers
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tt", controller: P1, targets: ["one", "three", "four"] }),
    ]);
  });

  test("(c) unanswered: all three move together to bf1 and the spell goes to the trash", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.settle();
    expect(game.locationOf("one")).toBe("bf1");
    expect(game.locationOf("three")).toBe("bf1");
    expect(game.locationOf("four")).toBe("bf1");
    expect(game.locationOf("extra")).toBe("bf2"); // never chosen, never moved
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(a) Discipline pushes the group to 10: at resolution P1 must choose a SUBSET of the ORIGINAL targets (355.11.b)", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc", { targets: "three" });
    const settled = await game.settle();

    expect(game.state("three").might).toBe(5); // 3 + 2 → group is 1 + 5 + 4 = 10
    expect(settled.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", min: 0, seat: P1, semantics: "subset", timing: "RES" });
    // Only the three original targets are on the menu — 355.11.b.
    expect(d.options.map((o) => o.key).sort()).toEqual(["four", "one", "three"]);
  });

  test("(a) the subset must itself fulfil the restriction, and cannot recruit a unit that was never chosen (355.11.b)", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "three" });
    await game.settle();
    // {Three(5), Four(4)} = 9 — still over the cap.
    const overCap = await game.p1.try((p) => p.pick("three", "four"));
    expect(!overCap.ok && overCap.error.code).toBe("ILLEGAL_ARGS");
    // Extra was never a target, so it cannot be added now even though 2 would fit.
    const newcomer = await game.p1.try((p) => p.pick("extra"));
    expect(!newcomer.ok && newcomer.error.code).toBe("ILLEGAL_ARGS");
    // …and the legal subsets really are legal: {One(1), Four(4)} = 5.
    await game.p1.pick("one", "four");
    await game.settle();
    expect(game.locationOf("one")).toBe("bf1");
    expect(game.locationOf("four")).toBe("bf1");
  });

  test("(a) the destination is NOT re-offered with the subset: the chosen units still go to bf1, the dropped one stays put (355.4 / 355.15)", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "three" });
    await game.settle();
    await game.p1.pick("one", "four");
    // No fresh destination prompt — bf3 was never reopened even though fewer units now travel.
    const next = game.decision();
    expect(next?.kind === "pick" && next.semantics === "destination").toBe(false);
    await game.settle();
    expect(game.locationOf("one")).toBe("bf1");
    expect(game.locationOf("four")).toBe("bf1");
    expect(game.locationOf("three")).toBe("bf2"); // left behind, still carrying its +2
    expect(game.state("three").might).toBe(5);
    expect(game.zoneOf("tt")).toBe("trash");
  });

  test("(a) 'any number' includes none: declining the subset moves nobody and the spell still resolves to the trash (355.13)", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "three" });
    await game.settle();
    expect((game.decision() as PickDecision).allowDecline).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.locationOf("one")).toBe("bf2");
    expect(game.locationOf("three")).toBe("bf2");
    expect(game.locationOf("four")).toBe("bf2");
    expect(game.zoneOf("tt")).toBe("trash");
  });

  test("(b) Gust bounces Three: no subset prompt at all — the illegal target is dropped and the other two still move to bf1", async () => {
    const game = await board().build();
    await castAllThreeAtBf1(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "three" });
    const settled = await game.settle();

    // Three changed zone → illegal target, simply unaffected (359.3.e.2/.4/.5).
    expect(game.zoneOf("three")).toBe("hand");
    // The survivors total 4 + 1 = 5 ≤ 8, so the group restriction still holds and 355.11.b
    // never engages: nothing was asked of P1.
    expect(settled.reason).not.toBe("unanswered");
    expect(game.decision()?.kind).not.toBe("pick");
    // 359.3.e.8 — the instruction executes on the targets still valid; 446.3 — they arrive together.
    expect(game.locationOf("one")).toBe("bf1");
    expect(game.locationOf("four")).toBe("bf1");
    expect(game.locationOf("extra")).toBe("bf2");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
