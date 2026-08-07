/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Peak Guardian (ogn-223-298) · Unit · Order · 6 + [order] · 5 might (here: exhausted + buffed = 6)
 *   × Rebuke (ogn-172-298) · Spell · Chaos · 2 + [chaos]x2 · Action
 *     "Return a unit at a battlefield to its owner's hand."
 *   (+ Possession ogn-203-298 · 8 + [chaos]x3 · Action — "Choose an enemy unit at a battlefield. Take
 *      control of it and recall it." for variant (d))
 *
 * Question: P2 controls battlefield A with only an exhausted, buffed Peak Guardian there. On P1's turn
 * P1 resolves Hostile Takeover on it.
 *   (a) Right after resolution: controller? ready? buff kept? what happens to A?
 *   (b) End of P1's turn, nothing else: where does it go, buff kept, does P1 keep A?
 *   (c) Before end of turn P2 Rebukes the stolen unit — legal? where does it go? what does the
 *       end-of-turn clause do?
 *   (d) Before end of turn P2 re-steals it with Possession — who has it after end of turn?
 *
 * Rules: 477.1.a / 480.3 (control = layer-1 effect, later timestamp wins), 190.3.a ("moves or otherwise
 * becomes present" → Contested) → non-combat showdown → conquer, 317.1 (end-of-turn effects), 455 /
 * 456.1 / 458.1 (recall = to its controller's base, not a move, state kept), 323.7 (permanents in a
 * base other than their controller's are recalled), 317.2.b (heal at end of turn), 190.4.c / 323.6
 * (no units → lose the battlefield), 127.1 (owner), 705 / 124.1 (leaving the board clears buffs and
 * statuses; new object), 359.3.e.12 (clause about an object no longer on the board → null, ignored).
 *
 * Expected: (a) P1 controls it, readied, still buffed (6), still at A; A becomes Contested and P1
 * conquers it. (b) control reverts to P2 and it is recalled to P2's base, still buffed; A is empty so
 * P1 does not keep it. (c) legal; to P2's (owner's) hand as a fresh card; the EOT clause does nothing.
 * (d) legal for P2 (it is an enemy unit from P2's view); P2 controls it in P2's base through end of turn.
 *
 * Timing note for (c)/(d): Rebuke and Possession are [Action] spells, so on P1's turn P2 can only play
 * them inside a showdown. The tests open an independent showdown (P1's scout walks onto the empty,
 * uncontrolled battlefield B and passes Focus) so P2's window does not depend on (a)'s Contested step.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Seat } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const PEAK_GUARDIAN = "ogn-223-298";
const REBUKE = "ogn-172-298";
const POSSESSION = "ogn-203-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: G, seat: Seat, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn. P2 holds A with only an exhausted, buffed Peak Guardian. B is empty and uncontrolled. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } }) // exactly Hostile Takeover
    .resources(P2, { energy: 8, power: { chaos: 3 } }) // Rebuke (2+cc) or Possession (8+ccc)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bfA", PEAK_GUARDIAN, "peak", { buffed: true, exhausted: true })
    .unit(P1, "base", { might: 2, name: "P1 Scout" }, "scout")
    .hand(P1, HOSTILE_TAKEOVER, "takeover")
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, POSSESSION, "possession");
}

/** Hostile Takeover cast on Peak Guardian and fully settled. */
async function taken(): Promise<G> {
  const game = await board().build();
  await game.p1.cast("takeover", { targets: "peak" });
  await game.settle();
  return game;
}

