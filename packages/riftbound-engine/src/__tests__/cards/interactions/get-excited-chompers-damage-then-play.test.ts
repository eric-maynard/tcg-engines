/**
 * Interaction: Get Excited! (ogn-008-298) × Flame Chompers (ogn-006-298) — mid-combat, on the OPPONENT's turn
 *
 *   Get Excited! — Spell [Action] · Fury · 2 + [fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)"   — P1's hand
 *   Flame Chompers — Unit · Fury · 3 · 3 Might · "When you discard me, you may pay [fury] to play me."      — P1's hand
 *   D — vanilla 2-Might P1 unit holding bf1.   A — vanilla 4-Might P2 unit attacking bf1 from P2's base.
 *
 * Rules: 355.5 (targets chosen at finalization) vs 355.17 (the discard is an instruction → chosen on resolution;
 * rulings 4deda6bfd3f1e339 / 9c640f79b4c0ad82), 354.3 / 354.4 / 422.1.b (a trigger met mid-resolution waits — the
 * resolving spell finishes first; Traveling Merchant ruling 991e451ce26b951a), 337.1 / 337.4 (pending items are
 * finalized before anyone gets priority, then priority passes), 383.3.a / 383.3.b.1 (leading "you may pay [fury] to …":
 * opt-in + [fury] handled as the trigger is finalized — CR 2026-03-30; the older ruling 5a88d5846ff45970 placed it at
 * resolution, either way strictly AFTER Get Excited! finished and BEFORE Chompers is on the board), ruling
 * 9d5976499289b276 (the [fury] is an alternate cost — the printed 3 is NOT paid), 419.3.a / 419.3.b + 358.4 (a play
 * instructed by a resolving ability is a Limited Action that takes its timing from the effect — no [Action]/[Reaction]
 * needed even in a Closed showdown on P2's turn), 190.4.b (control of bf1 cannot change during the ongoing combat →
 * bf1 is a legal destination; rulings 11c73e4cf0214d9d / 1f44fde30716cf3a), 359.2.c (a unit played by an effect
 * enters exhausted), 337.2 (a played unit resolves immediately), 323.2.a (arriving unit becomes a Defender), 343.1.a /
 * 338.1.a.1 (from HAND a plain unit is not playable in a showdown / on another's turn), 465 / 466 (combat damage +
 * outcome).
 *
 * Question: P2 attacks bf1 with A (4); P2 passes Focus; P1 (Focus) casts Get Excited! at A and, on resolution,
 * discards Flame Chompers. (a) exact order — is A damaged before any Chompers prompt; does P2 get a window before
 * Chompers lands? (b) paying [fury]: what else is paid, which locations are offered, how does it enter, combat result?
 * (c) only ONE fury (spent on Get Excited!): what does P1 see, combat result? (d) could P1 just play Chompers from hand?
 *
 * Expected: (a) A is named at cast, the discard only on resolution; Get Excited! resolves completely (Chompers → trash,
 * 3 damage on A, spell → trash) BEFORE the Chompers trigger is even finalized; then P1 opts in / pays [fury], P2 gets
 * priority with the trigger on the chain and Chompers still in the trash. (b) Only the [fury] (energy untouched);
 * destinations {base, bf1}; enters bf1 EXHAUSTED, becomes a Defender; A (4, 3 marked) takes 2 + 3 more → dies; A's 4
 * kills at most one of D / Chompers → P1 keeps bf1. (c) No acceptable prompt (canAccept false / none), Chompers stays
 * in the trash; A 4 vs D 2 with 3 already marked: both die, nobody conquers, bf1 left uncontrolled. (d) No — never legal.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const CHOMPERS = "ogn-006-298";

/**
 * P2's turn 3, Neutral Open. P1: D (2) holds bf1; Get Excited! + Flame Chompers in hand; 5 energy (3 to spare after the
 * spell — enough for Chompers' printed cost, so an engine that wrongly charged it would show) and `fury` fury power.
 * P2: A (4) ready in base.
 */
function board(fury = 2) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Defender D" }, "dee")
    .unit(P2, "base", { might: 4, name: "Attacker A" }, "att")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, CHOMPERS, "fc");
}

