/**
 * Ruling f976dabe598ed311 — Stupefy (OGN-095 → ogn-095-298) · [Reaction] · Mind · [1]
 *     "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: How does the chain work when several reactions are played, and how does priority behave while the chain is
 *    built and while it resolves?
 * A: Priority only passes when a player chooses to pass, so one player may add several reactions in a row (and
 *    may even respond to their own spell). The chain resolves last-in-first-out, and after each item resolves
 *    there is a fresh priority window before the next one does. With the chain empty outside a showdown, the
 *    turn player is the one holding priority again.
 * Rules: 336/337 (the chain and LIFO resolution), 340.1-340.4 (priority is retained until passed; a window after
 *        each resolution), 419.2 (Reaction speed is what lets you add to a non-empty chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn. P2 holds bf1 with a Victim (2). P1's Alpha (3) and Beta (3) are in base and are what P2's two
 * Stupefys will shrink. P1 also holds a Stupefy of their own, to show a player may answer their own spell.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 3, name: "Alpha" }, "alpha")
    .unit(P1, "base", { might: 3, name: "Beta" }, "beta")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, STUPEFY, "ownStupefy")
    .resources(P1, { energy: 3, power: { order: 1 } })
    .hand(P2, STUPEFY, "s1")
    .hand(P2, STUPEFY, "s2")
    .resources(P2, { energy: 2 });
}

/** P1 casts the Blade; P2 then stacks both Stupefys while holding priority. */
async function buildChain(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "victim" });
  await game.p1.passPriority();
  await game.p2.cast("s1", { targets: "alpha" });
  await game.p2.cast("s2", { targets: "beta" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "s1", "s2"]);
}

describe("Ruling f976dabe598ed311 — chain building holds priority; resolution is LIFO with a window after each item", () => {
  test("the caster keeps priority after their own spell and may even answer it themselves", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ownStupefy")).toBe(true); // responding to your own spell is legal
  });

  test("one player may add several reactions before passing: both Stupefys go on above the Blade", async () => {
    const game = await board().build();
    await buildChain(game);
    expect(game.chain()[2]).toMatchObject({ cardId: "s2", controller: P2 });
    expect(game.state("alpha").might).toBe(3); // nothing has resolved yet
    expect(game.state("beta").might).toBe(3);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("resolution is last-in-first-out: Stupefy 2 (Beta) resolves first, and there is a priority window before Stupefy 1", async () => {
    const game = await board().build();
    await buildChain(game);
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("beta").might).toBe(2); // the TOP item resolved …
    expect(game.state("alpha").might).toBe(3); // … the one under it did not
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // "Draw 1"
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "s1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a fresh window, not an auto-cascade
  });

  test("then Stupefy 1 (Alpha), then the Blade at the bottom — the whole chain unwinds in reverse order", async () => {
    const game = await board().build();
    await buildChain(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // s2
    await game.acting().passPriority();
    await game.acting().passPriority(); // s1
    expect(game.state("alpha").might).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // the Blade is still waiting
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("with the chain empty outside a showdown, priority is back with the turn player in an open main phase", async () => {
    const game = await board().build();
    await buildChain(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("alpha").might).toBe(2);
    expect(game.state("beta").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
