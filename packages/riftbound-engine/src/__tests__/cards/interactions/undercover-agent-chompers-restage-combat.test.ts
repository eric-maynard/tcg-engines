/**
 * Interaction: Undercover Agent (ogn-178-298) · Unit · Chaos · 5 · 5 Might
 *     "[Deathknell] — Discard 2, then draw 2. (When I die, get the effect.)"
 *   × Flame Chompers (ogn-006-298) · Unit · Fury · 3 · 3 Might
 *     "When you discard me, you may pay [fury] to play me."
 *   × a vanilla 6-Might attacker.
 *
 * Question. P1's turn. P2 controls bf1 with a lone Undercover Agent; P2's hand is exactly Flame
 * Chompers + one other card and P2 has [fury] floating. P1 attacks alone with a vanilla 6-Might
 * unit; nobody plays anything in the showdown.
 *  (a) Step 2 (465.2.c.4): 6 → Agent (lethal), 5 → attacker (survives). 465.3 → Resolution Step.
 *      466.1 Combat Cleanup: the Deathknell is noted (808), Agent to trash, heal all (attacker back
 *      to 0), and — no Defenders present — the attacker is NOT recalled (466.1.a.2).
 *  (b) 466.2 window: the Deathknell resolves (discard Chompers + the other card, draw 2). Chompers'
 *      "you may pay [fury]" is an opt-in decided/paid at finalization (383.3.a / 383.3.b). On
 *      resolution P2 plays Chompers; bf1 is still CONTROLLED by P2 (466.5 has not run; 323.6 does
 *      not strip control mid-combat) so bf1 is a legal destination beside base. Played there it
 *      enters exhausted and is designated a Defender at the next Cleanup (323.2.a / 464.2.c.3.a);
 *      it has no defend trigger.
 *  (c) 466.3 with both sides present → "No Result" (466.3.d); 466.3.d.1 stages a Showdown AND a
 *      Combat at bf1; 466.5 is skipped (something is staged) → no control change, no conquer,
 *      Contested stays; 466.7 ends the combat. 323.13: a NEW combat begins at bf1 — Attacker = P1
 *      (its unit applied Contested, 464.2.c.1), P1 has Focus, attack/defend triggers fire afresh
 *      (383.4.e.2.a is per combat). Second combat, both pass: 6 → Chompers (dies), 3 → attacker
 *      (survives, healed); 466.3.a P1 won; 466.5/466.5.d P1 conquers bf1 → +1.
 *  (d) Contrast: P2 declines to pay, or plays Chompers to base → at 466.3 only P1 has units →
 *      P1 won, conquers immediately, no restage.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNDERCOVER_AGENT = "ogn-178-298";
const FLAME_CHOMPERS = "ogn-006-298";
const ANIVIA_PRIMAL = "ogn-148-298"; // 8 Might · "When I attack, deal 3 to all enemy units here." — attack-trigger probe for (c)

function board(opts: { attacker?: "vanilla" | "anivia" } = {}) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", UNDERCOVER_AGENT, "agent")
    .hand(P2, FLAME_CHOMPERS, "chompers")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Other Card" }, "other")
    .resources(P2, { power: { fury: 1 } });
  return opts.attacker === "anivia"
    ? s.unit(P1, "base", ANIVIA_PRIMAL, "bruiser")
    : s.unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const bf1 = (game: Game) => game.gameState.battlefields.bf1!;

/** P1 attacks alone; both pass Focus → damage step + Combat Cleanup run, the Deathknell is on the chain. */
async function attackAndPassShowdown(game: Game): Promise<void> {
  await game.p1.move("bruiser", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, focusPlayer: P1, isCombatShowdown: true });
  await game.p1.passFocus();
  await game.p2.passFocus();
}

/** Both pass on the Deathknell → it resolves (discard 2, draw 2) and Chompers' opt-in is asked. */
async function resolveDeathknell(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "agent", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
}