/** A attacks bf1 → combat showdown; P2 (attacker, Focus first) passes → P1 holds Focus. */
async function p1HasFocus(fury = 2): Promise<Game> {
  const game = await board(fury).build();
  await game.p2.move("att", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 casts Get Excited! at A; both pass; P1 discards Chompers on resolution. Stops at whatever comes next. */
async function excitedResolved(fury = 2): Promise<Game> {
  const game = await p1HasFocus(fury);
  await game.p1.cast("ge", { targets: "att" });
  for (let i = 0; i < 4 && game.zoneOf("ge") === "chain"; i++) {
    const d = game.decision()!;
    if (d.kind !== "action") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "fc")) {
    await game.p1.pick("fc");
  }
  return game;
}

const isAcceptableOptIn = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;

/** (b) path: P1 accepts the Chompers opt-in (pays [fury]); stop at the next decision. */
async function chompersAccepted(): Promise<Game> {
  const game = await excitedResolved(2);
  expect(isAcceptableOptIn(game.decision())).toBe(true);
  await game.p1.yes();
  return game;
}

/** (b) path continued: everyone passes on the trigger → it resolves → the destination prompt. */
async function atDestinationPrompt(): Promise<Game> {
  const game = await chompersAccepted();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return game;
}

/** (b) path: Chompers played to bf1; stop right after it lands (showdown still open). */
async function chompersAtBf1(): Promise<Game> {
  const game = await atDestinationPrompt();
  const d = game.decision() as Extract<Decision, { kind: "pick" }>;
  const opt = d.options.find((o) => o.key === "battlefield-bf1" || o.zone === "battlefield-bf1" || o.key === "bf1")!;
  await game.p1.pick(opt.key);
  return game;
}

describe("(a) ordering: target at cast, discard at resolution, damage BEFORE any Chompers prompt, P2's window before Chompers lands", () => {
  test("with Focus P1 may cast Get Excited! ([Action] in a showdown); both units AT bf1 are offered as targets and A is named AT CAST (355.5); cost 2 + [fury] → 3 energy / 1 fury left", async () => {
    const game = await p1HasFocus();
    expect(game.p1.can("cast", "ge")).toBe(true);
    const offered = (game.p1.option("cast", "ge")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered.sort()).toEqual(["att", "dee"]);
    await game.p1.cast("ge", { targets: "att" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["att"], triggered: false, type: "spell" })]);
  });

  test("the discard is NOT chosen at cast: while Get Excited! sits on the chain (P1 then P2 hold priority) Chompers is still in P1's hand and A is undamaged (355.17)", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("ge", { targets: "att" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("fc")).toBe("hand");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("fc")).toBe("hand");
    expect(game.state("att").damage).toBe(0);
  });

  test("P2 passes → Get Excited! resolves: the discard is asked NOW (resolution-time pick, from P1's hand)", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("ge", { targets: "att" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    // A lone card may be auto-taken by some engines; if a prompt is shown it is P1's resolution-time discard pick.
    if (game.zoneOf("fc") === "hand") {
      expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["fc"]);
    } else {
      expect(game.zoneOf("fc")).toBe("trash");
    }
  });

  test("Get Excited! finishes COMPLETELY first (354.3/354.4, 422.1.b): by the time ANY Chompers decision exists, A already has 3 damage marked (Chompers' Energy cost), Chompers is in the trash and the spell is in the trash", async () => {
    const game = await excitedResolved();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fc" } });
    expect(game.state("att")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    // The trigger is its own chain item; Get Excited! is no longer on the chain.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", controller: P1, triggered: true })]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // nothing paid for Chompers yet
  });

  test("after P1 opts in, P2 DOES get a priority window with the Chompers trigger on the chain and Chompers still in the TRASH — it is not on the board before P2 could react (337.4)", async () => {
    const game = await chompersAccepted();
    let sawP2 = false;
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      if (d.seat === P2) {
        sawP2 = true;
        expect(game.chain().map((c) => c.cardId)).toEqual(["fc"]);
        expect(game.zoneOf("fc")).toBe("trash");
        expect(game.p1.units("bf1")).toEqual(["dee"]);
      }
      await game.seat(d.seat).passPriority();
    }
    expect(sawP2).toBe(true);
  });
});

