/**
 * Ruling 5dee40d5cd59eeaf — Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · [2][fury]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me."
 *
 * Q: Thrill of the Hunt on my Darius, Trifarian as my FIRST card this turn — does his ability trigger and ready him?
 * A: Yes. Thrill is card #1; Darius being played by Thrill's resolution counts as playing a card, so he is card #2, is on the
 *    board when that is checked, and triggers: +2 Might and readied (he would otherwise enter exhausted). Notes: gear attached
 *    to the banished unit detaches and stays at the old location.
 * Rules: 419.4 (played via an effect is still "played"), 383.2.c (checked after the play completes), 811.1.c.3 (units enter
 *        exhausted), 817.4 / 189 (Equipment detaches when the unit leaves the board and stays where it was).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const DARIUS = "ogn-027-298";
const BF_SWORD = "sfd-161-221"; // Equipment +3, no other text

/**
 * P1's turn, nothing played yet. P1 controls bf1 where Darius (5, wearing B.F. Sword → 8) stands EXHAUSTED; bf2 is P2's with
 * a Guard (4). P1 holds Thrill + a 1-cost Squire, with [3][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", DARIUS, "darius", { equippedWith: ["sword"], exhausted: true })
    .card("sword", { def: BF_SWORD, meta: { attachedTo: "darius" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .hand(P1, THRILL, "thrill")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Squire" }, "squire");
}

/** Cast Thrill on Darius; on resolution his owner (P1) is asked where to play him → bf1; drain the rest. */
async function thrillDarius(game: Game): Promise<void> {
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "darius" });
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "pick", seat: P1 }); // "to any battlefield" — the owner chooses
  expect(game.zoneOf("darius")).toBe("banishment");
  const keys = r.decision?.kind === "pick" ? r.decision.options.map((o) => o.key) : [];
  expect(keys).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf2"]));
  expect(keys.some((k) => /base/.test(k))).toBe(false); // battlefields only
  await game.p1.pick("battlefield-bf1");
  await game.settle({ policy: "first" });
  expect(game.zoneOf("thrill")).toBe("trash");
  expect(game.zoneOf("darius")).toBe("battlefield-bf1");
}

describe("Ruling 5dee40d5cd59eeaf — Darius replayed by a first-card Thrill of the Hunt is the second card played: +2 and readied", () => {
  test("premise: nothing played yet this turn; Darius is an exhausted 8 (5 + B.F. Sword) at bf1", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("darius")).toMatchObject({ attachments: ["sword"], isExhausted: true, might: 8 });
  });

  test("Thrill (card #1) banishes Darius and his owner replays him to a battlefield for free; that play is card #2 → his trigger fires: +2 Might this turn (5 → 7) and he is READY", async () => {
    const game = await board().build();
    await thrillDarius(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // only Thrill was paid; Darius ignored his cost
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2); // Thrill, then Darius
    expect(game.state("darius").mightModifier).toBe(2);
    expect(game.state("darius").might).toBe(7); // 5 + 2 (the Sword fell off — below)
    expect(game.state("darius").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("note — gear detachment: the B.F. Sword falls off when Darius is banished and stays behind on P1's board, unattached; the replayed Darius wears nothing", async () => {
    const game = await board().build();
    await thrillDarius(game);
    expect(game.state("darius").attachments).toEqual([]);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(["battlefield-bf1", "base"]).toContain(game.zoneOf("sword")); // still P1's, still in play — not banished/trashed with him
    expect(game.state("sword").owner).toBe(P1);
  });

  test("note — state of entry: a unit played via Thrill enters EXHAUSTED by default; it is only Darius's own trigger that readies him (contrast: a card played BEFORE Thrill makes him card #3 → no trigger → he stays exhausted at 5)", async () => {
    const game = await board().build();
    await game.p1.play("squire", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    await thrillDarius(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(3);
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").mightModifier).toBe(0);
  });

  test("'this turn': next turn Darius is back to a plain 5", async () => {
    const game = await board().build();
    await thrillDarius(game);
    expect(game.state("darius").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("darius")).toMatchObject({ might: 5, mightModifier: 0 });
  });
});
