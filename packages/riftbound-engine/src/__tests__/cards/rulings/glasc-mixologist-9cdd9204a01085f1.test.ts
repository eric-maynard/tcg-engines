/**
 * Ruling 9cdd9204a01085f1 — Glasc Mixologist (SFD-165 → sfd-165-221) · 5 Might
 *     "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *      ignoring its cost."
 *   × Hidden Blade (OGN-213 → ogn-213-298) [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: I move Glasc into an EMPTY battlefield to conquer it and my opponent Hidden Blades him. Can the Deathknell
 *    play my trash unit onto that battlefield?
 * A: No. Moving into an empty battlefield opens a showdown; you do not control it until you actually conquer.
 *    Units may only be played to your base or a battlefield you control, so the Deathknell unit can only go to base.
 * Rules: 344 (showdown at an uncontrolled battlefield), 190.4 / 442 (control), 350.4 / 419 (a unit is played to
 *        base or a battlefield you control), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const HIDDEN_BLADE = "ogn-213-298";
const PEBBLE = { cardType: "unit", energyCost: 2, might: 2, name: "Pebble" } as const;

/**
 * P1's turn. bf1 is open (uncontrolled, empty); P1 also controls bf2 (held by a Sentry) so "a battlefield you control"
 * is a real alternative. P1: Glasc (5) ready in base, Pebble (2-cost unit) in trash. P2: Hidden Blade in hand + 2+[order].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", GLASC, "glasc")
    .trash(P1, PEBBLE, "pebble")
    .hand(P2, HIDDEN_BLADE, "blade")
    .resources(P2, { energy: 2, power: { order: 1 } });
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.card ?? o.key) : []);

function openShowdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);
}

/** Glasc walks into bf1; P1 passes focus; P2 Hidden Blades Glasc; both pass → it resolves; P1 accepts the Deathknell. */
async function bladeTheMixologist(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("glasc", "bf1");
  expect(openShowdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1?.controller).toBe(null); // NOT P1's yet
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "blade")).toBe(true);
  await game.p2.cast("blade", { targets: "glasc" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("glasc")).toBe("trash");
  return game;
}

describe("Ruling 9cdd9204a01085f1 — an attacker killed at an empty battlefield cannot Deathknell a unit onto it", () => {
  test("Hidden Blade kills Glasc at bf1 (P1 draws 2); the Deathknell goes on the chain as P1's optional trigger", async () => {
    const pre = await board().build();
    const handBefore = pre.p1.hand().length;
    const game = await bladeTheMixologist();
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // still not controlled by P1
  });

  test("accepting it: the Pebble may be played — but bf1 is NOT a legal destination (P1 never controlled it); base (and P1's own bf2) are", async () => {
    const game = await bladeTheMixologist();
    await game.p1.yes();
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    // Which unit: only the Pebble qualifies.
    if (game.decision()?.kind === "pick" && pickKeys(game.decision()).includes("pebble")) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("pebble");
    }
    // Where: P1 is asked, and bf1 is not on offer — base and P1's controlled bf2 are.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = pickKeys(d);
    expect(dests.some((k) => k === "bf1" || k === "battlefield-bf1")).toBe(false);
    expect(dests).toContain("base");
    expect(dests).toContain("battlefield-bf2");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("pebble")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // nobody conquered bf1
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("forcing the Pebble onto bf1 is rejected", async () => {
    const game = await bladeTheMixologist();
    await game.p1.yes();
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "pick" && pickKeys(game.decision()).includes("pebble")) {
      await game.p1.pick("pebble");
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const forced = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("pebble")).not.toBe("battlefield-bf1");
  });
});
