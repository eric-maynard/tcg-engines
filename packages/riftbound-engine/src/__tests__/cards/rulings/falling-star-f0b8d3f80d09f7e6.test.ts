/**
 * Ruling f0b8d3f80d09f7e6 — Falling Star (OGN-029 → ogn-029-298) · [2]+[fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *   (+ Watchful Sentry ogn-096-298 "[Deathknell] — Draw 1." as the Deathknell unit.)
 *
 * Q: If the opponent's Falling Star kills Karthus AND a Deathknell unit with the same spell, does the Deathknell still
 *    trigger twice?
 * A: Yes. Karthus's ability is a passive, active at the moment both units die simultaneously, so the other unit's
 *    Deathknell triggers once for its death plus one additional time — even though Karthus leaves at the same time.
 * Rules: 363 (passives apply continuously while on board), 428.1 (simultaneous deaths from one resolution), 808 Deathknell.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const KARTHUS = "ogn-236-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P2's turn with exactly [2]+[fury][fury] and Falling Star. P1 ("your"): Karthus (3) + Watchful Sentry (1) in base, known deck. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .hand(P2, FALLING_STAR, "star")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function starKillsBoth(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("star", { targets: ["karthus", "sentry"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority(); // resolves: 3 to Karthus (3 Might), 3 to Sentry (1 Might)
  expect(game.zoneOf("star")).toBe("trash");
  expect(game.zoneOf("karthus")).toBe("trash");
  expect(game.zoneOf("sentry")).toBe("trash");
  return game;
}

describe("Ruling f0b8d3f80d09f7e6 — Karthus dying alongside a Deathknell unit still doubles that Deathknell", () => {
  test("both die to the one Falling Star simultaneously; the Sentry's Deathknell is put on the chain TWICE (Karthus's passive was live at the moment of death)", async () => {
    const game = await starKillsBoth();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    const sentryItems = game.chain().filter((c) => c.cardId === "sentry" && c.triggered);
    expect(sentryItems).toHaveLength(2);
    expect(game.chain().filter((c) => c.cardId === "karthus")).toEqual([]); // Karthus itself has no Deathknell
    expect(game.p1.hand()).toEqual([]);
  });

  test("resolving them: P1 draws 1 + 1 = 2 cards", async () => {
    const game = await starKillsBoth();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Karthus on the board the same Sentry death draws exactly 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", { might: 3, name: "Not Karthus" }, "other")
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .hand(P2, FALLING_STAR, "star")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p2.cast("star", { targets: ["other", "sentry"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("control: Karthus surviving (only the Sentry is hit, twice) also gives 2 draws — the doubling is the same whether or not he dies in the event", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { might: 9, name: "Wall" }, "wall")
      .hand(P2, FALLING_STAR, "star")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p2.cast("star", { targets: ["sentry", "wall"] });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });
});
