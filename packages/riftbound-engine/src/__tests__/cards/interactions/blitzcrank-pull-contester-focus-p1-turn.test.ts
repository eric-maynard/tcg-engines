/**
 * Interaction: Blitzcrank, Impassive (ogn-067-298) · Champion Unit · Calm · 5+[calm] · 5 Might · [Tank]
 *     "When you play me to a battlefield, you may move an enemy unit to here."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit (P2's, pulled from P2-held bfB)
 *   × Cleave (ogn-004-298) · Spell · Fury · 1 · [Action] — "Give a unit [Assault 3] this turn."
 *
 * Rules: 190.3.a (a unit arriving at a battlefield its controller doesn't control applies Contested — here
 * P2 applies it on P1's turn), 464.2.c.1 (Attacker = the player who applied Contested; the battlefield's
 * controller defends), 345 / 313.2 / 335.1 (as the showdown begins the contester gains Focus and, with no
 * Combat Chain, Priority), 312.1.b / 313.4 (a player with neither Focus nor Priority may do nothing
 * discretionary), 337.4 (after a play the controller of the newest item holds Priority), 313.3 (Focus does
 * not move while Priority is passed around a chain), 346 / 347.1.b (when a chain opened by a PLAYED card
 * empties during a showdown, Focus passes to the next player in turn order, who gains Focus + Priority),
 * 347.2 / 347.2.a (pass; all passed in sequence → showdown ends → combat damage), 313.5 / 312.2.a (no
 * showdown → focus is nobody's; Neutral Open priority = turn player), 466.5.b (no units left → nobody
 * controls, no conquer).
 *
 * Question: P1's turn, Neutral Open. P1 controls empty bfA and plays Blitzcrank there; its trigger pulls
 * P2's Skulker (at P2's bfB) to bfA. P2 holds Cleave; P1 holds nothing playable.
 *   (a) Combat showdown at bfA on P1's turn: Attacker P2, Focus P2, Priority P2.
 *   (b) P1 can do nothing before P2 acts.
 *   (c) P2 Cleaves Skulker: (prio,focus,state) = (P2,P2,closed) → P2 pass (P1,P2,closed) → P1 pass → resolves.
 *   (d) Chain empties → Focus passes to P1 with Priority (346); P1 pass, P2 pass → combat: Skulker 6 kills
 *       Blitzcrank 5; Blitzcrank's 5 into Skulker is NOT lethal — Assault is "+3 [Might]" (807.1.c), lethal
 *       damage is ≥ Might (142.4.b) and the Attacker designation is still held during the Combat Cleanup
 *       (466.1, removed only at 466.7.a) → Skulker survives, P2 conquers bfA (+1) on P1's turn.
 *       (The table shorthand "5 into Skulker 3 (dies)" forgets Assault is Might, not just offense.)
 *       Without Cleave: Skulker dies, Blitzcrank survives, P1 keeps bfA.
 *   (e) No pull → no Contested → no showdown, no Focus, P1's open main phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P2, CLEAVE, "cleave");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];
/** (priorityHolder, focusHolder, turn state) as the rules name them. */
function triple(game: Game): { priority: string | undefined; focus: string | null; state: string } {
  const sd = showdown(game);
  const hasShowdown = sd?.active === true;
  const hasChain = game.gameState.interaction?.chain?.active === true;
  const state = hasShowdown ? (hasChain ? "showdown-closed" : "showdown-open") : hasChain ? "neutral-closed" : "neutral-open";
  const d = game.decision();
  return { focus: hasShowdown ? sd.focusPlayer : null, priority: d?.kind === "action" ? d.seat : undefined, state };
}

