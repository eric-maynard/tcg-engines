/**
 * Ruling 984862c2d74cbb58 — Unchecked Power (OGN-123 → ogn-123-298) · 7 + [mind][mind]
 *     "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "[Hidden] If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."
 *
 * Q: I cast Unchecked Power outside any showdown; my opponent has a Zhonya's hidden at one battlefield. Can they still
 *    save the unit there?
 * A: Yes. They may flip the hidden Hourglass in the reaction window before Unchecked Power resolves (hidden cards flip
 *    whenever a Reaction could be played). The 12 damage is simultaneous, so all lethal units die at once and the
 *    Hourglass's controller chooses which single death it replaces.
 * Rules: 811 (flip a hidden card at Reaction speed), 370.1.a.2 (simultaneous), 371–373 (replacement; controller assigns).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const ZHONYAS = "ogn-077-298";

/**
 * Turn 3, P1 active (no showdown) with exactly 7 + [mind]×2. P2 holds bf1 with Yak (3) — a facedown Zhonya's is hidden
 * there — and bf2 with Ox (4). P1's own Idler (2) sits in base (only exhausted, not damaged).
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Yak" }, "yak")
    .unit(P2, "bf2", { might: 4, name: "Ox" }, "ox")
    .facedown(P2, "bf1", ZHONYAS, "zhonyas")
    .unit(P1, "base", { might: 2, name: "Idler" }, "idler")
    .hand(P1, UNCHECKED_POWER, "up");
}

/** P1 casts Unchecked Power and passes; P2 flips the hidden Hourglass in response, then lets the spell resolve. */
async function powerWithFlip(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("up");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["up"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zhonyas")).toBe(true);
  await game.p2.reveal("zhonyas");
  expect(game.state("zhonyas")).toMatchObject({ controller: P2, isHidden: false, zone: "base" });
  return game;
}

/** Pass priority around until something other than a chain-priority prompt shows up. */
async function resolveChain(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      return d;
    }
  }
  return game.decision();
}

describe("Ruling 984862c2d74cbb58 — a hidden Zhonya's flipped in response to Unchecked Power still saves one unit", () => {
  test("outside any showdown, with Unchecked Power on the chain, P2 gets a reaction window and may flip the facedown Hourglass there (it becomes a face-up gear in P2's base, for 0)", async () => {
    const game = await powerWithFlip();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toContain("up"); // the spell hasn't resolved yet
    expect(game.state("yak").damage).toBe(0);
  });

  test("ruling 984862c2d74cbb58 — Unchecked Power resolves: 12 to Yak AND Ox at once → both deaths are simultaneous and P2 (the Hourglass's controller) is asked which one it replaces", async () => {
    const game = await powerWithFlip();
    const d = await resolveChain(game);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ox", "yak"]);
    expect(game.state("idler")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" }); // friendly units only exhausted
  });

  test("P2 saves the Yak (the unit at the Hourglass's old battlefield): Hourglass killed instead, Yak healed/exhausted/recalled to base; the Ox dies", async () => {
    const game = await powerWithFlip();
    await resolveChain(game);
    await game.p2.pick("yak");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("ox")).toBe("trash");
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…or the Ox — the flipped Hourglass is not tied to the battlefield it was hidden at; it is P2's choice", async () => {
    const game = await powerWithFlip();
    await resolveChain(game);
    await game.p2.pick("ox");
    await game.settle();
    expect(game.state("ox")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
  });

  test("contrast: if P2 doesn't flip it, the still-hidden Hourglass replaces nothing — both units die, no choice offered", async () => {
    const game = await board().build();
    await game.p1.cast("up");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.zoneOf("ox")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
  });
});
