/**
 * Twilight Reveler — ven-020-166 · Unit · Fury · 3 energy · 3 Might
 *
 *   When I attack, ready another friendly unit.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - "When I attack" (383.4.e) fires when the Reveler gains the Attacker designation as a COMBAT
 *    opens (464.2.c.3) — not on the move itself. Walking onto an empty or friendly battlefield is a
 *    move with no combat: no trigger (it just conquers / relocates). Defending never triggers it.
 *  - The move exhausts every unit that moved; the trigger then readies ONE OTHER friendly unit —
 *    anywhere on the board (no "here"): the buddy that attacked alongside it, or an exhausted unit
 *    back in base. The Reveler itself is never a legal choice; enemy units are never "friendly".
 *  - It is a triggered ability on the combat chain (464.2.e): the defender gets priority before the
 *    ready happens.
 *  - No other friendly unit → the trigger has nothing to choose; combat must still proceed with no
 *    dangling prompt.
 *  - Practical payoff: a buddy readied at the battlefield is READY after the fight, so it can make
 *    another Standard Move that same turn (e.g. fall back to base).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-020-166";

/** Pass priority around the combat chain; answer the ready-target prompt with `target` if asked. */
async function resolveTrigger(game: Game, target?: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      offered = d.options.map((o) => o.card ?? o.key);
      expect(d.seat).toBe(P1);
      await game.seat(d.seat).pick(target as string);
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return offered;
}

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Enemy Home" }, "foeHome", { exhausted: true })
    .unit(P1, "base", CARD, "rev")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 4, name: "Sleepy" }, "sleepy", { exhausted: true });
}

describe("Twilight Reveler (ven-020-166)", () => {
  test("cost: 3 energy, no power; 3 Might, enters exhausted; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "rev").build();
    await game.p1.play("rev");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rev")).toBe("base");
    expect(game.state("rev")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.chain()).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "rev").build()).p1.can("play", "rev")).toBe(false);
  });

  test("attacking alone: the trigger goes on the chain; only OTHER FRIENDLY units are offered; the exhausted unit in base is readied", async () => {
    const game = await board().build();
    await game.p1.move("rev", "bf1");
    expect(game.state("rev").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rev", controller: P1, triggered: true })]);
    const offered = await resolveTrigger(game, "sleepy");
    expect([...offered].sort()).toEqual(["buddy", "sleepy"]); // never rev, never def / foeHome
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.state("rev").isExhausted).toBe(true); // "another": it does not ready itself
    expect(game.state("foeHome").isExhausted).toBe(true);
    // and the fight goes on: 3 vs 2 → defender dies, Reveler conquers
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("rev")).toBe("bf1");
  });

  test("attacking WITH a buddy: both arrive exhausted, the trigger readies the buddy at the battlefield before combat damage", async () => {
    const game = await board().build();
    await game.p1.move(["rev", "buddy"], "bf1");
    expect(game.state("buddy").isExhausted).toBe(true);
    await resolveTrigger(game, "buddy");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("buddy")).toMatchObject({ isReady: true, location: "bf1" });
    expect(game.state("rev").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("payoff: the buddy readied at the battlefield can make another Standard Move (back to base) the same turn after the conquer", async () => {
    const game = await board().build();
    await game.p1.move(["rev", "buddy"], "bf1");
    await resolveTrigger(game, "buddy");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("buddy").isReady).toBe(true);
    await game.p1.move("buddy", "base");
    expect(game.locationOf("buddy")).toBe("base");
    // the exhausted Reveler cannot follow
    expect((await game.p1.try((p) => p.move("rev", "base"))).ok).toBe(false);
  });

  test("the defender gets priority on the combat chain before the ready happens", async () => {
    const game = await board().build();
    await game.p1.move("rev", "bf1");
    await game.p1.pick("sleepy"); // rule 402 (finalization): the target is chosen before priority
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.state("buddy").isReady).toBe(true);
  });

  test("negative space — DEFENDING is not attacking: an enemy walking into the Reveler's battlefield triggers nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rev")
      .unit(P1, "base", { might: 4, name: "Sleepy" }, "sleepy", { exhausted: true })
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.zoneOf("raider")).toBe("trash"); // 3-Might defender kills the 2-Might raider
  });

  test("negative space — moving onto an EMPTY enemy battlefield is a conquer with no combat: no Attacker designation, no trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "rev")
      .unit(P1, "base", { might: 4, name: "Sleepy" }, "sleepy", { exhausted: true })
      .build();
    await game.p1.move("rev", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("sleepy").isExhausted).toBe(true);
  });

  test("negative space — relocating to a battlefield you already control is not an attack either", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Flag" }, "flag", { exhausted: true })
      .unit(P1, "base", CARD, "rev")
      .build();
    await game.p1.move("rev", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("flag").isExhausted).toBe(true);
  });

  test("no other friendly unit: nothing to ready, no dangling prompt, combat still resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P2, "base", { might: 1, name: "Enemy Home" }, "foeHome", { exhausted: true })
      .unit(P1, "base", CARD, "rev")
      .build();
    await game.p1.move("rev", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("foeHome").isExhausted).toBe(true); // enemy units are never "friendly"
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("rev").isExhausted).toBe(true);
  });

  test("another unit attacking while the Reveler stays home triggers nothing (When *I* attack)", async () => {
    const game = await board().build();
    await game.p1.move("buddy", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("sleepy").isExhausted).toBe(true);
  });

  test("parsed abilities match the printed text: a single self attack trigger that readies another friendly unit (not optional, no location limit)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 3 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as Record<string, unknown>;
    expect(ab).toMatchObject({
      effect: { target: { controller: "friendly", excludeSelf: true, type: "unit" }, type: "ready" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
    expect(ab.optional).not.toBe(true);
    expect((ab.effect as { target: { location?: unknown } }).target.location).toBeUndefined();
  });
});
