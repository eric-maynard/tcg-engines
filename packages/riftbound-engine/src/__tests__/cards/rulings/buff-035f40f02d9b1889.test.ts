/**
 * Ruling 035f40f02d9b1889 — (no specific card) How buffs work.
 *   Exercised with Sett, Brawler (OGN-164 → ogn-164-298) · 4 Might · "When I'm played and when I conquer, buff me. …
 *   Spend my buff: Give me +4 [Might] this turn." and an inline 1-cost spell "Buff a friendly unit."
 *
 * Q: How do buffs work — permanence, interactions, multiple buffs?
 * A: A buff is +1 Might for as long as the unit has it; a unit can hold only ONE buff. It stays until the unit dies or
 *    the buff is spent. You may still target an already-buffed unit with a buff effect — it just gains nothing.
 *    Many cards spend buffs for other benefits.
 * Rules: 426 (the Buff game action), 701–702 (buffs: +1 Might, one per unit, spending removes it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT_BRAWLER = "ogn-164-298";

/** Inline [1] Action: "Buff a friendly unit." */
const PEP_TALK = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Pep Talk",
  timing: "action",
};

/** P1's turn with [5][body] for Sett + [1] per Pep Talk. A vanilla 2-Might Pal in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, SETT_BRAWLER, "sett")
    .hand(P1, PEP_TALK, "pep1")
    .hand(P1, PEP_TALK, "pep2");
}

async function settPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("sett");
  await game.settle();
  expect(game.zoneOf("sett")).toBe("base");
  return game;
}

describe("Ruling 035f40f02d9b1889 — buffs: +1 while held, one at a time, until death or spent", () => {
  test("gaining a buff: Sett's play trigger buffs him — isBuffed, 4 → 5", async () => {
    const game = await settPlayed();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5 });
    expect(game.state("pal")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("only one buff: an already-buffed Sett is still a LEGAL target for 'Buff a friendly unit' (the spell resolves to the trash), but he gains no second buff — still exactly 5", async () => {
    const game = await settPlayed();
    const offered = (game.p1.option("cast", "pep1")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("sett"); // legal to choose
    expect(offered).toContain("pal");
    await game.p1.cast("pep1", { targets: "sett" });
    await game.settle();
    expect(game.zoneOf("pep1")).toBe("trash");
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    // Whereas the unbuffed Pal does gain one: 2 → 3.
    await game.p1.cast("pep2", { targets: "pal" });
    await game.settle();
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("permanence: the buff is not a 'this turn' effect — two turns later (P2's turn, then P1's again) Sett is still buffed at 5", async () => {
    const game = await settPlayed();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("spending: 'Spend my buff: +4 this turn' removes the buff (5 → 4 + 4 = 8 this turn); next turn he is a plain unbuffed 4 — and with no buff left the ability can't be used again", async () => {
    const game = await settPlayed();
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8 });
    expect(game.p1.can("activate", "sett")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
  });

  test("until death: a buffed unit that dies and comes back is a new object with no buff", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true })
      .build();
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
    await game.p1.move("pal", "bf1");
    await game.settle(); // 3 into a 6: Pal dies
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.state("pal").isBuffed).toBe(false);
  });
});
