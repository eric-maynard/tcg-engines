/**
 * Ruling db957bc9b18914a1 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Rebuke (ogn-172-298, Action) "Return a unit at a battlefield to its owner's hand." — the bounce spell
 *
 * Q: Zhonya's is played from hidden at a battlefield where I then lose control (my last unit there is bounced).
 *    Does it stay at the battlefield or move to base?
 * A: Played from facedown, Zhonya's is recalled to base at once — before the bounce spell it answered resolves —
 *    regardless of what later happens to control of that battlefield. Gear only exists in base; from base it can
 *    then save units at any battlefield.
 * Rules: 811 (Hidden play as a Reaction), 145 / 457.1 (gear at a battlefield is recalled to base), 323.6/323.7
 *        (control + facedown cleanup — no longer applies once the card is in play in base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const REBUKE = "ogn-172-298";
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * P2's turn. P1: lone Guard (3) at bf1 with Zhonya's facedown there; Ranger (2) at bf2. P2: Rebuke + Bolt with
 * plenty of resources.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 10, power: { chaos: 3, fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Ranger" }, "ranger")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, BOLT, "bolt");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** P2 Rebukes the Guard; P1 flips Zhonya's in response; drive priority until Zhonya's play has resolved but Rebuke has not. */
async function flipInResponseToRebuke(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("rebuke", { targets: "guard" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "zhonya")).toBe(true);
  await game.p1.reveal("zhonya");
  // Let only the top item (Zhonya's, if it uses the chain) resolve; stop while Rebuke is still pending.
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "zhonya"); i++) {
    await game.acting().passPriority();
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rebuke"]);
  return game;
}

describe("Ruling db957bc9b18914a1 — Zhonya's flipped in response to a bounce is already in base before the bounce resolves", () => {
  test("with Rebuke (on the lone Guard) still on the chain, the freshly played Zhonya's is already in P1's BASE — not at bf1, not facedown", async () => {
    const game = await flipInResponseToRebuke();
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.gear()).toContain("zhonya");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // Rebuke has not resolved yet
    expect(bf1(game)?.controller).toBe(P1);
  });

  test("then Rebuke resolves: Guard to hand, bf1's control lapses (no P1 unit left) — and Zhonya's is unaffected, still in P1's base (not trashed with the battlefield)", async () => {
    const game = await flipInResponseToRebuke();
    await game.settle();
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("hand");
    expect(bf1(game)?.controller).not.toBe(P1);
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.p1.trash()).not.toContain("zhonya");
  });

  test("nuance — from base it now saves a unit at ANY battlefield: P2 then Bolts the Ranger at bf2 → Zhonya's is killed instead, Ranger recalled alive", async () => {
    const game = await flipInResponseToRebuke();
    await game.settle();
    await game.p2.cast("bolt", { targets: "ranger" });
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("ranger")).toBe("base");
    expect(game.state("ranger")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });
});
