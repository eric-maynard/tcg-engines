/**
 * Ruling d6fb146611e57f2d — Temporal Breach (VEN-066 → ven-066-166) · Spell [2][mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Rockfall Path (SFD-216 → sfd-216-221) · Battlefield "Units can't be played here." (the "impossible → stays banished" case)
 *
 * Q: When I Temporal Breach a friendly unit, must I play it back immediately or can I keep it banished and play it later?
 * A: Immediately — the "then its owner plays it" is part of the spell's resolution; the unit goes straight from Banishment back to
 *    the same location (exhausted unless Accelerated). There is never a moment where it waits in Banishment for you. Only if the
 *    play is impossible (Rockfall Path, a token, an unpayable mandatory extra cost) is that step skipped — and then it simply
 *    stays banished; you still don't get to play it later.
 * Rules: 359.2 ("then" instructions execute in sequence within one resolution), 359.3.e.6 (impossible instruction ignored),
 *        186.1 (a banished token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const ROCKFALL_PATH = "sfd-216-221";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit card
const SPRITE = "ogn-274-298"; // 3-Might unit token

describe("Ruling d6fb146611e57f2d — Temporal Breach replays the banished unit at once; it can never be banked for later", () => {
  test("friendly unit at an ordinary battlefield: within the SAME resolution it is banished and replayed to bf1 (fresh object: damage gone, enters exhausted, cost ignored) — the next thing P1 sees is the open main phase with the unit already back", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SKULKER, "skulker", { damage: 1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    await game.p1.cast("breach", { targets: "skulker" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", targets: ["skulker"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Breach resolves: banish, THEN replay — no decision for P1 in between
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        // (an Accelerate offer for the replay would be the only legitimate question here)
        expect(game.zoneOf("skulker")).not.toBe("battlefield-bf1");
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // "ignoring its cost"
    // Nothing is left to do "later": no play-from-banishment permission exists.
    expect(game.p1.legal().some((o) => o.card === "skulker" && o.verb !== "move")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("impossible replay (unit at Rockfall Path): the banish happens, the play step is skipped — the unit stays in banishment now AND on later turns (never playable from there)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
      .unit(P1, "rock", SKULKER, "skulker")
      .unit(P1, "rock", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    await game.p1.cast("breach", { targets: "skulker" });
    await game.settle({ policy: "first" });
    await game.settle();
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["skulker"]);
    expect(game.p1.can("playFrom", "skulker")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "skulker")).toBe(false);
    // A full round later, with fresh resources, it is still just a banished card.
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.do("addResources", { energy: 5, power: { mind: 2 } });
    expect(game.zoneOf("skulker")).toBe("banishment");
    expect(game.p1.can("playFrom", "skulker")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "skulker")).toBe(false);
  });

  test("impossible replay (a token): banished → it ceases to exist; nothing is replayed and nothing sits in banishment", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, TEMPORAL_BREACH, "breach")
      .build();
    expect(game.state("sprite").isToken).toBe(true);
    await game.p1.cast("breach", { targets: "sprite" });
    await game.settle({ policy: "first" });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.violations()).toEqual([]);
  });
});
