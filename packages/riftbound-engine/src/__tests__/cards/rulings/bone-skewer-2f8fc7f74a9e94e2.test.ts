/**
 * Ruling 2f8fc7f74a9e94e2 — Bone Skewer (UNL-139 → unl-139-219) · [Hidden] · [2][chaos]
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play
 *    that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *
 * Q: Can Bone Skewer choose a unit sitting in the opponent's Champion Zone?
 * A: No. The Champion Zone is its own zone; it is not the hand. Bone Skewer says "choose a unit from
 *    it" — "it" being the revealed HAND — so a champion parked in the Champion Zone is not eligible.
 * Rules: 811 / 116 (the Champion Zone is a distinct zone, playable-from but not part of the hand),
 *        355.9 (only objects the instruction names are legal choices).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const WARWICK = "ogn-159-298"; // champion unit, 5 Might — parked in P2's Champion Zone
const SKULKER = "ogn-175-298"; // plain 3-Might unit — in P2's hand

/**
 * P1's turn with exactly [2][chaos]. P2 holds bf1 with a Holder; P2's hand has a Skulker (a unit)
 * and a blank spell, and Warwick waits in P2's Champion Zone.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .champion(P2, WARWICK, "warwick")
    .hand(P2, SKULKER, "skulker")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Blank Spell" }, "blank")
    .hand(P1, BONE_SKEWER, "skewer");
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/** Cast Bone Skewer naming bf1 and drive to the "choose a unit from the revealed hand" prompt. */
async function toUnitPick(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("skewer", { answers: ["bf1"] });
  let stop = await game.settle();
  if (stop.reason === "unanswered" && offered(game.decision()).includes("bf1")) {
    await game.p1.pick("bf1");
    stop = await game.settle();
  }
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

describe("Ruling 2f8fc7f74a9e94e2 — Bone Skewer sees the opponent's HAND; the Champion Zone is out of reach", () => {
  test("premise: Warwick really is in P2's Champion Zone, not in P2's hand", async () => {
    const game = await board().build();
    expect(game.zoneOf("warwick")).toBe("championZone");
    expect(game.p2.champion()).toBe("warwick");
    expect(game.p2.hand().toSorted()).toEqual(["blank", "skulker"]);
  });

  test("ruling: the offered units are the hand's units only — the Skulker is there, the champion-zone Warwick is not (nor the spell)", async () => {
    const game = await toUnitPick();
    const keys = offered(game.decision());
    expect(keys).toContain("skulker");
    expect(keys).not.toContain("warwick");
    expect(keys).not.toContain("blank");
  });

  test("…and the pick works on the hand unit: P2 plays the Skulker to bf1 for free, stunned, while Warwick stays in the Champion Zone", async () => {
    const game = await toUnitPick();
    await game.p1.pick("skulker");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isStunned: true, owner: P2 });
    expect(game.zoneOf("warwick")).toBe("championZone");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // "ignoring any and all costs"
    expect(game.zoneOf("skewer")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("negative space: with the hand holding no unit at all, only the champion-zone Warwick, nothing is playable off Bone Skewer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
      .champion(P2, WARWICK, "warwick")
      .hand(P2, { cardType: "spell", energyCost: 1, name: "Blank Spell" }, "blank")
      .hand(P1, BONE_SKEWER, "skewer")
      .build();
    await game.p1.cast("skewer", { answers: ["bf1"] });
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      const keys = offered(game.decision());
      expect(keys).not.toContain("warwick");
      if (stop.reason !== "unanswered") {
        break;
      }
      if (keys.includes("bf1")) {
        await game.p1.pick("bf1");
        continue;
      }
      if (game.decision()?.kind === "pick") {
        await game.p1.decline();
        continue;
      }
      break;
    }
    expect(game.zoneOf("warwick")).toBe("championZone");
    expect(game.p2.units("bf1")).toEqual(["holder"]);
    expect(game.zoneOf("skewer")).toBe("trash");
  });
});
