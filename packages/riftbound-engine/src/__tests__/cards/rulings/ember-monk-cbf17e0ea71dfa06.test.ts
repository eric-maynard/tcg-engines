/**
 * Ruling cbf17e0ea71dfa06 — Ember Monk (OGN-167 → ogn-167-298) · Unit · [4] · 4 Might
 *   "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] — "Counter a spell that costs no more than [4] and no more than [R]."
 *   (Hidden spell used: Hidden Blade ogn-213-298 · [Hidden] · Action · [2][order] — "Kill a unit at a battlefield. Its
 *    controller draws 2.")
 *
 * Q: Player A plays a hidden spell during a showdown and Player B counters it with Defy — does Ember Monk get +2?
 * A: No. The hidden spell must RESOLVE to count as played; a countered spell never happened and is not "played".
 * Rules: 412 (Counter), "play" completes on resolution for spells; Hidden (reveal-and-play for [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMBER_MONK = "ogn-167-298";
const HIDDEN_BLADE = "ogn-213-298";
const DEFY = "ogn-045-298";

/**
 * P2's turn 3. P1 (Player A) controls bf1 with Ember Monk (4) and a Hidden Blade facedown there (hidden on an earlier
 * turn). P2 (Player B) attacks with a Raider (2) and holds Defy with exactly [1][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P2, DEFY, "defy");
}

/** Raider attacks bf1 (combat showdown); P2 passes Focus; P1 plays the Hidden Blade from facedown at the Raider; P1 passes. */
async function bladeFromHidden(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("raider");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["raider"] })]);
  expect(game.state("monk").might).toBe(4); // nothing yet — merely putting the hidden spell on the chain is not "played"
  expect(game.chain().some((c) => c.cardId === "monk")).toBe(false);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling cbf17e0ea71dfa06 — a Defied hidden spell was never 'played', so Ember Monk gets no +2", () => {
  test("P2 Defies the Hidden Blade (cost [2] ≤ [4], one power ≤ [R]): it is countered to the trash, the Raider lives, and Ember Monk stays 4 — no trigger ever hits the chain", async () => {
    const game = await bladeFromHidden();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "blade" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "defy"]);
    let monkTriggered = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      monkTriggered ||= game.chain().some((c) => c.cardId === "monk" && c.triggered);
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(monkTriggered).toBe(false);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("monk")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("contrast — P2 does not Defy: Hidden Blade resolves (Raider killed, P2 draws 2), THEN Ember Monk's trigger goes on the chain and resolves for +2 (4 → 6)", async () => {
    const game = await bladeFromHidden();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority(); // Hidden Blade resolves
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("monk").might).toBe(6);
  });
});
