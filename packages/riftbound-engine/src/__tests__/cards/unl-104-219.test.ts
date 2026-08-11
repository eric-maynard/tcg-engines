/**
 * Gentle Gemdragon — unl-104-219 · Unit · Body · 8 energy (no power) · 8 Might · Dragon
 *
 *   When you play me or another Dragon, ready up to 2 runes.
 *
 * Rules: 383.4.a (play effects trigger once the played permanent is on the board and go on the chain
 * as triggered items), 385.1 (a triggered ability only works from the board — a Gemdragon in hand sees
 * nothing), 415 (Ready: exhausted → ready; the runes are then usable again this very turn), "up to 2"
 * = 0, 1 or 2 chosen as the trigger is finalized (402.2 / 355.5), "you play … another Dragon" = a FRIENDLY unit with the Dragon tag
 * other than me (so my own arrival is exactly one trigger, never two), "runes" = your own runes.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Net cost: tap 8 runes, play me, ready 2 of them, tap those again → I effectively cost 6.
 *  2. "up to": with one exhausted rune you ready one and stop; you may also decline entirely; either
 *     way the trigger leaves the chain cleanly.
 *  3. Exactly one trigger when I am played (play-self), even though I am a Dragon myself; but a SECOND
 *     Gemdragon arriving = its own play-self + the first one's "another Dragon" = two triggers = 4 runes.
 *  4. Only friendly Dragons PLAYED: an enemy Dragon, a friendly non-Dragon, or a Dragon played while I
 *     am still in hand → nothing.
 *  5. Only YOUR runes are candidates — the opponent's exhausted runes are never offered — and only
 *     runes (an exhausted friendly unit is not).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-104-219";
const DUNE_DRAKE = "ogn-131-298"; // Body 5 · Dragon · (attack trigger only)
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit, not a Dragon

const offered = (d: unknown) => ((d as PickDecision | null)?.kind === "pick" ? (d as PickDecision).options.map((o) => o.card ?? o.key) : []);

describe("Gentle Gemdragon (unl-104-219)", () => {
  test("registry payload: 8-energy body Dragon, 8 Might; two triggers (play-self, friendly Dragon played excluding self) each readying up to 2 friendly runes", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 8, might: 8, name: "Gentle Gemdragon", tags: ["Dragon"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const ready = { target: { controller: "friendly", quantity: { upTo: 2 }, type: "rune" }, type: "ready" };
    expect(def?.abilities).toEqual([
      { effect: ready, trigger: { event: "play-self" }, type: "triggered" },
      { effect: ready, trigger: { event: "play-unit", on: { cardType: "unit", controller: "friendly", excludeSelf: true, tag: "Dragon" } }, type: "triggered" },
    ]);
  });

  test("cost & play-self: tap all 8 runes, play me (8 energy) → ONE triggered item → choose 2 runes → exactly 2 ready / 6 exhausted; I sit in base exhausted as an 8", async () => {
    const game = await scenario().runes(P1, "body", 8).hand(P1, CARD, "gem").build();
    await game.p1.tapRunes(8);
    expect(game.p1.energy()).toBe(8);
    await game.p1.play("gem");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gem", controller: P1, triggered: true })]); // one, not two
    // rule 402.2 / 355.5 — the runes are named while the trigger is FINALIZED, before priority.
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 2, seat: P1 });
    const [a, b] = game.p1.runes({ ready: false });
    await game.p1.pick(a as string, b as string);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.p1.runes({ ready: true }).sort()).toEqual([a, b].sort());
    expect(game.p1.runes({ ready: false })).toHaveLength(6);
    expect(game.state("gem")).toMatchObject({ isExhausted: true, might: 8, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("not playable with 7 energy", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { body: 2 } }).hand(P1, CARD, "gem").build();
    expect(game.p1.can("play", "gem")).toBe(false);
  });

  test("net cost 6: the two readied runes tap again the same turn for 2 fresh energy", async () => {
    const game = await scenario().runes(P1, "body", 8).hand(P1, CARD, "gem").build();
    await game.p1.tapRunes(8);
    await game.p1.play("gem");
    const [a, b] = game.p1.runes({ ready: false });
    await game.p1.pick(a as string, b as string);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("'up to 2': with a single exhausted rune, ready it and decline the rest → all runes ready; declining outright readies nothing — both leave an empty chain", async () => {
    const one = await scenario().resources(P1, { energy: 7 }).rune(P1, "body", { alias: "tapped" }).rune(P1, "body", { alias: "r2" }).rune(P1, "body", { alias: "r3" }).hand(P1, CARD, "gem").build();
    await one.p1.tapRune("tapped");
    await one.p1.play("gem");
    expect(offered(one.decision())).toContain("tapped");
    await one.p1.pick("tapped");
    if (one.decision()?.kind === "pick") {
      await one.p1.decline(); // no second rune wanted
    }
    await one.p1.passPriority();
    await one.p2.passPriority();
    await one.settle();
    expect(one.state("tapped").isReady).toBe(true);
    expect(one.p1.runes({ ready: true })).toHaveLength(3);
    expect(one.chain()).toEqual([]);

    const none = await scenario().runes(P1, "body", 8).hand(P1, CARD, "gem").build();
    await none.p1.tapRunes(8);
    await none.p1.play("gem");
    expect((none.decision() as PickDecision).allowDecline).toBe(true);
    await none.p1.decline();
    await none.p1.passPriority();
    await none.p2.passPriority();
    await none.settle();
    expect(none.p1.runes({ ready: true })).toHaveLength(0);
    expect(none.chain()).toEqual([]);
    expect(none.zoneOf("gem")).toBe("base");
    expect(none.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'another Dragon': with me on the board, playing Dune Drake (5) triggers MY ability (source = gem) and readies 2 of the 5 tapped runes", async () => {
    const game = await scenario().runes(P1, "body", 5).unit(P1, "base", CARD, "gem").hand(P1, DUNE_DRAKE, "drake").build();
    await game.p1.tapRunes(5);
    await game.p1.play("drake");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gem", controller: P1, triggered: true })]);
    const [a, b] = game.p1.runes({ ready: false });
    await game.p1.pick(a as string, b as string);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(3);
  });

  test("negative space: a friendly NON-Dragon, an ENEMY Dragon, or a friendly Dragon while I am still in HAND → no trigger, no rune readied", async () => {
    const plain = await scenario().resources(P1, { energy: 3 }).rune(P1, "body", { alias: "t", exhausted: true }).unit(P1, "base", CARD, "gem").hand(P1, SKULKER, "sk").build();
    await plain.p1.play("sk");
    expect(plain.chain()).toEqual([]);
    await plain.settle();
    expect(plain.state("t").isExhausted).toBe(true);

    const enemy = await scenario().active(P2).resources(P2, { energy: 5 }).rune(P1, "body", { alias: "t", exhausted: true }).rune(P2, "body", { alias: "theirs", exhausted: true }).unit(P1, "base", CARD, "gem").hand(P2, DUNE_DRAKE, "drake").build();
    await enemy.p2.play("drake");
    expect(enemy.chain()).toEqual([]);
    await enemy.settle();
    expect(enemy.state("t").isExhausted).toBe(true);
    expect(enemy.state("theirs").isExhausted).toBe(true);

    const inHand = await scenario().resources(P1, { energy: 5 }).rune(P1, "body", { alias: "t", exhausted: true }).hand(P1, CARD, "gem").hand(P1, DUNE_DRAKE, "drake").build();
    await inHand.p1.play("drake");
    expect(inHand.chain()).toEqual([]);
    await inHand.settle();
    expect(inHand.state("t").isExhausted).toBe(true);
    expect(inHand.zoneOf("gem")).toBe("hand");
  });

  test("a SECOND Gemdragon: its own play-self + the first one's 'another Dragon' = two triggers → up to 4 runes readied", async () => {
    const game = await scenario().runes(P1, "body", 8).unit(P1, "base", CARD, "gem1").hand(P1, CARD, "gem2").build();
    await game.p1.tapRunes(8);
    await game.p1.play("gem2");
    expect(game.chain().map((c) => [c.cardId, c.triggered]).sort()).toEqual([
      ["gem1", true],
      ["gem2", true],
    ]);
    // Both items are finalized in the same sweep, oldest first, and each names its own two runes
    // before anything readies — so the second pick still sees all eight exhausted (402.2).
    const exhausted = game.p1.runes({ ready: false });
    await game.p1.pick(exhausted[0] as string, exhausted[1] as string);
    await game.p1.pick(exhausted[2] as string, exhausted[3] as string);
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(4);
    expect(game.p1.runes({ ready: false })).toHaveLength(4);
    expect(game.chain()).toEqual([]);
  });

  test("only YOUR runes, and only runes: the opponent's exhausted runes and an exhausted friendly unit are never offered or readied", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .rune(P1, "body", { alias: "mine1", exhausted: true })
      .rune(P1, "body", { alias: "mine2", exhausted: true })
      .rune(P2, "fury", { alias: "theirs", exhausted: true })
      .unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true })
      .hand(P1, CARD, "gem")
      .build();
    await game.p1.play("gem");
    const opts = offered(game.decision());
    expect(opts).toEqual(expect.arrayContaining(["mine1", "mine2"]));
    expect(opts).not.toContain("theirs");
    expect(opts).not.toContain("tired");
    expect(opts).not.toContain("gem");
    await game.p1.pick("mine1", "mine2");
    await game.settle();
    expect(game.state("mine1").isReady).toBe(true);
    expect(game.state("mine2").isReady).toBe(true);
    expect(game.state("theirs").isExhausted).toBe(true);
    expect(game.state("tired").isExhausted).toBe(true);
  });

  test("played to a battlefield I control: still 'playing me' → the trigger fires there too", async () => {
    const game = await scenario().runes(P1, "body", 8).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "holder").hand(P1, CARD, "gem").build();
    await game.p1.tapRunes(8);
    await game.p1.play("gem", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gem", triggered: true })]);
    const [a, b] = game.p1.runes({ ready: false });
    await game.p1.pick(a as string, b as string);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("gem")).toBe("battlefield-bf1");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });
});
