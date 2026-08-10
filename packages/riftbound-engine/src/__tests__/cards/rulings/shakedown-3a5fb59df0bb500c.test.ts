/**
 * Ruling 3a5fb59df0bb500c — Shakedown (OGN-033 → ogn-033-298) · Reaction · Fury · [2][fury]
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 2 · 1 Might · "[Deathknell] — Draw 1."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]."
 *
 * Q: Watchful Sentry moves onto an EMPTY Trifarian War Camp (no combat). Can a Reaction like Shakedown be played
 *    during that showdown?
 * A: Yes. A showdown opens (with its own chain opportunities) whether or not combat occurs; both players may play
 *    Action- and Reaction-speed spells while it lasts, and it ends only once everyone passes on an empty chain.
 * Rules: 344.2 / 345 (Non-Combat Showdown; Focus allows Action-speed plays; Reactions always OK in a showdown), 347 /
 *        348 (ends on consecutive passes over an empty chain), 469.1 (sole player left establishes control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
/** Inline P2 spells to probe both speeds from the non-turn player's side. */
const P2_ACTION = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Jab", timing: "action" } as const;
const P2_REACTION = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Flick", timing: "reaction" } as const;

/**
 * P1's turn. Trifarian War Camp is empty and uncontrolled (live text). P1: Watchful Sentry ready in base, Shakedown in
 * hand with exactly [2][fury]. P2: a 3-Might Bystander in base (Shakedown's enemy unit), an Action and a Reaction spell
 * in hand with [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("camp", { controller: null, def: TRIFARIAN_WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .hand(P1, SHAKEDOWN, "shakedown")
    .hand(P2, P2_ACTION, "jab")
    .hand(P2, P2_REACTION, "flick");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

async function sentryToEmptyCamp(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("cast", "shakedown")).toBe(true); // (a Reaction is fine in your own open state too)
  await game.p1.move("sentry", "camp");
  return game;
}

describe("Ruling 3a5fb59df0bb500c — a no-combat showdown still has a chain: Reactions (and Actions) are playable in it", () => {
  test("Sentry alone onto the empty War Camp opens a NON-combat showdown (no defender, no combat) with P1 holding Focus; Sentry is 2 Might there (+1)", async () => {
    const game = await sentryToEmptyCamp();
    expect(showdown(game)).toMatchObject({ battlefieldId: "camp", focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.camp).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.state("sentry")).toMatchObject({ combatRole: null, might: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("during that showdown P1 may play the Reaction Shakedown: it goes on the showdown's chain targeting P2's Bystander, and P2 gets priority to respond", async () => {
    const game = await sentryToEmptyCamp();
    expect(game.p1.can("cast", "shakedown")).toBe(true);
    await game.p1.cast("shakedown", { targets: "bystander" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shakedown", controller: P1, targets: ["bystander"] })]);
    expect(showdown(game)).toMatchObject({ battlefieldId: "camp" }); // still inside the showdown
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flick")).toBe(true); // P2's Reaction is legal on this chain too
  });

  test("Shakedown resolves inside the showdown: P2 (the Bystander's controller) is asked the 'unless' choice; declining → Bystander takes 6 and dies; the showdown is STILL open afterwards", async () => {
    const game = await sentryToEmptyCamp();
    await game.p1.cast("shakedown", { targets: "bystander" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["yes-no", "pick"]).toContain(d?.kind as string);
    if (d?.kind === "yes-no") {
      await game.p2.no();
    } else if (d?.kind === "pick") {
      const opt = d.options.find((o) => !/draw/i.test(o.label)) ?? d.options[1];
      await game.p2.pick(opt?.key as string);
    }
    expect(game.zoneOf("shakedown")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(showdown(game)).toMatchObject({ battlefieldId: "camp" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("both speeds for both players: once P1 passes Focus, P2 (non-turn player) may play its ACTION-speed Jab as well as its Reaction in this no-combat showdown", async () => {
    const game = await sentryToEmptyCamp();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p2.can("cast", "jab")).toBe(true);
    expect(game.p2.can("cast", "flick")).toBe(true);
    await game.p2.cast("jab", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("jab")).toBe("trash");
    expect(game.state("sentry").damage).toBe(1); // 2 Might at the Camp — survives
    expect(game.zoneOf("sentry")).toBe("battlefield-camp");
  });

  test("the showdown ends only when everyone passes on an empty chain — then, with no opposing unit, P1 conquers the War Camp (+1)", async () => {
    const game = await sentryToEmptyCamp();
    await game.p1.cast("shakedown", { targets: "bystander" });
    game.script(P2, [(d) => (d.kind === "yes-no" ? "no" : d.kind === "pick" ? (d.options.find((o) => !/draw/i.test(o.label)) ?? d.options[1])?.key : undefined)]);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.camp).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
