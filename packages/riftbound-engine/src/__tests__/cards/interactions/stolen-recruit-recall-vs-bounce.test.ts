/**
 * Interaction: two "take control + recall" spells aimed at the same TOKEN — and what a recall is not.
 *
 *   Vanguard Armory  (sfd-168-221) — Gear, Order, [7]+[order]. "[Exhaust]: Play three 1 [Might]
 *                     Recruit unit tokens."
 *   Conscription     (unl-140-219) — Spell, Chaos, [5]+[chaos][chaos]. "Choose an enemy unit at a
 *                     battlefield with 3 [Might] or less … Take control of it, exhaust it, and recall it."
 *   Hostile Takeover (sfd-202-221) — Spell, Mind/Order, [5]+2. "Take control of an enemy unit at a
 *                     battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *
 * Q: (a) whose Base does a Conscripted Recruit token land in, does it survive at all, and who owns
 * it afterwards? (b) does Hostile Takeover's end-of-turn clause park the identical token in the
 * OPPOSITE base? (c) what changes if the stolen token is bounced to its owner's hand or killed
 * instead of recalled — and do move-triggered abilities see the Recall?
 *
 * Rules: 183 / 191.1 (a token's OWNER is fixed at creation and never changes; control can), 186.1 (a
 * token ceases to exist the moment it enters a non-board zone), 455 / 456.1 / 456.2 / 456.3 (Recall
 * relocates a permanent to its Base; it is NOT a Move, so it fires no move triggers and no movement
 * restriction can stop it), 390 (a delayed trigger executes its instructions in written order), 748
 * (counters are lost when an object leaves the board).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_ARMORY = "sfd-168-221";
const CONSCRIPTION = "unl-140-219";
const HOSTILE_TAKEOVER = "sfd-202-221";
const GUST = "ogn-169-298"; // [Reaction] 1: return a unit at a battlefield with 3 Might or less to its owner's hand
const TREASURE_HUNTER = "sfd-130-221"; // 1 Might: "When I move, play a Gold gear token exhausted."

const RECRUIT = { isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] } as const;

const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with a single 1-Might Recruit TOKEN it minted earlier. */
function stolenFrom(power: Record<string, number>) {
  return scenario()
    .resources(P1, { energy: 6, power })
    .battlefield("bf1", { controller: P2, owner: P2 })
    .unit(P2, "bf1", RECRUIT, "recruit")
    .unit(P2, "base", { might: 2, name: "Home" }, "home");
}

const goldOf = (game: Game, seat: typeof P1 | typeof P2) =>
  game.seat(seat).base().filter((id) => game.state(id).name === "Gold");

