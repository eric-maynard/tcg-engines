/**
 * Interaction: Fox-Fire (ogn-256-298) · Spell · Calm/Mind · 3 · Hidden / Action
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction — "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Question: P1 casts Fox-Fire from hand choosing three enemy units at bf1 with Might 1, 1 and 2
 * (total 4). In response P2 Disciplines one of the 1-Might targets (+2 → 3; P2 draws 1), so the chosen
 * group is 3/1/2 = 6 when Fox-Fire resolves. Does Fox-Fire fizzle entirely, kill all three anyway, or
 * does P1 re-pick? May P1 add a different, un-chosen 1-Might unit at bf1 to the kill set?
 * Contrast: no response (all three die); Discipline that keeps the total ≤ 4 (group 1+1, pump one to
 * 3 → total 4) — everything still dies.
 *
 * Rules: 355.11 / 355.11.a (group targeting requirement met collectively at finalization),
 * 355.11.b (if the group no longer collectively qualifies on resolution, the spell's CONTROLLER
 * chooses a subset of the ORIGINAL targets that does; units not originally chosen can't be added —
 * the rule's example is literally Fox-Fire), 359.3.e.1 / 359.3.e.8 (the spell still resolves and
 * goes to trash; only the un-chosen remainder is unaffected), 337.1.b (Discipline, added last,
 * resolves first).
 *
 * Expected: Discipline resolves first (oneA → 3 Might, P2 +1 card). Fox-Fire then finds 3+1+2 = 6 > 4
 * → P1 gets a DECISION to choose a qualifying subset of {oneA(3), oneB(1), two(2)} — e.g. {oneB, two}
 * — and only those die; the 4th bf1 unit "spare" (1 Might, never chosen) is neither offered nor
 * killed; Fox-Fire → P1's trash (no fizzle). Contrasts: no response → all three die; pump within the
 * cap → whole original group still dies.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 holds bf1 with oneA(1), oneB(1), two(2) and an extra spare(1); P2 has Discipline + 2
 * energy to react. P1 has Fox-Fire + exactly 3 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "One A" }, "oneA")
    .unit(P2, "bf1", { might: 1, name: "One B" }, "oneB")
    .unit(P2, "bf1", { might: 2, name: "Two" }, "two")
    .unit(P2, "bf1", { might: 1, name: "Spare" }, "spare")
    .hand(P1, FOX_FIRE, "ff")
    .hand(P2, DISCIPLINE, "disc");
}

/** Legal target SETS offered for Fox-Fire, each normalised to "a+b+c". */
function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "ff")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

/** P1 casts Fox-Fire on `group`; P1 passes; P2 responds with Discipline on `pump`; both pass once so ONLY Discipline resolves. */
async function foxFireThenDiscipline(game: Game, group: string[], pump: string): Promise<void> {
  await game.p1.cast("ff", { targets: group });
  await game.p1.passPriority();
  await game.p2.cast("disc", { targets: pump });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Discipline (top) resolves; Fox-Fire still on the chain
}

/** Cards named by P1's current pick decision (empty if none). */
function repickOptions(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

/**
 * Answer a 355.11.b subset prompt so that exactly `keep` (of the original targets) are affected.
 * Handles either shape the engine might use: a "drop a target" prompt (pick what to REMOVE, repeated)
 * or a "choose the subset" prompt (multi-pick / pick-then-decline).
 */
async function repick(game: Game, original: string[], keep: string[]): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const keyOf = (c: string) => d.options.find((o) => o.card === c || o.key === c)?.key;
    if (d.semantics === "drop-target") {
      const drop = original.find((c) => !keep.includes(c) && keyOf(c) !== undefined);
      if (drop === undefined) {
        return;
      }
      await game.p1.pick(keyOf(drop) as string);
      continue;
    }
    const wanted = keep.map(keyOf).filter((k): k is string => k !== undefined);
    if (wanted.length === 0) {
      if (d.allowDecline) {
        await game.p1.decline();
      }
      return;
    }
    if (d.max >= wanted.length) {
      await game.p1.pick(...wanted);
      keep = [];
    } else {
      await game.p1.pick(wanted[0] as string);
      keep = keep.filter((c) => keyOf(c) !== wanted[0]);
    }
  }
}

