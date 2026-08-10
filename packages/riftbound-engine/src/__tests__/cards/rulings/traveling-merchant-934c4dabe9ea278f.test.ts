/**
 * Ruling 934c4dabe9ea278f — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *   × Cleave (OGN-004 → ogn-004-298) · Action [1] "Give a unit [Assault 3] this turn."
 *
 * Q: When the Merchant moves to a battlefield, is it already AT the battlefield when its trigger happens — and what does that
 *    mean for responses and for when the showdown starts?
 * A: Yes — the move is instantaneous; the trigger goes on the chain with the Merchant at the battlefield, so Gust can target it
 *    in response (its controller may even discard that very Merchant to the trigger). The showdown is only staged: if the Merchant
 *    is gone before the trigger resolves, no showdown begins; if only the defender is removed (Flash), a NON-combat showdown happens
 *    and the Merchant never becomes an attacker (so a pre-applied Cleave's Assault never turns on). Attacker status / Assault only
 *    apply once a combat showdown actually begins.
 * Rules: 446 (move is immediate), 383 (trigger → chain), 344 / 516.5 (showdown staged, begins at Cleanup with an empty chain),
 *        340, 809 Assault (only while attacking).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. Merchant (2) in P1's base with Cleave + a Junk card in hand and [1]; deck top d1. P2 holds bf1 with Kai'Sa (3) and
 * has Gust + Flash with [3].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Kai'Sa" }, "kaisa")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
    .hand(P2, GUST, "gust")
    .hand(P2, FLASH, "flash")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Cleave the Merchant (Assault 3, inactive in base), then move it into bf1. Stops with the move trigger on the chain, P1 holding priority. */
async function cleaveAndMoveIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "merchant" });
  await game.settle();
  expect(game.state("merchant").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("merchant").might).toBe(2); // not an attacker in base
  await game.p1.move("merchant", "bf1");
  return game;
}

/** Answer the Merchant's "discard 1" prompt (if/when it appears) with `card`. */
async function discardIfAsked(game: Game, card: string): Promise<boolean> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "merchant") {
    expect(d.options.map((o) => o.card ?? o.key)).toContain(card);
    await game.p1.pick(card);
    return true;
  }
  return false;
}

describe("Ruling 934c4dabe9ea278f — Traveling Merchant is AT the battlefield while its move trigger is on the chain", () => {
  test("right after the move: Merchant is at bf1, its 'discard, then draw' trigger is on the chain, bf1 is only STAGED (no showdown yet), and the Merchant is not an attacker — Cleave's Assault is still off (2 Might)", async () => {
    const game = await cleaveAndMoveIn();
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    expect(game.state("merchant").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("control — nobody responds: the trigger resolves (discard Junk, draw d1), THEN the combat showdown begins and only now is the Merchant the attacker at 2 + 3 = 5", async () => {
    const game = await cleaveAndMoveIn();
    for (let i = 0; i < 8; i++) {
      if (await discardIfAsked(game, "junk")) {
        continue;
      }
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("merchant").might).toBe(5);
  });

  test("Gust in response is LEGAL on the Merchant (it is 'a unit at a battlefield'); it goes home, its controller may discard that very Merchant to the still-resolving trigger, and NO showdown ever begins at bf1", async () => {
    const game = await cleaveAndMoveIn();
    await game.p1.passPriority();
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[])).toContain("merchant");
    await game.p2.cast("gust", { targets: "merchant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
    for (let i = 0; i < 10; i++) {
      if (await discardIfAsked(game, "merchant")) {
        continue;
      }
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("trash"); // gusted to hand, then discarded to its own trigger
    expect(game.p1.hand().toSorted()).toEqual(["d1", "junk"]); // … then drew 1
    // Staged but un-staged in Cleanup: no showdown, bf1 untouched, back to P1's main phase.
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Flash the DEFENDER away in response: the trigger resolves, then a NON-combat showdown opens at bf1 (Merchant has Focus) — the Merchant is never an attacker, so Cleave's Assault stays off (2 Might); afterwards P1 simply takes the empty bf1", async () => {
    const game = await cleaveAndMoveIn();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "kaisa" });
    for (let i = 0; i < 10; i++) {
      if (await discardIfAsked(game, "junk")) {
        continue;
      }
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.locationOf("kaisa")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    expect(game.state("merchant").might).toBe(2);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("merchant")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
