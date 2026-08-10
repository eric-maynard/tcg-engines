/**
 * Ruling d6b9746f5675e061 — Temporal Portal (sfd-078-221) × Rocket Barrage (sfd-077-221)
 *   Temporal Portal — Gear: "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   Rocket Barrage — [4][mind] · "[Repeat] [4][mind]. Choose one — Deal 4 to a unit in a base. / Kill a gear."
 *
 * Q: With Temporal Portal used, does Rocket Barrage get to repeat twice — three executions instead of two?
 * A: Yes. The printed [Repeat] and the Portal-granted [Repeat] are two separate instances; each may be paid once, and the
 *    instructions run one extra time per instance paid: 1 (cast) + 1 (printed) + 1 (granted) = 3, with independent
 *    choices each time. The spell still counts as played once.
 * Rules: 820.2.a (different choices per execution), 820.3 / 820.3.a (one extra execution per Repeat instance paid; played once).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_PORTAL = "sfd-078-221";
const ROCKET_BARRAGE = "sfd-077-221";

/**
 * P1's turn. P2 has three 4-Might units in base and a Trinket gear. P1: Temporal Portal ready, Rocket Barrage in hand,
 * [12] + 4 mind — Portal's [rainbow] (paid from mind) + three full [4][mind] payments.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { mind: 4 } })
    .unit(P2, "base", { might: 4, name: "Alpha" }, "alpha")
    .unit(P2, "base", { might: 4, name: "Bravo" }, "bravo")
    .unit(P2, "base", { might: 4, name: "Charlie" }, "charlie")
    .gear(P2, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket")
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, ROCKET_BARRAGE, "barrage");
}

describe("Ruling d6b9746f5675e061 — printed Repeat + Portal Repeat = Rocket Barrage executes three times", () => {
  test("baseline without the Portal: Rocket Barrage offers exactly ONE Repeat (its printed one) — at most two executions", async () => {
    const game = await board().build();
    const repeat = game.p1.option("cast", "barrage")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options).toEqual([1]);
  });

  test("after activating Temporal Portal ([rainbow], Exhaust) the NEXT spell has a second Repeat instance: the cast now offers repeat 1 or 2", async () => {
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    expect(game.state("portal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 12, power: { mind: 3 } });
    const repeat = game.p1.option("cast", "barrage")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options).toEqual([1, 2]);
  });

  test("paying both Repeats: [4][mind] ×3 is taken up front and the instructions execute THREE times with independent choices — 4 to Alpha, 4 to Bravo, kill the Trinket; the spell is one card played once", async () => {
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    const playedBefore = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    await game.p1.cast("barrage", { modes: [0, 0, 1], repeat: 2, targets: ["alpha", "bravo", "trinket"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // 3 × [4][mind] after the Portal's pip
    expect(game.chain()).toHaveLength(1); // ONE spell on the chain
    expect(game.chain()[0]).toMatchObject({ cardId: "barrage", controller: P1 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.zoneOf("alpha")).toBe("trash"); // execution 1
    expect(game.zoneOf("bravo")).toBe("trash"); // execution 2 (printed Repeat)
    expect(game.zoneOf("trinket")).toBe("trash"); // execution 3 (Portal Repeat), a different mode
    expect(game.zoneOf("charlie")).toBe("base"); // no fourth execution
    expect(game.state("charlie").damage).toBe(0);
    expect((game.gameState.cardsPlayedThisTurn?.[P1] ?? 0) - playedBefore).toBe(1); // 820.3.a — played once
    expect(game.violations()).toEqual([]);
  });

  test("each instance is optional and separate: paying just ONE Repeat after the Portal gives two executions (Alpha, Bravo) and leaves [4][mind] unspent", async () => {
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("barrage", { modes: [0, 0], repeat: 1, targets: ["alpha", "bravo"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("bravo")).toBe("trash");
    expect(game.zoneOf("charlie")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base");
  });
});
