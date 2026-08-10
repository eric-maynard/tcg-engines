/**
 * Interaction: Here to Help (sfd-111-221) · Spell · Body · 2+[body] · [Hidden] [Action]
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6+[calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   × Ravenbloom Student (ogn-103-298) · Unit · Mind · 2 · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   (+ Vanguard Sergeant ogn-219-298 · vanilla 4-cost 4-Might unit; Pakaa Cub ogn-135-298 · vanilla [Hidden] unit
 *    as the facedown-UNIT contrast.)
 *
 * Rules: 358.3.a (this exact CR example: an effect that PREVENTS an action does not stop a card that INSTRUCTS it
 * from being played/finalized — the instruction is skipped on resolution), 358.5, 419.3.a / 419.3.c (effect-play is
 * a Limited play; no eligible card → nothing happens, resolution continues), 419.4.a ("when you play a spell"
 * triggers once the spell has resolved), 055.1 (all instructions impossible → still played and resolved), 054.1
 * (can't beats can), 355.2.a (valid locations = base or a controlled battlefield) as narrowed by the Warden,
 * 355.10.a / 355.10.b (the hand unit is not a target; "battlefield you control" is a restriction, not a target),
 * 354.3, 356.4 (the [3] reduction), 359.2.c (units enter exhausted), 811.1.b (from facedown: base cost ignored),
 * 811.1.d / 811.1.d.1 / 811.1.d.3 (from Hidden: a permanent must be played AT that battlefield; a unit a hidden
 * spell plays must go there too), 811.6 (Hidden grants Reaction), 128.6 (typed play from a private zone may be
 * declined). Ruling 005f282eb3ef939a: a facedown UNIT cannot be played at all while a Warden is at a battlefield.
 *
 * Question — P1's turn, Neutral Open. P2's Warden stands at bf2. P1 controls bf1 with Ravenbloom Student; hand =
 * Here to Help + Vanguard Sergeant (4); pool 3 energy + [body]. A second Here to Help has been facedown at bf1.
 *   (a) Warden at bf2: is the HAND Here to Help even legal (its only instruction can do nothing)? If so: cost paid,
 *       P2's window, any prompt on resolution, where do the spell and the Sergeant end up, does the Student get +1?
 *   (b) Warden in P2's BASE instead: what is P1 offered on resolution (units / battlefields / decline), what does
 *       the Sergeant cost and how does it enter?
 *   (c) Warden at bf2, P1 plays the Sergeant DIRECTLY from hand: which locations are offered?
 *   (d) The FACEDOWN Here to Help at bf1 under Warden-at-bf2, flipped on P2's turn during a showdown at bf1: legal?
 *       cost? effect? — versus a facedown UNIT there.
 *
 * Expected:
 *   (a) Legal (358.3.a). P1 pays 2+[body] → pool {1, body 0}; it is finalized on the chain; P2 gets priority; on
 *       resolution {battlefield P1 controls} ∩ {base only} = ∅ → nothing happens, NO prompt (419.3.c, 055.1). Here to
 *       Help → trash, Sergeant stays in hand, no further energy touched. The spell WAS played → Student +1 this turn.
 *   (b) Warden in base imposes nothing. On resolution P1 is offered {Vanguard Sergeant} + decline; destination set is
 *       {bf1} only (base is not legal for this instruction; bf2 is not controlled). Sergeant costs 4−3 = 1 → pool 0,
 *       enters bf1 EXHAUSTED, no timing keyword needed. Student +1.
 *   (c) Direct play under Warden-at-bf2: with 4 energy → {base} only (bf1 absent although controlled); with 3 → not
 *       offered at all. Warden in base → {base, bf1}.
 *   (d) Facedown Here to Help is a spell with no targets → 811.1.d does not block it: flip is legal in the showdown
 *       (Reaction via 811.6), costs 0, P2 may respond, resolves doing NOTHING under the Warden (it would have to play
 *       the unit AT bf1, 811.1.d.3, which the Warden forbids) → trash; Student +1. A facedown UNIT at bf1 under the
 *       Warden is not playable at all (811.1.d.1 vs Warden → no valid location) → absent from P1's legal actions,
 *       stays facedown. Control (Warden in base): the flip plays the Sergeant AT bf1 for 1 as a Defender; the Cub flips.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const MAGESEEKER_WARDEN = "ogn-070-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const PAKAA_CUB = "ogn-135-298"; // 3-cost 3-Might unit whose only text is [Hidden]

interface BoardOpts {
  readonly wardenAt?: "bf2" | "base";
  readonly active?: Seat;
  readonly energy?: number;
  readonly facedown?: "hth" | "cub";
}

/**
 * Turn 3. bf1: P1's — Ravenbloom Student (2) stands there, plus a facedown card of P1's (Here to Help by default,
 * Pakaa Cub for the unit contrast). bf2: P2's — a 1-Might Sentry and (by default) the Warden. P2 also has a
 * 2-Might Attacker in base (it walks into bf1 for the showdown of (d)). P1's hand: Here to Help + Vanguard
 * Sergeant; pool 3 energy + [body] unless overridden.
 */
