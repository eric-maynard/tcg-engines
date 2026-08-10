/**
 * Ruling fae6af2db4c7d4df — Counter Strike (SFD-194 → sfd-194-221) · Reaction · Calm/Body · [2][rainbow]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   × Falling Star (OGN-029 → ogn-029-298) · Action · Fury · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Falling Star aims BOTH of its "deal 3" at the same unit. Does Counter Strike stop it?
 * A: Counter Strike is a delayed replacement consumed by ONE damage event. One Counter Strike prevents the first 3 only — the
 *    second 3 is dealt. Two Counter Strikes (both resolving before Falling Star) create two separate effects: the first 3 uses
 *    one up (the unit's owner picks which, they're interchangeable), the second 3 is prevented by the other.
 * Rules: 437.5.b / 437.7 (prevent-next-instance, consumed on use), 372 (owner orders multiple applicable replacements), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
const FALLING_STAR = "ogn-029-298";

/** P1's turn with exactly [2][fury][fury]. P2's Brute (4) at bf1; P2 holds two Counter Strikes with [4] + 2 rainbow (enough for both). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 4, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .hand(P2, COUNTER_STRIKE, "cs1")
    .hand(P2, COUNTER_STRIKE, "cs2");
}

function withFallingStar() {
  return board().hand(P1, FALLING_STAR, "star");
}

/** Falling Star with BOTH instances on the Brute; P1 passes → P2 has priority. */
async function starBothOnBrute(game: Game): Promise<void> {
  await game.p1.cast("star", { targets: ["brute", "brute"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["brute", "brute"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** Resolve the whole chain; if the Brute's owner is asked which Counter Strike applies first (372), take the first. */
async function resolveAll(game: Game): Promise<void> {
  for (let i = 0; i < 12 && (game.chain().length > 0 || game.decision()?.kind !== "action"); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "replacement-order") {
      expect(d.seat).toBe(P2); // the damaged unit's owner chooses
      await game.p2.pick(d.options[0]!.key);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling fae6af2db4c7d4df — Counter Strike vs a double-targeted Falling Star: one copy stops one instance, two copies stop both", () => {
  test("control: no Counter Strike — Falling Star deals 3 + 3 to the 4-Might Brute and it dies", async () => {
    const game = await withFallingStar().build();
    await starBothOnBrute(game);
    await game.p2.passPriority();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
  });

  test("ONE Counter Strike in response: it resolves first (P2 draws 1); Falling Star's first 3 is prevented and consumes it, the second 3 IS dealt — Brute lives with 3 damage", async () => {
    const game = await withFallingStar().build();
    await starBothOnBrute(game);
    const hand0 = game.p2.hand().length;
    await game.p2.cast("cs1", { targets: "brute" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "cs1"]);
    await resolveAll(game);
    expect(game.zoneOf("cs1")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.state("brute")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("brute").meta.preventNextDamageInstance).toBeFalsy(); // consumed
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("TWO Counter Strikes in response: both resolve before Falling Star (P2 draws 2), each 'deal 3' consumes one effect — the Brute takes no damage at all", async () => {
    const game = await withFallingStar().build();
    await starBothOnBrute(game);
    const hand0 = game.p2.hand().length;
    await game.p2.cast("cs1", { targets: "brute" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 keeps priority after adding an item
    await game.p2.cast("cs2", { targets: "brute" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "cs1", "cs2"]);
    await resolveAll(game);
    expect(game.p2.hand()).toHaveLength(hand0 - 2 + 2);
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
