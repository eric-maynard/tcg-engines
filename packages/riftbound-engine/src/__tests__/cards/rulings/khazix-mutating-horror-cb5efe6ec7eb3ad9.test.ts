/**
 * Ruling cb5efe6ec7eb3ad9 — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · Champion Unit · Chaos · 4 Might
 *     "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *   × Inferna (unl-002-219) · 1 Might "[Ambush] [Assault 2]" — the opponent's Reaction-speed unit play.
 *
 * Q: Kha'Zix attacks a lone defender; the opponent reacts to the trigger by playing a unit there. Still +2 / 2 XP?
 * A: Yes. "if an enemy unit is alone here" is evaluated when Kha'Zix gains the Attacker designation and the ability
 *    triggers; the item goes on the chain. The opponent's unit (played in response) enters first (LIFO), but the
 *    condition is not re-evaluated at resolution — Kha'Zix gets +2 Might this turn and his controller gains 2 XP.
 * Rules: 383.2.a.1 (intervening "if" is part of the condition, checked at trigger time), 340 (LIFO), 800 (Ambush).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const INFERNA = "unl-002-219";

/** P1's turn. P2 holds bf1 with a lone Guard (2) and has Inferna + [2] to Ambush it in. P1's Kha'Zix (4) in base. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P2, INFERNA, "inferna")
    .unit(P1, "base", KHAZIX, "khazix");
}

/** 1–2: Kha'Zix moves in, becomes the attacker; Guard is alone → the trigger is on the chain. P1 passes to P2. */
async function triggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("khazix", "bf1");
  expect(game.state("khazix").combatRole).toBe("attacker");
  expect(game.p2.units("bf1")).toEqual(["guard"]); // alone at trigger time
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** Pass priority around until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling cb5efe6ec7eb3ad9 — a unit played in response does not retroactively negate Kha'Zix's 'alone' trigger", () => {
  test("3: the opponent reacts — Inferna is Ambushed to bf1 above Kha'Zix's trigger and enters first; Guard is no longer alone, the trigger is still waiting", async () => {
    const game = await triggerOnChain();
    expect(game.p2.can("play", "inferna")).toBe(true);
    await game.p2.play("inferna", { to: "bf1" });
    expect(game.zoneOf("inferna")).toBe("battlefield-bf1");
    expect(game.p2.units("bf1").toSorted()).toEqual(["guard", "inferna"]);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "khazix", triggered: true }));
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });

  test("4: Kha'Zix's trigger then resolves WITHOUT re-checking 'alone': +2 [Might] this turn (4 → 6) and P1 gains 2 XP", async () => {
    const game = await triggerOnChain();
    await game.p2.play("inferna", { to: "bf1" });
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("baseline — with no reaction the trigger resolves the same way: 6 Might, 2 XP, and Kha'Zix (6) then beats the lone Guard (2) to conquer", async () => {
    const game = await triggerOnChain();
    await drainChain(game);
    expect(game.state("khazix").might).toBe(6);
    expect(game.p1.xp()).toBe(2);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("control — had two enemy units been there when he attacked, nothing would have triggered (no +2, no XP)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "bf1", INFERNA, "inferna")
      .unit(P1, "base", KHAZIX, "khazix")
      .build();
    await game.p1.move("khazix", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
