/**
 * Ruling 164b54559be25510 — Karthus, Eternal (OGN-236 → ogn-236-298) · Champion · Order · 3 Might
 *     "Your [Deathknell] effects trigger an additional time."   (a PASSIVE ability)
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might · "When another non-Recruit unit you control dies, play a
 *     1 [Might] Recruit unit token into your base."            (a TRIGGERED ability — the contrast case)
 *   Deathknell witness: Watchful Sentry (ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *
 * Q: Does Karthus still double a Deathknell if he dies at the same time as that unit?
 * A: Yes. Karthus's ability is passive: it applies as long as he is on the board, including the moment both are
 *    killed together (lethal combat damage / board wipe), so the other unit's Deathknell triggers twice. This is
 *    unlike a TRIGGERED "when another unit dies" ability (Viktor, Leader), which does not trigger if its source
 *    leaves the board at the same time.
 * Rules: 808.1.d.2 (Deathknell), 365 / 370.1.a.2 (passives apply while on board; look-back for leave-play
 *        triggers is limited to the dying card's own abilities), 466–467 (combat deaths are simultaneous).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const VIKTOR = "ogn-246-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn. P2 holds bf1 with a Brute (8). P1's base: Watchful Sentry (1) plus `partner` (Karthus 3 / Viktor 4). */
function board(partner: string) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Brute" }, "brute")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", partner, "partner");
}

const recruits = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) => game.findAll({ name: "Recruit", owner: P1, zone: "base" });

describe("Ruling 164b54559be25510 — Karthus (passive) doubles a Deathknell even when he dies in the same combat; Viktor (triggered) gets nothing", () => {
  test("Karthus + Sentry attack the 8-Might Brute together and BOTH die to combat damage at once — the Sentry's Deathknell still triggers twice: P1 draws 2", async () => {
    const game = await board(KARTHUS).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.move(["partner", "sentry"], "bf1");
    expect(game.state("partner").combatRole).toBe("attacker");
    expect(game.state("sentry").combatRole).toBe("attacker");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("partner")).toBe("trash"); // Karthus died …
    expect(game.zoneOf("sentry")).toBe("trash"); // … together with the Sentry
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 4 < 8, healed at end of combat
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("reference: Karthus safely at home while the Sentry dies alone → doubled Deathknell, P1 draws 2 — dying alongside (above) gives the SAME result", async () => {
    const game = await board(KARTHUS).build();
    const hand = game.p1.hand().length;
    await game.p1.move("sentry", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("partner")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand + 2);
  });

  test("contrast — Viktor, Leader (a TRIGGERED 'when another unit you control dies') dying in the same combat as the Sentry does NOT trigger: no Recruit token; the Sentry's undoubled Deathknell draws 1", async () => {
    const game = await board(VIKTOR).build();
    const hand = game.p1.hand().length;
    await game.p1.move(["partner", "sentry"], "bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("partner")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.violations()).toEqual([]);
  });

  test("…whereas a Viktor who stays home DOES trigger when the Sentry dies alone: one Recruit token appears in P1's base", async () => {
    const game = await board(VIKTOR).build();
    await game.p1.move("sentry", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("partner")).toBe("base");
    expect(recruits(game)).toHaveLength(1);
    expect(game.state(recruits(game)[0]!)).toMatchObject({ isToken: true, might: 1 });
  });
});
