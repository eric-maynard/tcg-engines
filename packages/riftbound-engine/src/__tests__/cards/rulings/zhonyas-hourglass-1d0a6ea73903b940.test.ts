/**
 * Ruling 1d0a6ea73903b940 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [2] calm · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Guardian Angel (sfd-051-221) · Equipment "If I would die, kill Guardian Angel instead. Heal me, exhaust me, recall me."
 *   × Smite (unl-007-219) · Action "Deal 3 to a unit at a battlefield. If it would die this turn, banish it instead." — the
 *     ENEMY-controlled "if it would die" replacement aimed at my unit.
 *
 * Q: Which applies first — an enemy's "if it would die" effect targeted at my unit, or my own (Zhonya's-style) one?
 * A: Several replacement effects on the same event are ORDERED by a player choice: if you control all of them you pick
 *    the order; once the first one replaces the death the unit is no longer dying, so the others have nothing to
 *    replace and are not used. With effects of different controllers the game rules decide who orders them.
 * Rules: 372 (multiple replacements on one event → the affected object's controller/owner chooses the order),
 *        366.1 ("instead"), 373 (a single-use replacement vs simultaneous events).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const SMITE = "unl-007-219";

type PickD = Extract<Decision, { kind: "pick" }>;
const offered = (game: Game) => ((game.decision() as PickD | null)?.options ?? []).map((o) => o.card ?? o.key).sort();

/** P2's turn. P1 holds bf1 with a Squire (2) wearing Guardian Angel (+1 → 3) and has Zhonya's face up in base. P2's Brute (9) attacks. */
function bothMine() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "squire" }, owner: P1, zone: "bf1" })
    .gear(P1, ZHONYAS, "zhonyas")
    .unit(P2, "base", { might: 9, name: "Brute" }, "brute");
}

/** P2's turn with 2+[fury] and Smite. P1 holds bf1 with a bare 3-Might Squire and has Zhonya's face up in base. */
function mineVsTheirs() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
    .gear(P1, ZHONYAS, "zhonyas")
    .hand(P2, SMITE, "smite");
}

async function smiteResolvesToOrdering(): Promise<Game> {
  const game = await mineVsTheirs().build();
  await game.p2.cast("smite", { targets: "squire" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 1d0a6ea73903b940 — I control BOTH replacements (Zhonya's + Guardian Angel): I choose the order; the second is unused", () => {
  test("lethal combat damage to the Squire → a replacement-ORDER pick for P1 (its controller) listing both effects; nothing has happened yet", async () => {
    const game = await bothMine().build();
    await game.p2.move("brute", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    expect(offered(game)).toEqual(["ga", "zhonyas"]);
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.zoneOf("zhonyas")).toBe("base");
  });

  test("Zhonya's first: it is killed instead, the Squire is healed/exhausted/recalled STILL WEARING Guardian Angel — GA had no death left to replace and stays", async () => {
    const game = await bothMine().build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    await game.p1.pick("zhonyas");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(game.state("squire")).toMatchObject({ attachments: ["ga"], damage: 0, isExhausted: true, might: 3, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Guardian Angel first: GA is killed instead, the Squire survives in base at 2, and Zhonya's stays on the board unused", async () => {
    const game = await bothMine().build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    await game.p1.pick("ga");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 2, zone: "base" });
  });
});

describe("Ruling 1d0a6ea73903b940 — an ENEMY 'would die → banish instead' (Smite) vs MY Zhonya's on the same death", () => {
  test("the game rules pick who orders them: per CR 372 it is the affected Squire's controller — P1 is asked (not the Smite caster), with both effects listed", async () => {
    const game = await smiteResolvesToOrdering();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    expect(offered(game)).toEqual(["smite", "zhonyas"]);
    expect(game.p2.decision()?.kind === "pick").toBe(false);
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
  });

  test("P1 applies Zhonya's first: it dies instead, the Squire is healed/exhausted/recalled — never died, so Smite's banish never happens", async () => {
    const game = await smiteResolvesToOrdering();
    await game.p1.pick("zhonyas");
    await game.settle();
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.banishment()).not.toContain("squire");
    expect(game.violations()).toEqual([]);
  });

  test("P1 applies Smite first instead: the Squire is banished (not dead, not recalled) and Zhonya's stays in base unused", async () => {
    const game = await smiteResolvesToOrdering();
    await game.p1.pick("smite");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("squire");
    expect(game.zoneOf("zhonyas")).toBe("base");
  });
});
