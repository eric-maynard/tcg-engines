/**
 * Sona, Harmonious — ogn-073-298 · Champion Unit · Calm · 4 energy · [calm] · 4 might
 *
 *   At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes.
 *
 * Rule 317 (Ending step triggers) · 355.13 ("up to N": 0..N chosen by the
 * controller) · the awaken step only readies the TURN player's permanents, so
 * P1's runes keep whatever state Sona left them in through P2's turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import type { Game } from "../../harness";

const CARD = "ogn-073-298";

function withSonaAt(where: "bf1" | "base", exhaustedRunes: number) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, where, CARD, "sona", { exhausted: true })
    .unit(P1, "base", { might: 1 }, "bystander", { exhausted: true })
    .runes(P1, "calm", exhaustedRunes, { exhausted: true });
}

/** End P1's turn and drive Sona's trigger, choosing up to `max` runes if asked. */
async function endTurnChoosingRunes(game: Game, max: number): Promise<void> {
  await game.p1.endTurn();
  for (let i = 0; i < 12 && game.turnPlayer() === P1; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(...d.options.slice(0, Math.min(max, d.max)).map((o) => o.key));
    } else if ((await game.settle()).reason !== "unanswered") {
      break;
    }
  }
  await game.settle({ policy: "first" });
}

describe("Sona, Harmonious (ogn-073-298)", () => {
  test("costs 4 energy + 1 calm and enters the base exhausted as a 4-might unit", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "sona").build();
    await game.p1.play("sona", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("sona")).toBe("base");
    expect(game.state("sona").might).toBe(4);
    expect(game.state("sona").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "sona").build();
    expect(noPower.p1.can("play", "sona")).toBe(false);
  });

  test("at the end of your turn with Sona at a battlefield her trigger goes on the chain", async () => {
    const game = await withSonaAt("bf1", 3).build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true })]);
  });

  test.failing("BUG: readies friendly runes (3 exhausted → all 3 ready after the trigger resolves)", async () => {
    // Expected: the three exhausted calm runes are ready going into P2's turn.
    // Actual: the trigger resolves but target type "rune" is not resolved against the rune pool,
    // so no rune is readied.
    const game = await withSonaAt("bf1", 3).build();
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await endTurnChoosingRunes(game, 4);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
  });

  test.failing("BUG: 'up to 4' — with 5 exhausted runes exactly 4 become ready and 1 stays exhausted", async () => {
    // Expected: controller picks 4 of the 5. Actual: nothing is readied (see above).
    const game = await withSonaAt("bf1", 5).build();
    await endTurnChoosingRunes(game, 4);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("readies RUNES only: exhausted friendly units (Sona herself, a bystander) stay exhausted", async () => {
    const game = await withSonaAt("bf1", 3).build();
    await endTurnChoosingRunes(game, 4);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sona").isExhausted).toBe(true);
    expect(game.state("bystander").isExhausted).toBe(true);
  });

  test("condition: Sona in the BASE at end of turn puts nothing on the chain and readies nothing", async () => {
    const game = await withSonaAt("base", 3).build();
    await game.p1.endTurn();
    expect(game.chain().some((c) => c.cardId === "sona")).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
  });

  test("only YOUR turn: the opponent ending their turn with my Sona at a battlefield triggers nothing", async () => {
    const game = await withSonaAt("bf1", 3).active(P2).build();
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "sona")).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
  });
});
