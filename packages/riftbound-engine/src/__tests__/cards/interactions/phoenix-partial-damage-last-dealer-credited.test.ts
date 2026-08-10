/**
 * Interaction: Immortal Phoenix (ogn-037-298) · Unit · Fury · 3 — "[Assault 2] … When you kill a unit with a spell,
 *     you may pay [1][fury] to play me from your trash."
 *   × Falling Star (ogn-029-298) · Spell · Fury · 2 + [fury][fury] — "Deal 3 to a unit. Deal 3 to a unit."
 *   × Void Seeker  (ogn-024-298) · Spell · Fury · 3 + [fury] · Action — "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Rules: 428.1.a.2 / 428.4 (lethal damage kills only in the following Cleanup — never mid-resolution), 428.5.c
 * (a Cleanup kill is attributed to the spell/ability that resolved IMMEDIATELY PRIOR to that Cleanup and dealt
 * damage to the unit), 428.5.c.1 (the player responsible for that Deal is responsible for the kill), 428.5.c.2
 * (a Combat-Cleanup kill is attributed to the combat-damage sources), 417.6.a / 417.6.c (who is responsible for
 * a Deal), 383.2.c.1 (earlier, survived damage credits nobody later).
 *
 * Q: Phoenix in P1's trash, [1][fury] spare. Enemy X (5) at P2's bf1, enemy Y (4) at P2's bf2.
 *   (a) Falling Star, both 'Deal 3' on X (6) — how many Phoenix triggers, killed by what?
 *   (b) Split 3→X / 3→Y (nobody dies); later Void Seeker (4) finishes X — which spell is credited, Phoenix?
 *   (c) Split, then a 2-Might P1 unit attacks X; X dies to combat damage in the Combat Cleanup — Phoenix?
 *   (d) Split, then P2 finishes its own X with P2's Void Seeker during a showdown — does P1's Phoenix trigger?
 * Expected: (a) X dies once in the Cleanup after Falling Star → ONE trigger, credited to Falling Star / P1; Y
 * untouched. (b) Falling Star's Cleanup killed nothing → no credit; Void Seeker's Cleanup kills X → credited to
 * Void Seeker / P1 → Phoenix triggers. (c) Combat kill → credited to the attacker, not a spell → no Phoenix (the
 * attacker also dies to X's 5). (d) Credited to P2's Void Seeker / P2 → P1's Phoenix silent; a Phoenix in P2's
 * trash would trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const FALLING_STAR = "ogn-029-298";
const VOID_SEEKER = "ogn-024-298";

/**
 * P1's turn. Pools: P1 = Falling Star (2+FF) + Void Seeker (3+F) + Phoenix replay (1+F) = 6 energy / 4 fury;
 * P2 = its own Void Seeker (3+F) + its own Phoenix replay (1+F) = 4 / 2. X (5) at bf1, Y (4) at bf2 — both
 * P2 battlefields; P1's 2-Might Scout in base is the combat finisher.
 */
function board(opts: { p2Phoenix?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 6, power: { fury: 4 } })
    .resources(P2, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "X" }, "x")
    .unit(P2, "bf2", { might: 4, name: "Y" }, "y")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, FALLING_STAR, "star")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, VOID_SEEKER, "theirSeeker");
  return opts.p2Phoenix ? b.trash(P2, IMMORTAL_PHOENIX, "theirPhoenix") : b;
}

/** rule 417 — the engine's public dealt-damage records for `target`, oldest first: [source card, amount, combat?]. */
function hits(game: Game, target: string): [string | undefined, number, boolean][] {
  return (game.gameState.damageLog ?? []).filter((r) => r.target === target).map((r) => [r.source.cardId, r.amount, r.combat]);
}

const isPhoenixOptIn = (game: Game, seat: string, source: string) => {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === seat && d.source?.cardId === source && /Pay \[1\]\[fury\]/.test(d.prompt);
};

/** (b)–(d) opening: Falling Star split 3 → X, 3 → Y; nobody dies, nothing is asked. */
async function splitStar(game: Game): Promise<void> {
  await game.p1.cast("star", { targets: ["x", "y"] });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.state("x").damage).toBe(3);
  expect(game.state("y").damage).toBe(3);
  expect(game.zoneOf("phoenix")).toBe("trash");
}

