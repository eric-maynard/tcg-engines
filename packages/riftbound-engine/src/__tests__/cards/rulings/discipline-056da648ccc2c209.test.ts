/**
 * Ruling 056da648ccc2c209 — Discipline (OGN-058 → ogn-058-298) · [Reaction] · Calm · [2] "Give a unit +2 [Might] this turn.
 *     Draw 1."
 *   Stand-in hidden cards: Sprite Call (ogn-094-298, [Hidden] [Action] spell "Play a ready 3 [Might] Sprite unit token with
 *   [Temporary]") and Blastcone Fae (ogn-097-298, [Hidden] unit 2 "When you play me, give a unit -2 [Might] this turn, to a
 *   minimum of 1 [Might].").
 *
 * Q: When can I play a hidden card after I play Discipline?
 * A: Immediately — while still holding priority, before Discipline resolves. Discipline goes on the chain; you may then
 *    play another legally-timed card (a hidden card has Reaction timing, if hidden on a previous turn); it lands on top,
 *    you pass, and LIFO the hidden card resolves first, then Discipline (+2, draw 1). A hidden PERMANENT enters the board
 *    at once rather than waiting on the chain, but the priority window is the same.
 * Rules: 332 (the player who added an item keeps priority first), 811 (Hidden → Reaction for [0]; not the turn it was
 *        hidden), 340 (LIFO), 346 (permanents don't resolve off the chain like spells).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const SPRITE_CALL = "ogn-094-298";
const BLASTCONE_FAE = "ogn-097-298";

/** Turn 3, P1 active with [2]. P1 holds bf1 with a Warden (3) and `hidden` facedown there (hidden earlier); Discipline in hand; known deck. */
function board(hidden: string) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", hidden, "hid")
    .hand(P1, DISCIPLINE, "disc")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 056da648ccc2c209 — a hidden card can be flipped right after Discipline, while still holding priority", () => {
  test("Discipline goes on the chain and P1 STILL holds priority — the facedown Sprite Call is playable right now, before anything resolves", async () => {
    const game = await board(SPRITE_CALL).build();
    await game.p1.cast("disc", { targets: "warden" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, targets: ["warden"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // holding priority
    expect(game.p1.can("reveal", "hid")).toBe(true);
    await game.p1.reveal("hid");
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "hid"]); // on top of Discipline
    expect(game.p1.energy()).toBe(0); // [0] from hidden
    expect(game.state("warden").might).toBe(3); // Discipline has not resolved
    expect(game.p1.hand()).toEqual([]);
  });

  test("P1 then passes to P2; LIFO: Sprite Call resolves first (a ready 3-Might Sprite token at bf1) while Discipline waits; then Discipline: Warden 3 → 5 this turn and P1 draws 1", async () => {
    const game = await board(SPRITE_CALL).build();
    await game.p1.cast("disc", { targets: "warden" });
    await game.p1.reveal("hid");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.zoneOf("hid")).toBe("trash");
    const sprite = game.p1.units("bf1").find((id) => id !== "warden");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc" })]);
    expect(game.state("warden").might).toBe(3);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("warden")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — a hidden PERMANENT (Blastcone Fae) flipped in the same window enters bf1 IMMEDIATELY (it does not sit on the chain as a spell would); only its play trigger joins the chain above Discipline, and Discipline still resolves last", async () => {
    const game = await board(BLASTCONE_FAE).build();
    await game.p1.cast("disc", { targets: "warden" });
    expect(game.p1.can("reveal", "hid")).toBe(true);
    await game.p1.reveal("hid");
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        // from Hidden the Fae's "-2" must pick a unit HERE (811): aim it at the Fae itself (2 → 1) to leave the Warden alone
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("sentry");
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "hid")?.key ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.zoneOf("hid")).toBe("battlefield-bf1"); // on the board already
    expect(game.state("hid")).toMatchObject({ isHidden: false, might: 2 });
    expect(game.chain()[0]).toMatchObject({ cardId: "disc" }); // Discipline still at the bottom, unresolved
    expect(game.chain().slice(1).every((c) => c.triggered)).toBe(true); // anything above it is a trigger, not the Fae "resolving"
    expect(game.state("warden").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // the priority window still applies
    await game.settle();
    expect(game.zoneOf("hid")).toBe("battlefield-bf1");
    expect(game.state("warden").might).toBe(5);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("constraint: a card hidden THIS turn cannot be the follow-up (only cards hidden on a previous turn have the Reaction option)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .hand(P1, SPRITE_CALL, "fresh")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.hide("fresh", "bf1");
    await game.p1.cast("disc", { targets: "warden" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "fresh")).toBe(false);
  });
});
