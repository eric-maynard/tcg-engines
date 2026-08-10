/**
 * Ruling 4afdb4f8e6643fbb — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [5][body] · [Ambush]
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) I can be played to a battlefield where
 *      there are enemy units…"
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024, Master Yi legend) "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: A unit defends alone with Yi's +2; I Ambush Rengar into that battlefield. Does the +2 stay?
 * A: No. Yi's bonus is a continuous "While" effect; the instant Rengar enters (a second friendly unit there) the defender is no
 *    longer alone and loses the +2 immediately — no snapshot, regardless of anything still on the chain.
 * Rules: 522 (statics apply continuously), 741.1 (alone), 806 (Ambush), FAQ #10141/#3935.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const WUJU_BLADESMAN = "ogs-019-024";

/**
 * P2's turn. P1 (Master Yi) holds bf1 with a lone 3-Might Disciple; Rengar in hand with exactly [5][body].
 * P2's 4-Might Raider attacks from base.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Disciple" }, "disciple")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1; P2 passes focus to P1. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("disciple").might).toBe(3); // not defending yet
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 4afdb4f8e6643fbb — Ambushing Rengar in beside a lone defender switches off Master Yi's +2 at once", () => {
  test("opening state: the Disciple defends ALONE → Yi's continuous +2 applies (3 → 5)", async () => {
    const game = await attacked();
    expect(game.state("disciple")).toMatchObject({ combatRole: "defender", might: 5 });
  });

  test("Rengar is playable via Ambush to bf1 during the showdown and goes on the chain; while he is still on the chain the Disciple is still alone (5)", async () => {
    const game = await attacked();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const to = game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-bf1");
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    if (game.zoneOf("rengar") !== "battlefield-bf1") {
      // Still a pending play on the chain: nothing has changed for the Disciple yet.
      expect(game.state("disciple").might).toBe(5);
    }
  });

  test("the moment Rengar ENTERS bf1 the Disciple is no longer alone: the +2 is gone immediately (back to 3), mid-showdown, before combat resolves", async () => {
    const game = await attacked();
    await game.p1.play("rengar", { to: "bf1" });
    for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(showdown(game)?.active).toBe(true); // still inside the combat showdown
    expect(game.p1.units("bf1").sort()).toEqual(["disciple", "rengar"]);
    expect(game.state("disciple")).toMatchObject({ combatRole: "defender", might: 3, mightModifier: 0 });
    expect(game.state("rengar").might).toBe(6); // Rengar is not alone either — no +2 for him
    expect(game.violations()).toEqual([]);
  });
});
