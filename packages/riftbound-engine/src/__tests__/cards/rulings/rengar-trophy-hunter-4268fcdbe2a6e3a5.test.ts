/**
 * Ruling 4268fcdbe2a6e3a5 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Unit · 6 Might · [5][body]
 *   "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *    I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: I move in to conquer an empty battlefield and my opponent plays Rengar there. Who is the attacker?
 * A: You are. Applying Contested first makes the player who moved in the Attacker; anyone entering an
 *    already-contested battlefield afterwards is a Defender. Rengar's permission only lets him be PLAYED
 *    there — it does not change the designation.
 * Rules: 459.2.b.1 (the player who makes it contested is the Attacker), 459.2.b.2 (later arrivals defend),
 *        [Ambush] / "can be played to a battlefield where there are enemy units".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";

/** P1's turn. bf1 is empty and uncontrolled; P1 has a Vanguard (7) ready; P2 holds Rengar and [5][body]. */
function board() {
  return scenario()
    .resources(P2, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 7, name: "Vanguard" }, "van")
    .hand(P2, RENGAR, "rengar");
}

/** P1 moves in first (making bf1 contested), then P2 ambushes Rengar into it. */
async function movedThenAmbushed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("van", "bf1");
  expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1); // P1 applied Contested → P1 is the Attacker
  await game.p1.passFocus();
  expect(game.p2.can("play", "rengar")).toBe(true);
  await game.p2.play("rengar", { to: "bf1" });
  return game;
}

describe("Ruling 4268fcdbe2a6e3a5 — the player who moved in first is the Attacker; Rengar arrives as the Defender", () => {
  test("moving into the empty bf1 makes it contested and P1 the attacker", async () => {
    const game = await board().build();
    await game.p1.move("van", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  });

  test("ruling: Rengar may be played there even though P2 has no units at bf1", async () => {
    const game = await board().build();
    await game.p1.move("van", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("play", "rengar")).toBe(true);
    await game.p2.play("rengar", { to: "bf1" });
    expect(game.locationOf("rengar")).toBe("bf1");
  });

  test("ruling: Rengar enters as the DEFENDER and P1's Vanguard stays the ATTACKER", async () => {
    const game = await movedThenAmbushed();
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.state("van").combatRole).toBe("attacker");
  });

  test("epilogue: the combat runs attacker-vs-defender — the 7-Might Vanguard survives Rengar's 6 and P1 conquers bf1", async () => {
    const game = await movedThenAmbushed();
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("van")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
