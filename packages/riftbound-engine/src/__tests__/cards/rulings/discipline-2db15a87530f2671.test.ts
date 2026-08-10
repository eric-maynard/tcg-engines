/**
 * Ruling 2db15a87530f2671 — Discipline (OGN-058 → ogn-058-298) · Reaction spell · Calm · [2]
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Glowstone (VEN-133 → ven-133-166) · Gear · "…At the end of your turn, kill this and deal 5 to all units you control."
 *   × Stellacorn Herder (sfd-048-221) · 3-Might unit (the "Stellacorn" of the question).
 *
 * Q: Stellacorn has had two Disciplines cast on it; Glowstone's end-of-turn trigger deals 5 to everything I
 *    control. Does Stellacorn die?
 * A: It lives. 3 + 2 + 2 = 7 Might; the trigger resolves in the Ending Step while "this turn" buffs are still
 *    active, and 5 < 7 is not lethal (142.4). Damage is then healed at end of turn anyway (317.2).
 * Rules: 142.4 (lethal damage), 317.1–317.2 (Ending Step: end-of-turn triggers, then heal / expire "this turn").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const GLOWSTONE = "ven-133-166";
const STELLACORN_HERDER = "sfd-048-221";

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", STELLACORN_HERDER, "stellacorn")
    .gear(P1, GLOWSTONE, "glowstone")
    .hand(P1, DISCIPLINE, "d1")
    .hand(P1, DISCIPLINE, "d2");
}

describe("Ruling 2db15a87530f2671 — a twice-Disciplined Stellacorn (7 Might) survives Glowstone's end-of-turn 5 damage", () => {
  test("two Disciplines resolve: Stellacorn is 3 + 2 + 2 = 7 Might this turn", async () => {
    const game = await board().build();
    expect(game.state("stellacorn").might).toBe(3);
    await game.p1.cast("d1", { targets: "stellacorn" });
    await game.settle();
    await game.p1.cast("d2", { targets: "stellacorn" });
    await game.settle();
    expect(game.state("stellacorn").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
  });

  test("ending the turn puts Glowstone's trigger on the chain during the Ending Step while Stellacorn is STILL 7 Might (buffs not yet expired)", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "stellacorn" });
    await game.settle();
    await game.p1.cast("d2", { targets: "stellacorn" });
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glowstone", controller: P1, triggered: true })]);
    expect(game.state("stellacorn").might).toBe(7);
  });

  test("the trigger resolves: Glowstone kills itself, the 5 damage is not lethal to a 7-Might unit — Stellacorn is alive (and healed, back to 3) on the next turn", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "stellacorn" });
    await game.settle();
    await game.p1.cast("d2", { targets: "stellacorn" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("glowstone")).toBe("trash");
    expect(game.zoneOf("stellacorn")).toBe("base");
    expect(game.state("stellacorn")).toMatchObject({ damage: 0, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with only ONE Discipline (5 Might) the same 5 damage is lethal and Stellacorn dies, proving the trigger really deals 5", async () => {
    const game = await board().build();
    await game.p1.cast("d1", { targets: "stellacorn" });
    await game.settle();
    expect(game.state("stellacorn").might).toBe(5);
    await game.advanceTurn();
    expect(game.zoneOf("glowstone")).toBe("trash");
    expect(game.zoneOf("stellacorn")).toBe("trash");
  });
});
