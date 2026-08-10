/**
 * Ruling 73dbd506989be4be — Star Spring (UNL-215 → unl-215-219) · Battlefield · "The first time a player plays a non-token unit
 *   here each turn, they may move another unit they control here to its base."   × Hidden Blade (OGN-213 → ogn-213-298) ·
 *   [Hidden][Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: My unit is at Star Spring; the opponent attacks and Hidden Blades it. In response I Ambush a unit in, Star Spring triggers
 *    and I pull the targeted unit back to base. Does Hidden Blade still make me draw 2?
 * A: No. When Hidden Blade resolves its target is no longer "a unit at a battlefield" → illegal target; it cannot determine
 *    "its controller", so neither the kill nor the draw happens.
 * Rules: 355.11 / 359.3.f.2.a (illegal target on resolution → instructions ignored), 359.3.e.14 (linked "its controller
 *        draws 2"), 812 (Ambush = play as a Reaction to a battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const HIDDEN_BLADE = "ogn-213-298";
const AMBUSHER = { cardType: "unit", energyCost: 2, keywords: ["Ambush"], might: 2, name: "Ambusher" } as const;

/**
 * P2's turn 3. P1 controls the live Star Spring ("ss") with a 3-Might Victim there; an Ambusher in hand + [2].
 * P2: a 4-Might Raider in base and Hidden Blade in hand with 2 + [order]. P1's deck top is known (d1, d2, …).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("ss", { controller: P1, def: STAR_SPRING, inert: false })
    .unit(P1, "ss", { might: 3, name: "Victim" }, "victim")
    .hand(P1, AMBUSHER, "ambusher")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Raider attacks ss; P2 (Focus) Hidden Blades the Victim and passes priority to P1. */
async function bladeAtVictim(game: Game): Promise<void> {
  await game.p2.move("raider", "ss");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("blade", { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["victim"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

/** P1 Ambushes into ss; Star Spring asks P1; P1 sends the Victim home. Stops with Hidden Blade still on the chain. */
async function ambushAndSpringVictimHome(game: Game): Promise<void> {
  expect(game.p1.can("play", "ambusher")).toBe(true);
  const where = game.p1.option("playUnit", "ambusher")?.fields.find((f) => f.name === "location")?.options ?? [];
  expect(where).toContain("battlefield-ss");
  await game.p1.play("ambusher", { to: "ss" });
  expect(game.p1.energy()).toBe(0);
  let asked = false;
  for (let i = 0; i < 12 && game.chain().some((c) => c.cardId === "blade") && game.locationOf("victim") !== "base"; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      asked = true;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      asked = true;
      expect(d.options.map((o) => o.card ?? o.key)).toContain("victim");
      await game.p1.pick("victim");
    } else if (d?.kind === "action" && d.context === "chain") {
      // Only pass while something OTHER than the Blade is on top (never let the Blade resolve here).
      if (game.chain().at(-1)?.cardId === "blade") {
        break;
      }
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(asked).toBe(true); // Star Spring's "may" was P1's decision
  expect(game.zoneOf("ambusher")).toBe("battlefield-ss");
  expect(game.locationOf("victim")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toContain("blade"); // still pending
}

describe("Ruling 73dbd506989be4be — Star Spring pulls the Hidden Blade target home: no kill, no draw", () => {
  test("baseline: unanswered, Hidden Blade kills the Victim at Star Spring and P1 (its controller) draws 2", async () => {
    const game = await board().build();
    await bladeAtVictim(game);
    await game.p1.passPriority();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["ambusher", "d1", "d2"]);
  });

  test("P1 Ambushes a unit into Star Spring in response; the Spring triggers for P1 ('you may') and P1 moves the Victim to base while the Blade is still on the chain", async () => {
    const game = await board().build();
    await bladeAtVictim(game);
    await ambushAndSpringVictimHome(game);
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("Hidden Blade then resolves against a unit no longer at a battlefield: the Victim is NOT killed and P1 does NOT draw 2 (Blade to trash, P2's cost still spent)", async () => {
    const game = await board().build();
    await bladeAtVictim(game);
    await ambushAndSpringVictimHome(game);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.hand()).toEqual([]); // Ambusher was played; NO "draw 2"
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]); // and certainly not P2 either
    // The fight goes on: Raider 4 vs Ambusher 2.
    await game.settle();
    expect(game.zoneOf("ambusher")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
