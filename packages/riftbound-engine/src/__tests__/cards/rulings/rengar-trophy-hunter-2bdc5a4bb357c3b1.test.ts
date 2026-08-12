/**
 * Ruling 2bdc5a4bb357c3b1 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Body · [5][body] · 6 Might
 *     "[Ambush] … I can be played to a battlefield where there are enemy units (even if you don't have
 *      units there)."
 *
 * Q: My opponent moves a unit onto an open battlefield to conquer it; I answer by playing Rengar there.
 *    Who is the attacker and who is the defender?
 * A: They are. The player who first made the battlefield Contested is the attacker; Rengar's controller,
 *    arriving afterwards, is the defender. Rengar is legally playable there because his own text lifts the
 *    "battlefield where you have units" requirement as long as enemy units are present.
 * Rules: 442.1.a (first contester = attacker), 190.3.a / 450 (Contested), 822 ([Ambush]), 464.2.c.3.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";

/** P2's turn. bf1 is open (nobody controls it, nobody is on it). P1 holds Rengar and [5][body]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .resources(P1, { energy: 5, power: { body: 1 } })
    .hand(P1, RENGAR, "rengar");
}

/** P2 walks the Raider onto the open battlefield — Contested by P2, showdown running. */
async function raiderContested(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.locationOf("raider")).toBe("bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.passFocus(); // the attacker acts first; P1 answers with Rengar
  return game;
}

describe("Ruling 2bdc5a4bb357c3b1 — the first contester attacks; Rengar arrives as the defender", () => {
  test("ruling: Rengar is playable at that battlefield even though P1 has no units there", async () => {
    const game = await raiderContested();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.can("play", "rengar")).toBe(true);
  });

  test("ruling: P2's Raider is the ATTACKER and the freshly played Rengar is the DEFENDER", async () => {
    const game = await raiderContested();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });

  test("epilogue: the combat runs once the chain empties — 6-Might Rengar beats the 3-Might Raider", async () => {
    const game = await raiderContested();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.p2.points()).toBe(0); // the attacker did not conquer
  });
});
