/**
 * Interaction: a [Reaction] unit arriving mid-Showdown, and what it takes to make a Combat.
 *
 *   Ahri, Inquisitive (ogn-119-298) — 3 [Might], "When I attack or defend, give an enemy unit here
 *                                      -2 [Might] this turn, to a minimum of 1 [Might]."
 *   Shen, Kinkou     (ogn-241-298) — 3 [Might] [Reaction] unit, "[Shield 2]", "[Tank]", playable
 *                                      "including to a battlefield you control".
 *   Discipline       (ogn-058-298) — [Reaction] spell, "Give a unit +2 [Might] this turn. Draw 1."
 *                                      (used only as P1's probe for "when is my next window?")
 *
 * Rules: 344.1 / 344.2 / 345 (showdowns, Contested, Combat Showdowns), 347.1 / 347.2.a / 339.1
 * (Focus, and closing a showdown needs passes IN SEQUENCE), 348.1 / 348.2 / 348.2.a (closing as a
 * combat vs non-combat showdown), 337.1.a / 337.2 / 337.4 (finalization, units resolve at once,
 * priority afterwards), 340.2.a / 346.1 (Focus does not pass when the chain was opened by a
 * trigger), 330.1 (there is only one chain), 383.4.e.2 (Attack Triggers), 461 / 461.3 (Combat is
 * staged when opposing units share a battlefield), 464.2.c.1 / 464.2.c.3.a (who is the Attacker,
 * designations at the next Cleanup), 358.4 (Reaction timing), 323.6 (control lapses).
 *
 * DESIGN / adjudicated BATTLEFIELD CONTROL TIMING (rules 190.4 / 323.6, FIXER-PRIMER): a player who
 * controls a battlefield with NO unit of theirs there loses control at the first Open-State Cleanup,
 * and a showdown merely STAGED in that same Cleanup is not yet "ongoing" (step 4 runs before step 9).
 * So the literally-asked board — "bf1 is P2's and empty of units" — is not a stable position: bf1 is
 * UNCONTROLLED by the time the showdown opens, and Shen's "a battlefield you control" permission
 * therefore offers him no destination there. Part A pins that down; Part B runs the same questions on
 * the board where P2's control is real (a Guard of P2's stands at bf1), which is the only way a
 * [Reaction] unit of P2's can legally land at bf1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const SHEN = "ogn-241-298";
const DISCIPLINE = "ogn-058-298";

/** Flatten the `targets` field of a cast option into the set of card ids offered. */
function targetsOffered(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** The board exactly as asked: bf1 is P2's and holds no units. */
function emptyBoard() {
  return scenario()
    .turn(2)
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AHRI, "ahri")
    .resources(P1, { energy: 6, power: { mind: 3, rainbow: 3 } })
    .resources(P2, { energy: 6, power: { order: 3, rainbow: 3 } })
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, SHEN, "shen");
}

/** The same board with P2's control made real by a 3-Might Guard standing at bf1. */
function guardedBoard() {
  return emptyBoard().unit(P2, "bf1", { might: 3, name: "Guard" }, "guard");
}

describe("Shen, Kinkou arriving mid-showdown × Ahri, Inquisitive", () => {
  // ---------------------------------------------------------------- Part A
  test("A1 — 'P2's battlefield with no units' lapses to UNCONTROLLED before the showdown opens (323.6); P1 applies Contested and a NON-combat showdown opens", async () => {
    const game = await emptyBoard().build();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // as seeded
    await game.p1.move("ahri", "bf1");
    const bf = game.gameState.battlefields.bf1;
    // DESIGN: rule 323.6 / 190.4 — Cleanup step 4 (control) runs before step 9 (stage showdown).
    expect(bf?.controller).toBeNull();
    expect(bf?.contested).toBe(true);
    expect(game.decision()?.prompt).toContain("Focus");
    expect(game.actingSeat()).toBe(P1); // the contester holds Focus (347.1)
    expect(game.state("ahri").combatRole).toBeNull(); // non-combat showdown: no designations
  });

  test("A2 — with bf1 uncontrolled, Shen's 'including to a battlefield you control' offers him NO destination there: base only", async () => {
    const game = await emptyBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passFocus();
    const dest = game.p2.option("play", "shen")?.fields.find((f) => f.name === "location");
    expect(dest?.options).toEqual(["base"]);
    const rejected = await game.p2.try((p) => p.play("shen", { to: "bf1" }));
    expect(rejected.ok).toBe(false);
  });

  test("A3 — so nothing converts: the showdown closes NON-combat and P1, the only player with units there, Establishes Control and Conquers for a point (348.2 / 348.2.a)", async () => {
    const game = await emptyBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passFocus();
    await game.p2.play("shen", { to: "base" }); // legal Reaction play, just not at bf1
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.locationOf("shen")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- Part B
  test("B1 — (b) opposing units share bf1 ⇒ Combat is staged (461) and designations land at the next Cleanup: P1 is the Attacker because P1 applied Contested (345 / 464.2.c.1)", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // real control, kept
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.state("ahri").combatRole).toBe("attacker"); // 464.2.c.3.a
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("B2 — (c) Ahri's Attack Trigger fires on gaining the designation (383.4.e.2), joins the ONE chain (330.1), is finalized with no priority passing (337.1.a) and 337.4 then gives priority to P1", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    const chain = game.chain();
    expect(chain).toHaveLength(1);
    expect(chain[0]?.cardId).toBe("ahri");
    expect(chain[0]?.triggered).toBe(true);
    expect(chain[0]?.controller).toBe(P1);
    // Its "an enemy unit here" is chosen by P1 at finalization — only the Guard is on the board then.
    expect(chain[0]?.targets).toEqual([game.card("guard")]);
    expect(game.actingSeat()).toBe(P1); // 337.4
    expect(game.state("guard").might).toBe(3); // not applied until it resolves
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("guard").might).toBe(1); // -2 this turn, to a minimum of 1
  });

  test("B3 — (c) when that chain empties Focus does NOT pass: it was opened by a triggered ability, not a played card (346.1 / 340.2.a)", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.prompt).toContain("Focus");
    expect(game.actingSeat()).toBe(P1); // Focus is back with P1, not handed to P2
    expect(game.p2.legal()).toEqual([]);
  });

  test("B4 — (a) P1 gets NO window on Shen before he is on the board: a finalized unit resolves at once (337.2 / 358.4), so P1's next window already sees a 5-Might [Tank] Defender", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(targetsOffered(game, "discipline")).not.toContain(game.card("shen")); // not in play yet
    await game.p2.play("shen", { to: "bf1" });
    expect(game.zoneOf("shen")).toBe("battlefield-bf1"); // never sat on the chain
    expect(game.chain()).toEqual([]);
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.state("shen").might).toBe(5); // 3 + [Shield 2] while defending
    expect(game.state("shen").keywords).toContain("Tank");
    expect(targetsOffered(game, "discipline")).toContain(game.card("shen")); // only now
  });

  test("B5 — (d) the earlier pass does not carry: Shen's play broke the sequence, so P1 (Focus) must act again before the showdown can close (339.1 / 347.2.a)", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    await game.p2.play("shen", { to: "bf1" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()?.prompt).toContain("Focus");
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(false);
  });

  test("B6 — (e) YES: closes as a Combat Showdown (348.1) — Ahri 3 into Shen 5 with [Tank]; Ahri dies, P2 keeps bf1, no conquer, no points", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    await game.p2.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("B7 — (e) NO: P2 never plays Shen — Ahri 3 kills the debuffed Guard (1) and P1 Conquers for a point", async () => {
    const game = await guardedBoard().build();
    await game.p1.move("ahri", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
