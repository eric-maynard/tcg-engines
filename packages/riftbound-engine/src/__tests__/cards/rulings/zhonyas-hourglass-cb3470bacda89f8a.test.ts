/**
 * Ruling cb3470bacda89f8a — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   (Tideturner OGN-199 is cited only as another card that side-steps the "here" rule for hidden cards.)
 *
 * Q: Zhonya's hidden at a battlefield and flipped as a reaction — does it only protect units at THAT battlefield, or does
 *    it go to base and save the next unit killed anywhere?
 * A: Played from facedown it goes straight to your base (gear can't be at a battlefield) and then replaces the next
 *    friendly death regardless of location. Keeping it hidden lets you be selective (flip in response to the spell you
 *    care about); the "here" restriction never applies because it is never at that battlefield.
 * Rules: 811 (playing a Hidden card as a Reaction for [0]), 811.1.d.1 / 518 (gear from hidden ends up in base),
 *        372/373 (replacement effect applies to the next qualifying event anywhere).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298"; // Deal 4 to a unit at a battlefield. Draw 1.
/** Inline "Deal 4 to a unit." (any location) — for the death-in-base variant. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/**
 * P1's turn. P2 holds bf1 (Keeper 3, Zhonya's facedown there) and bf2 (Yak 4), with a 2-Might Xerus in base.
 * P1: Void Seeker ([3][fury]) + Bolt ([1]) with [4][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P2, "bf2", { might: 4, name: "Yak" }, "yak")
    .unit(P2, "base", { might: 2, name: "Xerus" }, "xerus")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, BOLT, "bolt");
}

/** P1 casts `spell` at `target` and passes; P2 flips the Hourglass hidden at bf1 in response. */
async function castAndFlip(spell: string, target: string): Promise<Game> {
  const game = await board().build();
  await game.p1.cast(spell, { targets: target });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  return game;
}

describe("Ruling cb3470bacda89f8a — a Zhonya's flipped from facedown goes to base and saves the next friendly death anywhere", () => {
  test("flipped at bf1 for [0] in response to Void Seeker: the gear is immediately in P2's BASE, face up, no longer facedown at bf1", async () => {
    const game = await castAndFlip("seeker", "yak");
    expect(game.p2.energy()).toBe(0);
    expect(game.state("zh")).toMatchObject({ isHidden: false, zone: "base" });
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.cardsAt("battlefield-bf1")).toEqual(["keeper"]); // never "at" the battlefield
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
  });

  test("Void Seeker then kills Yak at bf2 — a DIFFERENT battlefield from where the Hourglass was hidden — and Zhonya's still replaces the death: Hourglass to trash, Yak healed/exhausted/recalled", async () => {
    const game = await castAndFlip("seeker", "yak");
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.trash()).toEqual(["zh"]);
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("location truly doesn't matter: flipped in response to a Bolt at Xerus in BASE, it saves that unit too", async () => {
    const game = await castAndFlip("bolt", "xerus");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("xerus")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("selectivity: left HIDDEN it does nothing — Yak simply dies to Void Seeker and the Hourglass is still facedown at bf1 for later", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "yak" });
    await game.settle();
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
  });
});
