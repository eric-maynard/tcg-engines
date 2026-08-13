/**
 * Ruling b5299ebe890ede57 — Moonfall (UNL-198 → unl-198-219) Action [3][rainbow] "Choose a battlefield where you have units.
 *   You may move up to one enemy unit to that battlefield. Then give enemy units there -2 [Might] this turn."
 *   × Scuttle Crab (UNL-053 → unl-053-219) 0-Might unit "(Units with 0 [Might] can conquer and hold.) When you play me,
 *   draw 1. [Deathknell] …"
 *
 * Q: What happens if I Moonfall a Scuttle Crab?
 * A: Its Might becomes -2 mathematically (treated as 0 when referenced) and it SURVIVES — Moonfall marks no damage, and
 *    only damage ≥ Might kills. A later +2 buff makes it -2 + 2 = 0 (increases use the actual value).
 * Rules: 143.2.a (killed only by nonzero damage ≥ Might), 143.2.b / 143.2.b.1 (negative Might treated as 0 but is not 0).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOONFALL = "unl-198-219";
const SCUTTLE_CRAB = "unl-053-219";
const DISCIPLINE = "ogn-058-298"; // Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P1 holds bf1 with Holder (5); P2's Scuttle Crab sits at P2's bf2. P1: Moonfall + [3][mind]. P2: Discipline + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
    .unit(P2, "bf2", SCUTTLE_CRAB, "crab")
    .hand(P1, MOONFALL, "moonfall")
    .hand(P2, DISCIPLINE, "disc");
}

/** Cast Moonfall (bf1 is the only battlefield with friendly units), everyone passes, P1 picks the Crab to be moved. */
async function moonfallTheCrab(): Promise<Game> {
  const game = await board().build();
  expect(game.state("crab")).toMatchObject({ baseMight: 0, might: 0, zone: "battlefield-bf2" });
  await game.p1.cast("moonfall");
  {
      // rule 355.10.b (unl-198-219) — the anchor battlefield is a target of the
      // spell, chosen as it is played: answer it before the pull is offered.
      const anchor = game.decision();
      if (
        anchor?.kind === "pick" &&
        anchor.options.every((o) => game.gameState.battlefields[o.key] !== undefined)
      ) {
        await game.p1.pick(anchor.options[0]?.key as string);
      }
    }
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "moonfall") && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("crab");
  await game.p1.pick("crab");
  expect(game.zoneOf("moonfall")).toBe("trash");
  return game;
}

describe("Ruling b5299ebe890ede57 — Moonfall on a Scuttle Crab: -2 Might (treated as 0), and it survives", () => {
  test("Moonfall resolves: the Crab is moved to bf1 and gets -2 [Might] this turn — actual modifier -2, referenced Might 0 — and it is NOT killed (no damage marked)", async () => {
    const game = await moonfallTheCrab();
    expect(game.zoneOf("crab")).toBe("battlefield-bf1");
    expect(game.state("crab")).toMatchObject({ baseMight: 0, damage: 0, mightModifier: -2 });
    expect(game.state("crab").might).toBe(0); // 143.2.b — treated as 0 when referenced
    // Still on the board with its abilities intact; the arrival merely opened a combat showdown at bf1.
    expect(game.state("crab").keywords).toContain("Deathknell");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.p2.units("bf1")).toEqual(["crab"]);
  });

  test("143.2.b.1 — a later +2 [Might] buff (Discipline) is computed from the ACTUAL -2: the Crab ends at exactly 0, not 2", async () => {
    const game = await moonfallTheCrab();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("disc", { targets: "crab" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("crab")).toMatchObject({ might: 0, mightModifier: 0, zone: "battlefield-bf1" });
  });

  test("only DAMAGE kills it: the ensuing combat (Holder 5 into the 0-Might Crab) is what finally puts the Crab in the trash", async () => {
    const game = await moonfallTheCrab();
    expect(game.zoneOf("crab")).toBe("battlefield-bf1"); // alive after Moonfall
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
