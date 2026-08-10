/**
 * Ruling 099986d2c26a2753 — Carnivorous Snapvine (OGN-149 → ogn-149-298) · Unit · Body · 5 + [B][B] · 6 Might
 *   "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *   (Riptide Rex ogn-092-298 is cited as "similar"; the scenario uses Snapvine.)
 *   × En Garde (ogn-046-298) [Reaction] · 1 "Give a friendly unit +1 [Might] this turn, then an additional +1
 *     [Might] this turn if it is the only unit you control there."
 *
 * Q: Enemy plays Snapvine to their base targeting my unit at a battlefield I control — can I react?
 * A: Yes, to the on-play ABILITY (not to the unit being played). The unit enters the board first; its play
 *    effect then goes on the chain like a spell, with targets chosen; before it resolves other players may
 *    play Reaction-speed spells only.
 * Rules: 383 (play triggers become chain items), 331–333 (Closed state: Reactions only), 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CARNIVOROUS_SNAPVINE = "ogn-149-298";
const EN_GARDE = "ogn-046-298";
const STACKED_DECK = "ogn-183-298"; // an [Action] spell — must NOT be playable in response

/** P2's turn. P1 holds bf1 with a lone 4-Might Guard and has En Garde (1) + Stacked Deck (1) in hand with 2 energy. P2 has Snapvine funded. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { body: 2 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P2, CARNIVOROUS_SNAPVINE, "vine")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P1, STACKED_DECK, "sd");
}

/** P2 plays Snapvine to base; its play trigger (Guard is the only legal choice) is on the chain and P2 has passed priority to P1. */
async function snapvinePlayed(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("vine");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("guard");
  }
  // The unit is already ON THE BOARD (never a chain item); only its play effect is pending, targeting Guard.
  expect(game.zoneOf("vine")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vine", controller: P2, targets: ["guard"], triggered: true })]);
  expect(game.state("guard").damage).toBe(0); // nothing has resolved yet
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 099986d2c26a2753 — you can React to Snapvine's on-play ability before it resolves", () => {
  test("P1 gets a priority window on the pending play effect: the [Reaction] En Garde is legal, the [Action] Stacked Deck is not", async () => {
    const game = await snapvinePlayed();
    expect(game.p1.can("cast", "engarde")).toBe(true);
    expect(game.p1.can("cast", "sd")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sd"));
    expect(r.ok).toBe(false);
  });

  test("P1 casts En Garde on the lone Guard in response: it resolves first (LIFO) → Guard is 6; then Snapvine's effect resolves — 6 each way, BOTH die", async () => {
    const game = await snapvinePlayed();
    await game.p1.cast("engarde", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vine", "engarde"]);
    expect(game.p1.energy()).toBe(1);
    // Resolve En Garde only.
    while (game.chain().length > 1 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("guard").might).toBe(6); // +1, +1 more for being alone there
    expect(game.chain().map((c) => c.cardId)).toEqual(["vine"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // took 6 ≥ 6
    expect(game.zoneOf("vine")).toBe("trash"); // took 6 ≥ 6 — only because the Reaction landed first
    expect(game.violations()).toEqual([]);
  });

  test("control without a response: Guard (4) takes 6 and dies, Snapvine takes 4 and survives in P2's base", async () => {
    const game = await snapvinePlayed();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.state("vine").damage).toBe(4);
  });

  test("there is no window to respond to the unit itself: at no point is Snapvine a chain item — the first decision after the play already has it in base", async () => {
    const game = await board().build();
    await game.p2.play("vine");
    expect(game.zoneOf("vine")).toBe("base");
    expect(game.chain().every((c) => c.triggered)).toBe(true); // only the triggered ability, never a 'unit spell'
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });
});
