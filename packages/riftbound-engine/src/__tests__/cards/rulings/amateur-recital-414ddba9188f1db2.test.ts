/**
 * Ruling 414ddba9188f1db2 — Amateur Recital (UNL-207 → unl-207-219, Battlefield)
 *     "When you hold here, you may move a unit at a battlefield to its base."
 *   × Baron Nashor (UNL-147 → unl-147-219) · 12 Might "… I can't be chosen by enemy spells and abilities. Other friendly
 *     units have +2 [Might]."
 *
 * Q: Can Amateur Recital send (an enemy) Baron Nashor to base?
 * A: No. Selecting which unit to move is "choosing" it even though the word isn't printed, so Baron Nashor's
 *    "can't be chosen by enemy spells and abilities" makes him an illegal choice for the enemy Recital trigger.
 * Rules: 355.10 (a player-selected object is a target / is "chosen"), 757, 383 (hold trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMATEUR_RECITAL = "unl-207-219";
const BARON_NASHOR = "unl-147-219";

/**
 * End of P1's turn 2. P2 controls the live Amateur Recital (bf1) with a Holder there → P2 will HOLD it at the start of
 * P2's turn. P1's Baron Nashor (12) and a plain Sentry (3, +2 from Baron = 5) stand at P1's bf2.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: AMATEUR_RECITAL, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", BARON_NASHOR, "baron")
    .unit(P1, "bf2", { might: 3, name: "Sentry" }, "sentry");
}

/** P1 ends the turn; P2 holds the Recital (scores) and opts into "you may move a unit…"; returns at P2's unit choice. */
async function recitalHoldChoice(): Promise<Game> {
  const game = await board().build();
  expect(game.state("baron").keywords).toContain("Untargetable"); // "I can't be chosen by enemy spells and abilities"
  await game.p1.endTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  expect(game.decision()?.prompt).toMatch(/Amateur Recital/);
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // P2 CHOOSES the unit — that is targeting
  return game;
}

describe("Ruling 414ddba9188f1db2 — Amateur Recital's hold trigger cannot choose an enemy Baron Nashor", () => {
  test("P2's choice of 'a unit at a battlefield' offers the Holder and P1's Sentry but NOT P1's Baron Nashor", async () => {
    const game = await recitalHoldChoice();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toContain("holder");
    expect(offered).toContain("sentry");
    expect(offered).not.toContain("baron");
    const r = await game.p2.try((p) => p.pick("baron"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("baron")).toBe("battlefield-bf2");
  });

  test("picking the legal Sentry works as printed (it is moved to P1's base); Baron Nashor never moves", async () => {
    const game = await recitalHoldChoice();
    await game.p2.pick("sentry");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.zoneOf("baron")).toBe("battlefield-bf2");
    expect(game.p2.points()).toBe(1); // the hold scored regardless
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the restriction is 'ENEMY spells and abilities' — if the Recital's controller owns Baron Nashor, its own hold trigger may choose and move him", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: AMATEUR_RECITAL, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", BARON_NASHOR, "baron")
      .build();
    await game.p1.endTurn();
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["baron", "holder"]);
    await game.p2.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("base");
  });
});
