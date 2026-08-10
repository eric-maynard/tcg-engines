/**
 * Ruling 19ff18ba0b75e2c6 — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend (Ahri) · Calm/Mind
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Captain Farron (OGN-015 → ogn-015-298) · 5 Might · "Other friendly units here have [Assault]."
 *   × Stupefy (OGN-095 → ogn-095-298) — same "to a minimum of 1" wording (cited as analogous).
 *
 * Q: Fox gives an attacker -1; the attacker later loses a static bonus (Assault from Farron). Does the -1
 *    persist and can it take the unit to 0 Might?
 * A: Yes. The "minimum of 1" is checked once, when the trigger resolves (unit had > 1 Might then → -1 applied for
 *    the turn). It is not re-evaluated; if the unit later loses Assault it can sit at 0 Might, and it survives —
 *    units only die from nonzero damage ≥ Might.
 * Rules: 359.2 (evaluated on resolution), 727 (Assault only while attacking), 520 (death needs damage > 0).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const CAPTAIN_FARRON = "ogn-015-298";

/**
 * P1's turn. P2 (legend: Nine-Tailed Fox) controls bf1 with a STUNNED 2-Might Guard (deals no combat damage, so
 * both attackers survive). P1 has Captain Farron (5) and a 1-Might Squire ready in base.
 */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", CAPTAIN_FARRON, "farron")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire");
}

/** Farron + Squire attack bf1 together; drain the Fox triggers (both players pass) but stop before combat damage. */
async function attackAndResolveFox(game: Game): Promise<void> {
  await game.p1.move(["farron", "squire"], "bf1");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "order" && d.defaultable) {
      expect(d.seat).toBe(P2); // both Fox triggers are P2's
      await game.acceptTriggerOrder();
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
}

describe("Ruling 19ff18ba0b75e2c6 — Nine-Tailed Fox's -1 is checked once on resolution and persists past losing Assault (0 Might, alive)", () => {
  test("while attacking next to Farron the 1-Might Squire has Assault → 2 Might, so it 'could have its Might reduced': Fox triggers for each enemy attacker", async () => {
    const game = await board().build();
    await game.p1.move(["farron", "squire"], "bf1");
    expect(game.state("squire").combatRole).toBe("attacker");
    expect(game.state("squire").keywords).toContain("Assault");
    if (game.decision()?.kind === "order") {
      expect(game.decision()?.seat).toBe(P2);
      await game.acceptTriggerOrder();
    }
    const foxItems = game.chain().filter((c) => c.cardId === "fox" && c.triggered);
    expect(foxItems).toHaveLength(2);
    expect(foxItems.every((c) => c.controller === P2)).toBe(true);
    // Before the triggers resolve: Squire 1 + Assault 1 = 2, Farron 5 (no Assault for himself).
    expect(game.state("squire").might).toBe(2);
    expect(game.state("farron").might).toBe(5);
  });

  test("on resolution the -1 applies to both (each had more than 1 Might at that moment): Squire 2 → 1, Farron 5 → 4", async () => {
    const game = await board().build();
    await attackAndResolveFox(game);
    expect(game.state("squire")).toMatchObject({ combatRole: "attacker", might: 1, mightModifier: -1 });
    expect(game.state("farron")).toMatchObject({ might: 4, mightModifier: -1 });
  });

  test("after combat the Squire is no longer an attacker (Assault gone) but the -1 persists this turn → 0 Might, and it SURVIVES with no damage on the conquered battlefield", async () => {
    const game = await board().build();
    await attackAndResolveFox(game);
    await game.settle(); // both pass focus → combat: 1 + 4 = 5 into the stunned 2-Might Guard
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("squire").combatRole).not.toBe("attacker");
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 0, mightModifier: -1 });
    expect(game.zoneOf("squire")).toBe("battlefield-bf1"); // 0 Might, alive
    expect(game.state("farron").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': next turn the -1 is gone and the Squire is back to 1 (Farron 5)", async () => {
    const game = await board().build();
    await attackAndResolveFox(game);
    await game.settle();
    await game.advanceTurn();
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.state("farron").might).toBe(5);
  });

  test("contrast — the minimum IS enforced at resolution: a lone 1-Might attacker (no Farron, no Assault) is not reduced at all", async () => {
    const game = await scenario()
      .legend(P2, NINE_TAILED_FOX, "fox")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .build();
    await game.p1.move("squire", "bf1");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("squire")).toMatchObject({ combatRole: "attacker", might: 1, mightModifier: 0 });
  });
});
