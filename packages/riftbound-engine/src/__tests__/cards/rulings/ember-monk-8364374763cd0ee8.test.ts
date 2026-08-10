/**
 * Ruling 8364374763cd0ee8 — Ember Monk (OGN-167 → ogn-167-298) · 4 Might "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action · 3+[fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · [Hidden] unit · 1 Might "When you play me, give me +3 [Might] this turn."
 *   × (nuance) Hextech Ray (OGN-009 → ogn-009-298) "Deal 3 …" and Stupefy (OGN-095 → ogn-095-298) Reaction "Give a unit -1 [Might] this
 *     turn, to a minimum of 1. Draw 1."
 *
 * Q: Void Seeker targets Ember Monk; its controller reacts by playing a hidden card (Teemo). How does the Monk's trigger resolve?
 * A: There is only ever one chain. Playing Teemo from hidden makes the Monk's trigger pending; it finalizes in the Cleanup right after
 *    Teemo is played and is added to the SAME chain above Void Seeker. LIFO: the Monk's +2 resolves first (Monk 6), then Void Seeker's
 *    4 — the Monk survives. (The earlier judge call that the Monk dies "before a new chain could open" was wrong.)
 *    Nuance: Monk already on 3 damage from a Ray, opponent Rays again, you flip the hidden card, opponent answers THAT with Stupefy —
 *    Stupefy resolves before your items, Monk becomes 3 Might with 3 damage and dies before it ever gets the +2.
 * Rules: 339–340 (one chain; LIFO), 319–323 (pending triggers finalize at the next Cleanup), 811 (Hidden → Reaction), 140.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMBER_MONK = "ogn-167-298";
const VOID_SEEKER = "ogn-024-298";
const TEEMO_SCOUT = "ogn-197-298";
const HEXTECH_RAY = "ogn-009-298";
const STUPEFY = "ogn-095-298";

/** P2's turn 3. P1 controls bf1 with Ember Monk (4) and Teemo, Scout facedown there. P2: Void Seeker + 3+[fury]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .hand(P2, VOID_SEEKER, "vs");
}

/** Void Seeker at the Monk; P2 passes; P1 flips Teemo (enters bf1 at once); P1 accepts the offered order of its two triggers. */
async function seekerThenTeemo(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vs", { targets: "monk" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "teemo")).toBe(true);
  await game.p1.reveal("teemo");
  expect(game.locationOf("teemo")).toBe("bf1"); // a hidden permanent is played to its battlefield immediately
  if (game.decision()?.kind === "order") {
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 }); // P1 orders ITS simultaneous triggers
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling 8364374763cd0ee8 — Ember Monk's hidden-play trigger joins the SAME chain above Void Seeker and resolves first", () => {
  test("after Teemo is flipped: ONE chain — Void Seeker at the bottom, then the pending triggers (Teemo's +3, Monk's +2) finalized on top of it; the Monk is untouched so far", async () => {
    const game = await seekerThenTeemo();
    const ids = game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);
    expect(ids[0]).toBe("vs");
    expect(ids.slice(1).toSorted()).toEqual(["monk*", "teemo*"]);
    expect(game.chain()).toHaveLength(3);
    expect(game.state("monk")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]); // no second chain/showdown anywhere
  });

  test("LIFO: the triggers resolve before Void Seeker — the Monk is 6 (and Teemo 4) while Void Seeker is still waiting", async () => {
    const game = await seekerThenTeemo();
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.state("monk")).toMatchObject({ damage: 0, might: 6 });
    expect(game.state("teemo").might).toBe(4);
  });

  test("then Void Seeker resolves: 4 damage on a 6-Might Monk — it SURVIVES (the 'dies before a new chain opens' call was wrong); P2 draws 1", async () => {
    const game = await seekerThenTeemo();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("monk")).toMatchObject({ damage: 4, might: 6, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Monk already on 3 damage, P2 Rays it again, P1 flips Teemo, P2 answers with Stupefy on the Monk: Stupefy resolves first → 3-Might Monk with 3 damage dies BEFORE its +2 resolves", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", EMBER_MONK, "monk", { damage: 3 })
      .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P2, STUPEFY, "stupefy")
      .build();
    expect(game.state("monk")).toMatchObject({ damage: 3, might: 4 });
    await game.p2.cast("ray", { targets: "monk" });
    await game.p2.passPriority();
    await game.p1.reveal("teemo");
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    // P1 holds priority after adding items; pass it so P2 can respond to the hidden play with Stupefy.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "monk" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "stupefy", controller: P2 });
    expect(game.chain()[0]).toMatchObject({ cardId: "ray" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves: Monk 4 → 3 with 3 damage → dies in the Cleanup
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("monk")).toBe("trash");
    // Its +2 trigger (still on the chain or already gone) can no longer save it; the rest resolves harmlessly.
    await game.settle();
    expect(game.zoneOf("monk")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
