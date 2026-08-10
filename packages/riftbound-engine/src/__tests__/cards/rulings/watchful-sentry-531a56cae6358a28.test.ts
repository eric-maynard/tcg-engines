/**
 * Ruling 531a56cae6358a28 — Watchful Sentry (OGN-096 → ogn-096-298) · Unit · Mind · 2 · 1 Might "[Deathknell] — Draw 1."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · Unit · Order · 3+[order] · 3 "Your [Deathknell] effects trigger an
 *     additional time." × Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2+[fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: Karthus and Watchful Sentry die at the same time to Falling Star — does Sentry's Deathknell still trigger twice?
 * A: Yes. Karthus's ability is a passive; it is still active at the moment the Sentry's Deathknell trigger is created, even
 *    though Karthus dies in the same event. Sentry's Deathknell triggers twice → draw 2.
 * Rules: 361–364 (passive abilities apply continuously while on board), 383.2.c (triggers evaluated right after the
 *        event), 370.1.a.2 (simultaneous deaths in one cleanup), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
const KARTHUS = "ogn-236-298";
const FALLING_STAR = "ogn-029-298";

/** P2's turn with exactly 2+[fury][fury]. P1: Karthus (3) and Watchful Sentry (1) in base, a known 3-card deck top. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P2, FALLING_STAR, "star");
}

describe("Ruling 531a56cae6358a28 — Karthus dying alongside the Sentry still doubles the Sentry's Deathknell", () => {
  test("Falling Star (3 to Karthus, 3 to Sentry) kills both in the same resolution; Sentry's Deathknell is put on the chain TWICE", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["karthus", "sentry"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Falling Star resolves
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    await game.acceptTriggerOrder(); // two same-controller triggers may be offered for ordering (383.3.d)
    const sentryTriggers = game.chain().filter((c) => c.cardId === "sentry" && c.triggered);
    expect(sentryTriggers).toHaveLength(2);
  });

  test("both resolve: P1 draws 2 cards total (d1 and d2), not 1", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("star", { targets: ["karthus", "sentry"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.zoneOf("d3")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("control — Sentry dies alone with Karthus NOT on the board: a single Deathknell, draw 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { might: 5, name: "Sponge" }, "sponge")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .hand(P2, FALLING_STAR, "star")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("star", { targets: ["sentry", "sponge"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
  });
});