describe("A stolen Recruit token: Conscription's recall vs Hostile Takeover's end-of-turn recall vs a bounce", () => {
  // -------------------------------------------------------------------------
  // The tokens really are tokens
  // -------------------------------------------------------------------------
  test("Vanguard Armory mints real 1-Might Recruit unit TOKENS under P2's control — the objects the rest of this file steals", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P2, owner: P2 })
      .unit(P2, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .gear(P2, VANGUARD_ARMORY, "armory")
      .build();
    await game.p2.activate("armory");
    for (let i = 0; i < 3; i++) {
      await game.settle();
      if (game.decision()?.kind !== "pick") {
        break;
      }
      await game.p2.pick(i === 0 ? "battlefield-bf1" : "base");
    }
    await game.settle();
    const recruits = [...game.p2.base(), ...game.p2.units("bf1")].filter((id) => game.state(id).name === "Recruit");
    expect(recruits).toHaveLength(3);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ cardType: "unit", controller: P2, isExhausted: true, isToken: true, might: 1, owner: P2 });
    }
  });

  // -------------------------------------------------------------------------
  // (a) Conscription — the token lands in the CASTER's base and survives
  // -------------------------------------------------------------------------
  test("(a) 455 / 186.1 — Conscription's recall sends the token to P1's Base, and because a Base is a BOARD zone the token does NOT cease to exist", async () => {
    const game = await stolenFrom({ chaos: 2 }).hand(P1, CONSCRIPTION, "con").build();
    expect(game.p1.option("cast", "con")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["recruit"]]);
    await game.p1.cast("con");
    await game.settle();

    expect(game.has("recruit")).toBe(true);
    expect(game.zoneOf("recruit")).toBe("base"); // NOT "gone" — 186.1 never fires for a board zone
    // 183 / 191.1 — control moved, ownership did not, and Conscription's control change has no duration.
    expect(game.state("recruit")).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "base", owner: P2 });
    expect(game.p1.units("base")).toContain("recruit");
    expect(game.p2.units("base")).not.toContain("recruit");
    expect(game.zoneOf("con")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) the Conscripted token is P1's for good: it readies on P1's next turn and P1 may move it out to a battlefield", async () => {
    const game = await stolenFrom({ chaos: 2 }).hand(P1, CONSCRIPTION, "con").battlefield("bf2", { controller: null }).build();
    await game.p1.cast("con");
    await game.settle();
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    expect(game.state("recruit")).toMatchObject({ controller: P1, isReady: true, owner: P2 });
    await game.p1.move("recruit", "bf2");
    await game.settle();
    expect(game.locationOf("recruit")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  // -------------------------------------------------------------------------
  // (b) Hostile Takeover — written order puts the identical token in the OTHER base
  // -------------------------------------------------------------------------
  test("(b) 390 — Hostile Takeover's end-of-turn clause loses control FIRST and only then recalls, so the same token ends the turn in P2's Base under P2", async () => {
    const game = await stolenFrom({ order: 2 }).hand(P1, HOSTILE_TAKEOVER, "ht").build();
    await game.p1.cast("ht", { targets: "recruit" });
    await game.settle();
    await game.settle(); // pass through the auto-begun non-combat showdown; P1 conquers bf1
    expect(game.state("recruit")).toMatchObject({ controller: P1, isToken: true, owner: P2 });
    expect(game.p1.points()).toBe(1);

    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has("recruit")).toBe(true);
    expect(game.zoneOf("recruit")).toBe("base");
    // "Its Base" is read AFTER control reverts — the opposite base from Conscription's.
    expect(game.state("recruit")).toMatchObject({ controller: P2, location: "base", owner: P2 });
    expect(game.p2.units("base")).toContain("recruit");
    expect(game.p1.units("base")).not.toContain("recruit");
    expect(game.p1.points()).toBe(1); // the conquer point stays
  });

  test("(a) vs (b) side by side — two 'take control and recall it' spells park the IDENTICAL token in opposite bases", async () => {
    const conscripted = await stolenFrom({ chaos: 2 }).hand(P1, CONSCRIPTION, "con").build();
    await conscripted.p1.cast("con");
    await conscripted.settle();
    await conscripted.advanceTurn(); // survive the same end-of-turn window Hostile Takeover uses
    expect(conscripted.state("recruit").controller).toBe(P1);
    expect(conscripted.p1.units("base")).toContain("recruit");

    const taken = await stolenFrom({ order: 2 }).hand(P1, HOSTILE_TAKEOVER, "ht").build();
    await taken.p1.cast("ht", { targets: "recruit" });
    await taken.settle();
    await taken.settle();
    await taken.advanceTurn();
    expect(taken.state("recruit").controller).toBe(P2);
    expect(taken.p2.units("base")).toContain("recruit");
  });

  // -------------------------------------------------------------------------
  // (c) a bounce or a kill is removal against a token; a Recall is not a Move
  // -------------------------------------------------------------------------
  test("(c) 186.1 / 748 — Gusting the stolen token to its OWNER's hand destroys it outright: nothing reaches P2's hand, and any counters go with it", async () => {
    const game = await stolenFrom({ chaos: 3 }).hand(P1, GUST, "gust").build();
    const handBefore = game.p2.hand().length;
    await game.p1.cast("gust", { targets: "recruit" });
    await game.settle();
    expect(game.has("recruit")).toBe(false);
    expect(game.zoneOf("recruit")).toBe("gone"); // 186.1 — it ceased to exist on arrival
    expect(game.p2.hand()).toHaveLength(handBefore); // the hand never sees it
    expect(game.p1.hand()).not.toContain("recruit");
    expect(game.p2.trash()).not.toContain("recruit");
  });

  test("(c) 186.1 — killing the stolen token likewise leaves nothing: no card in either trash", async () => {
    const game = await stolenFrom({ chaos: 2 }).resources(P1, { energy: 1 }).hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "recruit" });
    await game.settle();
    expect(game.has("recruit")).toBe(false);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.p1.trash()).not.toContain("recruit");
    expect(game.p2.trash()).not.toContain("recruit");
  });

  test("(c) 456.1 — the Recall is NOT a Move: Conscripting Treasure Hunter ('When I move, play a Gold gear token exhausted') off a battlefield produces no Gold", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2, owner: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", TREASURE_HUNTER, "hunter")
      .hand(P1, CONSCRIPTION, "con")
      .build();
    expect(goldOf(game, P1)).toEqual([]);
    await game.p1.cast("con", { targets: "hunter" });
    await game.settle();
    expect(game.state("hunter")).toMatchObject({ controller: P1, location: "base", owner: P2 });
    // 456.1 — no move event, so the Hunter's own trigger never fired, for either side.
    expect(goldOf(game, P1)).toEqual([]);
    expect(goldOf(game, P2)).toEqual([]);
    expect(game.chain()).toEqual([]);

    // Control: an actual Move of the same unit DOES fire it — proving the trigger is live.
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    await game.p1.move("hunter", "bf2");
    await game.settle();
    expect(goldOf(game, P1)).toHaveLength(1);
  });
});
