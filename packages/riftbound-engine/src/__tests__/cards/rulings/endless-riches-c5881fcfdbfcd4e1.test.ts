/**
 * Ruling c5881fcfdbfcd4e1 — Endless Riches (VEN-022 → ven-022-166) Gear "… If a card would go to your trash from anywhere other than
 *   your Main Deck, banish it instead." × Master of Shadows (VEN-191 → ven-191-166, Zed legend) "When you banish a card you own,
 *   empower me. …" (Shadow unl-194-219 / Zhonya's Hourglass ogn-077-298 are cited only as analogies for replacement attribution.)
 *
 * Q: My unit is killed in combat; Endless Riches banishes it instead. Does that count as ME banishing it for the Zed legend?
 * A: Yes. A replacement effect's actions are performed by the controller of its source (Endless Riches = you), and the unit is a card
 *    you own — so "When you banish a card you own" is met and Master of Shadows is empowered.
 * Rules: 374 (replacement effect controller = its source's controller), 370.2 (replaced actions attributed to that player), 571.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ENDLESS_RICHES = "ven-022-166";
const MASTER_OF_SHADOWS = "ven-191-166";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P1: Master of Shadows legend, Endless Riches already in play, a Grunt (2) in base. P2 holds bf1 with a Wall (5). */
function board(withRiches = true) {
  const s = scenario()
    .legend(P1, MASTER_OF_SHADOWS, "zed")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt");
  return withRiches ? s.gear(P1, ENDLESS_RICHES, "riches") : s;
}

/** Grunt attacks the Wall and combat resolves (Grunt takes 5 ≥ 2 → killed). */
async function gruntDiesInCombat(game: Game): Promise<void> {
  expect(game.state("zed").isEmpowered).toBe(false);
  await game.p1.move("grunt", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  await game.settle();
  expect(showdown(game)).toBeUndefined();
  expect(game.zoneOf("wall")).toBe("battlefield-bf1");
}

describe("Ruling c5881fcfdbfcd4e1 — a combat death turned into a banish by Endless Riches is 'you banishing a card you own' for Master of Shadows", () => {
  test("with Endless Riches in play, the Grunt killed in combat goes to P1's BANISHMENT instead of the trash…", async () => {
    const game = await board().build();
    await gruntDiesInCombat(game);
    expect(game.zoneOf("grunt")).toBe("banishment");
    expect(game.p1.banishment()).toContain("grunt");
    expect(game.p1.trash()).not.toContain("grunt");
  });

  // Expected: the trash→banish replacement is a banish performed by P1 (rule 374) of a card P1 owns, so "When you banish a card you
  // own" triggers and the legend is empowered. Actual: the Grunt is banished, but the replacement-banish raises no banish event for
  // Master of Shadows — the legend stays un-empowered (a banish INSTRUCTION, e.g. Riches' own play trigger, does empower it).
  test("ruling c5881fcfdbfcd4e1 — Endless Riches' replacement banish does not fire Master of Shadows' 'when you banish' trigger", async () => {
    const game = await board().build();
    await gruntDiesInCombat(game);
    await game.settle(); // let the legend's trigger resolve if it is still on the chain
    expect(game.chain()).toEqual([]);
    expect(game.state("zed").isEmpowered).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("reference: a banish P1 performs by instruction (Endless Riches' own play trigger banishing P1's hand and trash) DOES empower Master of Shadows — the replacement banish must be attributed the same way", async () => {
    const game = await scenario()
      .legend(P1, MASTER_OF_SHADOWS, "zed")
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .hand(P1, ENDLESS_RICHES, "riches")
      .hand(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk")
      .build();
    await game.p1.play("riches");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("banishment");
    expect(game.state("zed").isEmpowered).toBe(true);
  });

  test("control: WITHOUT Endless Riches the same death puts the Grunt in the trash and the legend is NOT empowered", async () => {
    const game = await board(false).build();
    await gruntDiesInCombat(game);
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.state("zed").isEmpowered).toBe(false);
  });

  test("control: an ENEMY unit dying (P2's card → P2's trash) is untouched by P1's Endless Riches and does not empower the legend", async () => {
    const game = await scenario()
      .legend(P1, MASTER_OF_SHADOWS, "zed")
      .gear(P1, ENDLESS_RICHES, "riches")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.p2.trash()).toContain("weak");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("zed").isEmpowered).toBe(false);
  });
});
