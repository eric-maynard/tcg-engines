/**
 * Ruling fad0abda516490ec — Relentless Pursuit (SFD-184 → sfd-184-221) · Spell · [Action] · [2][rainbow]
 *   "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit
 *    has 'When I conquer, you may move me to my base.'"
 *
 * Q: If I push a damaged unit into a battlefield and then Relentless Pursuit it to another one, is it healed?
 * A: No. Healing happens only at the end of a combat that reached the Resolution Step, or at end of turn.
 *    Moving a unit — by hand or by a spell effect — is not combat and heals nothing; the marked damage rides
 *    along to the new battlefield.
 * Rules: 418.3.a / 466.1.a.1 (units heal in Combat Cleanup and in the Ending Phase), 460 (a showdown is only
 *        combat once it reaches the Combat Damage Step), 450 (a move is not a recall and triggers no cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
// rule 355.7 / 355.9 (riftjudge 4283ca02526c0650) — the Equipment is named as the
// spell is played, so a board with none cannot cast Relentless Pursuit at all.
const BRUTALIZER = "sfd-042-221";

/** P1's turn. P1's 5-Might Ranger sits damaged at bf1; bf2 is empty; Relentless Pursuit is in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 5, name: "Ranger" }, "ranger", { damage: 3 })
    .gear(P1, BRUTALIZER, "brut")
    .hand(P1, RELENTLESS_PURSUIT, "pursuit");
}

/**
 * Drain everything back to an open main phase, declining Relentless Pursuit's two optional riders
 * (the Equipment attach and its granted "when I conquer, you may move me to my base" trigger).
 */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 24; i++) {
    await game.settle();
    const d = game.decision();
    if (!d) return;
    if (d.kind === "action" && d.context === "main") return;
    if (d.kind === "yes-no") await game.seat(d.seat).no();
    else if (d.kind === "pick" && d.allowDecline) await game.seat(d.seat).decline();
    else if (d.kind === "pick") await game.seat(d.seat).pick(d.options[0]!.key);
    else if (d.kind === "action") await game.seat(d.seat).pass();
    else return;
  }
}

describe("Ruling fad0abda516490ec — Relentless Pursuit moves a damaged unit; it stays damaged", () => {
  test("premise: the Ranger is at bf1 with 3 damage marked and 5 Might", async () => {
    const game = await board().build();
    expect(game.state("ranger")).toMatchObject({ damage: 3, might: 5 });
    expect(game.locationOf("ranger")).toBe("bf1");
  });

  test("ruling: Relentless Pursuit to bf2 leaves the 3 damage exactly where it was", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["ranger", "brut"], answers: ["bf2"] });
    await drain(game);
    expect(game.locationOf("ranger")).toBe("bf2");
    expect(game.state("ranger").damage).toBe(3);
    expect(game.zoneOf("pursuit")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a plain hand-driven move heals nothing either — a damaged unit walking out of base keeps its damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 5, name: "Walker" }, "walker", { damage: 3 })
      .build();
    await game.p1.move("walker", "bf2");
    await drain(game);
    expect(game.locationOf("walker")).toBe("bf2");
    expect(game.state("walker").damage).toBe(3);
  });

  test("…nor does moving it home to base", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["ranger", "brut"], answers: ["base"] });
    await drain(game);
    expect(game.locationOf("ranger")).toBe("base");
    expect(game.state("ranger").damage).toBe(3);
  });

  test("contrast: the damage DOES clear at end of turn — that (and combat) is when healing happens", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: ["ranger", "brut"], answers: ["bf2"] });
    await drain(game);
    expect(game.state("ranger").damage).toBe(3);
    await game.advanceTurn();
    expect(game.state("ranger").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a combat that reaches the damage step heals the survivor — moving into an occupied battlefield, not the Pursuit itself, is what clears it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Ranger" }, "ranger", { damage: 3 })
      .unit(P2, "bf2", { might: 1, name: "Wall" }, "wall")
      .gear(P1, BRUTALIZER, "brut")
      .hand(P1, RELENTLESS_PURSUIT, "pursuit")
      .build();
    await game.p1.cast("pursuit", { targets: ["ranger", "brut"], answers: ["bf2"] });
    await drain(game);
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("ranger").damage).toBe(0); // healed in Combat Cleanup, not by the move
    expect(game.violations()).toEqual([]);
  });
});
