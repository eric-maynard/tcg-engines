/**
 * Card Sharp — sfd-081-221 · Unit · Mind · 3 energy · 3 Might
 *
 *   When you play me, you and each opponent may play a Gold gear token exhausted. For each
 *   opponent who did, you play a Gold gear token exhausted.
 *
 * Rules: 383.4.b (play effect = triggered ability on the chain), 187.5 (a Gold token is a
 * domainless gear token with "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]"), 185 (tokens
 * follow the rules of their type), 186.1 (a token put into a non-board zone ceases to exist),
 * 813 (Reaction abilities may be activated during Closed states on any player's turn), 115 ("each opponent" — every other
 * player in a 3–4 player game).
 *
 * Head-judge corner cases considered:
 *   1. Three independent "may"s: you may decline your own token; each opponent decides for
 *      themselves; your bonus tokens count only opponents who ACCEPTED (0, 1 or 2 in 3p).
 *   2. Every token enters EXHAUSTED — nobody can cash Gold the turn Card Sharp is played.
 *   3. The Gold ability is a Reaction with "Kill this" as a cost: usable on the opponent's turn
 *      while a chain is open, and the token is gone afterwards (not in any trash).
 *   4. Engine status: the parsed ability is a bare create-token for the controller — no opt-in,
 *      no opponent offer, no bonus tokens (BUG tests below keep the printed contract).
 *   5. Cost sanity: 3 energy flat, no power.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, P3, scenario } from "../../harness";

const CARD = "sfd-081-221";
const FRIGID_TOUCH = "sfd-066-221"; // cheap Reaction spell, used only to open a chain

const goldOf = (game: Game, seat: string) =>
  game.seat(seat).base().filter((id) => game.state(id).name === "Gold");

/** Play Card Sharp and answer every yes/no that appears (any seat) with `accept(seat)`. Returns who was asked. */
async function playSharp(game: Game, accept: (seat: string) => boolean = () => true): Promise<string[]> {
  const asked: string[] = [];
  await game.p1.play("sharp");
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "yes-no") {
      break;
    }
    asked.push(d.seat);
    await (accept(d.seat) ? game.seat(d.seat).yes() : game.seat(d.seat).no());
  }
  return asked;
}

function board() {
  return scenario().resources(P1, { energy: 3 }).unit(P2, "base", { might: 2, name: "Bystander" }, "foe").hand(P1, CARD, "sharp");
}

