/**
 * Ruling 38d38b626b47aaae — (general [Hidden] rules)
 *   Stand-ins: Sprite Call (ogn-094-298) · [Hidden] [Action] [3] "Play a ready 3 [Might] Sprite unit token
 *   with [Temporary]." · Test Rally (inline [Action] spell) to open a chain on the opponent's turn.
 *
 * Q: Can you reveal hidden cards, and can you play hidden cards, on your turn?
 * A: Revealing is a Limited Action — you never perform it voluntarily, only when an effect says so
 *    (showing a private card to your opponent is not the game action "Reveal"). Hiding on your turn is
 *    fine. Playing what you hid is NOT: you may play a hidden card only from the turn AFTER you hid it,
 *    and when you do it is played with [Reaction] timing, for [0].
 * Rules: 424.2 (Reveal is a Limited Action), 128.4 (you may look at your own private cards),
 *        811.1 (Hidden: not the turn it was hidden; played with Reaction for [0]), 811.6.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

/** [Action] "Give a unit +2 [Might] this turn." — something for P2 to open a chain with. */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, SPRITE_CALL, "call")
    .hand(P2, RALLY, "rally");
}

/** P1 hides Sprite Call at their own battlefield on their own turn. */
async function hidden(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("call", "bf1");
  return game;
}

describe("Ruling 38d38b626b47aaae — hiding, revealing and playing hidden cards", () => {
  test("hiding on your turn is legal: it costs [rainbow] and the card goes facedown at your battlefield", async () => {
    const game = await hidden();
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.state("call").isHidden).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.hand()).not.toContain("call");
  });

  test("you cannot play it the same turn you hid it — there is no legal action on the card at all", async () => {
    const game = await hidden();
    expect(game.p1.can("reveal", "call")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("call"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    // ...and no voluntary "show it to your opponent" game action exists either (424.2)
    expect(game.p1.legal().some((o) => o.card === "call")).toBe(false);
  });

  test("from the NEXT turn on it is playable — and with [Reaction] timing, so it goes off inside the opponent's chain for [0]", async () => {
    const game = await hidden();
    await game.advanceTurn(); // now it is P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    await game.p2.cast("rally", { targets: "sentry" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.reveal("call");
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally", "call"]);
    expect(game.p1.energy()).toBe(0); // played for [0]
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    const sprite = game.p1.units("bf1").find((id) => id !== "warden");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("on your own later turn it is playable too — the restriction is only 'not the turn you hid it'", async () => {
    const game = await hidden();
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("reveal", "call")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
