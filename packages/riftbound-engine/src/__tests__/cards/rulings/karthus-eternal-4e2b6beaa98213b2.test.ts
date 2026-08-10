/**
 * Ruling 4e2b6beaa98213b2 — Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an
 *   additional time."  (PASSIVE)
 *   × Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base." (TRIGGERED — the contrast the answer draws)
 *   Deathknell witness: Watchful Sentry (ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *
 * Q: Karthus and a Deathknell unit both die to one Falling Star — does the Deathknell still trigger twice?
 * A: Yes. Karthus's doubling is a passive ability, still applying at the moment both are killed together, so the other
 *    unit's Deathknell triggers twice. A TRIGGERED "when another unit dies" (Viktor, Leader) dying at the same time would
 *    not trigger at all.
 * Rules: 808 (Deathknell), 365 (passives apply while on board), 376.3 / 370.1.a.2 (leave-board look-back only for the
 *        dying card's own triggers), one spell's kills are simultaneous at its cleanup.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const VIKTOR = "ogn-246-298";
const FALLING_STAR = "ogn-029-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P2's turn with exactly [2][fury][fury] and Falling Star. P1's base: Watchful Sentry (1) + `partner` (Karthus 3 / Viktor 4). */
function board(partner: string) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", partner, "partner")
    .hand(P2, FALLING_STAR, "star");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1, zone: "base" });

describe("Ruling 4e2b6beaa98213b2 — Karthus dying to the same Falling Star still doubles the other unit's Deathknell", () => {
  test("Falling Star [Karthus, Sentry] kills both at once — the Sentry's Deathknell triggers TWICE: P1 draws 2", async () => {
    const game = await board(KARTHUS).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p2.cast("star", { targets: ["partner", "sentry"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("partner")).toBe("trash"); // Karthus (3) took 3
    expect(game.zoneOf("sentry")).toBe("trash"); // Sentry (1) took 3
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("reference: Karthus untouched (Falling Star puts both 3s into the Sentry) → also exactly 2 draws — dying alongside changes nothing", async () => {
    const game = await board(KARTHUS).build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("star", { targets: ["sentry", "sentry"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("partner")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  test("baseline without Karthus: the Sentry's Deathknell draws just 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .hand(P2, FALLING_STAR, "star")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("star", { targets: ["sentry", "sentry"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("contrast — Viktor, Leader (TRIGGERED) killed by the same Falling Star as the Sentry does NOT trigger: no Recruit token; the Sentry's undoubled Deathknell draws 1", async () => {
    const game = await board(VIKTOR).build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("star", { targets: ["partner", "sentry"] });
    await game.settle();
    // Viktor has 4 Might, so one 3 does not kill him: this first line shows the Sentry's single draw with Viktor ALIVE → a Recruit is made.
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("partner")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(recruits(game)).toHaveLength(1); // alive Viktor triggers

    // Now the simultaneous case: a pre-damaged Viktor (1 marked) dies to the same Falling Star as the Sentry.
    const sim = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", VIKTOR, "viktor", { damage: 1 })
      .hand(P2, FALLING_STAR, "star")
      .build();
    const h0 = sim.p1.hand().length;
    await sim.p2.cast("star", { targets: ["viktor", "sentry"] });
    await sim.settle();
    expect(sim.zoneOf("viktor")).toBe("trash");
    expect(sim.zoneOf("sentry")).toBe("trash");
    expect(recruits(sim)).toEqual([]); // Viktor left at the same time → his trigger never fires
    expect(sim.p1.units("base")).toEqual([]);
    expect(sim.p1.hand()).toHaveLength(h0 + 1);
    expect(sim.violations()).toEqual([]);
  });
});