describe("(b) P1 pays [fury]: alternate cost only, destinations {base, bf1}, enters exhausted as a Defender, P1 keeps bf1", () => {
  test("accepting costs exactly the [fury] (1 → 0) and NOT the printed 3 energy — P1 still has all 3 spare energy (ruling 9d5976499289b276)", async () => {
    const game = await chompersAccepted();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    const landed = await chompersAtBf1();
    expect(landed.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } }); // nothing more at finalization of the play either
  });

  test("the destinations offered are exactly P1's base and bf1 — P1 still controls bf1 mid-combat (190.4.b); no timing keyword is needed for this effect-instructed play (419.3)", async () => {
    const game = await atDestinationPrompt();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d.options.map((o) => o.zone ?? o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2); // …all of this on the OPPONENT's turn, inside a showdown
  });

  test("choosing bf1: Chompers is on bf1 EXHAUSTED (359.2.c), resolves immediately (no chain item, 337.2), and is a DEFENDER in the ongoing combat (323.2.a); the showdown continues", async () => {
    const game = await chompersAtBf1();
    expect(game.zoneOf("fc")).toBe("battlefield-bf1");
    expect(game.state("fc")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.state("fc").combatRole).toBe("defender");
    expect(game.state("att").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("combat: A 4 (3 already marked) vs D 2 + Chompers 3 → A takes 5 more and dies; A's 4 kills at most one defender → P1 KEEPS bf1 with a unit on it; no points to P2", async () => {
    const game = await chompersAtBf1();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("att")).toBe("trash");
    const survivors = game.p1.units("bf1");
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    expect(["dee", "fc"].filter((u) => game.zoneOf(u) === "trash").length).toBeLessThanOrEqual(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("choosing BASE instead is equally legal: Chompers sits exhausted in P1's base, out of the combat", async () => {
    const game = await atDestinationPrompt();
    await game.p1.pick("base");
    expect(game.zoneOf("fc")).toBe("base");
    expect(game.state("fc")).toMatchObject({ combatRole: null, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
  });
});

describe("(c) only ONE fury (spent on Get Excited!): no payable Chompers option, Chompers stays in the trash, both combatants die", () => {
  test("Get Excited! still resolves the same way: 3 on A, Chompers → trash, pool 3 energy / 0 fury", async () => {
    const game = await excitedResolved(1);
    expect(game.state("att").damage).toBe(3);
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
  });

  test("P1 gets NO acceptable 'pay [fury]?' prompt (canAccept false or none — 3 energy cannot stand in for [fury]); forcing 'yes' is rejected", async () => {
    const game = await excitedResolved(1);
    const d = game.decision();
    expect(isAcceptableOptIn(d)).toBe(false);
    if (d?.kind === "yes-no") {
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    }
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.p1.energy()).toBe(3);
  });

  test("settling: Chompers never leaves the trash; combat A 4 (3 marked) vs D 2 → A takes 2 more (5 ≥ 4) and dies, D takes 4 and dies; nobody conquers, bf1 is left with no units and no controller; no points", async () => {
    const game = await excitedResolved(1);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no(); // the only honest answer to an unpayable opt-in
    }
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("fc")).toBe("trash");
    expect(game.zoneOf("att")).toBe("trash");
    expect(game.zoneOf("dee")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — from HAND Flame Chompers is not playable in this showdown on P2's turn", () => {
  test("holding Focus with 5 energy, P1's legal actions are pass / Get Excited! only: no 'play Flame Chompers' (343.1.a, 338.1.a.1, 358.4); forcing it is rejected and nothing is spent", async () => {
    const game = await p1HasFocus();
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.can("play", "fc")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["cast", "concede", "passFocus"]);
    expect((await game.p1.try((p) => p.play("fc", { to: "bf1" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("fc", { to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("fc")).toBe("hand");
    expect(game.p1.energy()).toBe(5);
  });

  test("nor on P2's turn outside the showdown (Neutral Open for P2): P1 has no play action at all", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("play", "fc")).toBe(false);
    expect((await game.p1.try((p) => p.play("fc", { to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("fc")).toBe("hand");
  });
});
