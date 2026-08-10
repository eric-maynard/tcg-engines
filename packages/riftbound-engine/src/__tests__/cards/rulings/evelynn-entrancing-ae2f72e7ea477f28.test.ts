/**
 * Ruling ae2f72e7ea477f28 — Evelynn, Entrancing (UNL-141 → unl-141-219) · 2 Might · [Hidden] [Backline] "When you play me from face down
 *     on your turn, you may move an enemy unit at a different location to my battlefield."
 *   × Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · 4 Might · [Ambush] "When I attack or defend, if an enemy unit is alone here,
 *     give me +2 [Might] this turn and gain 2 XP."
 *
 * Q: Does reacting to Kha'Zix with a hidden Evelynn make his +2 ability fail?
 * A: No. "Alone here" is checked when Kha'Zix gains his combat designation and the trigger is put on the chain. Evelynn, played
 *    from face down in response, resolves first (LIFO) and changes the head-count, but the trigger does not re-check on
 *    resolution: Kha'Zix still gets +2 Might and 2 XP.
 * Rules: 383.4.e / 383.2 (condition evaluated when triggered), 336–340 (LIFO), 811 (playing a Hidden card as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EVELYNN = "unl-141-219";
const KHAZIX = "unl-143-219";

/** P1's turn (turn 3), 0 XP. P2 holds bf1 with a lone Rookie (2) and a facedown Evelynn hidden there earlier. Kha'Zix ready in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Rookie" }, "rookie")
    .facedown(P2, "bf1", EVELYNN, "eve")
    .unit(P1, "base", KHAZIX, "khazix");
}

/** Kha'Zix attacks bf1 (Rookie alone) → trigger on the chain; P1 passes → P2 holds priority. */
async function khazixAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  expect(game.p2.units("bf1")).toEqual(["rookie"]);
  await game.p1.move("khazix", "bf1");
  expect(game.state("khazix").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  expect(game.state("khazix").might).toBe(4);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ae2f72e7ea477f28 — a hidden Evelynn flipped in response does not stop Kha'Zix's already-triggered 'alone' bonus", () => {
  test("P2 may play the facedown Evelynn (for [0]) in response; she enters bf1 at once — two enemy units now — while Kha'Zix's trigger is still pending below her", async () => {
    const game = await khazixAttacks();
    expect(game.p2.can("reveal", "eve")).toBe(true);
    await game.p2.reveal("eve");
    expect(game.state("eve")).toMatchObject({ isHidden: false, location: "bf1" });
    expect(game.p2.units("bf1").sort()).toEqual(["eve", "rookie"]); // the Rookie is no longer alone
    expect(game.chain()[0]).toMatchObject({ cardId: "khazix", triggered: true }); // still there, underneath
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
    expect(game.locationOf("khazix")).toBe("bf1"); // not P2's turn: Evelynn's own move-trigger does nothing
  });

  test("LIFO: everything above resolves first, then Kha'Zix's trigger resolves WITHOUT re-checking — +2 Might (4 → 6) this turn and 2 XP for P1, still inside the bf1 showdown", async () => {
    const game = await khazixAttacks();
    await game.p2.reveal("eve");
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action") {
        await game.acting().passPriority();
      } else if (d?.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — had Evelynn already been face UP at bf1 before the attack (Rookie not alone), the condition fails at designation: no +2, no XP", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Rookie" }, "rookie")
      .unit(P2, "bf1", EVELYNN, "eve")
      .unit(P1, "base", KHAZIX, "khazix")
      .build();
    await game.p1.move("khazix", "bf1");
    for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
