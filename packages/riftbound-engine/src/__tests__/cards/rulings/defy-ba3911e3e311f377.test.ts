/**
 * Ruling ba3911e3e311f377 — Defy (OGN-045 → ogn-045-298) · Reaction · Calm · 1 + [calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Reaction · Calm · 3 · "Counter a spell."
 *   (subject: Lecturing Yordle ogn-087-298 · 3 · "[Tank] When you play me, draw 1.")
 *
 * Q: Can I counter a unit's "When you play me" ability?
 * A: No. Defy / Wind Wall counter SPELLS; a unit ability is not a spell, so there is nothing for them to target. The
 *    ability does use the chain, so Reactions may be played in response to it (Action cards may not — closed state),
 *    but the ability itself then resolves.
 * Rules: 412 (counter → spells), 383.3 (triggered abilities go on the chain), 331 / 338.1.a (closed state: Reactions only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const LECTURING_YORDLE = "ogn-087-298";
const STUPEFY = "ogn-095-298"; // Reaction [1]: -1 Might this turn (min 1), draw 1
const CHARM = "ogn-043-298"; // Action [1][calm]: move an enemy unit

/** P1's turn with [3] and the Yordle in hand. P2 holds Defy, Wind Wall, Stupefy and Charm with 6 energy + [calm][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 6, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, LECTURING_YORDLE, "yordle")
    .hand(P2, DEFY, "defy")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, CHARM, "charm");
}

/** P1 plays the Yordle and passes priority on its play trigger → P2 to act. */
async function yordleTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("yordle");
  expect(game.p1.energy()).toBe(0);
  expect(game.zoneOf("yordle")).toBe("base"); // the unit is on the board at once …
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yordle", controller: P1, triggered: true })]); // … only its ability is on the chain
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ba3911e3e311f377 — a 'When you play me' ability cannot be countered by Defy or Wind Wall", () => {
  test("with the Yordle's play trigger on the chain, neither Defy nor Wind Wall is castable — the ability is not a spell; attempts are rejected and nothing is spent", async () => {
    const game = await yordleTriggerPending();
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.p2.can("cast", "windwall")).toBe(false);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "yordle" }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.cast("windwall", { targets: "yordle" }))).ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 6, power: { calm: 2 } });
    expect(game.p2.hand().sort()).toEqual(["charm", "defy", "stupefy", "windwall"]);
    expect(game.chain()).toHaveLength(1);
  });

  test("the ability DOES use the chain: P2 may add a [Reaction] (Stupefy on the Yordle) in response — but not an [Action] card (Charm)", async () => {
    const game = await yordleTriggerPending();
    expect(game.p2.can("cast", "charm")).toBe(false);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "yordle" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yordle", "stupefy"]);
    // LIFO: Stupefy resolves first, then the (uncountered) play trigger.
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("yordle").might).toBe(1); // 2 - 1
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Stupefy's draw
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // the Yordle's "draw 1" still happened
    expect(game.violations()).toEqual([]);
  });

  test("left alone, the trigger simply resolves: P1 draws 1, the Yordle stays, both counterspells are still in P2's hand", async () => {
    const game = await yordleTriggerPending();
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.p2.hand()).toContain("defy");
    expect(game.p2.hand()).toContain("windwall");
  });
});
