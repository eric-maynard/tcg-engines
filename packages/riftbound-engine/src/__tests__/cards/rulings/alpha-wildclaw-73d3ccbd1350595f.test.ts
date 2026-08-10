/**
 * Ruling 73d3ccbd1350595f — Alpha Wildclaw (UNL-057 → unl-057-219) · 7 Might · [Tank] "Your units here with less Might than me
 *     can't be chosen by enemy spells and abilities."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · 2 "Give a unit +2 [Might] this turn. Draw 1."
 *   × an enemy kill spell (inline "Execute": Action — Kill a unit at a battlefield).
 *
 * Q: I have Alpha Wildclaw (7) and an 8-Might unit at a battlefield. The opponent attacks and, in the showdown, plays a kill
 *    spell on my 8-Might unit. I react with Discipline on Wildclaw (→ 9). Does my 8-Might unit still die?
 * A: No. The kill spell still resolves (it is not countered), but by then the 8-Might unit has less Might than Wildclaw and
 *    can't be chosen by enemy spells, so the spell has mistargeted and its instructions referring to that unit are ignored.
 * Rules: 359.3.e.9 / 359.3.e.12 (target legality rechecked on resolution; illegal → those instructions ignored, spell not
 *        countered), 340 (LIFO), Wildclaw's continuous protection.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_WILDCLAW = "unl-057-219";
const DISCIPLINE = "ogn-058-298";
/** The opponent's "kill spell": an Action that kills a unit at a battlefield. */
const EXECUTE = {
  abilities: [{ effect: { target: { location: "battlefield", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  name: "Test Execute",
  timing: "action",
} as const;

/** P2's turn. P1 holds bf1 with Alpha Wildclaw (7) and Giant (8), Discipline in hand + [2]. P2: Raider (3) in base, Execute + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ALPHA_WILDCLAW, "wildclaw")
    .unit(P1, "bf1", { might: 8, name: "Giant" }, "giant")
    .hand(P1, DISCIPLINE, "discipline")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, EXECUTE, "execute");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Raider attacks bf1 (P2 has Focus); P2 casts Execute on the Giant and passes priority to P1. */
async function attackAndExecuteGiant(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  // Premise: at 8 > 7 the Giant is NOT under Wildclaw's protection, so the enemy spell may choose it.
  expect(targetsOffered(game, "p2", "execute")).toContain("giant");
  await game.p2.cast("execute", { targets: "giant" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "execute", controller: P2, targets: ["giant"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 73d3ccbd1350595f — Discipline on Alpha Wildclaw in response makes the kill spell mistarget the 8-Might unit", () => {
  test("P1 reacts with Discipline on Wildclaw; LIFO — Discipline resolves first: Wildclaw is 9 (P1 draws 1) while Execute still waits, and the Giant (8) now has less Might than Wildclaw", async () => {
    const game = await attackAndExecuteGiant();
    expect(game.p1.can("cast", "discipline")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "wildclaw" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["execute", "discipline"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("wildclaw").might).toBe(9);
    expect(game.state("giant").might).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["execute"]);
    // The protection is live now: a fresh enemy spell could no longer choose the Giant.
    expect(game.zoneOf("giant")).toBe("battlefield-bf1");
  });

  test("Execute then RESOLVES (goes to the trash, not countered) but has mistargeted: the Giant can't be chosen by enemy spells any more, so the kill is ignored — the Giant lives", async () => {
    const game = await attackAndExecuteGiant();
    await game.p1.cast("discipline", { targets: "wildclaw" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline
    await game.p2.passPriority();
    await game.p1.passPriority(); // Execute
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("execute")).toBe("trash");
    expect(game.p2.energy()).toBe(0); // paid, nothing refunded — it resolved
    expect(game.zoneOf("giant")).toBe("battlefield-bf1");
    expect(game.state("giant")).toMatchObject({ damage: 0, might: 8 });
    expect(game.zoneOf("wildclaw")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Discipline response the Giant (8 > Wildclaw's 7, unprotected) is killed by Execute", async () => {
    const game = await attackAndExecuteGiant();
    await game.p1.passPriority();
    expect(game.zoneOf("execute")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("wildclaw")).toBe("battlefield-bf1");
  });

  test("premise check of the static itself: a friendly unit here that already has LESS Might than Wildclaw is never offered to the enemy spell, while Wildclaw himself is", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ALPHA_WILDCLAW, "wildclaw")
      .unit(P1, "bf1", { might: 3, name: "Cub" }, "cub")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P2, EXECUTE, "execute")
      .build();
    await game.p2.move("raider", "bf1");
    const offered = targetsOffered(game, "p2", "execute");
    expect(offered).not.toContain("cub");
    expect(offered).toContain("wildclaw");
  });
});
