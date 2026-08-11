/**
 * Ruling 1979d3b4b345bb8b — Discipline (OGN-058 → ogn-058-298) · Spell · Calm · [2] · [Reaction]
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear [2] — "If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it. (Send it to base. This isn't a move.)"
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) · 3 Might — "When I move from a location, play a 3 [Might] Sprite
 *     unit token with [Temporary] there." (the move-trigger witness).
 *
 * Q: Does a unit carrying a buff lose it when Zhonya's Hourglass recalls it?
 * A: No. A recalled unit keeps every buff and modification — it is simply moved to its controller's base,
 *    unchanged. Nuances: a recall does not trigger movement abilities, and the +2 [Might] from Discipline is
 *    retained just like any other modification.
 * Rules: 454 (Recall = send to base; a corrective/effect recall is NOT a move, 446.1), 373.1.a (the replacement's
 *        heal/exhaust/recall happen in place of the death), 317.2 ("this turn" modifiers expire only in the
 *        Ending Phase's Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const ZHONYAS = "ogn-077-298";
const LILLIA = "unl-082-219";

/**
 * P2's turn. P1 holds bf1 with Lillia (3 Might) alone, Zhonya's Hourglass face up in P1's base and Discipline
 * in hand with [2]. P2's 5-Might Raider stands in base ready to attack.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, ZHONYAS, "zh")
    .unit(P1, "bf1", LILLIA, "lillia")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc");
}

/** Raider attacks; P1 Disciplines Lillia to 5 Might inside the showdown and lets it resolve. */
async function buffedUnderAttack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("lillia").combatRole).toBe("defender");
  await game.p2.passFocus();
  await game.p1.cast("disc", { targets: "lillia" });
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("disc")).toBe("trash");
  expect(game.state("lillia")).toMatchObject({ might: 5, mightModifier: 2 });
  return game;
}

const sprites = (game: Game) => [...game.p1.units("base"), ...game.p1.units("bf1")].filter((u) => game.state(u).isToken);

describe("Ruling 1979d3b4b345bb8b — a unit recalled by Zhonya's Hourglass keeps Discipline's +2 [Might]", () => {
  test("setup: Discipline puts +2 on the lone defender (3 → 5), matching the 5-Might Raider", async () => {
    const game = await buffedUnderAttack();
    expect(game.state("lillia").baseMight).toBe(3);
    expect(game.state("lillia").might).toBe(5);
    expect(sprites(game)).toEqual([]);
  });

  test("mutual lethal: Zhonya's replaces Lillia's death — the gear dies instead and Lillia is healed, exhausted and recalled to base", async () => {
    const game = await buffedUnderAttack();
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // killed in her place
    expect(game.zoneOf("lillia")).toBe("base");
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.state("lillia")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("raider")).toBe("trash"); // took Lillia's buffed 5
    expect(game.violations()).toEqual([]);
  });

  test("THE RULING: after the recall Lillia still carries Discipline's +2 — mightModifier 2, effective 5 on a 3-Might body", async () => {
    const game = await buffedUnderAttack();
    await game.settle();
    expect(game.state("lillia").mightModifier).toBe(2);
    expect(game.state("lillia").might).toBe(5);
    expect(game.state("lillia").baseMight).toBe(3);
  });

  test("nuance: the recall is not a move — Lillia's 'When I move from a location' trigger does not fire, no Sprite token appears", async () => {
    const game = await buffedUnderAttack();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(sprites(game)).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.units("base")).toEqual(["lillia"]);
  });

  test("control: the retained modifier is still a 'this turn' one — it expires in the Ending Phase, leaving a plain 3-Might Lillia in base", async () => {
    const game = await buffedUnderAttack();
    await game.settle();
    expect(game.state("lillia").might).toBe(5);
    await game.advanceTurn(); // P2's turn ends → expiration step
    expect(game.state("lillia").mightModifier).toBe(0);
    expect(game.state("lillia").might).toBe(3);
    expect(game.locationOf("lillia")).toBe("base");
  });

  test("control: a standard MOVE by the same unit does fire her trigger — so the silence above is the recall, not a missing trigger", async () => {
    const game = await board().build();
    await game.advanceToTurnOf(P1);
    expect(game.state("lillia").isReady).toBe(true);
    await game.p1.move("lillia", "base");
    await game.settle();
    expect(sprites(game).length).toBeGreaterThan(0); // Sprite left behind at bf1
  });
});
