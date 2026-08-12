/**
 * Ruling 2a574e6d83c828f8 — Abandoned Hall (UNL-205 → unl-205-219) · Battlefield
 *   "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than
 *     [4] and no more than [rainbow]."
 *
 * Q: If my spell gets countered, do I still get the Abandoned Hall buff?
 * A: No. A "when you play a spell" trigger fires only when the spell RESOLVES; a countered spell
 *    leaves the chain without resolving, so it was never played and the Hall never triggers.
 * Rules: 419.4.a–a.1 + 425.1.b (play-TRIGGERS fire on resolution, so a countered spell fires none),
 *        425.1.a–c (countered: no effect, straight to trash, no refund), 383 (triggered abilities).
 *        419.4.b is the other half and cuts the other way: NON-triggered "cards played" checks read
 *        Finalization, so the countered spell still counts for Legion / cost reductions.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const DEFY = "ogn-045-298";
const VOID_SEEKER = "ogn-024-298"; // [3]+[fury] Action — "Deal 4 to a unit at a battlefield. Draw 1."

/**
 * P1's turn. P1 holds the Abandoned Hall (live text) with a 3-Might Champion standing there and has
 * a Void Seeker plus [3][fury]. P2 has a Wall at bf2 (something to shoot at) and Defy with [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "hall", { might: 3, name: "Champion" }, "champ")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Void Seeker at the Wall; P2 Defies it; the Defy resolves first (LIFO). */
async function defied(): Promise<Game> {
  const game = await board().build();
  const played0 = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
  expect(played0).toBe(0);
  await game.p1.cast("vs", { targets: "wall" });
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "vs" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "defy"]);
  await game.settle();
  return game;
}

describe("Ruling 2a574e6d83c828f8 — a countered spell was never played: Abandoned Hall does not trigger", () => {
  test("control: unopposed, the Void Seeker resolves and the Hall's 'they may' trigger appears for P1, who buffs the Champion to 4", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "wall" });
    const stop = await game.settle();
    expect(game.state("wall").damage).toBe(4);
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hall" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("champ");
    }
    await game.settle();
    expect(game.state("champ").might).toBe(4);
  });

  test("ruling: the Defied Void Seeker never resolves — no Hall item ever reaches the chain and P1 is never asked", async () => {
    const game = await defied();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("wall").damage).toBe(0); // the countered spell did nothing
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "hall")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("champ")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 2a574e6d83c828f8 reads 425.1.b as erasing the countered spell from
  // "cards played this turn" entirely; CR 419.4.b says 425.1.b scopes ONLY to abilities that
  // TRIGGER on cards being played — "Non-triggered abilities that check cards being played do so by
  // means of referencing whether said cards have been Finalized", with Defy-countered spells named
  // in both of its examples (Legion stays active; Battering Ram still costs the reduced 4). 812.1.c
  // says the same for Legion. Engine follows CR: `cardsPlayedThisTurn` is tallied at Finalization
  // (chain-add), so the countered Void Seeker DOES count, while the Hall's "when a player plays a
  // spell" TRIGGER stays silent (419.4.a.1) — the facet above.
  test("the countered spell was still Finalized, so it counts for non-triggered 'cards played' checks (419.4.b)", async () => {
    const game = await defied();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
  });

  test("contrast: with the Defy held back the very same cast DOES tick the played-a-card tally and fire the Hall", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "wall" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no(); // declining the Hall is fine; the point is that it was offered
    await game.settle();
    expect(game.state("champ").might).toBe(3);
  });
});
