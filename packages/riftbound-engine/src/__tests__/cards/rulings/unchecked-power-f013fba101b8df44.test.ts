/**
 * Ruling f013fba101b8df44 — Unchecked Power (OGN-123 → ogn-123-298) · Spell · Mind · 7 + [mind][mind]
 *     "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Immortal Phoenix (ogn-037-298) · 3 Might · "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Hand of Noxus (OGN-253 → ogn-253-298, the Darius legend) "[Exhaust]: [Reaction], [Legion] — [Add] [1]."
 *   (Viktor, Leader OGN-246 is cited only for the "trigger sees the unit already in its new zone" analogy.)
 *
 * Q: Opponent casts Unchecked Power. I have Hidden Blade facedown at the battlefield with my Phoenix. Can I Hidden-Blade my own
 *    Phoenix, then use the Darius legend (Legion) to pay and bring Phoenix back from trash to base before Unchecked Power resolves?
 * A: Yes. Hidden Blade kills Phoenix; by the time its "when you kill a unit with a spell" trigger happens Phoenix is already IN
 *    the trash, so paying [1][fury] plays it from there to base — all on top of the still-waiting Unchecked Power, which then
 *    finds Phoenix in base (not at a battlefield).
 * Rules: 811 (hidden → Reaction), 383/387 ("when" triggers look at the state after the event), 331 (LIFO), Legion (a card was
 *        played this turn — the flipped Hidden Blade counts), [Add] Reaction abilities.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const HIDDEN_BLADE = "ogn-213-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const HAND_OF_NOXUS = "ogn-253-298";

/**
 * Turn 3, P2 active with exactly 7 + [mind][mind]. P1 (Hand of Noxus legend, 0 energy + 1 fury) holds bf1 with Immortal Phoenix
 * (3) and Buddy (2) and hid Hidden Blade there earlier. P2 holds bf2 with Foe (4) and casts Unchecked Power.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 2 } })
    .resources(P1, { energy: 0, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .legend(P1, HAND_OF_NOXUS, "darius")
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 4, name: "Foe" }, "foe")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, UNCHECKED_POWER, "up");
}

/** UP cast; P1 flips Hidden Blade on its own Phoenix and taps Hand of Noxus for [1]; both pass → Hidden Blade resolves. */
async function bladeOwnPhoenix(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("up");
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  // Before any card is played this turn, Legion is off: the legend's [Add] is not offered.
  expect(game.p1.can("activate", "darius")).toBe(false);
  expect(game.p1.can("reveal", "blade")).toBe(true);
  await game.p1.reveal("blade");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["buddy", "phoenix"]); // own units are legal
  await game.p1.pick("phoenix");
  expect(game.chain().map((c) => c.cardId)).toEqual(["up", "blade"]);
  // Legion is now met (Hidden Blade was played this turn) → [Reaction] [Add] [1] is usable on the opponent's turn, mid-chain.
  expect(game.p1.can("activate", "darius")).toBe(true);
  await game.p1.activate("darius");
  expect(game.state("darius").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["up", "blade"]); // [Add] abilities don't use the chain
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // Hidden Blade resolves
  return game;
}

describe("Ruling f013fba101b8df44 — Hidden Blade your own Phoenix under Unchecked Power, pay with Legion, replay it to base in time", () => {
  test("Hidden Blade resolves first: Phoenix is killed (in P1's TRASH), P1 draws 2, and Phoenix's own 'when you kill a unit with a spell' trigger asks to pay [1][fury] — payable thanks to the Legion [Add]; Unchecked Power still waits underneath", async () => {
    const game = await bladeOwnPhoenix();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // "Its controller draws 2"
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "phoenix" }, timing: "FIN" });
    expect(game.chain()[0]).toMatchObject({ cardId: "up", controller: P2 });
  });

  test("P1 pays: [1][fury] spent, the trigger resolves and PLAYS Phoenix from the trash — P1 chooses base — while Unchecked Power is STILL on the chain", async () => {
    const game = await bladeOwnPhoenix();
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["up", "phoenix"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("base");
    await game.p1.pick("base");
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["up"]);
  });

  test("Unchecked Power finally resolves: 12 to ALL units at battlefields kills Buddy and P2's own Foe — Phoenix, safe in base, survives", async () => {
    const game = await bladeOwnPhoenix();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("base");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("phoenix")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — doing nothing: Unchecked Power kills Phoenix at the battlefield (and it stays dead: it was killed by damage, P1's pool can't pay anyway)", async () => {
    const game = await board().build();
    await game.p2.cast("up");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash");
    // With no P1 unit left at bf1, control lapses at the next Open Cleanup and the unused facedown Hidden Blade is trashed (323.6/323.7).
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
