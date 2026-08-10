/**
 * Ruling 590ad9527c20f0e0 — Pakaa Cub (OGN-135 → ogn-135-298) · Unit · Body · [3] · 3 Might
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].)"
 *   × Sett, Brawler (ogn-164-298, "When I'm played … buff me") as "the opponent plays a unit with a trigger ability".
 *
 * Q: Can you hide a card and instantly play it on the same turn?
 * A: No. Hide it during your turn, then wait for the opponent's turn; play it from face-down any time you have
 *    priority there — e.g. when the opponent plays a unit whose trigger opens a chain. A hidden card that needs no
 *    target (Pakaa Cub) can be played in any such priority window.
 * Rules: 811 (Hidden: hide for [rainbow]; not playable the turn it was hidden; later played as a Reaction for [0]),
 *        316.5.b / 336 (priority only exists in Closed States on the opponent's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PAKAA_CUB = "ogn-135-298";
const SETT_BRAWLER = "ogn-164-298";
/** Inline 0-cost "[Action] Draw 1." — just to give P1 a same-turn priority window on a chain. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Cantrip (inline)",
  rulesText: "[Action] Draw 1.",
  timing: "action",
} as const;

/** P1's turn with exactly 1 rainbow power. P1 holds bf1 with a Holder (2); Pakaa Cub + Cantrip in hand. P2 has Sett, Brawler in hand. */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, PAKAA_CUB, "cub")
    .hand(P1, CANTRIP, "cantrip")
    .hand(P2, SETT_BRAWLER, "sett");
}

/** Hide the Cub at bf1, then hand the turn to P2 and give P2 what Sett costs ([5][body]). */
async function hiddenCubOnP2Turn(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("cub", "bf1");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 5, power: { body: 1 } });
  return game;
}

describe("Ruling 590ad9527c20f0e0 — a hidden card can't be played the turn it is hidden; play it with priority on the opponent's turn", () => {
  test("hide during your turn: costs the [rainbow], the Cub lies face down at bf1 — and it is NOT playable that same turn, neither in the open state nor while P1 holds priority on a chain", async () => {
    const game = await board().build();
    await game.p1.hide("cub", "bf1");
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.can("reveal", "cub")).toBe(false); // open state, own turn
    await game.p1.cast("cantrip");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 has priority right now …
    expect(game.p1.can("reveal", "cub")).toBe(false); // … still no: hidden this turn
    const r = await game.p1.try((p) => p.reveal("cub"));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
  });

  test("on the opponent's turn, in THEIR open state P1 has no priority and still cannot play it", async () => {
    const game = await hiddenCubOnP2Turn();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "cub")).toBe(false);
  });

  test("when P2 plays Sett, Brawler its 'When I'm played' trigger opens a chain; once priority reaches P1 the target-less Cub IS playable from face-down for [0] and enters play at bf1", async () => {
    const game = await hiddenCubOnP2Turn();
    await game.p2.play("sett");
    expect(game.chain().some((c) => c.cardId === "sett" && c.triggered)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "cub")).toBe(false); // P2 holds priority first
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "cub")).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing to pay with — and nothing needed
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.state("cub")).toMatchObject({ isHidden: false, location: "bf1", might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played for [0]
    expect(game.state("sett")).toMatchObject({ isBuffed: true, zone: "base" }); // Sett's trigger resolved normally
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
