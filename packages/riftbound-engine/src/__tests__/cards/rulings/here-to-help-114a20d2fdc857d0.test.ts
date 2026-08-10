/**
 * Ruling 114a20d2fdc857d0 — Here to Help (SFD-111 → sfd-111-221) · Spell · Body · [2][body] · Hidden · Action
 *   "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Unit · Calm · [5][calm] · 5 Might · Tank
 *     "When you play me to a battlefield, you may move an enemy unit to here. …"
 *   × Anivia, Primal (OGN-148 → ogn-148-298) · Unit · Body · 8 Might — "When I attack, deal 3 to all enemy units here."
 *
 * Q: I control both battlefields; the opponent attacks one. Can I Here-to-Help Blitzcrank onto my OTHER battlefield,
 *    and does his hook resolve during the ongoing showdown to create a second showdown?
 * A: Yes. Blitzcrank's trigger goes on the chain during the first showdown; when it resolves it moves the unit, which
 *    stages a second showdown at Blitzcrank's battlefield that waits for the first to finish. Referents resolve on
 *    resolution: hooking Anivia in response to her attack trigger makes her 3 damage land "here" = Blitzcrank's
 *    battlefield; a moved attacker gets a fresh attack trigger in the new combat.
 * Rules: 347 (Action with Focus in a showdown), 811 (Hidden → Reaction), 383.4.e (attack triggers), 359.2 ("here"
 *        evaluated on resolution), 449/460/323.9 (a staged combat begins once the current one ends), 464.2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const BLITZCRANK = "ogn-067-298";
const ANIVIA = "ogn-148-298";

const showdowns = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).map((s) => `${s.battlefieldId}${s.active ? "!" : ""}`);
const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/**
 * P2's turn (turn 3). P1 controls bfA (Warden 4) and bfB (Sentry 4). P2's Raider (3) attacks bfA from base.
 * P1 holds Here to Help + Blitzcrank with exactly [2][body] + ([5]-[3]=[2])[calm].
 */
function raiderBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { body: 1, calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 4, name: "Warden" }, "warden")
    .unit(P1, "bfB", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, HERE_TO_HELP, "help")
    .hand(P1, BLITZCRANK, "blitz");
}

/** Same, but the attacker is Anivia (attack trigger) and Here to Help was HIDDEN at bfB on an earlier turn (Reaction speed). */
function aniviaBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 4, name: "Warden" }, "warden")
    .unit(P1, "bfB", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "base", ANIVIA, "anivia")
    .facedown(P1, "bfB", HERE_TO_HELP, "help")
    .hand(P1, BLITZCRANK, "blitz");
}

/**
 * After Here to Help resolves: pick Blitzcrank from hand, send him to bfB, accept his hook. The lone enemy unit is
 * the forced hook target. Asserts each prompt is P1's. Leaves Blitzcrank's trigger on the chain (P1 has priority).
 */
async function playBlitzToBfBAndHook(game: Game): Promise<void> {
  let d: Decision | null = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["blitz"]);
  await game.p1.pick("blitz");
  d = game.decision();
  // Cast from hand P1 chooses between the battlefields it controls; played from HIDDEN, rule 811.1.d.3
  // (ruling 248dec2f9fd0302c) leaves bfB as the only legal location, so it is locked in with no prompt.
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key.startsWith("battlefield-"))) {
    expect(d.options.map((o) => o.key).sort()).toEqual(["battlefield-bfA", "battlefield-bfB"]); // only battlefields P1 controls
    await game.p1.pick("battlefield-bfB");
  }
  expect(game.zoneOf("blitz")).toBe("battlefield-bfB");
  d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may move an enemy unit to here"
  await game.p1.yes();
  for (let i = 0; i < 2; i++) {
    const p = game.decision();
    if (p?.kind === "pick" && p.seat === P1) {
      await game.p1.pick(p.options[0]?.key as string);
    }
  }
  expect(game.chain().at(-1)).toMatchObject({ cardId: "blitz", controller: P1, triggered: true });
}

