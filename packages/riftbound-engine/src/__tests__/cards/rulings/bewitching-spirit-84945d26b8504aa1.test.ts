/**
 * Ruling 84945d26b8504aa1 — Bewitching Spirit (UNL-121 → unl-121-219) · Unit · Chaos · 3 · 2 Might
 *     "When you play me, choose a player. They discard 1."
 *   × Moonlight Affliction (UNL-066 → unl-066-219) · Spell · Mind · 7 · [Reaction] "Give a unit -10 [Might] this turn."
 *
 * Q: I play Bewitching Spirit and make my opponent discard; they discard Moonlight Affliction — can they still play
 *    it as a Reaction "in response" to being discarded?
 * A: No. The play trigger goes on the chain (there IS a Reaction window while it is pending), but once it resolves the
 *    opponent is simply instructed to discard: discarding is a limited action hand → trash, not a play, and opens no
 *    window. Once in the trash the card can no longer be played.
 * Rules: 383 (triggered ability on the chain), 422.2 (discard), 343/346 (playing a card), 425.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIRIT = "unl-121-219";
const MOONLIGHT = "unl-066-219";

/** P1's turn, 3 energy for the Spirit. P2 holds Moonlight Affliction (+ a Grunt) with a full 7 energy so cost is never the blocker. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 7 })
    .hand(P1, SPIRIT, "spirit")
    .hand(P2, MOONLIGHT, "moon")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" }, "grunt")
    .unit(P2, "base", { might: 3, name: "Dummy" }, "dummy");
}

/** P1 plays the Spirit, names the opponent for the discard; the trigger sits on the chain with P1 holding priority. */
async function spiritPlayedNamingOpponent(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("spirit");
  expect(game.zoneOf("spirit")).toBe("base"); // the unit itself does not use the chain
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
  await game.p1.chooseMode(0); // "Opponent discards 1"
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spirit", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 84945d26b8504aa1 — a card being discarded to Bewitching Spirit cannot be played 'in response' to the discard", () => {
  test("the 'When you play me' trigger is a chain item: while it is pending P2 does get priority and Moonlight Affliction (a Reaction) is playable then", async () => {
    const game = await spiritPlayedNamingOpponent();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "moon")).toBe(true);
  });

  test("once both pass the trigger resolves: P2 is told to discard — the prompt is a discard pick with no play option, Moonlight Affliction goes hand → trash, its effect never happens, and it cannot be played afterwards", async () => {
    const game = await spiritPlayedNamingOpponent();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind).not.toBe("action"); // no priority / no "cast" offered at this point
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["grunt", "moon"]);
      // rule 650 — `concede` is advertised on every Decision; nothing else is offered here.
      expect((d.actions ?? []).filter((a) => a.moveId !== "concede")).toEqual([]);
    }
    await game.p2.pick("moon");
    expect(game.zoneOf("moon")).toBe("trash");
    expect(game.p2.trash()).toContain("moon");
    expect(game.chain()).toEqual([]);
    // Nothing was "played": no -10 Might landed anywhere and P2's energy is untouched.
    expect(game.state("spirit").might).toBe(2);
    expect(game.state("dummy").might).toBe(3);
    expect(game.p2.energy()).toBe(7);
    // Back in P1's open main phase; P2 has no way to cast the trashed card.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "moon")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
