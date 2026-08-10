/**
 * Ruling ad570be74f64d404 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Cleave (OGN-004 → ogn-004-298) · [Action] · [1] · "Give a unit [Assault 3] this turn."
 *
 * Q: With Cleave's Assault 3 on him, is the Merchant already +3 when his move trigger fires?
 * A: No. The move makes the battlefield Contested and puts his trigger on the chain, but combat is only PENDING while the chain is
 *    non-empty; the showdown (and with it the Attacker designation / Assault) starts only after the chain has resolved.
 * Rules: 446 (move), 383 (trigger → chain), 344 / 516.5 (showdown staged, begins with an empty chain), 807 (Assault only while
 *        an attacker).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const CLEAVE = "ogn-004-298";

/** P1's turn with [1]. Merchant (2) ready in base; Cleave + a Junk card in hand; known deck top. P2's Guard (4) holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Cleave the Merchant in base, then Standard-Move him into bf1. Stops with the move trigger on the chain. */
async function cleavedMerchantMovesIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "merchant" });
  await game.settle();
  expect(game.state("merchant").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("merchant").might).toBe(2); // in base: not an attacker, Assault dormant
  await game.p1.move("merchant", "bf1");
  return game;
}

describe("Ruling ad570be74f64d404 — the Merchant's move trigger resolves before combat starts, so Assault is not on yet", () => {
  test("right after the move: bf1 is Contested by P1, the 'discard, then draw' trigger is on the chain, NO showdown has begun (combat pending), and the Merchant is not an attacker — still 2 Might, not 5", async () => {
    const game = await cleavedMerchantMovesIn();
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    expect(game.state("merchant").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the trigger resolves (discard Junk, draw d1) with the chain otherwise empty → only THEN does the combat showdown begin, the Merchant becomes the attacker and Assault applies: 2 + 3 = 5", async () => {
    const game = await cleavedMerchantMovesIn();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "merchant") {
        expect(game.state("merchant").might).toBe(2); // still resolving the chain: no Assault yet
        await game.p1.pick("junk");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("merchant")).toMatchObject({ combatRole: "attacker", might: 5 });
  });

  test("outcome: the 5-Might attacking Merchant beats the Guard (4) — taking 4 (< 5 while attacking) he survives, conquers bf1 and reverts to 2 afterwards", async () => {
    const game = await cleavedMerchantMovesIn();
    game.script(P1, ["junk"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("merchant")).toMatchObject({ damage: 0, location: "bf1", might: 2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
