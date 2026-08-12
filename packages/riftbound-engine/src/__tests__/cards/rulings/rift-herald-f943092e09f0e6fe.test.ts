/**
 * Ruling f943092e09f0e6fe — Rift Herald (UNL-179 → unl-179-219) · 7 [Might] · [8][order]
 *   "[Deathknell][>] Play a unit from your hand to your base, ignoring its Energy cost."
 *   × Hidden Blade (OGN-213 → ogn-213-298) — the kill that sets the Deathknell off.
 *
 * Q: When Rift Herald dies, am I forced to play a unit from my hand?
 * A: No. The instruction names a TYPE of card in a private zone (your hand), and per the 2026-04-29 clarification a
 *    player cannot be compelled to act on cards in a private zone by type/quality — you may ignore it. The prompt is
 *    a choice you can decline, and declining does nothing at all.
 * Rules: 2026-04-29 clarification (private-zone compulsion), 355.10.d.2 (a lone legal option is still a choice).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIFT_HERALD = "unl-179-219";
const HIDDEN_BLADE = "ogn-213-298";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — 3-Might unit, [3], no Power cost
const JINX = "ogn-030-298"; // Jinx, Demolitionist — [3][fury]

/** P1's turn. Rift Herald holds bf1 for P1; P1 will kill it with its own Hidden Blade. A spare unit waits in hand. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", RIFT_HERALD, "herald")
    .hand(P1, SKULKER, "spare")
    .hand(P1, JINX, "jinxy") // [3][fury] — Energy is ignored, the Power cost is not
    .hand(P1, HIDDEN_BLADE, "blade")
    .resources(P1, { energy: 5, power: { order: 1 } });
}

/** Kill the Herald; its Deathknell is now asking. */
async function heraldDies(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "herald" });
  await game.acting().passPriority();
  await game.acting().passPriority(); // Hidden Blade resolves — the Herald dies and its Deathknell is queued
  expect(game.zoneOf("herald")).toBe("trash");
  await game.acting().passPriority();
  await game.acting().passPriority(); // the Deathknell item resolves and asks
  return game;
}

describe("Ruling f943092e09f0e6fe — Rift Herald's Deathknell play is optional, because your hand is a private zone", () => {
  test("the Deathknell surfaces as a DECISION for the Herald's controller, not an automatic play", async () => {
    const game = await heraldDies();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(game.p1.hand()).toContain("spare"); // still in hand while being asked
  });

  test("declining is legal and does nothing — the unit stays in hand", async () => {
    const game = await heraldDies();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toContain("spare");
    expect(game.zoneOf("spare")).toBe("hand");
    expect(game.p1.base()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("accepting plays it to base for free — the [3] Energy cost is ignored, the pool is untouched", async () => {
    const game = await heraldDies();
    const before = game.p1.energy();
    await game.p1.pick("spare");
    await game.settle();
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.p1.energy()).toBe(before);
  });

  test("only the Energy is ignored: a unit whose Power cost the pool cannot cover is not an option", async () => {
    const game = await heraldDies();
    const d = game.decision() as { options: { key: string }[] };
    expect(d.options.map((o) => o.key)).toContain("spare");
    expect(d.options.map((o) => o.key)).not.toContain("jinxy"); // needs [fury], and there is none in the pool
    expect(game.p1.power("fury")).toBe(0);
  });
});