describe("Card Sharp (sfd-081-221)", () => {
  test("parsed abilities: a play-self trigger that plays an EXHAUSTED Gold gear token", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 3 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test.failing("BUG: parsed ability should carry the printed 'you MAY' and the per-opponent offer, not a bare create-token", async () => {
    // Expected: the registry payload marks the controller's token optional and models "each opponent may …
    // for each opponent who did". Actual: a single unconditional create-token for the controller.
    const ability = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as Record<string, unknown> | undefined;
    expect(ability).toMatchObject({ optional: true });
    expect(JSON.stringify(ability)).toMatch(/opponent/i);
  });

  test("cost: 3 energy for a 3-Might unit that enters exhausted; 2 energy is not enough", async () => {
    const game = await board().resources(P1, { energy: 4 }).build();
    await game.p1.play("sharp");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.zoneOf("sharp")).toBe("base");
    expect(game.state("sharp")).toMatchObject({ isExhausted: true, might: 3 });
    const poor = await board().resources(P1, { energy: 2 }).build();
    expect(poor.p1.can("play", "sharp")).toBe(false);
  });

  test("the play effect is a triggered chain item; nothing is created before it resolves", async () => {
    const game = await board().build();
    await game.p1.play("sharp");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sharp", controller: P1, triggered: true, type: "ability" })]);
    expect(goldOf(game, P1)).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // the opponent may respond first
  });

  test("you accept, the opponent does not: you end with exactly one Gold — a domainless gear TOKEN, in base, exhausted", async () => {
    const game = await board().build();
    await playSharp(game, (seat) => seat === P1);
    const mine = goldOf(game, P1);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0] as string)).toMatchObject({
      cardType: "gear",
      controller: P1,
      domains: [],
      isExhausted: true,
      isToken: true,
      name: "Gold",
      owner: P1,
      zone: "base",
    });
    expect(goldOf(game, P2)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: 'you MAY' — the controller is asked and can decline, ending with no Gold at all", async () => {
    // Expected: a yes/no for P1; answering no creates nothing. Actual: no prompt, the token is always made.
    const game = await board().build();
    const asked = await playSharp(game, () => false);
    expect(asked).toContain(P1);
    expect(goldOf(game, P1)).toEqual([]);
    expect(goldOf(game, P2)).toEqual([]);
  });

  test.failing("BUG: 'each opponent may' — the opponent gets their own yes/no; accepting gives THEM an exhausted Gold", async () => {
    // Expected: P2 is prompted; on yes P2 controls one exhausted Gold token. Actual: P2 is never asked.
    const game = await board().build();
    const asked = await playSharp(game, () => true);
    expect(asked).toContain(P2);
    const theirs = goldOf(game, P2);
    expect(theirs).toHaveLength(1);
    expect(game.state(theirs[0] as string)).toMatchObject({ controller: P2, isExhausted: true, isToken: true });
  });

  test.failing("BUG: 'for each opponent who did' — when the opponent accepts you play a second exhausted Gold (2 for you, 1 for them)", async () => {
    const game = await board().build();
    await playSharp(game, () => true);
    expect(goldOf(game, P2)).toHaveLength(1);
    const mine = goldOf(game, P1);
    expect(mine).toHaveLength(2);
    expect(mine.every((id) => game.state(id).isExhausted)).toBe(true);
  });

  test.failing("BUG: three players — both opponents accept → you finish with 3 Gold, each of them with 1", async () => {
    const game = await scenario({ players: 3 }).resources(P1, { energy: 3 }).hand(P1, CARD, "sharp").build();
    const asked = await playSharp(game, () => true);
    expect(new Set(asked)).toEqual(new Set([P1, P2, P3]));
    expect(goldOf(game, P2)).toHaveLength(1);
    expect(goldOf(game, P3)).toHaveLength(1);
    expect(goldOf(game, P1)).toHaveLength(3);
  });

  test("the Gold enters exhausted, so its 'Kill this, [Exhaust]: Add [rainbow]' cannot be used the turn Card Sharp is played", async () => {
    const game = await board().build();
    await playSharp(game);
    const [gold] = goldOf(game, P1);
    expect(game.state(gold as string).isExhausted).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(false);
    expect(game.p1.power()).toBe(0);
  });

  test("on your next turn the readied Gold cashes in: the token ceases to exist and you gain 1 power (rainbow)", async () => {
    const game = await board().build();
    await playSharp(game);
    const [gold] = goldOf(game, P1) as [string];
    await game.advanceTurn(); // → P2
    expect(game.state(gold).isExhausted).toBe(true); // only YOUR awaken readies your permanents
    await game.advanceTurn(); // → P1, awakened
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.has(gold) ? game.zoneOf(gold) : "gone").not.toBe("base");
    expect(goldOf(game, P1)).toEqual([]);
  });

  test.failing("BUG: a cashed-in Gold token must cease to exist (186.1) — it lingers in the trash instead", async () => {
    // Expected: after "Kill this" the token is in no zone at all. Actual: Card Sharp's Gold sits in P1's trash
    // as a card named "Gold" (a sandbox `addToken` Gold does vanish — the two paths disagree).
    const game = await board().build();
    await playSharp(game);
    const [gold] = goldOf(game, P1) as [string];
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.trash().some((id) => game.state(id).name === "Gold")).toBe(false);
    expect(game.has(gold)).toBe(false);
  });

  test("[Reaction] on the Gold: with it ready, you may cash it on the OPPONENT's turn while their spell is on the chain — but not in their Open state", async () => {
    const game = await board().resources(P2, { energy: 0 }).hand(P2, FRIGID_TOUCH, "ft").build();
    await playSharp(game);
    const [gold] = goldOf(game, P1) as [string];
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 (gold readies)
    await game.advanceTurn(); // P2's turn, gold still ready
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(false); // opponent's Open state: no Reaction window
    await game.p2.do("addResources", { energy: 2, playerId: P2 });
    await game.p2.cast("ft", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", gold)).toBe(true);
    await game.p1.activate(gold);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(goldOf(game, P1)).toEqual([]);
    await game.settle();
    expect(game.state("foe").might).toBe(0); // their spell still resolved normally afterwards
  });
});
