/**
 * Ruling 0e99ecc4f6f6ccec — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · [4][chaos] · 4 Might
 *     "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *      for [rainbow]."
 *   × Teemo, Strategist (ogn-121-298) · 2 Might · "[Hidden] When I defend, choose an enemy unit here and reveal the top 5
 *     cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the rest."
 *
 * Q: Teemo, Strategist defends and its trigger reveals Nocturne — can Nocturne be played directly to the defended battlefield?
 * A: Yes: you still control that battlefield until the combat ends, so it is "a battlefield you control". Nuance: if Teemo
 *    is only a surprise defender at a battlefield you DON'T control, Nocturne can't be played there.
 * Rules: 190.4.b (control persists through the combat), 143.3 / 355.4 (units may be played to a battlefield you
 *        control), 464.2.c.3.a (late arrivals join as defenders), Nocturne's reveal replacement.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const SKULKER = "ogn-175-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3. P1 holds bf1 with a face-up Teemo, Strategist (2) and a 5-Might Anchor; P1 also holds bf3 (Mine 1).
 * P1's deck (top first): Skulker, Nocturne, 4 Skulkers; P1 floats exactly ONE power, no energy. P2's Raider (3) attacks bf1.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "bf3", { might: 1, name: "Mine" }, "mine")
    .deck(P1, [SKULKER, NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER], ["s0", "noc", "s1", "s2", "s3", "s4"])
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Raider attacks bf1 → Teemo defends; its trigger (aimed at Raider) is passed through and starts resolving: the top 5 are revealed. */
async function teemoRevealsNocturne(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  expect(game.state("teemo").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Accept "banish me" and "play me"; return the destination prompt. */
async function acceptUpToDestination(game: Game): Promise<PickD> {
  const banish = game.decision();
  expect(banish).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes();
  expect(game.zoneOf("noc")).toBe("banishment"); // "if you do …"
  const play = game.decision();
  expect(play).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes();
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "noc" } });
  expect((dest as PickD).prompt).toMatch(/destination/i);
  return dest as PickD;
}

describe("Ruling 0e99ecc4f6f6ccec — Nocturne found by defending Teemo may be played straight onto the defended battlefield", () => {
  test("as the trigger reveals Nocturne, P1 is offered to banish it and then to play it; the destination offer INCLUDES bf1 — the battlefield being defended, still P1's mid-combat — besides base and P1's other battlefield, never P2's bf2", async () => {
    const game = await board().build();
    await teemoRevealsNocturne(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    const dest = await acceptUpToDestination(game);
    const keys = dest.options.map((o) => o.zone ?? o.key).sort();
    expect(keys).toEqual(["base", "battlefield-bf1", "battlefield-bf3"]);
  });

  test("choosing bf1: Nocturne is played there for exactly the one floating power (not [4][chaos]), joins the ongoing combat as a DEFENDER, and the defence holds (Raider 3 dies into 2+5+4); P1 keeps bf1", async () => {
    const game = await board().build();
    await teemoRevealsNocturne(game);
    await acceptUpToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("noc").combatRole).toBe("defender");
    expect(game.p1.banishment()).not.toContain("noc");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("raider").damage ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — surprise defence at a battlefield P1 does NOT control (uncontrolled bf1 where P1's Teemo and a P2 Squatter both stand; Raider moves in): Teemo still defends and finds Nocturne, but bf1 is NOT among the places it may be played (only base / P1's own bf3)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P1 })
      .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
      .unit(P2, "bf1", { might: 1, name: "Squatter" }, "squatter")
      .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "bf3", { might: 1, name: "Mine" }, "mine")
      .deck(P1, [SKULKER, NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER], ["s0", "noc", "s1", "s2", "s3", "s4"])
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await teemoRevealsNocturne(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
    const dest = await acceptUpToDestination(game);
    const keys = dest.options.map((o) => o.zone ?? o.key).sort();
    expect(keys).not.toContain("battlefield-bf1");
    expect(keys).toEqual(["base", "battlefield-bf3"]);
    await game.p1.pick("base");
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0);
  });
});
