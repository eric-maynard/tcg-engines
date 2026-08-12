/**
 * Ruling 43c664db4c9f46d4 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · [2][body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · 5 Might
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Play Darius, then Challenge with Darius — is he 5 or 7 Might during the Challenge?
 * A: 5. A card counts as "played" only once it has fully resolved, so Challenge (the second card) resolves with
 *    Darius still at 5; only afterwards does his "When…" trigger go on the chain and resolve, making him 7 and
 *    readying him. "When" triggers use the chain; "While" effects would apply continuously.
 * Rules: 419.4.a (a card is played when its play finishes resolving), 383 (triggered abilities go on the chain),
 *        340 (chain resolution), 417.6.b.3 (fight damage uses current Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DARIUS = "ogn-027-298";

/** P1's turn, nothing played yet. Darius in hand ([5][fury]), Challenge in hand ([2][body]); P2 has an Ogre in base. */
function board(ogreMight: number) {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, fury: 1 } })
    .unit(P2, "base", { might: ogreMight, name: "Ogre" }, "ogre")
    .hand(P1, DARIUS, "darius")
    .hand(P1, CHALLENGE, "challenge");
}

/** Darius is card #1; Challenge (card #2) is cast naming [Darius, Ogre] and is left on the chain. */
async function challengeOnChain(ogreMight: number): Promise<Game> {
  const game = await board(ogreMight).build();
  await game.p1.play("darius", { to: "base" });
  await game.settle();
  expect(game.state("darius")).toMatchObject({ might: 5, zone: "base" });
  await game.p1.cast("challenge", { targets: ["darius", "ogre"] });
  return game;
}

describe("Ruling 43c664db4c9f46d4 — Darius fights at 5; his second-card trigger only resolves after Challenge does", () => {
  test("ruling: while Challenge is on the chain Darius is still 5 — his trigger is NOT on the chain yet", async () => {
    const game = await challengeOnChain(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.state("darius").might).toBe(5);
  });

  test("ruling: Challenge resolves at 5 Might — a 6-Might Ogre takes exactly 5 and SURVIVES (7 would have killed it)", async () => {
    const game = await challengeOnChain(6);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("ogre")).toMatchObject({ damage: 5, might: 6 });
    expect(game.zoneOf("ogre")).toBe("base");
    expect(game.zoneOf("darius")).toBe("trash"); // 6 damage on a 5-Might Darius
    expect(game.violations()).toEqual([]);
  });

  test("ruling: only AFTER Challenge has resolved does Darius count as the second card played — the trigger fires then", async () => {
    const game = await challengeOnChain(3);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("ogre")).toBe("trash"); // 5 ≥ 3
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    expect(game.state("darius")).toMatchObject({ damage: 3, might: 5 }); // the +2 has not applied yet
  });

  test("… and once that trigger resolves he is 7 and ready", async () => {
    const game = await challengeOnChain(3);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ damage: 3, isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
