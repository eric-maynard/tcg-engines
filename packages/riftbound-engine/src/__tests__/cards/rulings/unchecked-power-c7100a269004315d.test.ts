/**
 * Ruling c7100a269004315d — Unchecked Power (OGN-123 → ogn-123-298) · Spell · [7][mind][mind]
 *     "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might · "[Assault 2] When you kill a unit with a spell, you may pay [1][fury]
 *     to play me from your trash."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · "Kill a unit at a battlefield. Its controller draws 2." (the answer's comparison)
 *
 * Q: When my Unchecked Power kills my own Immortal Phoenix at a battlefield, does the Phoenix's trigger happen in time for
 *    it to come back?
 * A: Yes. The Phoenix's ability is checked after the spell resolves — by then the Phoenix is in your trash and "you killed a
 *    unit with a spell" is true — so you may pay [1][fury] and play it from the trash. Same as Hidden Blade on your own Phoenix.
 * Rules: 383 / 385.2 (a trash-zone trigger evaluated after the killing spell finishes resolving), 359 (spell resolution),
 *        419 (play from a non-hand zone via permission).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P1's Phoenix alone at P1's bf1 (the only unit at any battlefield); P2's Sentry in base. */
function board(spell: string, resources: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, resources)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "base", { might: 3, name: "Sentry" }, "sentry")
    .hand(P1, spell, "spell");
}

/** Resolve the spell; expect the Phoenix (now in trash) to offer its pay-to-return; accept, resolve, play it to base. */
async function phoenixReturns(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority(); // the killing spell resolves
  expect(game.zoneOf("spell")).toBe("trash");
  expect(game.zoneOf("phoenix")).toBe("trash"); // it really died first…
  const d = game.decision();
  expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "phoenix" } }); // …and its trigger found it there
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true })]);
  await game.p1.yes();
  expect(game.p1.resources().energy).toBe(0);
  expect(game.p1.power("fury")).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority(); // the trigger resolves → play me from trash
  const dest = game.decision();
  if (dest?.kind === "pick" && dest.seat === P1) {
    expect(dest.options.map((o) => o.zone ?? o.key)).toContain("base");
    await game.p1.pick("base");
  }
  await game.settle();
  expect(game.zoneOf("phoenix")).toBe("base");
  expect(game.p1.units()).toContain("phoenix");
  expect(game.p1.trash()).toEqual(["spell"]);
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.violations()).toEqual([]);
}

describe("Ruling c7100a269004315d — your own spell killing your Phoenix at a battlefield still lets it rise from the trash", () => {
  test("Unchecked Power ([7][mind][mind] + [1][fury] kept back): the Phoenix at bf1 takes 12 and dies; AFTER the spell resolves its trigger offers 'pay [1][fury] to play me from your trash'; paying brings it back onto the board", async () => {
    const game = await board(UNCHECKED_POWER, { energy: 8, power: { fury: 1, mind: 2 } }).build();
    await game.p1.cast("spell");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", controller: P1 })]);
    await phoenixReturns(game);
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "base" }); // "at battlefields" only
  });

  test("declining is allowed ('you may'): the Phoenix just stays in the trash and nothing is paid", async () => {
    const game = await board(UNCHECKED_POWER, { energy: 8, power: { fury: 1, mind: 2 } }).build();
    await game.p1.cast("spell");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, mind: 0 } });
  });

  test("same with Hidden Blade on your own Phoenix ([2][order] + [1][fury]): it dies, P1 (its controller) draws 2, then the trigger lets P1 pay and replay it", async () => {
    const game = await board(HIDDEN_BLADE, { energy: 3, power: { fury: 1, order: 1 } }).build();
    const hand = game.p1.hand().length;
    await game.p1.cast("spell", { targets: "phoenix" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await phoenixReturns(game);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
  });
});
