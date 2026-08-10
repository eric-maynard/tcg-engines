/**
 * Ruling 50879c7c933ad3cc — Ripper's Bay (UNL-214 → unl-214-219) · Battlefield
 *   "When a unit here is returned to a player's hand, that player may pay [1] to channel 1 rune exhausted."
 *   × Rebuke (ogn-172-298, "[Action] Return a unit at a battlefield to its owner's hand.") on a 1-Might Recruit unit TOKEN.
 *
 * Q: If a token unit at Ripper's Bay is returned to my hand, can I still pay [1] to channel a rune?
 * A: Yes. A token is a unit; it does move to the hand zone (satisfying "returned to a player's hand") and only then
 *    ceases to exist. The Bay's ability goes on the chain for that player, who may pay [1] to channel 1 rune exhausted.
 * Rules: 184.1 (Recruit token = unit), 183.1 / 186.1 (a token in a non-board zone ceases to exist), 383 (trigger
 *        condition met by the zone change), 430.2 (channel exhausted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPPERS_BAY = "unl-214-219";
const REBUKE = "ogn-172-298";
const RECRUIT_TOKEN = { cardType: "unit", isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] } as const;

/** P2's turn with Rebuke paid up. P1 holds the live Bay with a Recruit TOKEN and an Anchor (4); P1 has `p1Energy`. */
function board(p1Energy: number) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .resources(P1, { energy: p1Energy })
    .battlefield("bay", { controller: P1, def: RIPPERS_BAY, inert: false })
    .unit(P1, "bay", RECRUIT_TOKEN, "token-recruit")
    .unit(P1, "bay", { might: 4, name: "Anchor" }, "anchor")
    .hand(P2, REBUKE, "rebuke");
}

const tokenZone = (game: Game) => (game.has("token-recruit") ? game.zoneOf("token-recruit") : "gone");

/** P2 Rebukes the token; both pass; it resolves. */
async function rebukeTheToken(game: Game): Promise<void> {
  expect(game.state("token-recruit")).toMatchObject({ isToken: true, might: 1, zone: "battlefield-bay" });
  await game.p2.cast("rebuke", { targets: "token-recruit" });
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Ruling 50879c7c933ad3cc — a token bounced from Ripper's Bay still triggers the Bay for its owner", () => {
  test("Rebuke returns the Recruit token 'to hand': it leaves the Bay and ceases to exist (not on the board, not in the trash, not a card in hand) — AND the Bay's ability is put on the chain for P1, who is asked to pay [1]", async () => {
    const game = await board(1).build();
    await rebukeTheToken(game);
    expect(tokenZone(game)).not.toBe("battlefield-bay");
    expect(["gone", "hand"]).toContain(tokenZone(game));
    expect(game.p1.trash()).not.toContain("token-recruit");
    expect(game.p1.units("bay")).toEqual(["anchor"]);
    // The trigger condition was met by the zone change: P1 ("that player") gets the Bay's opt-in with its [1] cost.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bay", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bay", controller: P1, triggered: true })]);
  });

  test("P1 accepts: pays [1] and, on resolution, channels 1 rune EXHAUSTED; P2 (the caster) gets nothing", async () => {
    const game = await board(1).build();
    const p1Runes = game.p1.runes().length;
    const p2Runes = game.p2.runes().length;
    await rebukeTheToken(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // cost paid on accepting
    await game.settle();
    expect(game.p1.runes()).toHaveLength(p1Runes + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(p2Runes);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // only Rebuke's own cost
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("it is a 'may': declining costs nothing and channels nothing (the token is still gone)", async () => {
    const game = await board(1).build();
    await rebukeTheToken(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.runes()).toHaveLength(0);
    expect(["gone", "hand"]).toContain(tokenZone(game));
  });
});
