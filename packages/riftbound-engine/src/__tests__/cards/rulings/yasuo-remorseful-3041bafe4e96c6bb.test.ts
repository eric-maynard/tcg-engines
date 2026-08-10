/**
 * Ruling 3041bafe4e96c6bb — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · 6 · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · 2 · 2 Might · [Hidden]
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *      original location."
 *
 * Q: The opponent is attacking my battlefield. If I swap Yasuo onto it with Tideturner, does his "When I attack" trigger?
 * A: No. Attacker/defender is set by who applied Contested to the battlefield, not by who moves in. The opponent is
 *    the attacker, so Yasuo arrives as a DEFENDER and never gains the attacker designation — no trigger.
 * Rules: 464.2.c (attacker = the contesting player's units; others there are defenders), 383.4.e ("When I attack"
 *        fires on gaining the attacker designation), 811 (Hidden → play as a Reaction at that battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn. P1 controls bf1 with a 2-Might Sentinel and a facedown Tideturner there; Yasuo (6) waits in P1's base.
 * P2's Raider (4) attacks from base.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bf1", TIDETURNER, "tide")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** Raider attacks bf1; P2 passes focus; P1 flips Tideturner, opts in, swaps with Yasuo; the play trigger resolves. */
async function swapYasuoIn(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tide" } });
  await game.p1.yes();
  // "a unit you control at another location": Yasuo (base) is the only candidate; pick it if asked.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["yasuo"]);
    await game.p1.pick("yasuo");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["tide"]);
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tide"); i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling 3041bafe4e96c6bb — Yasuo swapped in by Tideturner while DEFENDING does not 'attack'", () => {
  test("the swap happens: Tideturner ends in P1's base, Yasuo is now at bf1 — as a DEFENDER (P2 contested the battlefield)", async () => {
    const game = await board().build();
    await swapYasuoIn(game);
    expect(game.zoneOf("tide")).toBe("base");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
  });

  test("no 'When I attack' trigger: the chain is empty after the swap, P1 is never asked to target an enemy, and the Raider takes no ability damage", async () => {
    const game = await board().build();
    await swapYasuoIn(game);
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "yasuo")).toBe(false);
    const d = game.decision();
    expect(d?.kind).toBe("action"); // back to showdown focus, not a Yasuo target prompt
    expect(d).toMatchObject({ context: "showdown" });
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("the combat then resolves normally with Yasuo defending: Raider (4) dies to 8 defending Might, P1 holds bf1, and Yasuo's ability never fired at any point", async () => {
    const game = await board().build();
    await swapYasuoIn(game);
    let yasuoTargetPrompt = false;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick" && d.source?.cardId === "yasuo") {
          yasuoTargetPrompt = true;
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(yasuoTargetPrompt).toBe(false);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — on P1's own turn Yasuo moving into an enemy battlefield IS the attacker and his trigger goes on the chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Raider" }, "raider")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    // Single enemy there → target may be locked automatically; either way the trigger is on the chain.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("raider");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 6 damage from the trigger
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
