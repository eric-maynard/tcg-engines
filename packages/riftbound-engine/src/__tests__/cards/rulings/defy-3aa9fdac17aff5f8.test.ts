/**
 * Ruling 3aa9fdac17aff5f8 — Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · [Reaction]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Spell · Calm · 3+[calm][calm] · [Reaction] — "Counter a spell."
 *   × Miss Fortune, Captain (ogn-162-298) · Unit — "The first time I move each turn, you may ready something else that's exhausted."
 *
 * Q: Can unit abilities (like Miss Fortune's on-move ability) be countered by Defy, and do they open a chain?
 * A: They DO open a chain (the opponent gets priority to respond), but they are abilities, not spells — Defy and Wind
 *    Wall "counter a spell" and therefore have no legal target; the ability resolves.
 * Rules: 383.3 (triggered ability → chain), 340/343 (priority in the closed state), 425 (counter), 355 (legal targets).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const MISS_FORTUNE = "ogn-162-298";
/** A 1-cost slow spell so the contrast ("Defy CAN counter a spell") is observable. */
const PEBBLE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Pebble",
} as const;

/**
 * P1's turn. Miss Fortune + an EXHAUSTED Sleepy in P1's base; bf1 is open. P2 holds Defy AND Wind Wall with enough for
 * both (4 energy, 3 calm). P1 also holds Pebble (1 energy) for the contrast.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "base", { might: 3, name: "Sleepy" }, "sleepy", { exhausted: true })
    .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
    .hand(P1, PEBBLE, "pebble")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "ww");
}

/** Miss Fortune moves to bf1; P1 accepts her trigger (Sleepy is the only exhausted thing); P1 passes → P2 has priority. */
async function mfTriggerPendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("mf", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mf", pendingChoiceType: "opt-in" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("sleepy");
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  return game;
}

describe("Ruling 3aa9fdac17aff5f8 — a unit's triggered ability opens a chain but Defy / Wind Wall cannot counter it", () => {
  test("the ability DOES open a chain: it sits there as an 'ability' item and P2 receives priority to respond before it resolves", async () => {
    const game = await mfTriggerPendingP2Priority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("sleepy").isExhausted).toBe(true); // not resolved yet
  });

  test("…but neither Defy nor Wind Wall is playable against it (they counter SPELLS): not offered, attempts rejected, P2's resources untouched", async () => {
    const game = await mfTriggerPendingP2Priority();
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "ww")).toBe(false);
    const r1 = await game.p2.try((p) => p.cast("defy", { targets: "mf" }));
    expect(r1.ok).toBe(false);
    const r2 = await game.p2.try((p) => p.cast("ww", { targets: "mf" }));
    expect(r2.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } });
    expect(game.p2.hand().sort()).toEqual(["defy", "ww"]);
    // P2 can only pass; the ability resolves and readies Sleepy.
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a SPELL is fair game: P1 casts Pebble (cost 1), P2 Defies it, Pebble is countered and deals nothing", async () => {
    const game = await board().build();
    await game.p1.cast("pebble", { targets: "by" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("defy", { targets: "pebble" });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    await game.settle();
    expect(game.zoneOf("pebble")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("by").damage).toBe(0);
  });
});
