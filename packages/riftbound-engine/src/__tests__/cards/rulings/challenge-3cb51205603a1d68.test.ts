/**
 * Ruling 3cb51205603a1d68 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Spell · 2 · [Hidden] [Action] — "Move a unit from a battlefield to its base."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · Unit · 2 · 2 Might — "When I move, discard 1, then draw 1."
 *
 * Q: The opponent Challenges (their unit in base vs my Traveling Merchant at a battlefield). I have Fight or Flight hidden
 *    there — can I flip it to move the Merchant home, trigger its ability, and dodge Challenge?
 * A: You can flip it and move the Merchant to base (its "When I move" triggers and resolves: discard 1, draw 1), but
 *    Challenge still resolves — its targets need not be at any particular location, so the Merchant in base is still legal
 *    and both units deal their Might to each other.
 * Rules: 811 (Hidden → Reaction, must choose from that battlefield), 355.15 / 359.3.e.5 (a target only becomes illegal if it
 *        stops matching the requirement), 340.1 (LIFO), 383.3 (Merchant's trigger joins the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const JUNK = { cardType: "unit", energyCost: 1, might: 1, name: "Junk" } as const;

/**
 * P2's turn with exactly 2+[body]. P2's Brute (4) is in base. P1 controls bf1 with the Merchant (2) + an Anchor (3) and a
 * facedown Fight or Flight there; P1's hand is one Junk card, known top of deck.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TRAVELING_MERCHANT, "merchant")
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, JUNK, "junk")
    .deck(P1, ["ogn-175-298"], ["topcard"])
    .hand(P2, CHALLENGE, "challenge");
}

/** P2 Challenges Brute vs Merchant from base; P1 answers by flipping Fight or Flight on the Merchant. */
async function challengeThenFlip(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("challenge", { targets: ["brute", "merchant"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", controller: P2, targets: ["brute", "merchant"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof");
  return game;
}

describe("Ruling 3cb51205603a1d68 — hidden Fight or Flight moves the Merchant home (and triggers it), but Challenge still lands", () => {
  test("the flip is a legal Reaction for [0]; its target must be a unit AT THAT BATTLEFIELD (Merchant / Anchor offered, the Brute in base is not)", async () => {
    const game = await challengeThenFlip();
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "fof" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["anchor", "merchant"]);
    await game.p1.pick("merchant");
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "fof"]);
  });

  test("LIFO: Fight or Flight resolves first — Merchant moves to P1's base — and its 'When I move' trigger goes on the chain ABOVE the still-waiting Challenge, then resolves: P1 discards Junk and draws 1", async () => {
    const game = await challengeThenFlip();
    await game.p1.pick("merchant");
    await game.p1.passPriority();
    await game.p2.passPriority(); // FoF resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "merchant"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true, type: "ability" });
    // Resolve the Merchant trigger: discard 1 (Junk is the only card), then draw 1.
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["junk"]);
      await game.p1.pick("junk");
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topcard"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]); // Challenge still pending, targets unchanged
    expect(game.chain()[0]?.targets).toEqual(["brute", "merchant"]);
    expect(game.state("brute").damage).toBe(0);
  });

  test("Challenge then resolves anyway: the Merchant in BASE is still a legal 'enemy unit' — Brute deals 4 to it (it dies) and takes 2 back", async () => {
    const game = await challengeThenFlip();
    await game.p1.pick("merchant");
    game.script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : undefined)]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("trash"); // 4 ≥ 2 — moving home did not dodge it
    expect(game.state("brute")).toMatchObject({ damage: 2, zone: "base" }); // the Merchant hit back with its 2
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toEqual(["topcard"]); // the discard/draw did happen along the way
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