describe("Immortal Phoenix — partial spell damage: only the LAST dealer before the killing Cleanup is credited", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) both 'Deal 3' on X: no mid-resolution death — X carries 3+3 from Falling Star and dies in the Cleanup after it (428.4); Y is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "x"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(hits(game, "x")).toEqual([
      ["star", 3, false],
      ["star", 3, false],
    ]);
    expect(game.state("y")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("star")).toBe("trash");
  });

  test("(a) ONE unit died → exactly ONE Phoenix trigger credited to P1's spell (428.5.c/.c.1): a single opt-in for P1, a single Phoenix item on the chain, one 'die' event this turn", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "x"] });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isPhoenixOptIn(game, P1, "phoenix")).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.chain().filter((i) => i.cardId === "phoenix")).toHaveLength(1);
    expect(game.gameState.turnEventCounts?.die).toBe(1);
  });

  test("(a) accepting pays exactly [1][fury] and the Phoenix enters P1's base exhausted; afterwards the game is open — no second prompt for the second 'Deal 3'", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["x", "x"] });
    await game.settle();
    const before = game.p1.resources();
    await game.p1.yes();
    expect(game.p1.energy()).toBe(before.energy - 1);
    expect(game.p1.power("fury")).toBe((before.power.fury ?? 0) - 1);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) split 3/3: Falling Star's Cleanup kills nobody → no attribution, no Phoenix prompt, nothing spent beyond the spell", async () => {
    const game = await board().build();
    await splitStar(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.zoneOf("y")).toBe("battlefield-bf2");
  });

  test("(b) later Void Seeker deals 4 to X (3 + 4 = 7 ≥ 5) → X dies in the Cleanup after VOID SEEKER; the last dealer on record is Void Seeker, not Falling Star (428.5.c)", async () => {
    const game = await board().build();
    await splitStar(game);
    await game.p1.cast("seeker", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(hits(game, "x")).toEqual([
      ["star", 3, false],
      ["seeker", 4, false],
    ]);
    expect(hits(game, "x").at(-1)?.[0]).toBe("seeker");
    expect(game.zoneOf("seeker")).toBe("trash");
  });

  test("(b) …credited to P1's spell → 'you killed a unit with a spell': P1 gets the Phoenix opt-in, pays the last [1][fury] and the Phoenix lands in base", async () => {
    const game = await board().build();
    await splitStar(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("seeker", { targets: "x" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isPhoenixOptIn(game, P1, "phoenix")).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Void Seeker's "Draw 1" already happened
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("phoenix")).toBe("base");
  });

  // ---------------------------------------------------------------- (c)
  test("(c) split, then P1's 2-Might Scout attacks X: X (3 marked) takes 2 combat damage and dies in the COMBAT Cleanup; X's 5 kills the Scout too", async () => {
    const game = await board().build();
    await splitStar(game);
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(hits(game, "x")).toEqual([
      ["star", 3, false],
      [undefined, 2, true], // pooled combat damage from P1's attacker(s)
    ]);
    expect(hits(game, "scout")).toEqual([[undefined, 5, true]]);
    expect(game.zoneOf("y")).toBe("battlefield-bf2");
  });

  test("(c) the kill is attributed to the combat-damage source (428.5.c.2) — P1 killed X, but NOT with a spell: no Phoenix prompt, Phoenix stays in the trash, pool untouched since Falling Star", async () => {
    const game = await board().build();
    await splitStar(game);
    await game.p1.move("scout", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    expect(game.gameState.turnEventCounts?.die).toBe(2); // X and the Scout — two deaths, zero spell kills
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d)
  /** Split, Scout walks into bf1 (combat showdown, P1 has Focus), P1 passes Focus, P2 Void-Seekers its own X. */
  async function p2FinishesX(game: Game): Promise<void> {
    await splitStar(game);
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "theirSeeker")).toBe(true); // [Action]: legal inside a showdown
    await game.p2.cast("theirSeeker", { targets: "x" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "theirSeeker", controller: P2, targets: ["x"] })]);
  }

  test("(d) P2's own Void Seeker in the showdown finishes X (3 + 4): X dies in the Cleanup after P2's spell — last dealer = theirSeeker, responsible player = P2 (428.5.c.1)", async () => {
    const game = await board().build();
    await p2FinishesX(game);
    await game.acting().passPriority();
    await game.acting().passPriority(); // both pass → P2's Void Seeker resolves, then the Cleanup
    expect(game.zoneOf("x")).toBe("trash");
    expect(hits(game, "x")).toEqual([
      ["star", 3, false],
      ["theirSeeker", 4, false],
    ]);
    expect(game.zoneOf("theirSeeker")).toBe("trash");
  });

  test("(d) P1 did not kill it → P1's Phoenix never asks; the showdown/combat just plays out (Scout conquers the emptied bf1) and P1's pool is untouched", async () => {
    const game = await board().build();
    await p2FinishesX(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast — a Phoenix in P2's trash DOES trigger for P2 (P2 killed a unit with P2's spell): the opt-in is P2's, sourced from P2's Phoenix, and P1 is never asked", async () => {
    const game = await board({ p2Phoenix: true }).build();
    await p2FinishesX(game);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.zoneOf("x")).toBe("trash");
    expect(isPhoenixOptIn(game, P2, "theirPhoenix")).toBe(true);
    expect(game.chain().filter((i) => i.cardId === "phoenix")).toEqual([]);
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    // P2 still controls battlefields, so the replay asks P2 where its Phoenix enters (355.2.a) — base.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "theirPhoenix" } });
    await game.p2.pick("base");
    const after = await game.settle();
    expect(after.reason).toBe("open"); // no P1 prompt followed
    expect(game.zoneOf("theirPhoenix")).toBe("base");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
  });
});