/** P2 accepts and pays [fury]; both pass on the Chompers trigger → the play asks for a destination. */
async function acceptChompersToDestinationPrompt(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "chompers" } });
  await game.p2.yes();
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Undercover Agent Deathknell → Flame Chompers played back to the contested battlefield restages the combat", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) 6 v 5: the Agent takes lethal and dies, the attacker takes 5 < 6 and is healed to 0 in the Combat Cleanup; with no Defender left it is NOT recalled; the Deathknell waits on the chain (466.2) with bf1 still P2's and contested", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    expect(game.zoneOf("agent")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // not recalled (466.1.a.2)
    expect(game.state("bruiser").damage).toBe(0); // healed (466.1.a.1)
    expect(game.state("bruiser").isExhausted).toBe(true); // the Standard Move exhausted it; nothing readies it
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "agent", controller: P2, name: "Undercover Agent", triggered: true, type: "ability" })]);
    // The 466.2 window: the combat result has NOT been determined yet.
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined(); // the showdown closed; we are between step 2 and step 3
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  // ---------------------------------------------------------------- (b)
  test("(b) the Deathknell resolves in the 466.2 window: P2 discards Chompers + the other card and draws 2; discarding Chompers asks P2 the opt-in 'pay [fury]?' at finalization (383.3.a/.b) — nothing paid until 'yes'", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(2); // drew 2 fresh cards
    expect(game.p2.hand()).not.toContain("chompers");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "chompers" }, timing: "FIN" });
    expect(game.p2.power("fury")).toBe(1);
    await game.p2.yes();
    expect(game.p2.power("fury")).toBe(0); // [fury] is the trigger's base cost, paid on finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // P1 may still respond
  });

  test("(b) on resolution P2 still CONTROLS the contested bf1 (466.5 has not run, 323.6 doesn't apply mid-combat), so the play offers BOTH base and bf1 as destinations", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    expect(bf1(game)).toMatchObject({ contested: true, controller: P2 });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
  });

  test("(b) played TO bf1: Chompers enters exhausted at bf1, is designated a DEFENDER (323.2.a / 464.2.c.3.a), puts nothing on the chain (no defend trigger) — and P1 has NOT conquered: bf1 still P2's, still contested, score 0–0", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    await game.p2.pick("battlefield-bf1");
    expect(game.zoneOf("chompers")).toBe("battlefield-bf1");
    expect(game.state("chompers")).toMatchObject({ combatRole: "defender", controller: P2, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) 466.3.d 'No Result' → 466.3.d.1 stages Showdown + Combat; 466.5 skipped; 323.13 opens a BRAND-NEW combat at bf1: Attacker = P1 (applied Contested, 464.2.c.1) with Focus, P2 Defender, both units designated afresh", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    await game.p2.pick("battlefield-bf1");
    const sd = showdown(game);
    expect(sd).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true, passedPlayers: [] });
    expect(game.state("bruiser").combatRole).toBe("attacker");
    expect(game.state("chompers").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // it is a full second showdown window: after P1 passes, P2 gets Focus too
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(0); // still nothing scored
  });

  test("(c) second combat, both pass: 6 → Chompers (dies), 3 → attacker (survives, healed); 466.3.a P1 won → 466.5/466.5.d P1 conquers bf1 for exactly 1 point; P2 netted discard 2 / draw 2 and lost Chompers", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    await game.p2.pick("battlefield-bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser")).toMatchObject({ combatRole: null, damage: 0 });
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)).toBeUndefined();
    expect(game.p1.points()).toBe(1); // one conquer of bf1 this turn, not two
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(2);
    expect(game.p2.trash().sort()).toEqual(["agent", "chompers", "other"]);
    expect(game.p2.power("fury")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) 'When I attack' fires AFRESH in the restaged combat (383.4.e.2.a is per combat): with Anivia, Primal (8, 'When I attack, deal 3 to all enemy units here') as the attacker, its trigger goes on the chain again when the new combat opens and the 3 kills the freshly-played Chompers", async () => {
    const game = await board({ attacker: "anivia" }).build();
    await game.p1.move("bruiser", "bf1");
    // first combat: the attack trigger fires once (3 to the Agent), then 8 v 5 kills the Agent
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bruiser", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("agent").damage).toBe(3);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("agent")).toBe("trash");
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    await game.p2.pick("battlefield-bf1");
    // brand-new combat at bf1 → Anivia gains the Attacker designation anew → its trigger fires again
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bruiser", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("chompers")).toBe("trash"); // 3 damage to a 3-Might unit
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("bruiser").damage).toBe(0);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) contrast — P2 DECLINES to pay: Chompers stays in the trash, the [fury] is kept, and at 466.3 only P1 has units → P1 wins and conquers bf1 at once (+1), no second showdown", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "chompers" } });
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.p2.power("fury")).toBe(1);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)).toBeUndefined();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("bruiser")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d) contrast — P2 pays but plays Chompers to BASE: it sits exhausted in P2's base, nobody defends bf1 at 466.3 → P1 conquers immediately (+1), no restage", async () => {
    const game = await board().build();
    await attackAndPassShowdown(game);
    await resolveDeathknell(game);
    await acceptChompersToDestinationPrompt(game);
    await game.p2.pick("base");
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.state("chompers")).toMatchObject({ combatRole: null, controller: P2, isExhausted: true });
    expect(game.p2.power("fury")).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)).toBeUndefined();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
