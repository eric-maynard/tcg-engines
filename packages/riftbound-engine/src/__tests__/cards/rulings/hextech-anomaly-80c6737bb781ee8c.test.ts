/**
 * Ruling 80c6737bb781ee8c — Hextech Anomaly (SFD-083 → sfd-083-221) · Gear · Mind · [3][mind]
 *   "[Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy."
 *   × Dunebreaker (sfd-027-221, "When I hold, draw 2") only to open a Beginning-Phase chain for the draw-phase case.
 *
 * Q: How does Hextech Anomaly work — when you recycle runes do you have "floating" resources, and how long do they stay?
 * A: Recycling runes adds Power to your Rune Pool (it floats there); the Anomaly converts that Power into Energy. Whatever
 *    is in the pool stays until the pool empties — at the end of the turn, or (for resources made before it) as the
 *    Main Phase starts right after the Draw Phase.
 * Rules: 159/161 (Recycle a rune: Add 1 Power), 429 (Add), 167 (Rune Pools empty at the start of each player's Main
 *        Phase and at the end of each turn), 317.2 step 3e (Expiration: pools empty).
 */
import { describe, expect, test } from "bun:test";
import type { SeatHandle } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_ANOMALY = "sfd-083-221";
const DUNEBREAKER = "sfd-027-221";

/** Activate the Anomaly paying X power (the X rides on the activation). */
async function anomaly(seat: SeatHandle, x: number): Promise<void> {
  const opt = seat.option("activate", "anom");
  expect(opt).toBeDefined();
  await seat.choose(opt!.key, { params: { xAmount: x }, x });
  const d = seat.game.decision();
  if (d?.kind === "integer" && d.seat === seat.seat) {
    await seat.chooseX(x);
  }
}

describe("Ruling 80c6737bb781ee8c — recycled-rune Power floats in the pool, the Anomaly turns it into Energy, and it lasts until the pool empties", () => {
  test("main phase: recycle 2 runes → 2 floating fury Power; Anomaly (X=2) → 2 Energy, Power gone; the Energy is still there after other actions (a whole combat) … and is lost when the turn ends (Expiration empties the pool)", async () => {
    const game = await scenario()
      .gear(P1, HEXTECH_ANOMALY, "anom")
      .runes(P1, "fury", 2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const [r1, r2] = game.p1.runes();
    await game.p1.recycleRune(r1 as string);
    await game.p1.recycleRune(r2 as string);
    expect(game.p1.runes()).toEqual([]); // recycled to the rune deck
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 2 } }); // "floating" power
    await anomaly(game.p1, 2);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]); // Add abilities don't use the chain
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    // It stays through the rest of the turn — e.g. an entire combat later it is still there.
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(2);
    // End of turn: the Expiration Step empties the pool (unspent Energy is lost).
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]).toEqual({ energy: 2, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("draw-phase case: Energy made with the Anomaly during P1's Beginning Phase (in a hold-trigger chain, before the Draw Phase) is emptied as the Main Phase starts", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, HEXTECH_ANOMALY, "anom")
      .runes(P1, "fury", 2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DUNEBREAKER, "dune")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dune", triggered: true })]); // "When I hold" chain: P1 has priority
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.recycleRune(game.p1.runes()[0] as string);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await anomaly(game.p1, 1); // Reaction-speed Add: legal here
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    await game.settle(); // chain resolves → Channel → Draw → Main Phase begins: pool empties (rule 167)
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("anom").isExhausted).toBe(true); // Awaken already ran this turn, so it stays exhausted
  });
});
