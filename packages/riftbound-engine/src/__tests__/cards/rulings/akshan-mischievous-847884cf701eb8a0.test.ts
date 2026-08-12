/**
 * Ruling 847884cf701eb8a0 — Akshan, Mischievous (SFD-109 → sfd-109-221) · Unit · Body · [4] · 4 Might
 *     "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid the
 *      additional cost, move an enemy gear to your base. You control it until I leave the board. …"
 *
 * Q: Two Akshans steal the same gear off each other and then both die — who controls it?
 * A: Control is recomputed from the effects still applying, in timestamp order, later over earlier. A
 *    control-change effect ending does not "hand the object back"; it simply stops applying. So while P2's
 *    (later) effect lives it wins; when both are gone the gear is back with its owner.
 * Rules: 390.4 / 477.1.a (a duration-bound control change), 613 (layers recomputed continuously, later timestamp
 *        wins), 110.2 (with no control effect, the owner controls it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
/** An inert gear so nothing but the control effects is in play. */
const TRINKET = { cardType: "gear", domain: "order", energyCost: 2, name: "Test Trinket" } as const;
/** Inline [Reaction] bolt, lethal to a 4-Might Akshan. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "reaction",
} as const;

/** P1's turn. The Trinket is P2's (owner + controller). Both players hold an Akshan; P2 also holds two bolts. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .gear(P2, TRINKET, "trinket")
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .hand(P1, AKSHAN, "ak1")
    .hand(P2, AKSHAN, "ak2")
    .hand(P2, BOLT, "bolt1")
    .hand(P2, BOLT, "bolt2");
}

/** Play `akshan` for `seat` paying the [body][body] extra, and take the Trinket. */
async function stealWith(game: Game, seat: string, akshan: string): Promise<void> {
  const hand = game.seat(seat);
  await hand.play(akshan, { payOptional: true, to: "base" });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === seat) {
    await hand.pick("trinket");
    await game.settle();
  }
}

/** P1 steals it on their turn; then on P2's turn P2 steals it straight back (later timestamp). */
async function bothSteals(): Promise<Game> {
  const game = await board().build();
  expect(game.state("trinket")).toMatchObject({ controller: P2, owner: P2 });
  await stealWith(game, P1, "ak1");
  expect(game.state("trinket").controller).toBe(P1);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 4, power: { body: 2 } });
  await stealWith(game, P2, "ak2");
  expect(game.state("trinket").controller).toBe(P2);
  return game;
}

/** P2 bolts `victim` dead. */
async function bolt(game: Game, spell: string, victim: string): Promise<void> {
  await game.p2.cast(spell, { targets: victim });
  await game.settle();
  expect(game.zoneOf(victim)).toBe("trash");
}

describe("Ruling 847884cf701eb8a0 — two Akshans over one gear: control is recomputed, never handed back", () => {
  test("setup: P1's Akshan takes P2's Trinket, then P2's Akshan takes it back — the later effect wins", async () => {
    const game = await bothSteals();
    expect(game.state("trinket")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.gear()).toContain("trinket");
    expect(game.p1.gear()).not.toContain("trinket");
  });

  test("P1's Akshan dies first: its (earlier) effect stops applying, but P2's still does — P2 keeps the Trinket", async () => {
    const game = await bothSteals();
    await bolt(game, "bolt1", "ak1");
    expect(game.state("trinket").controller).toBe(P2);
    expect(game.p2.gear()).toContain("trinket");
  });

  test("then P2's Akshan dies too: with no control effect left the Trinket is simply back with its owner, P2 — it does not bounce to P1", async () => {
    const game = await bothSteals();
    await bolt(game, "bolt1", "ak1");
    await bolt(game, "bolt2", "ak2");
    expect(game.state("trinket")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p1.gear()).not.toContain("trinket");
    expect(game.violations()).toEqual([]);
  });

  test("the other order — P2's (later) Akshan dies while P1's still stands: P1's earlier effect is applying again, so P1 controls it", async () => {
    const game = await bothSteals();
    await bolt(game, "bolt2", "ak2");
    expect(game.zoneOf("ak1")).toBe("base"); // P1's Akshan is still around
    expect(game.state("trinket").controller).toBe(P1);
    await bolt(game, "bolt1", "ak1");
    expect(game.state("trinket")).toMatchObject({ controller: P2, owner: P2 }); // back to the owner
  });
});
