/**
 * Ruling a98cb780d509d892 — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · [2] · 2 [Might]
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Cleave (OGN-004 → ogn-004-298) as the spells cast, × Gust (OGN-169 → ogn-169-298) as the "3 [Might] or less" removal.
 *
 * Q: If the Student's controller casts spells without announcing the might triggers, may they claim the might later,
 *    e.g. when the unit is targeted by removal?
 * A: Yes — nothing is missed until the trigger would have a visible effect. The engine has no "announce" step at all:
 *    the trigger goes on the Chain and the raised [Might] is in the public game state from the moment it resolves,
 *    so it is already there when removal is aimed. It only lasts the turn.
 * Rules: 383.3 (triggered abilities use the Chain), 419.4.a ("when you play a spell" fires after that spell resolves),
 *        317.2.c ("this turn" effects expire in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const CLEAVE = "ogn-004-298";
const GUST = "ogn-169-298";
const STUPEFY = "ogn-095-298";

/** P1's turn. Student sits at bf1 (Gust only reaches units at battlefields). Two Cleaves in hand, 2 energy. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CLEAVE, "cleave1")
    .hand(P1, CLEAVE, "cleave2")
    .hand(P1, CLEAVE, "cleave3")
    .resources(P1, { energy: 3 })
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** Both players pass priority once, resolving the top Chain item. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** Cast one Cleave at the base ally and let both it and the Student's trigger resolve. */
async function cleaveAndSettle(game: Game, cleave: string): Promise<void> {
  await game.p1.cast(cleave, { targets: "ally" });
  await bothPass(game); // Cleave resolves — only THEN does "when you play a spell" trigger (419.4.a)
  await bothPass(game); // the Student's trigger
}

describe("Ruling a98cb780d509d892 — Ravenbloom Student's +1 is live in the game state, never 'announced'", () => {
  test("the trigger queues once the spell has resolved, and its +1 is public the moment it resolves", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("cleave1", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave1"]);
    await bothPass(game);
    expect(game.zoneOf("cleave1")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.state("student").might).toBe(2); // not yet
    await bothPass(game);
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  test("while the Student is still 2, Gust ('3 [Might] or less') does offer it as a target", async () => {
    const game = await board().build();
    await game.p1.cast("cleave1", { targets: "ally" });
    await game.p1.passPriority(); // P2 now holds priority with Cleave on the Chain
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["student"]]);
  });

  test("the raised [Might] is what removal has to read: after two spells the Student is 4 and Gust cannot choose it", async () => {
    const game = await board().build();
    await cleaveAndSettle(game, "cleave1");
    await cleaveAndSettle(game, "cleave2");
    expect(game.state("student").might).toBe(4);
    // A third spell opens P2's priority window while the Student stands at 4.
    await game.p1.cast("cleave3", { targets: "ally" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    // No claim, no announcement — the Student is simply out of Gust's reach now.
    expect(game.p2.can("cast", "gust")).toBe(false);
    const attempt = await game.p2.try((p) => p.cast("gust", { targets: "student" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
  });

  test("only the Student's controller sets it off — an opponent's spell gives nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P2, STUPEFY, "stupefy")
      .resources(P2, { energy: 1 })
      .build();
    await game.p2.cast("stupefy", { targets: "theirs" });
    await bothPass(game);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.chain()).toEqual([]); // no Student trigger queued at all
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("it is a 'this turn' effect — the accumulated +2 is gone by the opponent's turn", async () => {
    const game = await board().build();
    await cleaveAndSettle(game, "cleave1");
    await cleaveAndSettle(game, "cleave2");
    expect(game.state("student").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("student").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
