/**
 * Ruling f53d2625d43991d8 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *   × Crackshot Corsair (OGN-130 → ogn-130-298) · 3 Might · "When I attack, deal 1 to an enemy unit here."
 *
 * Q: My attacker's "when I attack" trigger fired and killed the defender. My opponent then Rides the Wind a
 *    fresh unit into that battlefield. Does my attacker's trigger fire a second time?
 * A: No. An attack trigger fires once per combat — the first time that unit gains the Attacker designation in
 *    that combat. Reinforcements arriving mid-combat do not re-trigger it.
 * Rules: 383.4.e.2.a (an attack trigger fires only on gaining the designation, once per combat), 464.2.c.3
 *        (designations are handed out as units arrive), 383.4 (a new combat is needed for a new trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRACKSHOT_CORSAIR = "ogn-130-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P2 holds bf1 with a 1-Might Weakling; P1's Corsair is in base. P2 holds Ride the Wind + a Reinforcement. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weakling")
    .unit(P2, "base", { might: 3, name: "Reinforcement" }, "reinforcement")
    .unit(P1, "base", CRACKSHOT_CORSAIR, "corsair")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .resources(P2, { energy: 2, power: { chaos: 1 } });
}

/** Corsair attacks; his trigger resolves and the 1-Might defender dies. */
async function attackAndPing(game: Game): Promise<void> {
  await game.p1.move("corsair", "bf1");
  expect(game.state("corsair").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("weakling")).toBe("trash");
  expect(game.chain()).toEqual([]);
}

describe("Ruling f53d2625d43991d8 — an attack trigger fires once per combat, even when a new unit is Ridden in", () => {
  test("the trigger fires once and kills the 1-Might defender", async () => {
    const game = await board().build();
    await attackAndPing(game);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: P2 Riding a Reinforcement into the same battlefield does NOT put Corsair's trigger back on the chain", async () => {
    const game = await board().build();
    await attackAndPing(game);
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "reinforcement", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("reinforcement")).toBe("bf1");
    expect(game.chain().some((c) => c.cardId === "corsair")).toBe(false);
    expect(game.state("reinforcement").damage).toBe(0); // never pinged
  });

  test("the Corsair is still the attacker of the same, ongoing combat — nothing re-designated him", async () => {
    const game = await board().build();
    await attackAndPing(game);
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "reinforcement", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("reinforcement").combatRole).toBe("defender");
  });

  test("end state: the combat runs with the Reinforcement present and it is the only 1 damage the Corsair's ability ever dealt", async () => {
    const game = await board().build();
    await attackAndPing(game);
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "reinforcement", answers: ["bf1"] });
    await game.settle();
    expect(game.zoneOf("corsair")).toBe("trash"); // 3 vs 3 — a straight trade, with no extra ping to tip it
    expect(game.zoneOf("reinforcement")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
