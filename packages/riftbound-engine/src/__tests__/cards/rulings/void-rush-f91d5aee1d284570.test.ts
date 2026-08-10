/**
 * Ruling f91d5aee1d284570 — Void Rush (SFD-188 → sfd-188-221) · Spell · Fury/Order · 2+[rainbow]
 *   "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you
 *    didn't banish."
 *   × Vanguard Captain (OGN-218 → ogn-218-298) · 3+[order] · 3 Might "[Legion] — When you play me, play two 1 [Might]
 *     Recruit unit tokens here."   (Portal Rescue OGN-102 is only cited as precedent.)
 *
 * Q: Void Rush is my FIRST card this turn; one of the two revealed cards is Vanguard Captain and I play it. Legion?
 * A: Yes. Void Rush was played (it is resolving) before the Captain, so the Captain is the second card played this turn
 *    and its Legion "when you play me" makes the two Recruit tokens.
 * Rules: 724 (Legion: another main-deck card played earlier this turn), 419 / 354.3 (plays instructed by a resolving spell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const VANGUARD_CAPTAIN = "ogn-218-298";
const SKULKER = "ogn-175-298";

/** P1's turn, nothing played yet. P1: Void Rush + [2][rainbow] + [1][order] for the discounted Captain. Deck: Captain, Skulker. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 1, rainbow: 1 } })
    .hand(P1, VOID_RUSH, "vr")
    .deck(P1, [VANGUARD_CAPTAIN, SKULKER], ["captain", "sk"]);
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");

/** Cast Void Rush as the first card, resolve it, banish-and-play the Captain; answer its play prompts (destination etc.). */
async function rushIntoCaptain(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("vr");
  expect(game.p1.energy()).toBe(1);
  expect(game.p1.power()).toBe(1);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Void Rush resolves → reveal 2
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toContain("captain");
  await game.p1.pick("captain");
  for (let i = 0; i < 6; i++) {
    const x = game.decision();
    if (x?.kind === "pick" && x.seat === P1) {
      const keys = x.options.map((o) => o.key);
      await game.p1.pick(keys.includes("base") ? "base" : (keys[0] as string));
    } else if (x?.kind === "yes-no" && x.seat === P1) {
      await game.p1.no();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling f91d5aee1d284570 — a Vanguard Captain played off a first-card Void Rush gets Legion", () => {
  test("Void Rush (card #1) reveals Captain + Skulker; banishing-and-playing the Captain costs [3−2]=[1]+[order]; it is card #2 this turn and the Skulker is drawn", async () => {
    const game = await rushIntoCaptain();
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2); // Void Rush, then the Captain
    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.zoneOf("vr")).toBe("trash");
  });

  test("Legion is satisfied (Void Rush was played before it): the Captain's 'when you play me' plays two 1-Might Recruit tokens at its location", async () => {
    const game = await rushIntoCaptain();
    await game.settle();
    const toks = recruits(game);
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ isToken: true, might: 1, zone: "base" });
    }
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same Captain played from hand as the FIRST card of the turn gets no Legion: no Recruits", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, VANGUARD_CAPTAIN, "captain").build();
    await game.p1.play("captain");
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(recruits(game)).toEqual([]);
  });
});