/** After the takeover, P1's scout walks onto empty B and passes Focus → P2 may play Action spells. */
async function p2Window(): Promise<G> {
  const game = await taken();
  await game.p1.move("scout", "bfB");
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Hostile Takeover × Peak Guardian × Rebuke / Possession — temporary control, EOT recall, bounce", () => {
  // ---- setup / cost / targeting -----------------------------------------------------------------

  test("setup: Hostile Takeover offers only the ENEMY unit at a battlefield and costs 5 + 2 power", async () => {
    const game = await board().build();
    expect(game.state("peak")).toMatchObject({ controller: P2, owner: P2, might: 6, isBuffed: true, isExhausted: true, location: "bfA" });
    expect(targetsOffered(game, P1, "takeover")).toEqual(["peak"]);
    await game.p1.cast("takeover", { targets: "peak" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["takeover"]);
  });

  // ---- (a) immediately after resolution ---------------------------------------------------------

  test("(a) P1 becomes the controller (owner still P2); no zone change — it stays at A and keeps its buff (6 Might) (477.1.a)", async () => {
    const game = await taken();
    const s = game.state("peak");
    expect(game.zoneOf("takeover")).toBe("trash");
    expect(s.controller).toBe(P1);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("battlefield-bfA");
    expect(s.isBuffed).toBe(true);
    expect(s.might).toBe(6);
    expect(s.damage).toBe(0);
  });

  test("(a) 'Ready it.' — the stolen Peak Guardian is readied on resolution", async () => {
    // Expected: ready. Actual: the parsed effect is only `take-control`; the unit stays exhausted.
    const game = await taken();
    expect(game.state("peak").isReady).toBe(true);
  });

  test("(a) P1 now has a unit at a battlefield it doesn't control → A becomes Contested and, with no other enemy units there, P1 conquers A and scores (190.3.a, reminder text 'Otherwise, conquer.')", async () => {
    // Expected: after everything settles A is P1's and P1 has 1 point. Actual: A never becomes
    // Contested; it stays P2's and P1 scores nothing.
    const game = await taken();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
  });

  test("(a) that control-change conquer is a Score like any other (471.2.a): P1's 'When you conquer, draw 1' gear triggers and A is marked scored", async () => {
    const CONQUER_DRAW_GEAR = {
      abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "controller" }, type: "triggered" }],
      cardType: "gear",
      name: "Filler War Ledger",
    };
    const game = await board().gear(P1, CONQUER_DRAW_GEAR, "ledger").build();
    const hand0 = game.p1.hand().length; // includes takeover
    await game.p1.cast("takeover", { targets: "peak" });
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bfA"]);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // −takeover, +1 drawn by the conquer trigger
  });

  // ---- (b) end of turn, nothing else happens ----------------------------------------------------

  test("(b) at end of P1's turn P1 loses control and it is recalled to P2's base — still buffed, healed; A is left empty so P1 does not hold it (317.1, 455, 458.1, 323.7, 190.4.c)", async () => {
    // Expected as titled. Actual: Hostile Takeover's delayed 'lose control … recall it' clause is not
    // implemented — the unit stays P1-controlled at A into P2's turn.
    const game = await taken();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const s = game.state("peak");
    expect(s.controller).toBe(P2);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("base");
    expect(s.isBuffed).toBe(true);
    expect(s.damage).toBe(0);
    expect(game.cardsAt("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller ?? null).not.toBe(P1);
  });

  // ---- (c) P2 Rebukes the stolen unit before end of turn ----------------------------------------

  test("(c) Rebuke is legal for P2 on the stolen unit ('a unit at a battlefield', any controller): it returns to its OWNER's (P2's) hand with its buff gone (127.1, 705)", async () => {
    const game = await p2Window();
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    expect(targetsOffered(game, P2, "rebuke")).toContain("peak");
    await game.p2.cast("rebuke", { targets: "peak" });
    expect(game.p2.resources()).toEqual({ energy: 6, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("peak")).toBe("hand");
    expect(game.state("peak").owner).toBe(P2);
    expect(game.p2.hand()).toContain("peak");
    expect(game.p1.hand()).not.toContain("peak");
    expect(game.state("peak").isBuffed).toBe(false);
    expect(game.state("peak").might).toBe(5);
    expect(game.cardsAt("bfA")).toEqual([]);
  });

  test("(c) the bounced card is a new object — the temporary control change is cleared too, so in P2's hand it is P2's card in every respect (124.1)", async () => {
    // Expected: controller reads P2 (no status survives the zone change). Actual: the card record in
    // P2's hand still carries controller = P1 from Hostile Takeover.
    const game = await p2Window();
    await game.p2.cast("rebuke", { targets: "peak" });
    await game.settle();
    expect(game.zoneOf("peak")).toBe("hand");
    expect(game.state("peak").controller).toBe(P2);
  });

  test("(c) at end of turn Hostile Takeover's clause finds nothing on the board — the card simply stays in P2's hand (359.3.e.12)", async () => {
    const game = await p2Window();
    await game.p2.cast("rebuke", { targets: "peak" });
    await game.settle(); // Rebuke resolves, showdown at B closes
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("peak")).toBe("hand");
    expect(game.p2.hand()).toContain("peak");
    expect(game.cardsAt("bfA")).toEqual([]);
    expect(game.cardsAt("base").filter((c) => c === "peak")).toEqual([]);
  });

  // ---- (d) P2 re-steals it with Possession before end of turn -----------------------------------

  test("(d) Possession is legal for P2 — the P1-controlled Peak Guardian is an ENEMY unit from P2's perspective ('enemy' follows control, not ownership)", async () => {
    // Expected: peak is among Possession's offered targets for P2. Actual: enemy-ness is keyed on the
    // owner, so only P1's scout is offered and the cast on peak is rejected.
    const game = await p2Window();
    expect(game.p2.can("cast", "possession")).toBe(true);
    expect(targetsOffered(game, P2, "possession")).toContain("peak");
    await game.p2.cast("possession", { targets: "peak" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("(d) after Possession P2 controls it in P2's base (later control timestamp wins, 480.3); at end of turn Hostile Takeover's clause changes nothing — it is still P2's, in base, buffed", async () => {
    // Expected as titled. Actual: fails at the cast — see the previous BUG (peak not offered to P2).
    const game = await p2Window();
    await game.p2.cast("possession", { targets: "peak" });
    await game.settle();
    let s = game.state("peak");
    expect(s.controller).toBe(P2);
    expect(s.zone).toBe("base");
    expect(s.isBuffed).toBe(true);
    expect(game.cardsAt("bfA")).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    s = game.state("peak");
    expect(s.controller).toBe(P2);
    expect(s.owner).toBe(P2);
    expect(s.zone).toBe("base");
    expect(s.isBuffed).toBe(true);
  });
});
