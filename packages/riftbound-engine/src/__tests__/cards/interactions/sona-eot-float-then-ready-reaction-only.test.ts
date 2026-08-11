/**
 * Interaction: Sona, Harmonious (ogn-073-298) · Champion Unit · Calm · 4 · 4 Might
 *     "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes."
 *   × Calm Rune (ogn-042-298) · Rune · "[Exhaust]: Add [1]." (a Reaction-speed [Add] ability)
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction · "Give a unit +2 [Might] this turn. Draw 1."
 *   (+ Rune Prison ogn-050-298 · Spell · Calm · 2 · ACTION · "Stun a unit." — the Action-speed contrast)
 *
 * Rules: 317.1.a (Ending Step: end-of-turn triggers), 383.2.a.1 (Sona's "if I'm at a battlefield" is part of
 * the trigger condition — Sona is the rule's own example), 429.2 / 429.2.a ([Add] abilities resolve as soon as
 * they are finalized; Priority does not pass), 309.1.a / 813 (Closed State: only Reactions), 316.5.a vs 317.1
 * (Discretionary/Action play exists only in the Main Phase), 415 (ready), 167 / 164.2.a (Energy lives in the
 * pool, not on the rune that produced it), 317.2.d (3e: every Rune Pool empties — unspent Energy is lost),
 * 315.1.b (Awaken readies what is exhausted; a ready rune is untouched).
 *
 * Question: P1's turn; Sona at bf1 (P1's); P1 has 4 READY Calm runes r1–r4, 0 exhausted, pool (0,{}); hand:
 * Discipline (Reaction, 2) and Rune Prison (Action, 2). P1 clicks End Turn.
 *   (a) With Sona's trigger on the chain, may P1 tap all 4 runes (float 4)? Does P2 get priority on the
 *       trigger but not on the taps?
 *   (b) May Sona then ready the very runes just tapped → pool 4 AND 4 ready runes?
 *   (c) After the trigger resolves, can P1 cast the Action spell with the float? Could P1 instead have cast
 *       Discipline while the trigger was on the chain, paid from the float?
 *   (d) What happens to the unspent energy at 317.2.d; are the readied runes still ready on P2's turn (to pay
 *       for a Reaction there) and at P1's next Awaken?
 *   (e) NO side: Sona in P1's BASE — any trigger, any window to tap?
 * Expected: (a) yes / yes: chain only ever shows [Sona]; pool 0 → 4 with P1 keeping priority throughout.
 * (b) yes: r1–r4 ready again, pool still 4. (c) no Action window at all — the chain closes inside the Ending
 * Step and the turn rolls to P2; Discipline (Reaction) WAS castable on top of the trigger, 4 → 2, and Sona
 * still readies all four afterwards. (d) the float (4, or 2) is emptied at 3e; the runes stay READY through
 * P2's turn (P1 taps two there to Discipline in response to P2's spell) and are simply still ready after P1's
 * next Awaken. (e) no trigger, no chain, no P1 decision — straight to P2's turn with pool 0, runes untouched.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SONA = "ogn-073-298";
const DISCIPLINE = "ogn-058-298";
const RUNE_PRISON = "ogn-050-298";

/**
 * Turn 3, P1 active, Main Phase. P1: Sona at bf1 (P1's) — or in base for (e) —, four READY calm runes r1..r4,
 * pool (0,{}), Discipline + Rune Prison in hand. P2: a 3-Might Guard in base (a unit for the spells to name),
 * a Discipline of its own for P2's turn. Decks auto-filled (Discipline draws).
 */
function board(opts: { sonaAt?: "bf1" | "base" } = {}) {
  const b = scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, opts.sonaAt ?? "bf1", SONA, "sona")
    .unit(P1, "bf1", { might: 1, name: "P1 Flagbearer" }, "flag") // keeps bf1 P1's even in the Sona-in-base variant
    .unit(P2, "bf2", { might: 3, name: "P2 Guard" }, "guard");
  for (let i = 1; i <= 4; i++) {
    b.rune(P1, "calm", { alias: `r${i}` });
  }
  return b
    .resources(P1, { energy: 0 })
    .resources(P2, { energy: 0 })
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P2, DISCIPLINE, "p2Discipline");
}

const RUNES = ["r1", "r2", "r3", "r4"];
const ready = (game: Game) => [...game.p1.runes({ ready: true })].sort();

