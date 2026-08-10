/**
 * Ruling 01bfb37256a959cd — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might
 *     "[Hidden] … When you play me, you may choose a unit you control at another location. Move me to its location and
 *      it to my original location."
 *
 * Q: Can Tideturner be flipped during a showdown to swap with a unit that is about to lose the combat? Timing/location limits?
 * A: Yes — whenever you have priority during the showdown you may play it from facedown; it trades places with the chosen
 *    unit, which lands at the battlefield where Tideturner was hidden (saving it), while Tideturner will likely die in its
 *    place. Tideturner can only be hidden at a battlefield you CONTROL, never in base.
 * Rules: 811 (Hidden: hide at a battlefield you control; play later with Reaction timing), 811.1.d.2 (Tideturner's
 *        "another location" exempts it from the hidden-here targeting rule), 464.2.c.3.a (arrivals gain designations).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * P2's turn 3. P1 holds bf1 with a Brawler (3) and bf2 with a Holder (2) + Tideturner facedown there. P2's Raider (5)
 * is about to attack bf1 — a fight the Brawler would lose.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Brawler" }, "brawler")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf2", TIDETURNER, "tide")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** Raider attacks bf1; P2 passes Focus; P1 (now with priority) flips Tideturner at bf2, opts in and names the Brawler. */
async function flipForBrawler(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("brawler").combatRole).toBe("defender");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.zoneOf("tide")).toBe("battlefield-bf2");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(game.decision())).toContain("brawler");
    expect(pickCards(game.decision())).not.toContain("holder"); // same location as Tideturner — not "another location"
    await game.p1.pick("brawler");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tide", controller: P1, targets: ["brawler"], triggered: true })]);
  return game;
}

describe("Ruling 01bfb37256a959cd — Tideturner flipped mid-showdown rescues the unit in combat", () => {
  test("during the showdown, once P1 has priority, playing Tideturner from facedown at bf2 is legal and its play trigger targets the Brawler fighting at bf1", async () => {
    await flipForBrawler();
  });

  test("the swap resolves: the Brawler moves to bf2 (where Tideturner was hidden) and leaves combat; Tideturner takes its place at bf1 as the defender", async () => {
    const game = await flipForBrawler();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("brawler")).toBe("bf2");
    expect(game.state("brawler").combatRole ?? null).toBeNull();
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.state("tide").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
  });

  test("outcome: the Brawler is saved (alive at bf2, undamaged) while Tideturner (2) dies to the Raider (5), who conquers bf1", async () => {
    const game = await flipForBrawler();
    await game.settle();
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.state("brawler")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("hiding restriction: from hand Tideturner may be hidden only at a battlefield P1 CONTROLS (bf2) — not at base, not at the enemy's bf1", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Theirs" }, "theirs")
      .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
      .hand(P1, TIDETURNER, "tide")
      .build();
    const to = game.p1.option("hide", "tide")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toEqual(["bf2"]);
    expect((await game.p1.try((p) => p.hide("tide", "base"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.hide("tide", "bf1"))).ok).toBe(false);
    await game.p1.hide("tide", "bf2");
    expect(game.zoneOf("tide")).toBe("facedown-bf2");
    expect(game.p1.power()).toBe(0);
  });
});
