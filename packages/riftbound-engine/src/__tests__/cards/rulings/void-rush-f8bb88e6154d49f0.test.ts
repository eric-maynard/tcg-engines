/**
 * Ruling f8bb88e6154d49f0 — Void Rush (SFD-188 → sfd-188-221) · Spell · 2+[rainbow] · "Reveal the top 2 cards of your Main Deck. You may
 *     banish one, then play it, reducing its cost by [2]. Draw any you didn't banish."
 *   × Trifarian Gloryseeker (OGN-217 → ogn-217-298) · 2 · 2 Might · "[Legion] — When you play me, buff me."
 *
 * Q: Void Rush (my first card this turn) reveals two Gloryseekers; I play one off it. Does its Legion buff apply?
 * A (riftjudge): No — Void Rush "doesn't count" as a previously played Main Deck card, so Legion is unmet.
 *    That answer cites a superseded rule (738.1.c.1). Current CR 812.1.c: Legion is active "as long as a card different than the
 *    one with the Legion ability has been FINALIZED by you on the same turn" (419.4.b likewise) — Void Rush was finalized before the
 *    Gloryseeker is played, so the engine (following the CR) applies the buff. That facet is recorded as a RULING-CONFLICT below;
 *    everything else (reveal 2, banish-and-play at −[2], draw the rest) is asserted as ruled.
 * Rules: 812.1.c, 419.4.b, 419.1–419.3 (play via effect), 130.4 (cost reduction).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const GLORYSEEKER = "ogn-217-298";

/** P1's turn, nothing played yet, exactly 2+[rainbow]. Deck top→: Gloryseeker g1, Gloryseeker g2, filler. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .hand(P1, VOID_RUSH, "vr")
    .deck(P1, [GLORYSEEKER, GLORYSEEKER, "ogn-175-298"], ["g1", "g2", "filler"]);
}

/** Cast Void Rush and let it resolve up to the reveal-and-pick. */
async function rushRevealed(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("vr");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** Pass priority until the chain is empty. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling f8bb88e6154d49f0 — Void Rush into Trifarian Gloryseeker", () => {
  test("Void Rush reveals the top 2 (both Gloryseekers) and offers P1 an OPTIONAL banish-and-play pick of exactly those two", async () => {
    const game = await rushRevealed();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1, semantics: "from-revealed", source: { cardId: "vr" } });
    expect(d.options.map((o) => o.card).sort()).toEqual(["g1", "g2"]);
    expect(d.meta).toMatchObject({ onPicked: "play", onRest: "draw" });
  });

  test("picking g1: it is played to P1's base for [2] − [2] = nothing (pool already empty), the un-banished g2 is DRAWN, filler stays on top", async () => {
    const game = await rushRevealed();
    await game.p1.pick("g1");
    await drain(game);
    await game.settle();
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.zoneOf("g1")).toBe("base");
    expect(game.state("g1")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.p1.hand()).toEqual(["g2"]);
    expect(game.p1.deck()[0]).toBe("filler");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge f8bb88e6154d49f0 says the Gloryseeker played off Void Rush does NOT get its Legion buff (Void Rush
  // "isn't a previously played Main Deck card", citing old 738.1.c.1); CR 812.1.c / 419.4.b say Legion is active once ANOTHER card
  // has been FINALIZED by you this turn — Void Rush was finalized (P1's played-count is already 1) before g1 is played, so the
  // "When you play me, buff me" is live — engine follows CR.
  test("Legion facet (CR 812.1.c): Void Rush was already finalized this turn, so g1's 'When you play me, buff me' goes on the chain and g1 ends BUFFED at 3 Might", async () => {
    const game = await rushRevealed();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // Void Rush, finalized
    await game.p1.pick("g1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "g1", controller: P1, triggered: true })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    await drain(game);
    await game.settle();
    expect(game.state("g1")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("control — Legion genuinely needs ANOTHER finalized card: a Gloryseeker played from hand as P1's FIRST card of the turn gets no buff; as the SECOND card it does", async () => {
    const first = await scenario().resources(P1, { energy: 4 }).hand(P1, GLORYSEEKER, "gA").hand(P1, GLORYSEEKER, "gB").build();
    await first.p1.play("gA");
    await first.settle();
    expect(first.state("gA")).toMatchObject({ isBuffed: false, might: 2, zone: "base" });
    await first.p1.play("gB");
    await first.settle();
    expect(first.state("gB")).toMatchObject({ isBuffed: true, might: 3, zone: "base" });
  });

  test("declining the banish: nothing is played, BOTH revealed Gloryseekers are drawn, played-count stays 1 (just Void Rush)", async () => {
    const game = await rushRevealed();
    await game.p1.decline();
    await game.settle();
    expect(new Set(game.p1.hand())).toEqual(new Set(["g1", "g2"]));
    expect(game.p1.base()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