/** P1 plays Blitzcrank to bfA, opts into the pull, binds Skulker, and both pass so the move resolves. */
async function playBlitzAndPull(game: Game): Promise<void> {
  await game.p1.play("blitz", { to: "bfA" });
  if (game.decision()?.kind === "yes-no") {
    await game.p1.yes();
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("skulker");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
  expect(triple(game)).toEqual({ focus: null, priority: P1, state: "neutral-closed" }); // the trigger chain is Neutral Closed
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Blitzcrank pulls a contester onto P1's battlefield on P1's turn — who holds Focus / Priority", () => {
  test("(a) the pull resolves: Skulker arrives at P1-held bfA still under P2's control and P2 applies Contested (190.3.a); bfB is left uncontrolled", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("skulker")).toBe("bfA");
    expect(game.state("skulker").controller).toBe(P2);
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(bf(game, "bfB")?.controller).toBeNull();
  });

  test("(a) the Cleanup opens Combat with a Combat Showdown at bfA on P1's turn: Attacker = P2 (contester, 464.2.c.1), Defender = P1; no triggers → no Combat Chain → Showdown OPEN with Focus P2 AND Priority P2 (345, 313.2, 335.1)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]);
    expect(triple(game)).toEqual({ focus: P2, priority: P2, state: "showdown-open" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(b) before P2 acts, the turn player P1 has neither Focus nor Priority: P1's menu is empty and an attempted pass/play throws (312.1.b, 313.4)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("passFocus")).toBe(false);
    await expect(game.p1.passFocus()).rejects.toThrow();
    await expect(game.p1.pass()).rejects.toThrow();
    // P2, by contrast, may Cleave (Action + Focus + Open, 347.1) or pass.
    expect(game.p2.can("cast", "cleave")).toBe(true);
    expect(game.p2.can("passFocus")).toBe(true);
  });

  test("(c) P2 Cleaves Skulker → (P2, P2, showdown-closed) (337.4); P2 passes → (P1, P2, showdown-closed) — Focus STAYS with P2 while P1 holds Priority (313.3)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    await game.p2.cast("cleave", { targets: "skulker" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P2, triggered: false })]);
    expect(triple(game)).toEqual({ focus: P2, priority: P2, state: "showdown-closed" });
    await game.p2.passPriority();
    expect(triple(game)).toEqual({ focus: P2, priority: P1, state: "showdown-closed" });
    expect(game.state("skulker").grantedKeywords).toEqual([]); // not resolved yet
    // P1 holds priority but has nothing but the pass (no Reaction in hand).
    expect(game.p1.legal().map((o) => o.verb).filter((v) => v !== "concede")).toEqual(["passPriority"]);
  });

  test("(c)→(d) P1 passes → Cleave resolves (Skulker: Assault 3, 6 Might as attacker); the chain was opened by a PLAYED card so Focus passes to the next player P1, who gains Focus + Priority: (P1, P1, showdown-open) (346, 347.1.b, 313.2)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    await game.p2.cast("cleave", { targets: "skulker" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("skulker").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("skulker").might).toBe(6);
    expect(triple(game)).toEqual({ focus: P1, priority: P1, state: "showdown-open" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // At no window did P1 hold Focus before this, and focus was never nobody's during the showdown (checked above).
  });

  test("(d) P1 passes (347.2.b) → Focus + Priority to P2; P2 passes → all passed in sequence → showdown closes (347.2.a) and combat damage is dealt: Skulker 6 into Tank Blitzcrank 5 (lethal), Blitzcrank 5 into Skulker — whose Might is 6 while it keeps the Attacker designation through the Combat Cleanup (807.1.c, 142.4.b, 466.1 before 466.7.a) → NOT lethal; Skulker survives healed, P2 wins the combat and CONQUERS bfA on P1's turn (+1, 466.5.d)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    await game.p2.cast("cleave", { targets: "skulker" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passFocus();
    expect(triple(game)).toEqual({ focus: P2, priority: P2, state: "showdown-open" });
    await game.p2.passFocus();
    await game.settle(); // combat resolution procedures
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, controller: P2, damage: 0, zone: "battlefield-bfA" });
    expect(game.state("skulker").might).toBe(3); // Assault lapsed with the designation (807.1.d.1)
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d′) without Cleave: P2 passes, P1 passes → Skulker 3 dies into the 5-Might Tank, Blitzcrank survives (healed), P1 keeps bfA uncontested; still no points (a successful defense is not a conquer)", async () => {
    const game = await board().build();
    await playBlitzAndPull(game);
    await game.p2.passFocus();
    expect(triple(game)).toEqual({ focus: P1, priority: P1, state: "showdown-open" });
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("blitz")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.zoneOf("cleave")).toBe("hand");
  });

  // ── (e) contrast: no pull ─────────────────────────────────────────────────────────────────

  test("(e) Blitzcrank played to bfA but P1 DECLINES the pull: Skulker stays at bfB, bfA is not Contested, no showdown exists (focus = nobody, 313.5) and P1 — the turn player — has priority in a Neutral Open state (312.2.a)", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bfA" });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("blitz")).toBe("bfA");
    expect(game.locationOf("skulker")).toBe("bfB");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(triple(game)).toEqual({ focus: null, priority: P1, state: "neutral-open" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // Cleave is an Action: not on P1's turn outside a showdown
  });
});
