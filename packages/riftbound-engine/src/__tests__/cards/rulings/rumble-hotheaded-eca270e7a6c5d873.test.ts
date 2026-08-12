/**
 * Ruling eca270e7a6c5d873 — Rumble, Hotheaded (SFD-026 → sfd-026-221) · Champion Unit · Fury · [4] · 4 Might
 *     "Your Mechs each have [Assault]. · When I conquer, you may recycle another friendly unit to play a Mech
 *      from your trash. Reduce its Energy cost by the Might of the unit you recycled."
 *   × Bubble Bot (SFD-062 → sfd-062-221) · Mech · [3] · 3 Might · "When you play me, ready another friendly Mech."
 *
 * Q: When I pay Rumble's conquer cost, do I recycle a friendly unit already in play, or one from my hand?
 * A: From the board. "Unit" with no zone named means a unit on the board (a battlefield or your base); cards in
 *    hand are not units and cannot pay this cost.
 * Rules: 105 / 200 ("unit" = a card on the board; hand cards are just cards), 402.2 / 404.1 (a trigger's object
 *        cost is named at finalization from the legal objects), 356.4 (the cost reduction reads the paid object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE_HOTHEADED = "sfd-026-221";
const BUBBLE_BOT = "sfd-062-221";

/**
 * P1's turn with [5]. bf1 is open; Rumble is ready in base with two other friendly units on the board
 * (a 2-Might Grunt in base and a 1-Might Scout at bf2) and one unit sitting in HAND. Bubble Bot is in the trash.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", RUMBLE_HOTHEADED, "rumble")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .unit(P1, "bf2", { might: 1, name: "Scout" }, "scout")
    .hand(P1, { cardType: "unit", energyCost: 2, might: 9, name: "In Hand" }, "inhand")
    .trash(P1, BUBBLE_BOT, "bot");
}

/** Rumble walks onto the empty bf1 and conquers it; stop at his optional trigger's opt-in. */
async function conquerBf1(game: Game): Promise<void> {
  await game.p1.move("rumble", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/** Resolve the trigger: it reveals the trash Mech to play, then asks where it lands. */
async function playBotToBase(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
      continue;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      const bot = d.options.find((o) => (o.card ?? o.key) === "bot");
      await game.p1.pick(bot ? "bot" : "base");
      continue;
    }
    break;
  }
}

describe("Ruling eca270e7a6c5d873 — Rumble's conquer cost recycles a unit from the BOARD, never from hand", () => {
  test("conquering offers the optional ability to P1", async () => {
    const game = await board().build();
    await conquerBf1(game);
    expect(game.p1.points()).toBe(1);
  });

  test("ruling: the recycle cost may only name units on the board — the card in hand is not among the options", async () => {
    const game = await board().build();
    await conquerBf1(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(new Set(offered)).toEqual(new Set(["grunt", "scout"])); // base AND battlefield units …
    expect(offered).not.toContain("inhand"); // … but nothing from hand
    expect(offered).not.toContain("rumble"); // "another" friendly unit
  });

  test("paying with the Grunt recycles it out of play into the Main Deck and plays Bubble Bot from the trash for [3] − 2", async () => {
    const game = await board().build();
    await conquerBf1(game);
    await game.p1.yes();
    await game.p1.pick("grunt");
    expect(game.zoneOf("grunt")).toBe("mainDeck"); // recycled from the BOARD
    expect(game.zoneOf("inhand")).toBe("hand"); // the hand card was never touched
    await playBotToBase(game);
    expect(game.p1.units()).toContain("bot");
    expect(game.p1.energy()).toBe(4); // 5 − (3 − the recycled Grunt's 2 Might)
    expect(game.violations()).toEqual([]);
  });

  test("paying with the 1-Might Scout instead gives a smaller discount — Bubble Bot costs [2]", async () => {
    const game = await board().build();
    await conquerBf1(game);
    await game.p1.yes();
    await game.p1.pick("scout");
    expect(game.zoneOf("scout")).toBe("mainDeck");
    await playBotToBase(game);
    expect(game.p1.units()).toContain("bot");
    expect(game.p1.energy()).toBe(3); // 5 − (3 − 1)
    expect(game.violations()).toEqual([]);
  });

  test("with no other unit on the board the cost cannot be paid at all — the trigger is never offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
      .unit(P1, "base", RUMBLE_HOTHEADED, "rumble")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 9, name: "In Hand" }, "inhand")
      .trash(P1, BUBBLE_BOT, "bot")
      .build();
    await game.p1.move("rumble", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("bot")).toBe("trash"); // the hand card could not have paid for it
    expect(game.zoneOf("inhand")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
