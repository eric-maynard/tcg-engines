/**
 * Ruling a61835c5488c4ad7 — Akali, Deadly Weapon (VEN-021 → ven-021-166) · 3 Might "[Empower] [2][fury] … When I move, you may deal 1
 *     to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead. [Empowered][>] I have +1 [Might]."
 *   × Svellsongur (SFD-059 → sfd-059-221) Equipment "[Equip] [1][calm] … As this is attached to a unit, copy that unit's text to this
 *     Equipment's effect text for as long as this is attached to it."
 *
 * Q: With Svellsongur on Akali, does she deal 4 when she moves in, killing a 4-Might unit?
 * A: If EMPOWERED, yes: the Equipment is a second independent copy of her "When I move" trigger; each deals 2 → 4 total, and both may
 *    pick the same unit ("a unit", not "another"). If NOT empowered each deals 1 → only 2, not enough for a 4-Might unit.
 * Rules: 375/382 (each triggered ability triggers independently), 741 (copying text), 828 (Empowered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const SVELLSONGUR = "sfd-059-221";

/** P1's turn. Akali (empowered or not) ready in base, Svellsongur loose in base with exactly [1][calm] to Equip. P2 holds bf1 with a 4-Might Guard. */
function board(empowered: boolean) {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", AKALI, "akali", empowered ? { empowered: true } : {})
    .gear(P1, SVELLSONGUR, "svell");
}

/** Equip Svellsongur onto Akali, then move her into bf1. */
async function equipAndMoveIn(empowered: boolean): Promise<Game> {
  const game = await board(empowered).build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "akali" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("akali");
  expect(game.state("svell").meta.copiedFromCardId).toBe("akali"); // Svellsongur now carries Akali's text
  expect(game.state("akali").isEmpowered).toBe(empowered);
  await game.p1.move("akali", "bf1");
  return game;
}

/** Answer both optional triggers: yes → the Guard. Returns how many opt-ins were asked. Stops at the first priority window. */
async function aimBothAtGuard(game: Game): Promise<number> {
  let optIns = 0;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      optIns += 1;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("guard"); // the same unit is offered to both
      await game.p1.pick("guard");
    } else if (d?.kind === "order" && d.seat === P1) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return optIns;
}

async function drainChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Ruling a61835c5488c4ad7 — Svellsongur gives Akali a second 'When I move' trigger", () => {
  test("moving in creates TWO independent move triggers, each with its own 'you may' and its own target — both may name the Guard", async () => {
    const game = await equipAndMoveIn(true);
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(2);
    const optIns = await aimBothAtGuard(game);
    expect(optIns).toBe(2);
    expect(game.chain().filter((c) => c.triggered).map((c) => c.targets)).toEqual([["guard"], ["guard"]]);
  });

  test("EMPOWERED: 2 + 2 = 4 damage → the 4-Might Guard dies before combat; Akali takes bf1", async () => {
    const game = await equipAndMoveIn(true);
    expect(game.state("akali").might).toBe(4); // [Empowered] +1
    await aimBothAtGuard(game);
    // First trigger resolves: 2 damage.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("guard").damage).toBe(2);
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(1);
    await drainChain(game); // second trigger: 2 more → lethal
    expect(game.zoneOf("guard")).toBe("trash");
    await game.settle();
    expect(game.locationOf("akali")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("NOT empowered: 1 + 1 = 2 damage — the 4-Might Guard survives the triggers (2 damage marked going into combat)", async () => {
    const game = await equipAndMoveIn(false);
    expect(game.state("akali").might).toBe(3);
    const optIns = await aimBothAtGuard(game);
    expect(optIns).toBe(2);
    await drainChain(game);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});
