/**
 * Ruling b520725720343fb1 — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) × Nidalee, Cat Form (UNL-114 → unl-114-219)
 *   Kha'Zix (4, [4][chaos]): "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn
 *   and gain 2 XP."   Nidalee (4, [3][body]): "[Ambush] When I win a combat, draw 1."
 *
 * Q: I Ambush Kha'Zix in to DEFEND against a lone attacking Rengar; my opponent responds by Ambushing Nidalee in beside
 *    Rengar. Does Kha'Zix's trigger still give +2 on resolution?
 * A: Yes. "Alone" is checked when Kha'Zix enters and gains the Defender designation; the trigger goes on the chain then.
 *    Nidalee (added above it) enters first (LIFO), but the trigger does not re-evaluate on resolution: +2 Might and 2 XP.
 * Rules: 383.2 (condition evaluated when triggered), 383.4.e (defend trigger on designation), 336–340 (LIFO),
 *        Ambush (Reaction-speed unit play to a battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const NIDALEE = "unl-114-219";

/**
 * P2's turn. P1 holds bf1 with Anchor (2) and has Kha'Zix in hand + exactly [4][chaos]. P2 has a vanilla 3-Might
 * "Rengar" in base to attack with and Nidalee in hand + exactly [3][body]. P1 at 0 XP.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Rengar" }, "rengar")
    .hand(P1, KHAZIX, "khazix")
    .hand(P2, NIDALEE, "nidalee");
}

/** Rengar attacks bf1 alone; P2 passes focus; P1 Ambushes Kha'Zix in as a defender → his trigger is on the chain. */
async function khazixAmbushesIn(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  await game.p2.move("rengar", "bf1");
  expect(game.state("rengar").combatRole).toBe("attacker");
  expect(game.p2.units("bf1")).toEqual(["rengar"]); // the enemy is alone here
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("play", "khazix")).toBe(true); // Ambush: Reaction-speed to a battlefield where P1 has units
  await game.p1.play("khazix", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
  expect(game.state("khazix").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  expect(game.state("khazix").might).toBe(4);
  return game;
}

describe("Ruling b520725720343fb1 — Nidalee ambushing in beside Rengar doesn't undo defending Kha'Zix's already-triggered 'alone' bonus", () => {
  test("with Kha'Zix's defend trigger pending, P2 may Ambush Nidalee to bf1 in response; she enters immediately as a second attacker while the trigger is still on the chain", async () => {
    const game = await khazixAmbushesIn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("play", "nidalee")).toBe(true);
    await game.p2.play("nidalee", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.state("nidalee").combatRole).toBe("attacker");
    expect(game.p2.units("bf1").sort()).toEqual(["nidalee", "rengar"]); // Rengar no longer alone
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", triggered: true })]);
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });

  test("Kha'Zix's trigger then resolves WITHOUT re-checking 'alone': +2 Might this turn (4 → 6) and P1 gains 2 XP; the showdown continues", async () => {
    const game = await khazixAmbushesIn();
    await game.p1.passPriority();
    await game.p2.play("nidalee", { to: "bf1" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — had a second attacker ALREADY been at bf1 when Kha'Zix ambushed in (enemy not alone), the condition fails: no +2, no XP", async () => {
    const game = await board().unit(P2, "base", { might: 2, name: "Packmate" }, "packmate").build();
    await game.p2.move(["rengar", "packmate"], "bf1");
    await game.p2.passFocus();
    await game.p1.play("khazix", { to: "bf1" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
