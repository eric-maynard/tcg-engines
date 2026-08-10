/**
 * Ruling 175a37156f5944ce — Flame Chompers (OGN-006 → ogn-006-298) "When you discard me, you may pay [fury] to play me."
 *   × Chemtech Enforcer (OGN-003 → ogn-003-298) "When you play me, discard 1."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) "When you kill a unit with a spell, you may pay [1][fury] to
 *     play me from your trash."
 *   Witnesses: Darius, Trifarian (ogn-027-298) "When you play your second card in a turn, give me +2 [Might] this
 *   turn and ready me." / Cithria of Cloudfield (ogn-139-298) "When you play another unit, buff me."
 *
 * Q: Do units played through alternative routes (Chompers off a discard, Phoenix from the trash) trigger
 *    "when you play a unit / your second card" effects (Darius, Legion-style counts)?
 * A: Yes — an alternative way to play a card is still playing it; play-triggers fire and it counts as a
 *    card played this turn.
 * Rules: 383.3.b (optional costed trigger), 359.3.e.6 / 415 (play from a non-hand zone is a play), 419.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLAME_CHOMPERS = "ogn-006-298";
const CHEMTECH_ENFORCER = "ogn-003-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const DARIUS_TRIFARIAN = "ogn-027-298"; // 5 Might — second-card-this-turn witness
const CITHRIA = "ogn-139-298"; // 1 Might — "when you play another unit" witness
const HIDDEN_BLADE = "ogn-213-298"; // [2][order] Action — Kill a unit at a battlefield. Its controller draws 2.

/** Answer any destination prompt for the alt-played unit with the first option (base), then settle. */
async function finishPlay(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const base = d.options.find((o) => /base/i.test(o.label) || o.key === "base") ?? d.options[0]!;
    await game.p1.pick(base.key);
  }
}

describe("Ruling 175a37156f5944ce — units played via alternative routes still count as 'played'", () => {
  test("Flame Chompers discarded to Chemtech Enforcer and played for [fury]: it is P1's SECOND card played — Darius, Trifarian gets +2 and readies; cardsPlayedThisTurn = 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
      .hand(P1, CHEMTECH_ENFORCER, "enforcer")
      .hand(P1, FLAME_CHOMPERS, "chompers")
      .build();

    await game.p1.play("enforcer", { to: "base" });
    await game.settle(); // Enforcer's "discard 1" is forced onto the only other card: Chompers
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // first card: Darius idle
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });

    await game.p1.yes();
    await finishPlay(game);
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // It WAS played: the Legion-style count advanced and Darius saw a second card.
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("Immortal Phoenix played from the trash after your spell kills a unit: Cithria ('when you play another unit') is buffed, Darius sees the second card, cardsPlayedThisTurn = 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
      .unit(P1, "base", CITHRIA, "cithria")
      .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
      .trash(P1, IMMORTAL_PHOENIX, "phoenix")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();

    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // the spell
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 }); // a spell is not a unit
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });

    await game.p1.yes();
    await finishPlay(game);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("darius")).toMatchObject({ isExhausted: false, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