describe("Ruling 114a20d2fdc857d0 — Here to Help → Blitzcrank at my other battlefield hooks the attacker into a second, queued showdown", () => {
  test("P2 attacks bfA; once P2 passes Focus, P1 may cast Here to Help (Action) in the showdown, play Blitzcrank to bfB for [2][calm], and his hook goes ON THE CHAIN while bfA's showdown is still the active one", async () => {
    const game = await raiderBoard().build();
    await game.p2.move("raider", "bfA");
    expect(showdowns(game)).toEqual(["bfA!"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "help")).toBe(false); // no Focus yet
    await game.p2.passFocus();
    expect(game.p1.can("cast", "help")).toBe(true);
    await game.p1.cast("help");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, calm: 1 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Here to Help resolves
    await playBlitzToBfBAndHook(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 0 } }); // 5 - 3 = [2] + [calm]
    expect(chainIds(game)).toEqual(["blitz*"]);
    expect(showdowns(game)).toEqual(["bfA!"]);
    expect(game.locationOf("raider")).toBe("bfA"); // nothing moved yet
  });

  test("the hook RESOLVES inside the bfA showdown: Raider is moved to bfB, which stages a second showdown that WAITS — bfA is still the active showdown and play continues there first", async () => {
    const game = await raiderBoard().build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.cast("help");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await playBlitzToBfBAndHook(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blitzcrank's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("raider")).toBe("bfB");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1); // nothing decided at bfB yet
    expect(game.zoneOf("raider")).toBe("battlefield-bfB");
    expect(game.state("raider").damage).toBe(0);
  });

  test("after everyone passes at bfA (no attacker left → P1 keeps bfA), the queued bfB combat runs: Raider (3) attacks into Blitzcrank (5, Tank) + Sentry and dies; P1 keeps both battlefields, P2 scores nothing", async () => {
    const game = await raiderBoard().build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.cast("help");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await playBlitzToBfBAndHook(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Close bfA: both pass Focus.
    await game.acting().passFocus();
    await game.acting().passFocus();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    // Now the second showdown is live at bfB with Raider as the attacker.
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true, attackingPlayer: P2 });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.state("warden").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 114a20d2fdc857d0 (nuance) — hooking Anivia in response to her attack trigger: 'here' is re-read on resolution", () => {
  /** Anivia attacks bfA (trigger on chain); P2 passes; P1 flips hidden Here to Help, plays Blitz to bfB, hooks Anivia; resolve down to Anivia's trigger. */
  async function hookAniviaInResponse(): Promise<Game> {
    const game = await aniviaBoard().build();
    await game.p2.move("anivia", "bfA");
    expect(chainIds(game)).toEqual(["anivia*"]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "help")).toBe(true); // hidden at bfB, flipped while the fight is at bfA
    await game.p1.reveal("help");
    expect(chainIds(game)).toEqual(["anivia*", "help"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Here to Help resolves
    await playBlitzToBfBAndHook(game);
    expect(chainIds(game)).toEqual(["anivia*", "blitz*"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // hook resolves: Anivia → bfB
    expect(game.locationOf("anivia")).toBe("bfB");
    expect(chainIds(game)).toEqual(["anivia*"]); // her ORIGINAL attack trigger is still pending
    return game;
  }

  test("Anivia's first attack trigger resolves with her already at bfB: the 3 damage hits enemy units THERE (Blitzcrank, Sentry) and NOT the Warden at bfA", async () => {
    const game = await hookAniviaInResponse();
    expect(game.state("warden").damage).toBe(0);
    expect(game.state("blitz").damage).toBe(0);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Anivia's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("warden").damage).toBe(0);
    expect(game.state("blitz").damage).toBe(3);
    expect(game.state("sentry").damage).toBe(3);
    // Still bfA's showdown first; bfB is queued.
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA" });
  });

  // Ruling nuance ("the unit gets a second attack trigger at the new battlefield"): when bfA closes and the queued
  // combat opens at bfB, Anivia is designated Attacker of a NEW combat (rule 464.2.a), so "When I attack" triggers
  // again — an anivia* item on the bfB Combat Chain before any Focus action.
  test("ruling 114a20d2fdc857d0 — the hooked attacker gets a SECOND attack trigger when the queued bfB combat opens", async () => {
    const game = await hookAniviaInResponse();
    await game.acting().passPriority();
    await game.acting().passPriority(); // first trigger resolves at bfB
    await game.acting().passFocus();
    await game.acting().passFocus(); // bfA closes (no attackers) → bfB combat opens
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(chainIds(game)).toEqual(["anivia*"]);
  });
});
