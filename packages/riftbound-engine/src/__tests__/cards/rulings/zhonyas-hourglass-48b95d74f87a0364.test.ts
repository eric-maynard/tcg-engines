/**
 * Ruling 48b95d74f87a0364 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] · "[Hidden] If a friendly unit would
 *     die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Scuttle Crab (UNL-053 → unl-053-219) · 0 Might · "… [Deathknell] Choose an opponent. They reveal their hand. You
 *     can look at their facedown cards this turn. Gain 1 XP."
 *
 * Q: My unit at a battlefield dies while Zhonya's is hidden there — can I reveal Zhonya's after it dies, or must the
 *    reveal happen before?
 * A: (1) Plain combat death: no — once both players pass in the showdown, damage is dealt and cleanup follows with no
 *    reaction window; you had to flip Zhonya's (Reaction speed while hidden) before the passes. If you lose the
 *    battlefield the hidden card is discarded in cleanup. (2) If the dying unit has a Deathknell (Scuttle Crab), that
 *    trigger opens a chain and you DO get priority to reveal Zhonya's then — but that is too late to save that unit.
 * Rules: 811.6 (hidden cards have Reaction), 465–467 (combat damage → cleanup, no window), 383/808 (Deathknell uses
 *        the chain), 181.4.c (facedown card removed when control is lost), FAQ #7086/#8150/#9010.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SCUTTLE_CRAB = "unl-053-219";

/** P2's turn; P2's Raider (3) in base ready to attack P1's bf1, where Zhonya's lies facedown. */
function base() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .facedown(P1, "bf1", ZHONYAS, "zhonyas")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Answer any combat-damage distribution with the engine's offered default; pass anything passable; stop at an open main phase. Reports whether P1 ever had a legal reveal. */
async function finishCombatWatchingForRevealWindow(game: Game): Promise<boolean> {
  let p1CouldReveal = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main" && d.endTurnKey)) {
      break;
    }
    if (game.p1.can("reveal", "zhonyas")) {
      p1CouldReveal = true;
    }
    if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute(d.defaultAllocation);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "action") {
      const proc = d.options.find((o) => o.verb === "resolveCombat");
      if (!proc) {
        break;
      }
      await game.seat(d.seat).choose(proc.key);
    } else {
      break;
    }
  }
  return p1CouldReveal;
}

describe("Ruling 48b95d74f87a0364 — when a hidden Zhonya's can still be flipped for a dying unit", () => {
  test("case 1 (plain combat death): the window is DURING the showdown — with Focus, P1's hidden Zhonya's is a legal reveal; P1 passes instead, damage kills the lone Defender, P2 conquers, and the still-hidden Zhonya's is discarded in cleanup with no reveal window in between", async () => {
    const game = await base().unit(P1, "bf1", { might: 2, name: "Defender" }, "defender").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true); // ← this was the moment
    await game.p1.passFocus(); // both passed: combat damage now
    const hadWindow = await finishCombatWatchingForRevealWindow(game);
    expect(hadWindow).toBe(false);
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("zhonyas")).toBe("trash"); // lost the battlefield → facedown card discarded
    expect(game.state("zhonyas").isHidden).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("case 1, done right: revealing Zhonya's while holding Focus (for [0]) puts it in play; when the Defender then takes lethal combat damage Zhonya's dies instead and the Defender is healed, exhausted and recalled", async () => {
    const game = await base().unit(P1, "bf1", { might: 2, name: "Defender" }, "defender").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.energy()).toBe(0);
    await game.p1.reveal("zhonyas");
    expect(game.state("zhonyas").isHidden).toBe(false);
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("defender")).toBe("base");
    expect(game.state("defender")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // nobody left defending
    expect(game.violations()).toEqual([]);
  });

  test("case 2 (Deathknell): Scuttle Crab dies to combat damage (Guard survives, P1 keeps bf1) → its Deathknell goes on the chain and P1 gets priority — revealing Zhonya's IS legal there, but Scuttle is already in the trash and stays there", async () => {
    const game = await base().unit(P1, "bf1", SCUTTLE_CRAB, "scuttle").unit(P1, "bf1", { might: 5, name: "Guard" }, "guard").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    // Combat damage: P2 splits 3 — the offered default puts the lethal 1 on Scuttle.
    for (let i = 0; i < 6 && game.chain().length === 0; i++) {
      const d = game.decision();
      if (d?.kind === "distribute") {
        expect(d.seat).toBe(P2);
        await game.p2.distribute({ guard: 2, scuttle: 1 });
      } else if (d?.kind === "action" && !d.passKey) {
        const proc = d.options.find((o) => o.verb === "resolveCombat");
        if (!proc) {
          break;
        }
        await game.seat(d.seat).choose(proc.key);
      } else {
        break;
      }
    }
    expect(game.zoneOf("scuttle")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // took 5 from the Guard
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scuttle", controller: P1, triggered: true })]);
    // The Deathknell created a Closed state with priority: NOW the hidden Zhonya's may be revealed.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    expect(game.state("zhonyas").isHidden).toBe(false);
    await game.settle();
    // Too late for Scuttle: it was dead before the window opened. Zhonya's is simply in play now.
    expect(game.zoneOf("scuttle")).toBe("trash");
    expect(game.zoneOf("zhonyas")).not.toBe("trash");
    expect(game.zoneOf("zhonyas")).not.toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(1); // the Deathknell resolved (Gain 1 XP)
    expect(game.violations()).toEqual([]);
  });
});
