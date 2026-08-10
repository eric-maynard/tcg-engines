/**
 * Ruling b6ee20c994963b0c — Rumble, Hotheaded (SFD-026 → sfd-026-221) · Champion Unit · Fury · 4 · 4 Might · Mech
 *   "Your Mechs each have [Assault]. When I conquer, you may recycle another friendly unit to play a Mech from your
 *    trash. Reduce its Energy cost by the Might of the unit you recycled."
 *   × Ferrous Forerunner (SFD-021 → sfd-021-221) · Unit · 6 · 6 Might
 *   × Karma, Channeler (OGN-235 → ogn-235-298) · "When you recycle one or more cards to your Main Deck, buff a friendly
 *     unit. (… Runes aren't cards.)"
 *
 * Q: When Rumble's conquer trigger recycles a Ferrous Forerunner (a CARD unit) off the board, does Karma trigger?
 * A: Yes — a card was recycled to the main deck. If instead Rumble recycles a Mech TOKEN (legal as the cost), Karma
 *    does not trigger: tokens are not cards.
 * Rules: 186 (tokens are not cards), 409 (recycle), 383 (trigger conditions), 356 (costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const FERROUS_FORERUNNER = "sfd-021-221";
const KARMA = "ogn-235-298";
const BUBBLE_BOT = "sfd-062-221"; // 3-cost 3-Might Mech: "When you play me, ready another friendly Mech."
const MECH_TOKEN = { cardType: "unit", isToken: true, might: 3, name: "Mech", tags: ["Mech"] } as const;

/**
 * P1's turn, 3 energy. P2 holds bf1 with Weak (2). P1's base: Rumble (4), Ferrous Forerunner (6, a card), a 3-Might Mech
 * token, Karma. Bubble Bot (Mech) in P1's trash.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Weak" }, "weak")
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, "base", FERROUS_FORERUNNER, "fore")
    .unit(P1, "base", MECH_TOKEN, "tok")
    .unit(P1, "base", KARMA, "karma")
    .trash(P1, BUBBLE_BOT, "bot");
}

/** Rumble attacks bf1 alone (4 + Assault vs 2), conquers; accept his optional trigger and stop at the recycle-cost pick. */
async function rumbleConquers(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("rumble", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rumble" } });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "rumble" } });
  // "another friendly unit": the Forerunner (card), the Mech token and Karma are all legal to recycle — not Rumble.
  expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["fore", "karma", "tok"]);
  return game;
}

/** Drive the rest of Rumble's trigger (play Bubble Bot from trash to base; its own ready-trigger takes any target). Returns whether Karma ever asked for a buff target. */
async function finishTrigger(game: Game, karmaBuffs?: string): Promise<boolean> {
  let karmaAsked = false;
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "karma") {
      karmaAsked = true;
      await game.p1.pick(karmaBuffs ?? (d.options[0]?.card as string));
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
      expect(d.options.map((o) => o.card)).toEqual(["bot"]); // "a Mech from your trash"
      await game.p1.pick("bot");
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.card ?? (d.options[0]?.key as string));
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else {
      break;
    }
  }
  return karmaAsked;
}

describe("Ruling b6ee20c994963b0c — Rumble recycling a card unit triggers Karma; recycling a token does not", () => {
  test("recycle Ferrous Forerunner (a card): it goes to the main deck, KARMA TRIGGERS (P1 picks a friendly unit to buff — Rumble), and Bubble Bot is played from trash for 3 − 6 → 0 energy", async () => {
    const game = await rumbleConquers();
    await game.p1.pick("fore");
    expect(game.zoneOf("fore")).toBe("mainDeck");
    const karmaAsked = await finishTrigger(game, "rumble");
    expect(karmaAsked).toBe(true);
    expect(game.state("rumble").isBuffed).toBe(true);
    expect(game.zoneOf("bot")).toBe("base");
    expect(game.p1.energy()).toBe(3); // cost fully reduced by the Forerunner's 6 Might
    expect(game.zoneOf("tok")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("recycle the Mech TOKEN instead (legal as the cost): the token ceases to exist, Karma does NOT trigger (nobody gets buffed), and Bubble Bot is still played for 3 − 3 → 0 energy", async () => {
    const game = await rumbleConquers();
    await game.p1.pick("tok");
    expect(game.zoneOf("tok")).toBe("gone"); // a token that leaves the board ceases to exist — not a card in the deck
    const karmaAsked = await finishTrigger(game);
    expect(karmaAsked).toBe(false);
    expect(game.state("rumble").isBuffed).toBe(false);
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.state("fore").isBuffed).toBe(false);
    expect(game.zoneOf("bot")).toBe("base");
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("fore")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