/** P1 ends the turn with Sona at bf1 → Ending Step, Sona's trigger on the chain, P1 holding priority. */
async function atEndOfTurn(): Promise<Game> {
  const game = await board().build();
  expect(ready(game)).toEqual(RUNES);
  expect(game.p1.energy()).toBe(0);
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true })]);
  // rule 402.2 / 355.5 — the four runes are named while the trigger is finalized, before anyone
  // holds priority. rule 415.1.b: a READY rune is still a legal choice (readying it does nothing),
  // which is exactly what makes the tap-then-ready line below work.
  expect(game.decision()).toMatchObject({ kind: "pick", max: 4, seat: P1, source: { cardId: "sona" } });
  await game.p1.pick(...RUNES);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Tap r1..r4 one by one while the trigger waits. */
async function floatFour(game: Game): Promise<void> {
  for (const r of RUNES) {
    await game.p1.tapRune(r);
  }
}

/** P1 then P2 pass → the top item resolves. */
async function bothPass(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
}

describe("Sona at end of turn — float energy off ready runes, ready them again, Reaction-only, float lost at 3e", () => {
  // ── (a) tapping under the trigger ──────────────────────────────────────────────────────────

  test("(a) Sona's trigger is an ordinary triggered ability: it sits on the chain in the Ending Step with P1 (its controller) holding priority first, and all four ready runes offer their [Add] tap", async () => {
    const game = await atEndOfTurn();
    for (const r of RUNES) {
      expect(game.p1.can("tapRune", r)).toBe(true);
    }
    expect(game.p1.can("cast", "prison")).toBe(false); // Action: not in a Closed state (309.1.a)
    expect(game.p1.can("cast", "discipline")).toBe(false); // Reaction, but pool is 0 — not affordable yet
  });

  test("(a) P1 taps all four while the trigger waits: pool 0 → 1 → 2 → 3 → 4, each tap resolving at once with NO chain item and NO priority pass (429.2/.2.a) — P1 still holds priority, the chain is still exactly [Sona], all four runes now exhausted", async () => {
    const game = await atEndOfTurn();
    for (const [i, r] of RUNES.entries()) {
      await game.p1.tapRune(r);
      expect(game.p1.energy()).toBe(i + 1);
      expect(game.state(r).isExhausted).toBe(true);
      expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    }
    expect(ready(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
  });

  test("(a) P2 DOES get priority — on Sona's trigger, once P1 passes — and what P2 sees on the chain is only [Sona]; the taps never appeared there", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", triggered: true })]);
    expect(game.chain()).toHaveLength(1);
  });

  // ── (b) ready the runes just tapped ────────────────────────────────────────────────────────

  test("(b) Sona named r1..r4 at finalization and readies exactly them on resolution — the runes P1 tapped in between come back → 4 READY runes AND pool still (4,{}) — energy is not attached to the rune that made it (167)", async () => {
    const game = await atEndOfTurn(); // the finalization pick already named r1..r4
    await floatFour(game);
    await bothPass(game);
    expect(ready(game)).toEqual(RUNES);
    expect(game.chain()).toEqual([]);
    // The chain closed inside the Ending Step, so the engine runs straight on into the Expiration Step in
    // the same beat: the pool Sona left behind is what 3e found to empty — all 4 (readying spent nothing).
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]?.energy).toBe(4);
  });

  // ── (c) no Action window afterwards; a Reaction was possible on top of the trigger ─────────

  test("(c) after the trigger resolves there is NO window for the 2-cost ACTION spell despite the 4 floating: the chain closed inside the Ending Step (317.1, not a Main-Phase Open state, 316.5.a) — P1 is never offered a decision before P2's Main Phase begins", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await bothPass(game);
    // From here to P2's open main phase, P1 must never hold an action decision (let alone one listing Rune Prison).
    let p1ActionWindows = 0;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main" && d.seat === P2)) {
        break;
      }
      if (d.seat === P1 && d.kind === "action") {
        p1ActionWindows++;
        expect(game.p1.can("cast", "prison")).toBe(false);
      }
      await game.seat(d.seat).pass();
    }
    expect(p1ActionWindows).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("prison")).toBe("hand");
    expect(game.p1.can("cast", "prison")).toBe(false); // and certainly not on P2's turn
  });

  test("(c) Discipline (REACTION) IS castable while Sona's trigger is still on the chain, paid from the float: (4,{}) → (2,{}); it lands on top of [Sona], resolves first (+2 to Sona this turn, P1 draws 1) …", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    expect(game.p1.can("cast", "discipline")).toBe(true);
    expect(game.p1.can("cast", "prison")).toBe(false); // same cost, same float — Action timing is the only difference
    const hand0 = game.p1.hand().length;
    await game.p1.cast("discipline", { targets: "sona" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "discipline"]);
    await bothPass(game); // Discipline resolves
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("sona").might).toBe(6);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]);
    expect(game.phase()).toBe("ending");
  });

  test("(c) … and Sona then STILL readies all four tapped runes: 4 ready, pool (2,{}) left floating", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await game.p1.cast("discipline", { targets: "sona" });
    await bothPass(game);
    await bothPass(game); // now Sona's trigger
    expect(ready(game)).toEqual(RUNES);
    // as in (b): the Expiration Step follows at once — it found exactly the 2 left floating
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]?.energy).toBe(2);
  });

  // ── (d) 3e empties the pool; ready status survives ─────────────────────────────────────────

  test("(d) 317.2.d: the Expiration Step empties P1's pool — the unspent 4 is LOST (trace: poolsEmptied P1 energy 4); in P2's Main Phase P1 has (0,{}) but r1..r4 are all still READY; Sona back to 4 is moot (no buff this line)", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await bothPass(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const exp = game.trace().expiration;
    expect(exp.length).toBeGreaterThanOrEqual(1);
    expect(exp[0]?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(exp[0]?.poolsEmptied?.[P1]?.energy).toBe(4);
    expect(ready(game)).toEqual(RUNES); // ready is a status, not a pool resource
    expect(game.violations()).toEqual([]);
  });

  test("(d) the Discipline line loses only 2 at 3e (poolsEmptied P1 energy 2); Sona's +2 'this turn' expired in the same step", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await game.p1.cast("discipline", { targets: "sona" });
    await bothPass(game);
    await bothPass(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]?.energy).toBe(2);
    expect(game.state("sona").might).toBe(4);
    expect(ready(game)).toEqual(RUNES);
  });

  test("(d) those ready runes pay for a Reaction on P2's turn: P2 casts its Discipline, P1 (priority in the Closed state) taps r1 + r2 and answers with Discipline on Sona — r1, r2 exhausted, r3, r4 still ready", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await bothPass(game);
    await game.settle(); // → P2's main phase
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.cast("p2Discipline", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "discipline")).toBe(false); // nothing floating any more
    await game.p1.tapRune("r1");
    await game.p1.tapRune("r2");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "prison")).toBe(false); // Action on the opponent's turn: no
    await game.p1.cast("discipline", { targets: "sona" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("sona").might).toBe(6);
    expect(game.state("guard").might).toBe(5);
    expect(ready(game)).toEqual(["r3", "r4"]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) at P1's next Awaken the four (never re-exhausted) runes are simply still ready — readying a ready rune is a no-op (315.1.b / 415) — next to the 2 newly channeled ones; the pool starts P1's turn empty", async () => {
    const game = await atEndOfTurn();
    await floatFour(game);
    await bothPass(game);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    for (const r of RUNES) {
      expect(game.state(r).isReady).toBe(true);
    }
    expect(game.p1.runes()).toHaveLength(6); // channelled 2 at the start of the turn
    expect(game.p1.runes({ ready: true })).toHaveLength(6);
    expect(game.p1.energy()).toBe(0);
  });

  // ── (e) NO side: Sona in base ──────────────────────────────────────────────────────────────

  test("(e) Sona in P1's BASE: 'if I'm at a battlefield' fails → nothing triggers, no chain, no Closed-state priority for P1 — End Turn goes straight through Expiration (pool 0 emptied of nothing) into P2's turn; the four runes were never tappable and stay ready", async () => {
    const game = await board({ sonaAt: "base" }).build();
    expect(game.zoneOf("sona")).toBe("base");
    await game.p1.endTurn();
    expect(game.chain()).toEqual([]);
    // No P1 decision of any kind between End Turn and P2's turn.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || game.turnPlayer() === P2) {
        break;
      }
      expect(d.seat).not.toBe(P1);
      await game.seat(d.seat).pass();
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.trace().expiration[0]?.poolsEmptied?.[P1]?.energy ?? 0).toBe(0);
    expect(game.trace().expiration[0]?.itemsProcessed ?? 0).toBe(0);
    expect(ready(game)).toEqual(RUNES);
    expect(game.violations()).toEqual([]);
  });

  test("(e) contrast in one line: with Sona at bf1 End Turn leaves P1 holding priority in the Ending Step (a window to tap); with Sona in base it does not", async () => {
    const atBf = await board().build();
    await atBf.p1.endTurn();
    await atBf.p1.pick(...RUNES); // the finalization choice comes first (402.2)
    expect(atBf.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(atBf.p1.can("tapRune", "r1")).toBe(true);

    const inBase = await board({ sonaAt: "base" }).build();
    await inBase.p1.endTurn();
    expect(inBase.chain()).toEqual([]);
    expect(inBase.p1.decision()?.kind === "action" && (inBase.p1.decision() as { context?: string }).context === "chain").toBe(false);
    expect(inBase.turnPlayer()).toBe(P2); // already P2's turn — P1's Ending Step held no window at all
  });
});
