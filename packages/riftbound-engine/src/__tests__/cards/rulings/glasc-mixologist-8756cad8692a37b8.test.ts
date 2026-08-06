/**
 * Ruling 8756cad8692a37b8 — Glasc Mixologist (sfd-165-221) · Unit · Order · 5 + [order] · 5 Might
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your
 *    trash, ignoring its cost."
 *   × Falling Comet (ogn-085-298) "Deal 6 to a unit at a battlefield."  × Shipyard Skulker (ogn-175-298, 3-cost vanilla)
 *
 * Q: Can the Deathknell play a unit to the battlefield where Glasc Mixologist died?
 * A: Yes, if you controlled that battlefield when he died. Outside a showdown the Deathknell is a pending
 *    chain item from the moment it is queued, so the turn is in a Closed State (309.1) and cleanup step 4
 *    (empty battlefields become uncontrolled, 323.6) does not apply; the battlefield is still yours when
 *    the played unit is finalized, so it is a valid destination (355.2.a). (In a showdown control can't
 *    change anyway, 190.4.b.)
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const FALLING_COMET = "ogn-085-298";
const SKULKER = "ogn-175-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 controls bf1 with Glasc alone there and has a Skulker in trash. P2 Comets the Glasc. */
async function glascDies(): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", GLASC, "glasc")
    .trash(P1, SKULKER, "skulker")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P2, FALLING_COMET, "comet")
    .build();
  expect(game.p1.units("bf1")).toEqual(["glasc"]);
  await game.p2.cast("comet", { targets: "glasc" });
  // Both pass on Falling Comet → it resolves, Glasc takes lethal damage and dies in the cleanup.
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("glasc")).toBe("trash");
  return game;
}

/** Pass chain priority for whoever holds it until a non-priority decision appears. */
async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 8756cad8692a37b8 — Glasc Mixologist's Deathknell may play the unit to the battlefield where he died", () => {
  test.failing("BUG: ruling 8756cad8692a37b8 — with the Deathknell pending on the chain the turn is Closed, so P1 keeps control of the now-empty bf1 (323.6 needs an Open State); engine drops control immediately", async () => {
    const game = await glascDies();
    // The Deathknell is a chain item now; nobody has an open main phase.
    expect(game.chain().map((c) => c.cardId)).toEqual(["glasc"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: ruling 8756cad8692a37b8 — P1 may play Skulker from trash for free and bf1 (still P1's) is offered as its destination; it lands there and bf1 stays P1's; engine resolves the Deathknell onto the wrong object and loses bf1", async () => {
    // Expected: P1 opt-in → choose Skulker (the only ≤3-cost unit in P1's trash) → destination pick offering
    // base AND battlefield-bf1 → Skulker at bf1, exhausted, P1 still controls bf1, P1 paid nothing.
    const game = await glascDies();
    await passAll(game);
    let sawBf1Offered = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      expect(d.seat).toBe(P1); // every choice here is the Deathknell controller's
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        const keys = (d as PickD).options.map((o) => o.card ?? o.key);
        if (keys.includes("skulker")) {
          await game.p1.pick("skulker");
        } else if ((d as PickD).options.some((o) => o.key === "battlefield-bf1")) {
          sawBf1Offered = true;
          expect((d as PickD).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
          await game.p1.pick("battlefield-bf1");
        } else {
          break;
        }
      } else {
        break;
      }
      await passAll(game);
    }
    expect(sawBf1Offered).toBe(true);
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf2"); // P2's unit is nobody's business here
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
