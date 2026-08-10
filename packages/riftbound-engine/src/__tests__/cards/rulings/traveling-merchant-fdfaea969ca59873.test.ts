/**
 * Ruling fdfaea969ca59873 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Ride the Wind (OGN-173 → ogn-173-298) [Action] "Move a friendly unit and ready it." × Fight or Flight (OGN-168 →
 *   ogn-168-298) [Hidden][Action] "Move a unit from a battlefield to its base." (Reaver's Row is just another mover.)
 *
 * Q: When does the Merchant's move trigger occur and resolve — relative to combat, and when moved by spells/abilities?
 * A: Movement is instantaneous; the trigger goes on the chain immediately after the move and must resolve before anything
 *    else: after a Standard Move the combat can't begin until the trigger has resolved and the chain is empty; when a spell
 *    moves it, the trigger is added after the spell's move, before the chain closes; every further move (e.g. a Fight or
 *    Flight in response) triggers it again. "Discard 1, then draw 1" is do-as-much-as-you-can: no card to discard ⇒ still draw.
 * Rules: 383.4 (move triggers), 344/323.12–13 (a staged showdown begins only once the chain is empty), 340.1 (LIFO),
 *        359.3 (perform as much as possible; the comma/then is a sequence, not a cost).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const RIDE_THE_WIND = "ogn-173-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

type PickD = Extract<Decision, { kind: "pick" }>;
const JUNK = { cardType: "unit", energyCost: 1, might: 1, name: "Junk" } as const;

/** P1's turn. P2 holds bf1 with a 4-Might Guard (+ optionally a face-down Fight or Flight). P1: ready Merchant in base,
 * Ride the Wind + `junk` cards in hand, [2][chaos], known deck d1..d4. */
function board(opts: { junk?: number; fof?: boolean } = {}) {
  let s = scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
  for (let i = 0; i < (opts.junk ?? 2); i++) {
    s = s.hand(P1, JUNK, `junk${i + 1}`);
  }
  return opts.fof ? s.facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof") : s;
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Answer the Merchant's "discard which?" prompt with `card` once it appears (passing priority as needed). */
async function resolveMerchantTrigger(game: Game, card: string): Promise<void> {
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).options.map((o) => o.card ?? o.key)).toContain(card);
  await game.p1.pick(card);
}

describe("Ruling fdfaea969ca59873 — the Merchant's move trigger goes on the chain right after ANY move and resolves before anything else", () => {
  test("Standard Move into enemy bf1: the Merchant is at bf1 at once, its trigger is on the chain, and NO showdown/combat has begun; only after discard+draw resolve and the chain is empty does the combat showdown open", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.locationOf("merchant")).toBe("bf1"); // movement is instantaneous
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // react to the TRIGGER, not the move
    expect(showdown(game)).toBeUndefined();
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    await resolveMerchantTrigger(game, "junk1");
    expect(game.zoneOf("junk1")).toBe("trash");
    expect(game.p1.hand()).toContain("d1");
    // Chain empty ⇒ now the staged combat begins.
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeDefined();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("merchant").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("merchant")).toBe("trash"); // 2 into 4
    expect(game.violations()).toEqual([]);
  });

  test("moved by a spell (Ride the Wind to bf1): the spell resolves and moves+readies it, and BEFORE the chain closes the move trigger is added and must be dealt with; the combat waits for it too", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "merchant" });
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
      await game.p1.pick("battlefield-bf1");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.state("merchant").isReady).toBe(true);
    // The chain did not close: the Merchant's trigger is on it now.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(showdown(game)).toBeUndefined();
    await resolveMerchantTrigger(game, "junk1");
    expect(game.zoneOf("junk1")).toBe("trash");
    expect(game.p1.hand()).toContain("d1");
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(showdown(game)).toBeDefined();
    expect(game.state("merchant").combatRole).toBe("attacker");
  });

  test("any subsequent move triggers it AGAIN: P2 flips a hidden Fight or Flight on the Merchant in response to the first trigger ⇒ Merchant goes home, a second move trigger is added on top; both resolve (two discards, two draws) and no combat happens", async () => {
    const game = await board({ fof: true }).build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["merchant"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "fof"]);
    // FoF resolves: the Merchant moves to base ⇒ a NEW move trigger goes on the chain above the first one.
    for (let i = 0; i < 4 && game.zoneOf("fof") !== "trash"; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("merchant")).toBe("base");
    const merchantItems = game.chain().filter((c) => c.cardId === "merchant" && c.triggered);
    expect(merchantItems).toHaveLength(2);
    // Resolve both: discard junk1 / draw, discard junk2 / draw.
    await resolveMerchantTrigger(game, "junk1");
    await resolveMerchantTrigger(game, "junk2");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash().toSorted()).toEqual(["junk1", "junk2"]);
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2", "rtw"]);
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("'discard 1, then draw 1' does as much as it can: with an EMPTY hand there is nothing to discard, but P1 still draws 1", async () => {
    const game = await board({ junk: 0 }).build();
    // Get Ride the Wind out of the hand first so the hand is truly empty when the trigger resolves: cast it on the Merchant → bf1.
    await game.p1.cast("rtw", { targets: "merchant" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves: no discard prompt possible …
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]); // … but the draw still happened
    expect(game.p1.trash()).toEqual(["rtw"]);
    expect(game.violations()).toEqual([]);
  });
});
