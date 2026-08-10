/**
 * Ruling fff771e47a175023 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Elder Dragon (UNL-118 → unl-118-219) · [12][body×4] · 10 Might "Any amount of your damage is enough to kill enemy units.
 *     When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: Can I react with Star-Crossed to Elder Dragon's "when you play me" ability when my opponent plays it?
 * A: Yes. The Dragon enters the board, THEN its play trigger goes on the chain (Closed State) — a Reaction may be played on top.
 *    LIFO: Star-Crossed resolves first and bounces a friendly + an enemy unit (the Dragon itself is a legal enemy pick); the
 *    Dragon's ability then resolves against what remains — a chosen unit that was returned to hand is simply not hit.
 * Rules: 383.2/383.4.a (play triggers become chain items after the permanent enters), 336/343 (closed state → Reactions),
 *        340 (LIFO), 359.3.e.2/e.5 (target no longer there → not affected).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const ELDER_DRAGON = "unl-118-219";

/**
 * P2's turn with 12 + body×4 and the Dragon in hand; P2 also has a Whelp (2) in base. P1: Victim (3) at bf1 (P1's), Bystander (2)
 * in base, Star-Crossed + [3][chaos].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 2, name: "Whelp" }, "whelp")
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P1, STAR_CROSSED, "sc");
}

/** Answer any P2 pick the Dragon's ability raises by naming P1's units where offered (Victim at bf1, Bystander in base). */
async function dragonPicksEverything(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P2) {
      return;
    }
    const keys = d.options.map((o) => o.card ?? o.key);
    const hit = ["victim", "bystander"].filter((w) => keys.includes(w));
    if (hit.length > 0) {
      await game.p2.pick(...hit.slice(0, Math.max(1, Math.min(hit.length, d.max))));
    } else {
      await game.p2.decline();
    }
  }
}

/** P2 plays the Dragon (answering any at-once picks); stop with the play trigger on the chain and P1 holding priority. */
async function dragonPlayedP1ToRespond(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  expect(game.zoneOf("dragon")).toBe("base"); // the unit is on the board immediately …
  await dragonPicksEverything(game); // (choices asked at finalization, if the engine asks now)
  // … and its "When you play me" is a triggered item on the chain → Closed State.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling fff771e47a175023 — Star-Crossed may answer Elder Dragon's play trigger; it resolves first", () => {
  test("the window exists: Dragon on the board, its play trigger on the chain, and P1 may cast the Reaction Star-Crossed — the Dragon itself is a legal enemy pick", async () => {
    const game = await dragonPlayedP1ToRespond();
    expect(game.p1.can("cast", "sc")).toBe(true);
    const enemyOptions = (game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options ?? [])
      .map((v) => (Array.isArray(v) ? (v as string[])[1] : undefined))
      .filter(Boolean);
    expect(new Set(enemyOptions)).toEqual(new Set(["dragon", "whelp"]));
    await game.p1.cast("sc", { targets: ["victim", "dragon"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "sc"]);
  });

  test("LIFO — Star-Crossed [Victim, Dragon] resolves first: both go to their owners' hands while the Dragon's ability still waits on the chain", async () => {
    const game = await dragonPlayedP1ToRespond();
    await game.p1.cast("sc", { targets: ["victim", "dragon"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p1.hand()).toContain("victim");
    expect(game.zoneOf("dragon")).toBe("hand");
    expect(game.p2.hand()).toContain("dragon");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", triggered: true })]);
  });

  test("then the Dragon's ability resolves against what remains: the bounced Victim takes nothing (it's in hand); the Bystander in base still takes 1 (and survives — the bounced Dragon's 'any amount kills' passive is gone)", async () => {
    const game = await dragonPlayedP1ToRespond();
    await game.p1.cast("sc", { targets: ["victim", "dragon"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await dragonPicksEverything(game); // (choices asked at resolution, if the engine asks now — Victim is no longer offered)
    await game.settle();
    await dragonPicksEverything(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.state("victim").damage).toBe(0);
    // Dragon left the board before its ability resolved → its "any amount kills" passive is gone: Bystander survives with 1.
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.state("bystander").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("variant — Star-Crossed [Victim, Whelp] (Dragon stays): the ability still can't touch the bounced Victim, but the Bystander takes 1 and DIES (Dragon's passive live)", async () => {
    const game = await dragonPlayedP1ToRespond();
    await game.p1.cast("sc", { targets: ["victim", "whelp"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.zoneOf("whelp")).toBe("hand");
    await dragonPicksEverything(game);
    await game.settle();
    await dragonPicksEverything(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
