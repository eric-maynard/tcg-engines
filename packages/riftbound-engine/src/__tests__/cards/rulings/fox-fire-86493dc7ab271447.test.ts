/**
 * Ruling 86493dc7ab271447 — Fox-Fire (OGN-256 → ogn-256-298) · [Hidden][Action] · 3
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   (+ Discipline ogn-058-298 as the Reaction that pumps a target: "+2 [Might] this turn. Draw 1.")
 *
 * Q: Fox-Fire targets units totalling ≤ 4; before it resolves their Might is raised above 4 — what happens?
 * A: Targets are locked when cast. On resolution the caster picks a subset of the ORIGINAL targets whose total is ≤ 4 to
 *    kill; units not originally chosen can never be added. If no original target fits any more, Fox-Fire resolves doing
 *    nothing (it does not "fizzle" and does not retarget). Zero is a legal "any number".
 * Rules: 355.11.a/b (group targeting; subset of original targets on resolution), 359.3.f.2 (targets rechecked on
 *        resolution), 340 (LIFO — the Reaction and the Student's trigger resolve before Fox-Fire).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P2's turn with exactly [3] and Fox-Fire. P1 holds bf1 with Ravenbloom Student (2), Other (2) and Big (4), holds
 * Discipline ([2], Reaction) with exactly 2 energy, and has a Bystander (1) at bf1 too (never targeted — must never die).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3 })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "bf1", { might: 2, name: "Other" }, "other")
    .unit(P1, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P1, "bf1", { might: 1, name: "Bystander" }, "bystander")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, FOX_FIRE, "fox");
}

/** P2 casts Fox-Fire on `targets` (locked on the chain) and passes; P1 answers with Discipline on `pump`. */
async function foxThenDiscipline(targets: string[], pump: string): Promise<Game> {
  const game = await board().build();
  expect(game.state("student").might).toBe(2);
  await game.p2.cast("fox", { targets });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P2 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual([...targets].sort()); // locked at cast time
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("disc", { targets: pump });
  expect(game.p1.energy()).toBe(0);
  return game;
}

/** Pass priority until only Fox-Fire is left on the chain (Discipline and the Student's trigger have resolved). */
async function resolveDownToFox(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 1; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["fox"]);
}

describe("Ruling 86493dc7ab271447 — Fox-Fire keeps its original targets; pumped targets shrink what it can kill, never widen it", () => {
  test("all original targets pumped past 4: Fox-Fire on Big (4) alone, Discipline makes Big 6 (and the Student 3 via its own trigger) → Fox-Fire resolves doing NOTHING; P2 is never offered Other/Bystander instead", async () => {
    const game = await foxThenDiscipline(["big"], "big");
    await resolveDownToFox(game);
    expect(game.state("big").might).toBe(6);
    expect(game.state("student").might).toBe(3); // "When you play a spell" (P1 played Discipline)
    // Fox-Fire resolves: no subset of {Big} totals ≤ 4 → nothing happens, no retarget prompt.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.seat).toBe(P2);
        const offered = d.options.map((o) => o.card ?? o.key);
        expect(offered).not.toContain("other");
        expect(offered).not.toContain("bystander");
        expect(offered).not.toContain("student");
        await game.p2.decline();
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fox")).toBe("trash"); // it resolved (spells don't fizzle) — just with no effect
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("other")).toBe("battlefield-bf1");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("group no longer fits: Fox-Fire on Student (2) + Other (2); Discipline pumps Other to 4 and the Student's trigger makes it 3 (total 7) → on resolution P2 CHOOSES a subset of the ORIGINAL targets (a P2 pick offering only student/other); picking Other kills Other only", async () => {
    const game = await foxThenDiscipline(["student", "other"], "other");
    await resolveDownToFox(game);
    expect(game.state("other").might).toBe(4);
    expect(game.state("student").might).toBe(3);
    let asked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        asked = true;
        expect(d.seat).toBe(P2); // the spell's controller chooses (355.11.b)
        expect(d.semantics).toBe("subset");
        const offered = d.options.map((o) => o.card ?? o.key).sort();
        expect(offered.every((c) => c === "student" || c === "other")).toBe(true); // only ORIGINAL targets
        expect(offered).toContain("other");
        await game.p2.pick("other");
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("other")).toBe("trash"); // 4 ≤ 4
    expect(game.zoneOf("student")).toBe("battlefield-bf1"); // 3 + 4 would exceed 4
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("zero is a valid 'any number': in the same spot P2 may choose NO unit from the subset prompt — Fox-Fire resolves and nothing dies", async () => {
    const game = await foxThenDiscipline(["student", "other"], "other");
    await resolveDownToFox(game);
    let asked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        asked = true;
        expect(d.seat).toBe(P2);
        expect(d.min === 0 || d.allowDecline).toBe(true);
        await game.p2.decline();
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["big", "bystander", "other", "student"]);
  });

  test("control: unanswered, Fox-Fire on Student + Other (2 + 2 = 4) kills both", async () => {
    const game = await board().build();
    await game.p2.cast("fox", { targets: ["student", "other"] });
    await game.settle();
    expect(game.zoneOf("student")).toBe("trash");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });
});
