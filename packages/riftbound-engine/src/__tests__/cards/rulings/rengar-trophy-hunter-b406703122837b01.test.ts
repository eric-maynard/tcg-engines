/**
 * Ruling b406703122837b01 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Champion Unit · Body · 5 · 6 Might
 *   "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *    I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *   × Rengar, Pouncing (SFD-025 → sfd-025-221) · Champion Unit · Fury · 3 · 3 Might
 *   "[Reaction] [Assault 2] I can be played to a battlefield you're attacking."
 *
 * Q: Can the opponent Ambush Rengar as a reaction to a spell I play on my turn?
 * A: Yes. Ambush grants Reaction timing when playing to a battlefield where they have units, and Reactions may be
 *    played in a Closed State on any player's turn. Trophy Hunter may additionally go to a battlefield holding only
 *    ENEMY units. Rengar, Pouncing (printed Reaction, no Ambush) could go to base / a battlefield he controls / one
 *    he is attacking instead. A plain Action-speed unit cannot be played there at all (Closed State, not a showdown).
 * Rules: 813.1.c.1 / 822.1.b (Ambush → Reaction to a battlefield with your units), 331 / 338.1.a (Closed State:
 *        Reaction-timed plays only), 346 (play destinations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR_TROPHY_HUNTER = "unl-120-219";
const RENGAR_POUNCING = "sfd-025-221";

/** P1's 1-cost Action spell "Deal 1 to a unit" — the spell being reacted to. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Sting",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

/** A vanilla (Action-speed by default) unit in P2's hand. */
const GRUNT = { cardType: "unit", energyCost: 0, might: 2, name: "Grunt" } as const;

/**
 * P1's turn. bfA: P2's Guard (3) — a battlefield where P2 HAS units. bfB: P1's Sentry (2) only — enemy units, none of P2's.
 * P1: Sting in hand + 1 energy. P2: both Rengars + a Grunt in hand, 8 energy, [body] + [fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 8, power: { body: 1, fury: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P2, "bfA", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bfB", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, STING, "sting")
    .hand(P2, RENGAR_TROPHY_HUNTER, "trophy")
    .hand(P2, RENGAR_POUNCING, "pouncing")
    .hand(P2, GRUNT, "grunt");
}

/** P1 casts Sting at the Guard on P1's own turn and passes priority → P2 holds priority in a Closed State. */
async function spellOnChain(): Promise<Game> {
  const game = await board().build();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.cast("sting", { targets: "guard" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sting"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // a Closed State, not a showdown
  return game;
}

const locations = (game: Game, card: string) =>
  (game.p2.option("playUnit", card)?.fields.find((f) => f.name === "location")?.options ?? []).map(String).sort();

describe("Ruling b406703122837b01 — the opponent may Ambush Rengar in response to my spell on my turn", () => {
  test("with my spell on the chain (my turn, Closed State) P2 CAN play Rengar, Trophy Hunter: to bfA (where P2 has units — standard Ambush) and to bfB (enemy units only — his own text)", async () => {
    const game = await spellOnChain();
    expect(game.p2.can("play", "trophy")).toBe(true);
    const to = locations(game, "trophy");
    expect(to).toContain("battlefield-bfA");
    expect(to).toContain("battlefield-bfB");
  });

  test("a plain Action-speed unit cannot be played there at all — only Reaction-timed plays are legal in a Closed State", async () => {
    const game = await spellOnChain();
    expect(game.p2.can("play", "grunt")).toBe(false);
    expect((await game.p2.try((p) => p.play("grunt"))).ok).toBe(false);
  });

  test("Rengar, Pouncing (printed [Reaction], no Ambush) is also playable now — to P2's base or bfA (a battlefield P2 controls) — but NOT to bfB, which P2 is not attacking", async () => {
    const game = await spellOnChain();
    expect(game.p2.can("play", "pouncing")).toBe(true);
    const to = locations(game, "pouncing");
    expect(to).toContain("base");
    expect(to).toContain("battlefield-bfA");
    expect(to).not.toContain("battlefield-bfB");
  });

  test("P2 Ambushes Trophy Hunter into bfB in response: he pays 5 + [body], lands at bfB (a permanent leaves the chain on finalization) while my Sting is still pending; then Sting resolves (Guard takes 1)", async () => {
    const game = await spellOnChain();
    await game.p2.play("trophy", { to: "bfB" });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { body: 0, fury: 1 } });
    for (let i = 0; i < 4 && game.zoneOf("trophy") !== "battlefield-bfB" && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("trophy")).toBe("battlefield-bfB");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sting"]);
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sting")).toBe("trash");
    expect(game.state("guard").damage).toBe(1);
    // Rengar contested MY battlefield on my turn → a combat follows with P2 attacking; 6 vs 2 → he conquers bfB.
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("trophy")).toBe("bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
