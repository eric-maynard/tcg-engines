/**
 * Ruling 46c619f8c1768724 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Unit · [5][body] · 6 Might
 *   "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *    I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: My opponent moves to an empty battlefield on their turn. Can I play the new Rengar there, and am I
 *    the Defender?
 * A: Yes and yes. Their move makes the battlefield Contested and opens a (non-combat) showdown, and the
 *    enemy unit standing there satisfies Rengar's clause, so he may be played as a [Reaction] into that
 *    showdown. They applied Contested first, so they are the Attacker and you become the Defender.
 * Rules: 442.1.a.1 (whoever applies Contested is the Attacker), 442.1.a.2 (the other player is the
 *        Defender), 822.1.b/d (Ambush + a card expanding its permitted destinations), 309.1 (Closed State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";

/** P2's turn. bf1 is open (no controller, nobody there); P2's Prowler waits at home; P1 holds Rengar with [5][body]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 3, name: "Prowler" }, "prowler")
    .hand(P1, RENGAR, "rengar");
}

/** P2 walks the Prowler onto the open battlefield: contested, non-combat showdown, P2 holds focus. */
async function prowlerMovesIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("prowler", "bf1");
  expect(game.locationOf("prowler")).toBe("bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Battlefield destinations offered for playing `card` right now. */
function destinations(game: Game, card: string): string[] {
  const field = game.p1.option("playUnit", card)?.fields.find((f) => f.name === "location");
  return (field?.options ?? []).flat().map(String);
}

describe("Ruling 46c619f8c1768724 — Rengar answers a move onto an open battlefield, and becomes the Defender", () => {
  test("premise: P1 has no unit at bf1 at all, and it is P2 who made it Contested", async () => {
    const game = await prowlerMovesIn();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
  });

  test("ruling 46c619f8c1768724 (1) — during that showdown Rengar is playable, and the enemy-occupied bf1 is offered as his destination", async () => {
    const game = await prowlerMovesIn();
    expect(game.p1.can("play", "rengar")).toBe(true);
    expect(destinations(game, "rengar")).toContain("battlefield-bf1");
  });

  test("ruling 46c619f8c1768724 (2) — playing him there makes P1 the DEFENDER and leaves P2 the ATTACKER", async () => {
    const game = await prowlerMovesIn();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", controller: P1 });
    expect(game.state("prowler")).toMatchObject({ combatRole: "attacker", controller: P2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("the showdown then becomes a real combat: 6 beats 3, the Prowler dies and P1 holds bf1 — P2 never scored it", async () => {
    const game = await prowlerMovesIn();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("prowler")).toBe("trash");
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("without Rengar the open battlefield is simply taken: P2 conquers and scores it", async () => {
    const game = await prowlerMovesIn();
    await game.p1.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