describe("Fox-Fire × Discipline — group total broken in response → controller re-picks a subset of the ORIGINAL targets (355.11.b)", () => {
  test("setup: {oneA, oneB, two} (1+1+2 = 4) is a legal Fox-Fire group; adding spare (5) or any 5+ combination is not; costs exactly 3", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toContain("oneA+oneB+two");
    expect(sets).toContain("oneA+oneB+spare"); // 3 — also fine
    expect(sets).not.toContain("oneA+oneB+spare+two"); // 5
    const over = await game.p1.try((p) => p.cast("ff", { targets: ["oneA", "oneB", "two", "spare"] }));
    expect(over.ok).toBe(false);
    await game.p1.cast("ff", { targets: ["oneA", "oneB", "two"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ff"]);
  });

  // ---- contrast 1: no response ---------------------------------------------------------------

  test("contrast — no response: all three chosen units (total 4) are killed, the un-chosen spare survives, Fox-Fire → P1's trash", async () => {
    const game = await board().build();
    await game.p1.cast("ff", { targets: ["oneA", "oneB", "two"] });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("oneA")).toBe("trash");
    expect(game.zoneOf("oneB")).toBe("trash");
    expect(game.zoneOf("two")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.p1.trash()).toContain("ff");
  });

  // ---- the response ----------------------------------------------------------------------------

  test("P2 may respond to Fox-Fire with Discipline (Reaction) on a chosen target; it costs P2 2 energy and sits above Fox-Fire", async () => {
    const game = await board().build();
    await game.p1.cast("ff", { targets: ["oneA", "oneB", "two"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "oneA" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ff", "disc"]);
  });

  test("(1) LIFO: Discipline resolves first — oneA is 3 Might this turn, P2 drew 1, Fox-Fire is still waiting on the chain (337.1.b)", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    expect(game.state("oneA").might).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1 + 1); // spent Discipline, drew 1
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ff"]);
    expect(game.zoneOf("oneA")).toBe("battlefield-bf1"); // nothing killed yet
  });

  // Expected (355.11.b): the original group is now 3+1+2 = 6 > 4, so on resolution Fox-Fire's controller
  // P1 is asked to choose a qualifying subset of the ORIGINAL targets — a pick decision for P1 whose
  // options are drawn only from {oneA, oneB, two}. Actual: no prompt; Fox-Fire kills all three.
  test("BUG: (2) when Fox-Fire resolves against a 6-Might group P1 is PROMPTED to choose a subset of the original targets (355.11.b)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = repickOptions(game);
    expect(offered.length).toBeGreaterThan(0);
    for (const c of offered) {
      expect(["oneA", "oneB", "two"]).toContain(c);
    }
  });

  // Expected (355.11.b, last sentences): the un-chosen spare (1 Might, same battlefield, would fit
  // under 4) may NOT be added — it is not among the re-pick options. Actual: no re-pick prompt at all.
  test("BUG: (3) the re-pick prompt does NOT offer 'spare' — a unit at bf1 that was never an original target cannot be substituted in (355.11.b)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(repickOptions(game)).not.toContain("spare");
  });

  // Expected: P1 keeps {oneB(1), two(2)} = 3 ≤ 4 → exactly those two die; the pumped oneA (3) survives
  // at bf1 with its +2. Actual: all three original targets are killed regardless of the new total.
  test("BUG: (2) P1 keeps {oneB, two} (1+2 = 3): those two die, the pumped oneA survives at bf1 at 3 Might (355.11.b)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle();
    await repick(game, ["oneA", "oneB", "two"], ["oneB", "two"]);
    await game.settle();
    expect(game.zoneOf("oneB")).toBe("trash");
    expect(game.zoneOf("two")).toBe("trash");
    expect(game.zoneOf("oneA")).toBe("battlefield-bf1");
    expect(game.state("oneA").might).toBe(3);
  });

  // Expected: an alternative legal subset — P1 keeps {oneA(3), oneB(1)} = 4 → those die, two survives.
  // Actual: no choice; everything dies.
  test("BUG: (2) alternatively P1 keeps {oneA, oneB} (3+1 = 4, exactly the cap): those die and 'two' survives (355.11.b)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle();
    await repick(game, ["oneA", "oneB", "two"], ["oneA", "oneB"]);
    await game.settle();
    expect(game.zoneOf("oneA")).toBe("trash");
    expect(game.zoneOf("oneB")).toBe("trash");
    expect(game.zoneOf("two")).toBe("battlefield-bf1");
  });

  // Expected: whatever subset is chosen, the full 6-Might original group can never all die — at least
  // one of {oneA, oneB, two} must remain on bf1. Actual: all three go to the trash.
  test("BUG: Fox-Fire does NOT 'kill all three anyway' — with the group at 6 Might at least one original target survives (355.11.b)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle({ policy: "first" }); // take whatever subset the engine offers first
    const survivors = ["oneA", "oneB", "two"].filter((c) => game.zoneOf(c) === "battlefield-bf1");
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    const killedMight = ["oneA", "oneB", "two"]
      .filter((c) => game.zoneOf(c) === "trash")
      .reduce((n, c) => n + (c === "oneA" ? 3 : c === "two" ? 2 : 1), 0);
    expect(killedMight).toBeLessThanOrEqual(4);
  });

  test("(4) Fox-Fire does not fizzle: after everything resolves it is in P1's trash (not hand, not board), P1's 3 energy stay spent, and P1 has its open main phase back", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.p1.trash()).toContain("ff");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(3) the un-chosen spare is never killed by Fox-Fire, response or not", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "oneA");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.state("spare").damage).toBe(0);
  });

  // ---- contrast 2: pump that keeps the group within the cap ------------------------------------

  test("contrast — group {oneA, oneB} (1+1), P2 pumps oneA to 3 → total 4 is still ≤ 4: NO re-pick, the whole original group dies (only the collective total at resolution matters)", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB"], "oneA");
    expect(game.state("oneA").might).toBe(3);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no subset prompt
    expect(game.zoneOf("oneA")).toBe("trash");
    expect(game.zoneOf("oneB")).toBe("trash");
    expect(game.zoneOf("two")).toBe("battlefield-bf1");
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.zoneOf("ff")).toBe("trash");
  });

  test("contrast — Discipline on a unit OUTSIDE the group (spare → 3) changes nothing: the 1+1+2 group still totals 4 and all three die", async () => {
    const game = await board().build();
    await foxFireThenDiscipline(game, ["oneA", "oneB", "two"], "spare");
    expect(game.state("spare").might).toBe(3);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("oneA")).toBe("trash");
    expect(game.zoneOf("oneB")).toBe("trash");
    expect(game.zoneOf("two")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
