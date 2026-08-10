/**
 * Ruling c99b3a7111ac7e8a — Scuttle Crab (UNL-053 → unl-053-219) · 0 Might · "[Deathknell] Choose an opponent. They reveal
 *   their hand. You can look at their facedown cards this turn. Gain 1 XP."
 *   × Nidalee, Cat Form (UNL-114 → unl-114-219) · 4 Might · "When I win a combat, draw 1."
 *
 * Q: My Scuttle Crab dies to the opponent's Nidalee, who wins the combat and draws 1. Does the Deathknell reveal show me
 *    the card Nidalee draws?
 * A: No. The Deathknell fires in Combat Cleanup and resolves in its own window BEFORE the combat result is determined; only
 *    then does Nidalee's "win a combat" trigger go on the chain and draw. The drawn card was never part of the reveal.
 * Rules: 461.1–461.2 (cleanup kills → FEPR window → result → next window), 808 (Deathknell), 424.3.a.1 (a reveal names the
 *        cards there at that moment).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";
const NIDALEE = "unl-114-219";

/** P1 (Nidalee) attacks P2's lone Scuttle Crab at bf1. P1 holds one known card; the top of P1's deck is the card Nidalee will draw. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", NIDALEE, "nidalee")
    .unit(P2, "bf1", SCUTTLE_CRAB, "crab")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Secret Plan" }, "secret")
    .deckTop(P1, { cardType: "spell", energyCost: 8, name: "Fresh Card" }, "fresh");
}

async function resolveTop(game: Game): Promise<void> {
  const top = game.chain().at(-1)?.id;
  for (let i = 0; i < 4 && top !== undefined && game.chain().some((c) => c.id === top); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

const reveals = (game: Game) => game.gameState.publicReveals ?? [];

describe("Ruling c99b3a7111ac7e8a — Scuttle Crab's Deathknell reveal resolves before Nidalee's win-combat draw", () => {
  test("step by step: Crab dies → Deathknell alone on the chain and resolves (reveal = P1's hand as it was, +1 XP) → THEN Nidalee's trigger draws", async () => {
    const game = await board().build();
    await game.p1.move("nidalee", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat: 4 into a 0-Might Crab

    // (1) Combat cleanup: the Crab is dead; only its Deathknell (P2's) is on the chain. No draw has happened.
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crab", controller: P2, triggered: true })]);
    expect(game.p1.hand()).toEqual(["secret"]);
    expect(game.p2.xp()).toBe(0);
    await resolveTop(game);
    // Deathknell resolved: P2 gains 1 XP and P1's hand — exactly {secret} — was revealed.
    expect(game.p2.xp()).toBe(1);
    expect(reveals(game)).toContainEqual(expect.objectContaining({ cardIds: ["secret"], playerId: P1 }));
    expect(game.p1.hand()).toEqual(["secret"]); // still no draw
    expect(game.zoneOf("fresh")).toBe("mainDeck");

    // (2) Combat result determined → Nidalee's "When I win a combat" is the next, separate chain.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nidalee", controller: P1, triggered: true })]);
    await resolveTop(game);
    expect(game.p1.hand().sort()).toEqual(["fresh", "secret"]);

    // The drawn card was never revealed to P2.
    expect(reveals(game).some((r) => r.cardIds.includes("fresh"))).toBe(false);
    const p2sees = game.p2.view().zones.hand?.filter((c) => c.owner === P1) ?? [];
    expect(p2sees).toHaveLength(2);
    expect(p2sees.every((c) => "hidden" in c && c.hidden === true)).toBe(true);

    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("end state via settle(): Crab in trash, P2 +1 XP, P1 drew exactly the one card — and it is not in the reveal record", async () => {
    const game = await board().build();
    await game.p1.move("nidalee", "bf1");
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.hand().sort()).toEqual(["fresh", "secret"]);
    expect(reveals(game).flatMap((r) => r.cardIds)).toEqual(["secret"]);
    expect(game.p1.points()).toBe(1);
  });
});
