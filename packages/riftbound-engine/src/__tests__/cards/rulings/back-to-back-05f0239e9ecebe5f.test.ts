/**
 * Ruling 05f0239e9ecebe5f — Back to Back (OGN-206 → ogn-206-298) · Spell · Order · [3] · [Reaction]
 *     "Give two friendly units each +2 [Might] this turn."
 *   (+ Watchful Sentry OGN-096 → ogn-096-298 · 1 Might · "[Deathknell] — Draw 1." for the trigger case.)
 *
 * Q: Is there a window to play Actions/Reactions in a showdown after combat damage is dealt and units have died?
 * A: Generally no. After both players pass, damage is dealt and — if nothing triggers — the showdown ends immediately, no
 *    priority. Only if the damage/deaths produce a triggered ability (e.g. Deathknell) does a chain exist, and with it a
 *    window to play Reactions in response.
 * Rules: 465–467 (combat damage → cleanup → resolution, no priority step), 336/339 (a chain grants priority), FAQ #492/#3757.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BACK_TO_BACK = "ogn-206-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn. P2 controls bf1 with two 3-Might Guards and holds Back to Back with [3]. P1's Raider (4) attacks. */
function plainBoard() {
  return scenario()
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard A" }, "ga")
    .unit(P2, "bf1", { might: 3, name: "Guard B" }, "gb")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, BACK_TO_BACK, "b2b");
}

/** Same, but one defender is Watchful Sentry (Deathknell — Draw 1) so a death produces a trigger. */
function deathknellBoard() {
  return scenario()
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "bf1", { might: 5, name: "Big Guard" }, "gb")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, BACK_TO_BACK, "b2b");
}

describe("Ruling 05f0239e9ecebe5f — no play window after combat damage unless something triggers", () => {
  test("during the showdown (before damage) P2 CAN of course play Back to Back — that is the last window", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "b2b")).toBe(true);
  });

  test("no triggers: once both pass, damage is dealt (Raider 4 kills Guard A; the Guards' 6 kill the Raider) and the showdown ends IMMEDIATELY — the very next decision is P1's open main phase; P2 never got a window and still holds Back to Back + [3]", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ ga: 3, gb: 1 });
    }
    // Straight from damage to the end of the showdown: no chain, no showdown, main phase.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("gb")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 1 marked, healed at combat cleanup
    expect(game.p2.can("cast", "b2b")).toBe(false); // a Reaction still needs priority — there is none to be had now
    expect(game.zoneOf("b2b")).toBe("hand");
    expect(game.p2.energy()).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("WITH a trigger: the Sentry dies to combat damage → its Deathknell goes on the chain → now there IS a priority window in which P2 may play the Reaction Back to Back (on its surviving units) before the showdown wraps up", async () => {
    const game = await deathknellBoard().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ gb: 3, sentry: 1 });
    }
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("battlefield-bf1"); // 3 < 5
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    // Walk priority to P2 if P1 holds it first.
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "b2b")).toBe(true);
    const hand0 = game.p2.hand().length;
    await game.p2.cast("b2b", { targets: ["gb", "reserve"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry", "b2b"]);
    await game.settle();
    expect(game.zoneOf("b2b")).toBe("trash");
    expect(game.state("reserve").might).toBe(4); // 2 + 2 this turn
    expect(game.state("gb").might).toBe(7);
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1); // Back to Back left, Deathknell drew 1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
