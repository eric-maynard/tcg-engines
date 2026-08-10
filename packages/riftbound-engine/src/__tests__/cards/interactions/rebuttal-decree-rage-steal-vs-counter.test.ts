/**
 * Interaction: Rebuttal (ven-152-166) · Spell [Reaction] · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   × Decree of Rage (ven-015-166) · Spell [Action] · Fury · 1 + [fury]
 *     "This can't be countered. Deal 4 to an enemy Calm ([calm]) unit."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 + [fury] — "Deal 3 to a unit at a battlefield." (control)
 *   (+ Ravenbloom Student ogn-103-298 "When you play a spell, give me +1 Might this turn" as the
 *    425.1.b play-trigger probe.)
 *
 * Position: P1's turn. P2 controls Calm unit C (4 Might) at bf1 (+ a second Calm unit and a Fury unit);
 * P1 controls Calm unit D (3 Might) in base. P1 plays Decree of Rage at C; P2 answers with Rebuttal.
 *
 * Question: (a) is the uncounterable Decree even OFFERED to Rebuttal? (b) P2 pays [rainbow]: what
 * happens to Decree, which new choices are legal, where does everything end up? (b') same but P2 keeps
 * C / P1 has no Calm unit. (c) P2 declines to pay: is Decree countered? (d) control: Hextech Ray
 * instead of Decree, P2 declines.
 *
 * Rules: 355.9.b (only choose-restrictions limit targeting) + 358.3.a (an effect that prevents an
 * action does not stop the card instructing it from being played); 340.1 (LIFO); 740.1.b + 753.1
 * ("enemy" re-read from the NEW controller when re-choosing); 359.3.d (resolved spell → OWNER's
 * trash); 359.3.e.2 / 359.3.f.4 (kept target no longer 'enemy' → illegal → no effect); 054.1 (can't
 * beats can) + 359.3.e.6 (impossible instruction ignored); 425.1.a/.a.1/.b/.c (counter: no effect,
 * → trash, not 'played' for triggers, no refund); 419.4.b (but it WAS Finalized — Legion tally).
 *
 * Expected: (a) offered; Rebuttal finalized above Decree for 1 + [C]. (b) pay → control change (not
 * a counter): Decree now P2's; legal new choice = P1's D only; Rebuttal → P2's trash; Decree resolves
 * for P2: 4 to D, D dies → P1's trash; Decree → P1's (owner's) trash; C untouched; nobody refunded.
 * (b') kept on C / nothing to re-choose → C is friendly to the spell → no damage; Decree → P1's trash.
 * (c) decline → "counter it" is impossible (can't be countered) and ignored; Rebuttal → P2's trash
 * having done nothing; Decree stays, resolves: 4 to C, C dies → P2's trash; Decree → P1's trash.
 * (d) Ray IS countered: no damage, Ray → P1's trash, cost not refunded, no play-trigger, but the
 * Legion-style 'cards played' tally still counts it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const DECREE_OF_RAGE = "ven-015-166";
const HEXTECH_RAY = "ogn-009-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. bf1 (P2's): C — P2's 4-Might Calm unit — and a 2-Might Fury unit of P2's; P2's base: a
 * second Calm unit (2). P1's base: D — 3-Might Calm — unless `noCalmForP1`; with `student` also a
 * Ravenbloom Student (Mind, 2). P1 has exactly 1 + [fury] (one spell); P2 has 1 + [rainbow][rainbow]
 * (Rebuttal's 1 + [C], plus one [rainbow] for the option).
 */
function board(opts: { noCalmForP1?: boolean; student?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { domain: "calm", might: 4, name: "Calm C" }, "c")
    .unit(P2, "bf1", { domain: "fury", might: 2, name: "Fury F" }, "f")
    .unit(P2, "base", { domain: "calm", might: 2, name: "Calm C2" }, "c2");
  if (!opts.noCalmForP1) {
    s = s.unit(P1, "base", { domain: "calm", might: 3, name: "Calm D" }, "d");
  }
  if (opts.student) {
    s = s.unit(P1, "base", RAVENBLOOM_STUDENT, "student");
  }
  return s.hand(P1, DECREE_OF_RAGE, "decree").hand(P1, HEXTECH_RAY, "ray").hand(P2, REBUTTAL, "reb");
}

