/**
 * Ruling 2f2fb3a61bb3446a — Forge of the Future (OGN-212 → ogn-212-298) · Gear · Order · 2
 *   "When you play this, play a 1 [Might] Recruit unit token at your base. Kill this: Recycle up to 4 cards from trashes."
 *   × Acceptable Losses (OGN-179 → ogn-179-298) · Spell · Chaos · 1 · Action — "Each player kills one of their gear."
 *
 * Q: Does Forge of the Future kill itself as a cost, or do I need another card to kill the gear?
 * A: It kills itself — "Kill this" precedes the colon, so it is the activation COST. Activate in an open state on your
 *    turn; the Forge goes to the trash as the cost, THEN the recycle ability sits on the chain (opponent may react),
 *    then it resolves. If instead an outside effect (Acceptable Losses) kills the Forge, no recycle happens — you did
 *    not activate anything.
 * Rules: 150.1/150.2 (text before ":" is a cost), 402 (activated abilities → chain), FAQ #9207.
 *
 * TIMING settled 2026-08-12 (DESIGN.md § "Choices and when they are made" / § "A Public pile is a target
 * pool"): the recycle SET is named while the ability is FINALIZED, not as it resolves. CR 355.10.a.1 makes a
 * trash a PUBLIC zone, so 355.5 / 355.13 / 402.2 name the set in Make Relevant Choices and 355.15 locks it;
 * 402 is "2. Make relevant choices" and 404 is "4. Pay Costs", so the "Kill this" cost is paid AFTER those
 * choices and the Forge can never be one of its own targets.
 *
 * This is NOT a ruling conflict, though the tree previously recorded it as one: the ruling above answers only
 * "is *Kill this* a cost?", cites only 150.1 / 150.2, and never says when the set is chosen — its "if both
 * players pass, the ability resolves, and you carry out the recycle effect" is about the EFFECT executing at
 * resolution, which is still true. Its actual SUBJECT ("Kill this" is the activation cost, an outside kill
 * grants no recycle) is unaffected and still asserted below. Do not flip the timing back.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const ACCEPTABLE_LOSSES = "ogn-179-298";
const JUNK = (n: number) => ({ cardType: "unit", energyCost: 2, might: 2, name: `Junk ${n}` }) as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P1 has the Forge on board and Acceptable Losses in hand (1 energy); both trashes hold some cards. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, FORGE, "forge")
    .trash(P1, JUNK(1), "j1")
    .trash(P1, JUNK(2), "j2")
    .trash(P2, JUNK(3), "j3")
    .hand(P1, ACCEPTABLE_LOSSES, "losses");
}

describe("Ruling 2f2fb3a61bb3446a — 'Kill this:' is Forge of the Future's own activation cost", () => {
  test("the activated ability is offered in P1's open main phase and its only cost object is the Forge itself — no other card needed", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "forge")).toBe(true);
    const opt = game.p1.option("activate", "forge");
    const sac = opt?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options).toEqual(["forge"]);
  });

  test("activating: the Forge is in the trash IMMEDIATELY (cost paid) while the recycle ability waits on the chain; the opponent gets priority to react before it resolves", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash"); // cost paid up front
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forge", controller: P1, triggered: false, type: "ability" })]);
    // 402.2 — the set is named first, before anyone receives Priority (355.13: naming nothing is legal).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.decline();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may react
    expect(game.zoneOf("j1")).toBe("trash"); // nothing recycled yet
  });

  // MIGRATED 2026-08-12: was "after both pass it resolves: P1 picks … (the dead Forge itself included)".
  // See the RULING-CONFLICT note at the top of the file — do not flip it back.
  test("P1 names up to 4 cards from ANY trash as the ability is finalized (never the Forge itself) and they are recycled into their owners' decks when it resolves", async () => {
    const game = await board().build();
    await game.p1.activate("forge");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 3, min: 0, seat: P1, timing: "FIN" });
    expect((d as Pick).options.map((o) => o.card ?? o.key).sort()).toEqual(["j1", "j2", "j3"]);
    await game.p1.pick("j1", "j2", "j3");
    await game.settle();
    expect(game.zoneOf("j1")).toBe("mainDeck");
    expect(game.zoneOf("j2")).toBe("mainDeck");
    expect(game.zoneOf("j3")).toBe("mainDeck");
    expect(game.p2.deck()).toContain("j3"); // recycled into its OWNER's deck
    expect(game.zoneOf("forge")).toBe("trash"); // not picked
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — killed from OUTSIDE (Acceptable Losses): the Forge just dies; no recycle ability goes on the chain, P1 is never asked to pick, trashes untouched", async () => {
    const game = await board().build();
    await game.p1.cast("losses"); // rule 355.10.e — nothing named at play time; P1's only gear (the Forge) binds on resolution, P2 has none
    // Resolve; each player kills one of their gear — P1's only gear is the Forge, P2 has none.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "forge")) {
        await game.p1.pick("forge");
      } else {
        break;
      }
    }
    expect(game.zoneOf("losses")).toBe("trash");
    expect(game.zoneOf("forge")).toBe("trash");
    // No recycle: nothing on the chain, no reveal-and-pick pending, junk still in the trashes.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("j1")).toBe("trash");
    expect(game.zoneOf("j2")).toBe("trash");
    expect(game.zoneOf("j3")).toBe("trash");
    // And a dead Forge can no longer be activated.
    expect(game.p1.can("activate", "forge")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
