/**
 * Ruling 2daa48c9253a6614 — Singularity (OGN-105 → ogn-105-298) · Spell · Mind · 6+[mind][mind] · "Deal 6 to each of up to two units."
 *   × Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · 5 · 5 Might
 *     "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *
 * Q: Mixologist is alone at a battlefield and dies to Singularity — can I play the Deathknell unit back to that same
 *    battlefield? What if I have another unit there?
 * A: Yes in both cases. Deathknell is a triggered ability placed on the chain after the Mixologist has left play;
 *    when it resolves you may play the unit from trash to that battlefield (keeping control of it). With another
 *    unit there you never lost control anyway.
 * Rules: 322.3 / 383.3 (triggered ability → chain), 383.3.a ("you may" decided at finalization), Deathknell keyword.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const GLASC = "sfd-165-221";
const CHEAP = { cardType: "unit", energyCost: 2, might: 2, name: "Cheap Body" } as const;
const PRICEY = { cardType: "unit", energyCost: 5, might: 5, name: "Pricey Body" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 controls bf1 with Glasc Mixologist (+ optionally a Buddy); P1's trash: a 2-cost and a 5-cost unit. */
function board(withBuddy: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC, "glasc");
  if (withBuddy) {
    s.unit(P1, "bf1", { might: 7, name: "Buddy" }, "buddy");
  }
  return s.trash(P1, CHEAP, "cheap").trash(P1, PRICEY, "pricey").hand(P2, SINGULARITY, "sing");
}

/** Singularity on Glasc resolves; Glasc dies; P1 opts into Deathknell; the trigger resolves → P1 is asked which unit. */
async function killGlascAndOptIn(game: Game): Promise<void> {
  await game.p2.cast("sing", { targets: ["glasc"] });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Singularity resolves: 6 ≥ 5 → Glasc dies
  expect(game.zoneOf("glasc")).toBe("trash");
  expect(game.zoneOf("sing")).toBe("trash");
  // Deathknell: "You may …" is the first part of the effect → asked at finalization (383.3.a).
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "glasc" } });
  await game.p1.yes();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
  // Reaction window on the trigger, then it resolves.
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "glasc"); i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  // Only the ≤3-cost unit qualifies.
  expect((d as Pick).options.map((o) => o.card ?? o.key)).toEqual(["cheap"]);
  await game.p1.pick("cheap");
}

describe("Ruling 2daa48c9253a6614 — Glasc Mixologist's Deathknell unit may be played to the battlefield where it died", () => {
  test("(1) Mixologist ALONE at bf1: after it dies the Deathknell trigger resolves and bf1 is offered as a destination; the unit lands there free and P1 controls bf1", async () => {
    const game = await board(false).build();
    await killGlascAndOptIn(game);
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    expect((dest as Pick).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["cheap"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("pricey")).toBe("trash"); // over the cost cap, never offered
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(2) with ANOTHER friendly unit at bf1: control was never lost; bf1 is again a legal destination and the unit joins the Buddy there", async () => {
    const game = await board(true).build();
    await killGlascAndOptIn(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Buddy kept it
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    expect((dest as Pick).options.map((o) => o.key)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["buddy", "cheap"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