/** P1 casts `spell` at C, passes; P2 Rebuttals it; both pass until Rebuttal resolves (stops at P2's pay prompt). */
async function rebutted(spell: "decree" | "ray", opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast(spell, { targets: "c" });
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: spell });
  expect(game.chain().map((i) => i.cardId)).toEqual([spell, "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((i) => i.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

/** Pass priority around until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Rebuttal × Decree of Rage — steal (pay [rainbow]) vs 'counter it' on an uncounterable spell", () => {
  // ── (a) targeting ─────────────────────────────────────────────────────────────────────────────

  test("(a) Decree of Rage only offers ENEMY CALM units to P1 (C, C2 — not the Fury unit, not P1's own D); cast at C for 1 + [fury]", async () => {
    const game = await board().build();
    expect(targetsOffered(game, P1, "decree").sort()).toEqual(["c", "c2"]);
    await game.p1.cast("decree", { targets: "c" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, targets: ["c"] })]);
  });

  test("(a) 'can't be countered' is no targeting restriction: Decree (Energy 1 ≤ 4) IS offered to Rebuttal, which is finalized above it for 1 + [C] (355.9.b, 358.3.a)", async () => {
    const game = await board().build();
    await game.p1.cast("decree", { targets: "c" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "reb")).toBe(true);
    expect(targetsOffered(game, P2, "reb")).toEqual(["decree"]);
    await game.p2.cast("reb", { targets: "decree" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain().map((i) => [i.cardId, i.controller])).toEqual([
      ["decree", P1],
      ["reb", P2],
    ]);
  });

  // ── (b) pay [rainbow] → gain control → new choices ────────────────────────────────────────────

  test("(b) LIFO: Rebuttal resolves first and asks P2 to pay [rainbow]; paying flips Decree's controller to P2 — a control change, NOT a counter — and Rebuttal goes to P2's trash (340.1)", async () => {
    const game = await rebutted("decree");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, countered: false })]);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  test("(b) new choices are read from P2's seat: the only legal 'enemy Calm unit' is P1's D — C/C2 (now friendly) and the Fury unit are not offered; C is shown as the current choice (740.1.b, 753.1)", async () => {
    const game = await rebutted("decree");
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.newChoices?.slot : undefined).toMatchObject({ current: ["c"], kind: "target" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["d"]);
  });

  test("(b) P2 re-aims Decree at D: it resolves under P2's control — 4 to D, D (3) dies → P1's trash; Decree → its OWNER P1's trash (359.3.d); C untouched; P1's 1+[fury] and P2's 1+[C]+[rainbow] all stay spent", async () => {
    const game = await rebutted("decree");
    await game.p2.yes();
    await game.p2.pick("d");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, targets: ["d"] })]);
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["d", "decree"]);
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // ── (b') pay but keep C / nothing to re-choose ────────────────────────────────────────────────

  test("(b') P2 pays but KEEPS C: at resolution C is friendly to the (now P2's) spell → no longer an 'enemy Calm unit' → no damage; Decree → P1's trash; D untouched (359.3.e.2, 359.3.f.4)", async () => {
    const game = await rebutted("decree");
    await game.p2.yes();
    await game.p2.decline(); // "you MAY make new choices" — keep C
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, targets: ["c"] })]);
    await resolveChain(game);
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("d")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  test("(b') P1 controls NO Calm unit: after paying there is nothing legal to re-choose, so no new-choices prompt at all (753.2); Decree resolves for P2 still aimed at friendly C → nothing happens; either way paying saved C", async () => {
    const game = await rebutted("decree", { noCalmForP1: true });
    await game.p2.yes();
    expect(game.decision()?.kind).toBe("action"); // straight back to priority — no pick
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P2, targets: ["c"] })]);
    await resolveChain(game);
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  // ── (c) decline → 'Otherwise, counter it' vs 'This can't be countered' ────────────────────────

  test("(c) P2 declines to pay: 'counter it' is impossible (054.1) and ignored (359.3.e.6) — Decree stays on the chain un-countered under P1; Rebuttal itself resolved (→ P2's trash), its 1 + [C] spent, the unpaid [rainbow] still in pool", async () => {
    const game = await rebutted("decree");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, countered: false, targets: ["c"] })]);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(c) …Decree then resolves normally: 4 to C, C (4) dies → P2's trash; Decree → P1's trash", async () => {
    const game = await rebutted("decree");
    await game.p2.no();
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["c", "reb"]);
    expect(game.p1.trash()).toEqual(["decree"]);
    expect(game.state("d")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) control: an ordinary spell IS countered ───────────────────────────────────────────────

  test("(d) control — Hextech Ray at C, P2 declines to pay: Ray is COUNTERED — cleared from the chain at once, no damage to C, Ray → P1's TRASH (not hand/banishment), P1's 1 + [fury] not refunded (425.1.a/.a.1/.c)", async () => {
    const game = await rebutted("ray");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ray"]);
    expect(game.p1.hand()).toEqual(["decree"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p2.trash()).toEqual(["reb"]);
  });

  test("(d) the countered Ray still counts as a FINALIZED play for Legion-style 'cards played this turn' checks (419.4.b)", async () => {
    const game = await rebutted("ray");
    await game.p2.no();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });

  test("(d) …but NOT as 'played' for play-triggers (425.1.b / 419.4.a.1): P1's Ravenbloom Student gets no +1 from the countered Ray — whereas an un-rebutted Ray that resolves does pump it", async () => {
    const countered = await rebutted("ray", { student: true });
    await countered.p2.no();
    await countered.settle();
    expect(countered.chain()).toEqual([]);
    expect(countered.state("student").might).toBe(2);

    const clean = await board({ student: true }).build();
    await clean.p1.cast("ray", { targets: "c" });
    await clean.settle();
    expect(clean.state("c").damage).toBe(3);
    expect(clean.state("student").might).toBe(3);
  });

  test("(d) contrast within the control: had P2 PAID for the Ray instead, it is stolen not countered — re-aimable at any unit at a battlefield from P2's seat (Ray says 'a unit', so C, F stay legal too)", async () => {
    const game = await rebutted("ray");
    await game.p2.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, countered: false })]);
    const d = game.decision();
    // Ray's descriptor is 'a unit at a battlefield' — friendly/enemy is irrelevant, so the offer is every
    // battlefield unit other than the current choice C (751.1); D / C2 in base are not at a battlefield.
    const options = d?.kind === "pick" ? d.options : [];
    expect(options.filter((o) => !o.current).map((o) => o.card ?? o.key)).toEqual(["f"]);
    expect(options.filter((o) => o.current).map((o) => o.card ?? o.key)).toEqual(["c"]); // the kept value, re-nameable (751.1 note)
    await game.p2.decline(); // keep C: still a legal 'unit at a battlefield' → 3 damage to P2's own C
    await resolveChain(game);
    expect(game.state("c")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.p1.trash()).toEqual(["ray"]);
  });
});