function board(o: BoardOpts = {}) {
  const s = scenario()
    .turn(3)
    .active(o.active ?? P1)
    .resources(P1, { energy: o.energy ?? 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, o.wardenAt ?? "bf2", MAGESEEKER_WARDEN, "warden")
    .unit(P2, "base", { might: 2, name: "Attacker" }, "atk")
    .hand(P1, HERE_TO_HELP, "hthHand")
    .hand(P1, VANGUARD_SERGEANT, "sarge");
  return (o.facedown ?? "hth") === "hth" ? s.facedown(P1, "bf1", HERE_TO_HELP, "hthHidden") : s.facedown(P1, "bf1", PAKAA_CUB, "cub");
}

/** Normalised play locations offered to P1 for a hand unit ("base" | battlefield id). */
function playLocations(game: Game, alias: string): string[] {
  const raw = game.p1.option("play", alias)?.fields.find((f) => f.arg === "to")?.options ?? [];
  return raw.map((v) => String(v).replace(/^battlefield-/, "")).toSorted();
}

/** P1 casts the HAND copy in the Open state and both players pass once → Here to Help resolves. */
async function castHandCopyAndResolve(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.cast("hthHand");
  expect(game.chain().map((c) => c.cardId)).toEqual(["hthHand"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain().some((c) => c.cardId === "hthHand")).toBe(false);
  return game;
}

/**
 * Drive to the turn player's open main phase WITHOUT ever playing the Sergeant: pass every priority/focus window
 * and decline any pick the engine raises. (Used to observe the rest of the resolution independently of whether a
 * prompt appears — the prompt itself is asserted separately.)
 */
async function finishWithoutPlaying(game: Game): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).decline();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      throw new Error(`unexpected ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
}

/** (d) P2's turn: the Attacker walks into bf1 (combat showdown), P2 passes Focus → P1 holds Focus at bf1. */
async function showdownAtBf1(o: Omit<BoardOpts, "active"> = {}): Promise<Game> {
  const game = await board({ ...o, active: P2 }).build();
  await game.p2.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("(a) Warden at bf2 — Here to Help from HAND is legal, is paid for, and resolves doing nothing", () => {
  test("Here to Help IS a legal play although its only instruction can currently do nothing (358.3.a): offered, no play-time targets (355.10.a/b)", async () => {
    const game = await board().build();
    expect(game.locationOf("warden")).toBe("bf2");
    expect(game.p1.can("cast", "hthHand")).toBe(true);
    const targets = game.p1.option("cast", "hthHand")?.fields.find((f) => f.name === "targets");
    expect(targets === undefined || (targets.options ?? []).length === 0).toBe(true);
  });

  test("casting it pays the full 2 + [body] (pool → 1 energy, 0 body) and finalizes it on the chain as P1's non-triggered item; P1 then P2 hold priority — P2 DOES get a reaction window (it is a spell)", async () => {
    const game = await board().build();
    await game.p1.cast("hthHand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.zoneOf("hthHand")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hthHand", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("sarge")).toBe("hand");
  });

  // Expected (419.3.c, 055.1, 054.1): {a battlefield P1 controls} ∩ {Warden: base only} = ∅ → there is no eligible
  // play, so resolution continues with NO prompt: the next decision is a priority window (Student trigger) / main.
  // Actual: the engine raises "Pick a revealed card to play (or decline)" offering the Sergeant.
  test("on resolution P1 is NOT prompted to pick a unit or a battlefield at all — nothing can legally be played (419.3.c, 358.3.a)", async () => {
    const game = await castHandCopyAndResolve();
    const d = game.decision();
    expect(d?.kind).not.toBe("pick");
    expect(game.zoneOf("hthHand")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("hand");
  });

  // Expected (054.1 can't-beats-can; Warden: "opponents can only play units to their base"): even if offered, the
  // Sergeant can never end up at bf1 via Here to Help while the Warden is at a battlefield — a pick must be
  // rejected or do nothing. Actual: the pick is accepted and the Sergeant is put onto bf1 for 1 energy.
  test("the Warden's restriction is honoured by the effect-play — the Sergeant cannot be put onto bf1 through Here to Help (054.1)", async () => {
    const game = await castHandCopyAndResolve();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.try((p) => p.pick("sarge"));
    }
    await finishWithoutPlaying(game);
    expect(game.locationOf("sarge")).not.toBe("bf1");
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
  });

  test("end state when nothing is played: Here to Help in P1's trash, Sergeant still in hand, pool still {1, body 0} — no energy beyond the spell's own cost was touched", async () => {
    const game = await castHandCopyAndResolve();
    await finishWithoutPlaying(game);
    expect(game.zoneOf("hthHand")).toBe("trash");
    expect(game.p1.trash()).toContain("hthHand");
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.p1.units("bf1")).toEqual(["student"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("because the spell WAS played and resolved (419.4.a), Ravenbloom Student's trigger goes on the chain as P1's triggered item and gives it +1 Might this turn (2 → 3); it wears off next turn", async () => {
    const game = await castHandCopyAndResolve();
    // drive past any (buggy) prompt without playing; observe the Student item on the way
    let sawStudentItem = false;
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      sawStudentItem ||= game.chain().some((c) => c.cardId === "student" && c.controller === P1 && c.triggered);
      if (d.kind === "pick") {
        await game.p1.decline();
      } else {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(sawStudentItem).toBe(true);
    expect(game.state("student")).toMatchObject({ baseMight: 2, might: 3 });
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});

describe("(b) Warden in P2's BASE — the same cast now offers the Sergeant, to bf1 only, for 1", () => {
  test("'While I'm at a battlefield' is off: on resolution P1 is offered exactly {Vanguard Sergeant} and MAY decline ('you may' / 128.6)", async () => {
    const game = await castHandCopyAndResolve({ wardenAt: "base" });
    expect(game.locationOf("warden")).toBe("base");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["sarge"]);
  });

  test("declining: nothing is played, Sergeant stays in hand, Here to Help → trash, pool {1, body 0}; the Student still gets +1 (the spell resolved)", async () => {
    const game = await castHandCopyAndResolve({ wardenAt: "base" });
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.zoneOf("hthHand")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.state("student").might).toBe(3);
  });

  test("choosing the Sergeant: the destination set is {bf1} ONLY — base is not legal for this instruction and bf2 is not controlled — so no destination prompt follows and it lands at bf1, never base", async () => {
    const game = await castHandCopyAndResolve({ wardenAt: "base" });
    await game.p1.pick("sarge");
    const d = game.decision();
    expect(d?.kind === "pick" && d.semantics === "destination").toBe(false);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.p1.base()).not.toContain("sarge");
    expect(game.p2.units("bf2").sort()).toEqual(["sentry"]);
  });

  test("the Sergeant costs 4 − 3 = 1 energy (pool → 0), enters bf1 EXHAUSTED with no timing keyword of its own (419.3.a, 356.4, 359.2.c); Here to Help finishes in the trash", async () => {
    const game = await castHandCopyAndResolve({ wardenAt: "base" });
    await game.p1.pick("sarge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("sarge")).toMatchObject({ controller: P1, isExhausted: true, keywords: [], location: "bf1", might: 4 });
    expect(game.zoneOf("hthHand")).toBe("trash");
  });

  test("after the Sergeant is down, the Student's 'you played a spell' trigger is the next chain item (P1's), P2 gets a window, and it resolves to +1 (→ 3); final: Student 3 + Sergeant 4 at bf1, no violations", async () => {
    const game = await castHandCopyAndResolve({ wardenAt: "base" });
    await game.p1.pick("sarge");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("student").might).toBe(3);
    expect(game.p1.units("bf1").sort()).toEqual(["sarge", "student"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Warden at bf2 — playing the Sergeant DIRECTLY from hand", () => {
  test("with 4 energy the Sergeant is offered to {base} ONLY — bf1 is absent although P1 controls it (355.2.a as restricted by the Warden); bf2 never", async () => {
    const game = await board({ energy: 4 }).build();
    expect(game.p1.can("play", "sarge")).toBe(true);
    expect(playLocations(game, "sarge")).toEqual(["base"]);
    await expect(game.p1.play("sarge", { to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("sarge")).toBe("hand");
    await game.p1.play("sarge", { to: "base" });
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sarge").isExhausted).toBe(true);
  });

  test("with this board's 3 energy the 4-cost Sergeant is not offered at all (no discount outside Here to Help)", async () => {
    const game = await board({ energy: 3 }).build();
    expect(game.p1.can("play", "sarge")).toBe(false);
    expect(playLocations(game, "sarge")).toEqual([]);
  });

  test("control — Warden in P2's base, 4 energy: {base, bf1} are both offered (bf2 is P2's and never is)", async () => {
    const game = await board({ energy: 4, wardenAt: "base" }).build();
    expect(playLocations(game, "sarge")).toEqual(["base", "bf1"]);
  });
});

describe("(d) the FACEDOWN Here to Help at bf1 under Warden-at-bf2, flipped during a showdown at bf1 on P2's turn — vs a facedown UNIT", () => {
  test("the facedown spell has no targets, so 811.1.d does not block it: with Focus at bf1 P1 may flip it (Reaction via 811.6) — it is in P1's legal actions", async () => {
    const game = await showdownAtBf1();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf("warden")).toBe("bf2");
    expect(game.p1.can("reveal", "hthHidden")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:hthHidden");
  });

  test("flipping it costs 0 (811.1.b — pool stays 3 + [body]); it becomes P1's chain item and P2 gets a priority window to respond before it resolves", async () => {
    const game = await showdownAtBf1();
    await game.p1.reveal("hthHidden");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hthHidden", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hthHidden"]);
  });

  // Expected (811.1.d.3 + Warden + 054.1 → 419.3.c): from Hidden the unit would HAVE to be played at bf1, the Warden
  // allows only base → no eligible play → the spell resolves doing nothing, with no prompt.
  // Actual: the engine offers "Pick a revealed card to play (or decline)" with the Sergeant (and would put it at bf1).
  test("under the Warden the flipped Here to Help resolves doing NOTHING — no pick is raised (811.1.d.3, 419.3.c)", async () => {
    const game = await showdownAtBf1();
    await game.p1.reveal("hthHidden");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.zoneOf("hthHidden")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("hand");
  });

  test("either way the flipped copy ends in P1's trash, the Sergeant (nothing played) stays in hand, the pool is untouched, and the Student — P1 played a spell — gets +1 (→ 3) even on P2's turn", async () => {
    const game = await showdownAtBf1();
    await game.p1.reveal("hthHidden");
    // pass / decline through the chain (never playing the unit) until the showdown's Focus comes back
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context !== "chain")) {
        break;
      }
      if (d.kind === "pick") {
        await game.p1.decline();
      } else {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(game.zoneOf("hthHidden")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
    expect(game.state("student").might).toBe(3);
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  // Expected (811.1.d.1: a hidden permanent must be played TO that battlefield; Warden: only to base → no valid
  // location; ruling 005f282eb3ef939a): the facedown Pakaa Cub is not playable at all → absent from P1's legal
  // actions, and a forced attempt leaves it facedown at bf1. Actual: `revealHidden:cub` is offered and flipping
  // it puts the Cub onto bf1.
  test("a facedown UNIT (Pakaa Cub) at bf1 is NOT playable while the Warden is at a battlefield — not in P1's legal actions; it stays facedown (811.1.d.1, 054.1)", async () => {
    const game = await showdownAtBf1({ facedown: "cub" });
    expect(game.p1.legal().map((o) => o.key)).not.toContain("revealHidden:cub");
    expect(game.p1.can("reveal", "cub")).toBe(false);
    await game.p1.try((p) => p.reveal("cub"));
    expect(game.zoneOf("cub")).toBe("facedown-bf1");
    expect(game.state("cub").isHidden).toBe(true);
  });

  test("control — Warden in P2's BASE: the facedown Cub IS flippable for 0 and enters bf1; and the flipped Here to Help offers the Sergeant, which must go to bf1 (811.1.d.3) — it lands there for 1 energy as an exhausted Defender", async () => {
    const cub = await showdownAtBf1({ facedown: "cub", wardenAt: "base" });
    expect(cub.p1.can("reveal", "cub")).toBe(true);
    await cub.p1.reveal("cub");
    expect(cub.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
    await cub.settle();
    expect(cub.locationOf("cub")).toBe("bf1");

    const game = await showdownAtBf1({ wardenAt: "base" });
    await game.p1.reveal("hthHidden");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["sarge"]);
    await game.p1.pick("sarge");
    expect(game.decision()?.kind === "pick").toBe(false); // no destination choice: bf1 is forced
    expect(game.state("sarge")).toMatchObject({ combatRole: "defender", controller: P1, isExhausted: true, location: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1 } });
    expect(game.zoneOf("hthHidden")).toBe("trash");
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
