/**
 * Interaction: countering an ACTIVATED gear ability (vs. a spell counter, vs. an Add ability).
 *   Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · [Reaction]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Iron Ballista (ogn-017-298) · Gear · Fury · 3
 *     "This enters exhausted. [Exhaust]: Deal 2 to a unit at a battlefield."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3 · [Reaction] "Counter a spell."
 *   (+ Gold token sfd-t03 "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]" for contrast (d).)
 *
 * Question. P1's turn, open state. P1 exhausts a ready Iron Ballista choosing P2's 2-Might unit U at bf1.
 *   (a) Can P2 respond with Wind Wall?  (b) With Not So Fast? If NSF resolves, does the Ballista
 *   ready back up / can it be activated again this turn?  (c) P1 aims the Ballista at P1's OWN unit —
 *   can P2 NSF that?  (d) P1 activates a Gold token ([Add]) — can P2 NSF it?
 *
 * Rules: 355.9.a.2 ("spell"/"ability" = objects on the chain — an activated ability is an ABILITY,
 * not a spell); 355.9.b / 355.8 (all targeting restrictions must be met or the counter cannot be
 * put on the chain; "friendly"/"enemy" are relative to Not So Fast's controller); 377 / 402.2 (an
 * activated ability's cost — the [Exhaust] — is paid and its target chosen at finalization); 406.4
 * (then the opponent may React); 425.1 / 425.1.a (countered → does nothing, cleared; NSF → trash);
 * 425.1.c (countering refunds no costs → Ballista stays exhausted); 337.2 / 429.2 (an ability that
 * Adds resources resolves immediately on finalization — never a reaction window).
 *
 * Expected: (a) No — Wind Wall has no legal target. (b) Yes — enemy ability choosing P2's friendly
 * unit; NSF resolves first, the ability is countered, U takes 0; Ballista stays EXHAUSTED and cannot
 * be re-activated; NSF → P2's trash. (c) No — the chosen unit is friendly to P1, not P2. (d) No —
 * the Add resolves at once, nothing is ever on the chain for P2 to answer.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const IRON_BALLISTA = "ogn-017-298";
const WIND_WALL = "ogn-064-298";
const GOLD = "sfd-t03";

/** Printed ability #0 is "This enters exhausted."; the [Exhaust] damage ability is #1. */
const BALLISTA_SHOT = 1;

/**
 * P1's turn 2, Neutral Open. P2 controls bf1 with U (2 Might); P1 controls bf2 with its own Squire
 * (3 Might). P1 has a READY Iron Ballista and a Gold token in base. P2 holds Not So Fast + Wind Wall
 * with 5 energy + 1 calm (enough for either).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "U" }, "u")
    .unit(P1, "bf2", { might: 3, name: "Squire" }, "squire")
    .gear(P1, IRON_BALLISTA, "ballista")
    .gear(P1, GOLD, "gold")
    .hand(P2, NOT_SO_FAST, "nsf")
    .hand(P2, WIND_WALL, "windWall");
}

/** P1 fires the Ballista at `target` and passes priority → P2 now holds priority over the ability. */
async function fireAt(target: "u" | "squire"): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("ballista", BALLISTA_SHOT, { targets: target });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

function castTargets(game: Game, alias: string): unknown[] | undefined {
  return game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets")?.options as unknown[] | undefined;
}

describe("Iron Ballista's [Exhaust] ability at P2's unit — finalization, then P2's window", () => {
  test("activation: the [Exhaust] cost is paid and U is chosen at once; the ability sits on the chain as P1's (non-triggered) ABILITY with P1 holding priority first (377, 402.2)", async () => {
    const game = await board().build();
    expect(game.state("ballista").isReady).toBe(true);
    const offered = game.p1.option("activate", "ballista")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["u"], ["squire"]])); // "a unit at a battlefield" — either side
    await game.p1.activate("ballista", BALLISTA_SHOT, { targets: "u" });
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ballista", controller: P1, targets: ["u"], triggered: false, type: "ability" }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("u").damage).toBe(0); // nothing resolved yet
  });

  test("(a) Wind Wall ('Counter a SPELL') is NOT playable — the only chain object is an ability (355.9.a.2, 355.8)", async () => {
    const game = await fireAt("u");
    expect(game.p2.can("cast", "windWall")).toBe(false);
    const r = await game.p2.try((p) => p.cast("windWall", { targets: "ballista" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("windWall")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 5, power: { calm: 1 } });
  });

  test("(b) Not So Fast IS playable — an ENEMY ability that chooses P2's FRIENDLY unit — and the Ballista ability is its one offered target (355.9.b, 406.4)", async () => {
    const game = await fireAt("u");
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(castTargets(game, "nsf")).toEqual([["ballista"]]);
    await game.p2.cast("nsf", { targets: "ballista" });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 0 } }); // 2 + [calm]
    expect(game.chain().map((i) => [i.cardId, i.controller, i.type])).toEqual([
      ["ballista", P1, "ability"],
      ["nsf", P2, "spell"],
    ]);
  });

  test("(b) NSF resolves first and counters the ability: chain empties, U takes NO damage, NSF → P2's trash (425.1.a)", async () => {
    const game = await fireAt("u");
    await game.p2.cast("nsf", { targets: "ballista" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // NSF resolves
    expect(game.chain()).toEqual([]); // the countered ability was cleared with it
    expect(game.state("u")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p2.trash()).toContain("nsf");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) countering refunds nothing: Iron Ballista stays EXHAUSTED in base and cannot be activated again this turn (425.1.c)", async () => {
    const game = await fireAt("u");
    await game.p2.cast("nsf", { targets: "ballista" });
    await game.settle();
    expect(game.zoneOf("ballista")).toBe("base");
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.p1.can("activate", "ballista")).toBe(false);
    await expect(game.p1.activate("ballista", BALLISTA_SHOT, { targets: "u" })).rejects.toThrow();
    expect(game.violations()).toEqual([]);
  });

  test("(b) control — P2 just passes: the ability resolves and deals 2 to U (2 Might → dies)", async () => {
    const game = await fireAt("u");
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.state("ballista").isExhausted).toBe(true);
  });

  test("(b) it readies normally in P1's next Awaken step and can fire again then", async () => {
    const game = await fireAt("u");
    await game.p2.cast("nsf", { targets: "ballista" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("ballista").isExhausted).toBe(true);
    await game.advanceTurn(); // → P1, turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ballista").isReady).toBe(true);
    expect(game.p1.can("activate", "ballista")).toBe(true);
  });
});

describe("(c) Ballista aimed at P1's OWN unit — not an NSF target", () => {
  test("the ability chooses only a unit friendly to P1: P2 holds priority but Not So Fast is NOT playable (355.9.b, 355.8); the shot resolves for 2 on the Squire", async () => {
    const game = await fireAt("squire");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", targets: ["squire"] })]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(castTargets(game, "nsf")).toBeUndefined();
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "ballista" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    await game.p2.passPriority();
    expect(game.state("squire")).toMatchObject({ damage: 2, location: "bf2" }); // 3 Might survives 2
  });
});

describe("(d) Gold's [Add] ability — never a window", () => {
  test("cracking Gold resolves on finalization: token gone, +1 rainbow, chain EMPTY, priority never passes to P2, and NSF is not playable at any point (337.2, 429.2)", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.resources().power).toEqual({ rainbow: 1 });
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "gold" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
  });
});
