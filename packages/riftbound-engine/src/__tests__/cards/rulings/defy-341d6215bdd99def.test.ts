/**
 * Ruling 341d6215bdd99def — Defy (ogn-045-298) × Salvage (ogn-224-298) [× Darius, Trifarian / Ravenbloom Student as "play a spell" payoffs]
 *   Defy: "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]." (1 + [calm])
 *   Salvage: "[Action] You may kill up to one gear. Draw 1." (2 + [order])
 *
 * Q: Can you play Defy or Salvage with no valid target / "for no reason" (e.g. just to trigger play-a-spell payoffs)?
 * A: You cannot play a spell without a legal target. Defy is not a "may" — if you play it you must counter a spell,
 *    and a spell can never target itself. "May"/"up to" effects and redundant actions on legal targets are fine, and
 *    playing spells purely for "when you play a spell" triggers (Ravenbloom Student) is legitimate when the play is legal.
 * Rules: 355.8 (no legal target → can't play), 355.9 (a spell can't choose itself), 355.13 ("up to" may choose zero).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const SALVAGE = "ogn-224-298";
const RAVENBLOOM_STUDENT = "ogn-103-298"; // 2 Might, "When you play a spell, give me +1 Might this turn."
const DREDGE_UP = "ven-049-166"; // Spell · 2 · "Draw 1." — a legal Defy target (≤4 energy, ≤1 power)

describe("Ruling 341d6215bdd99def — no legal target, no play: Defy needs a spell to counter; Salvage's 'up to one gear' may be zero", () => {
  test("Defy with an empty chain (its only conceivable object would be itself) is not playable, even with 1 + [calm] ready and a Ravenbloom Student begging for a spell", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, DEFY, "defy")
      .build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "defy")).toBe(false);
    const r = await game.p1.try((p) => p.cast("defy"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("student").might).toBe(2); // no spell was played, no pump
  });

  test("Defy cannot name itself: while Defy is the only spell on the chain… it never gets there — the cast is refused outright and a self-target is rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .hand(P1, DEFY, "defy")
      .build();
    const r = await game.p1.try((p) => p.cast("defy", { targets: "defy" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("with a real spell to counter Defy is playable, MUST take that spell as its target, and counters it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .hand(P2, DREDGE_UP, "dredge")
      .hand(P1, DEFY, "defy")
      .build();
    expect(game.p1.can("cast", "defy")).toBe(false); // nothing to counter yet
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("dredge");
    await game.p2.passPriority();
    expect(game.p1.can("cast", "defy")).toBe(true);
    // The only legal object is Dredge Up — never Defy itself.
    const targets = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat()).toEqual(["dredge"]);
    await game.p1.cast("defy", { targets: "dredge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "defy"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // countered: no draw
  });

  test("Salvage IS a 'may … up to one': with no gear anywhere it is still a legal play — it kills nothing, draws 1, and counts as playing a spell (Ravenbloom Student +1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, SALVAGE, "salvage")
      .build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("salvage");
    await game.settle();
    if (game.decision()?.kind === "pick" || game.decision()?.kind === "yes-no") {
      // "you may kill up to one gear" with nothing to choose — decline / choose none.
      await game.p1.decline().catch(async () => game.p1.no());
      await game.settle();
    }
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("student").might).toBe(3); // a spell WAS played
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
