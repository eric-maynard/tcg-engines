/**
 * Ruling 21ede99bc05b70e2 — Wind Wall (OGN-064 → ogn-064-298) · Reaction spell · Calm · [3][calm][calm] — "Counter a spell."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · Order · [8][order][order] · 6 Might
 *     "When you play me, kill an enemy unit."
 *
 * Q: Can Wind Wall counter unit/champion abilities such as Harnessed Dragon's "kill an enemy unit"?
 * A: No. Wind Wall counters SPELLS only; it cannot counter a unit's (triggered) ability. (No current card counters
 *    unit abilities.)
 * Rules: 425 (counter), 132/136 (a spell is a card type; a triggered ability on the chain is not a spell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const HARNESSED_DRAGON = "ogn-234-298";
/** Inline P2 spell "Kill a unit." — the contrast Wind Wall CAN counter. */
const EXECUTE = { abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }], cardType: "spell", domain: "order", energyCost: 2, name: "Test Execute", timing: "action" };

/** P2's turn. P1's lone 3-Might Squire in base; P1 holds Wind Wall with exactly [3][calm][calm]. P2: Dragon + [8][order][order] (+ Execute + [2]). */
function board() {
  return scenario()
    .active(P2)
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
    .hand(P1, WIND_WALL, "ww")
    .resources(P1, { energy: 3, power: { calm: 2 } })
    .hand(P2, HARNESSED_DRAGON, "dragon")
    .hand(P2, EXECUTE, "exec")
    .resources(P2, { energy: 10, power: { order: 2 } });
}

/** P2 plays the Dragon; its kill trigger (Squire is the only enemy unit) goes on the chain; hand priority to P1. */
async function dragonTriggerPendingWithP1Priority(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  expect(game.zoneOf("dragon")).toBe("base");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("squire");
    } else if (d?.kind === "action" && d.context === "chain" && d.seat === P2) {
      await game.p2.passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.zoneOf("squire")).toBe("base"); // not killed yet
  return game;
}

describe("Ruling 21ede99bc05b70e2 — Wind Wall counters spells, not unit abilities like Harnessed Dragon's kill trigger", () => {
  test("with only the Dragon's triggered ABILITY on the chain, P1 (holding priority and the full cost) cannot cast Wind Wall — there is no spell to counter", async () => {
    const game = await dragonTriggerPendingWithP1Priority();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    expect(game.p1.can("cast", "ww")).toBe(false);
    const offered = (game.p1.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual([]);
    const r = await game.p1.try((p) => p.cast("ww", { targets: "dragon" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ww")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });

  test("so the ability resolves: the Squire is killed and Wind Wall is still in hand, unspent", async () => {
    const game = await dragonTriggerPendingWithP1Priority();
    await game.p1.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same 'kill a unit' as a SPELL is a legal Wind Wall target and gets countered — Squire lives", async () => {
    const game = await board().build();
    await game.p2.cast("exec", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "ww")).toBe(true);
    const offered = (game.p1.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["exec"]);
    await game.p1.cast("ww", { targets: "exec" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("exec")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
  });
});
