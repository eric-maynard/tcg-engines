/**
 * Interaction: LOOK vs REVEAL on a facedown card.
 *   × Scuttle Crab (unl-053-219) · Unit · Calm · 2 · 0 Might
 *     "[Deathknell][>] Choose an opponent. They reveal their hand. You can look at their facedown cards this turn.
 *      Gain 1 XP."                                                                                    — P1's
 *   × Noxus Saboteur (ogn-018-298) · Unit · Fury · 3 · 3 Might · "Your opponents' [Hidden] cards can't be revealed
 *     here."                                                                                          — P1's
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2+[order] · "[Hidden] [Action] Kill a unit at a battlefield. Its
 *     controller draws 2."                                                     — P2's, FACEDOWN at bf2 since last turn
 *
 * Rules: 424.1 (Reveal = present to ALL players), 424.1.a.3 (the Revealed state lasts until the revealing ability's
 * resolution finishes), 424.3 / 424.3.a.1 ("reveal [zone]" = the cards there now; later additions are not revealed),
 * 128.4 (Private: only the controller may look), 107.3.f (facedown zones are public zones holding private cards),
 * 107.3.d (lose the battlefield → facedown card removed at the next Cleanup), 811.6 / 811.6.a (a Hidden card is
 * played from facedown as a Reaction — which reveals it), 054.1 (can't beats can), 108.2.d (trash is public), 421.4
 * (a facedown card changing zones is revealed by its owner).
 *
 * Question — P1's turn. P2 holds bf2 with defender D (3) and a facedown Hidden Blade; P2's hand = {A, B}, deck top N.
 * P1: Scuttle Crab (0), Noxus Saboteur (3), Bruiser (3) in base. Step 1: Crab attacks bf2 alone, dies, Deathknell
 * resolves on P2. Step 2: P1 moves Saboteur + Bruiser into bf2.
 *   (a) How long are A and B exposed to P1; is a later-drawn N exposed?
 *   (b) Does P1's view of facedown-bf2 now show Hidden Blade — as a private LOOK (only P1) or a public REVEAL?
 *   (c) Step-2 showdown with Saboteur "here": can P2 flip the Blade? Does "can't be revealed" also blind P1's look?
 *   (d) P1 conquers bf2: where does the never-flipped Blade go; is it public then?
 *   (e) Had bf2 stayed P2's, is the Blade redacted again for P1 from P2's next turn on?
 *
 * Expected: (a) one-shot Reveal during resolution (424.1.a.3): A and B go on the public reveal record; afterwards
 * P1's live view of P2's hand is redacted again; N (drawn later) is never exposed (424.3.a.1). (b) a turn-long
 * private LOOK grant: P1's view of facedown-bf2 names the Blade; no public-reveal entry; P2's view unchanged; a
 * third seat still sees an anonymous slot. (c) "play Hidden Blade from facedown" is absent from P2's legal actions
 * throughout the showdown (054.1) — while P1's look keeps showing the Blade (looking ≠ revealing). (d) P2 loses
 * bf2 → Blade removed to P2's trash at Cleanup (107.3.d), public in both views (108.2.d); it never resolved, P2 drew
 * nothing. (e) yes — the grant is "this turn": on P2's turn P1 sees an anonymous slot again.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { P1, P2, P3, isHiddenView, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";
const SABOTEUR = "ogn-018-298";
const HIDDEN_BLADE = "ogn-213-298";
const FILLER = "ogn-175-298";

/** What a list of card views exposes: the id, or "HIDDEN" for a redacted slot. */
function ids(views: readonly CardView[] | undefined): string[] {
  return (views ?? []).map((v) => (isHiddenView(v) ? "HIDDEN" : v.id));
}

function p2HandSeenBy(game: Game, seat: string): string[] {
  return ids((game.seat(seat).view().zones.hand ?? []).filter((c) => c.owner === P2));
}

function facedownBf2SeenBy(game: Game, seat: string): string[] {
  return ids(game.seat(seat).view().zones["facedown-bf2"]);
}

function publicRevealIds(game: Game): string[] {
  return (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);
}

/**
 * Turn 3, P1 active. bf1: P1's 1-Might Holder. bf2: P2's Defender D (3) + P2's facedown Hidden Blade (hidden on an
 * earlier turn). P1 base: Scuttle Crab (0), Noxus Saboteur (3), Bruiser (3) — all ready. P2 hand = {a, b}; P2 deck
 * top = n. Victory score raised so the conquer point is incidental. `players: 3` adds an idle third seat (P3 holding
 * bf3) purely as a privacy observer.
 */
function board(opts: { players?: 2 | 3 } = {}) {
  const b = scenario({ players: opts.players ?? 2 })
    .turn(3)
    .active(P1)
    .victoryScore(15)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "P1 Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", HIDDEN_BLADE, "blade")
    .unit(P1, "base", SCUTTLE_CRAB, "crab")
    .unit(P1, "base", SABOTEUR, "sab")
    .unit(P1, "base", { might: 3, name: "P1 Bruiser" }, "bruiser")
    .hand(P2, FILLER, "a")
    .hand(P2, FILLER, "b")
    .deck(P2, [FILLER, FILLER], ["n", "n2"]);
  if (opts.players === 3) {
    b.battlefield("bf3", { controller: P3 }).unit(P3, "bf3", { might: 1, name: "P3 Holder" }, "holder3");
  }
  return b;
}

/** Step 1: the Crab attacks bf2 alone, dies to D, and its Deathknell resolves naming P2. Back in P1's open main phase. */
async function crabDiedLookGranted(opts: { players?: 2 | 3 } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("crab", "bf2");
  let settled = await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(P2); // "Choose an opponent"
    settled = await game.settle();
  }
  expect(settled.reason).toBe("open");
  expect(game.zoneOf("crab")).toBe("trash");
  expect(game.p1.xp()).toBe(1); // the Deathknell did resolve
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Step 2: Saboteur + Bruiser Standard-Move into bf2; the combat showdown opens with P1 holding Focus. */
async function saboteurArrives(game: Game): Promise<void> {
  await game.p1.move(["sab", "bruiser"], "bf2");
  expect(game.locationOf("sab")).toBe("bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Scuttle Crab's 'look at their facedown cards' × Noxus Saboteur's 'can't be revealed here' × a facedown Hidden Blade", () => {
  // ── premise ──────────────────────────────────────────────────────────────────────────────────────

  test("premise: before anything happens P1 sees P2's hand as two anonymous slots and facedown-bf2 as one anonymous slot; P2 sees its own Blade (128.4)", async () => {
    const game = await board().build();
    expect(p2HandSeenBy(game, P1)).toEqual(["HIDDEN", "HIDDEN"]);
    expect(facedownBf2SeenBy(game, P1)).toEqual(["HIDDEN"]);
    expect(facedownBf2SeenBy(game, P2)).toEqual(["blade"]);
    expect(publicRevealIds(game)).toEqual([]);
  });

  test("step 1: the 0-Might Crab attacking D alone dies in combat; its Deathknell goes on the chain as P1's item and resolves: P1 gains 1 XP, bf2 stays P2's, D undamaged", async () => {
    const game = await board().build();
    await game.p1.move("crab", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat damage
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crab", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick(P2);
      await game.settle();
    }
    expect(game.p1.xp()).toBe(1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.state("d").damage).toBe(0);
    expect(game.zoneOf("blade")).toBe("facedown-bf2");
  });

  // ── (a) the hand REVEAL ──────────────────────────────────────────────────────────────────────────

  // BUG: expected — "They reveal their hand" is a Reveal action (424.1): A and B are presented to all players and
  // land on the public reveal record. Actual — the engine records no public reveal at all (it models the hand
  // reveal as a private turn-long visibility grant for P1 only).
  test("(a) A and B are recorded on the PUBLIC reveal record when the Deathknell resolves (424.1, 424.3)", async () => {
    const game = await crabDiedLookGranted();
    expect(publicRevealIds(game).sort()).toEqual(["a", "b"]);
    expect(publicRevealIds(game)).not.toContain("blade"); // the facedown card is looked at, never revealed
  });

  // BUG: expected — the Revealed state ends when the Deathknell's resolution finishes (424.1.a.3): back in the open
  // main phase P1's LIVE view of P2's hand is two anonymous slots again. Actual — the engine keeps P2's whole hand
  // face-up to P1 for the rest of the turn.
  test("(a) after resolution P1's live view of P2's hand is redacted again — the reveal is one-shot, not 'this turn' (424.1.a.3)", async () => {
    const game = await crabDiedLookGranted();
    expect(p2HandSeenBy(game, P1)).toEqual(["HIDDEN", "HIDDEN"]);
  });

  // BUG: expected — 424.3.a.1: cards added to the hand after the reveal executed are NOT revealed; N drawn later is
  // never exposed to P1. Actual — P1's turn-long hand grant shows N face-up the moment P2 draws it.
  test("(a) a card P2 draws AFTER the reveal (N) is never exposed to P1 (424.3.a.1)", async () => {
    const game = await crabDiedLookGranted();
    await game.p2.do("drawCard", { count: 1 });
    expect(game.p2.hand()).toEqual(["a", "b", "n"]);
    expect(p2HandSeenBy(game, P1)).not.toContain("n");
    expect(p2HandSeenBy(game, P1).at(-1)).toBe("HIDDEN");
  });

  test("(a) P2's own view of its hand is of course unchanged, and P2 drew nothing off the Deathknell (hand still exactly {a, b})", async () => {
    const game = await crabDiedLookGranted();
    expect(game.p2.hand()).toEqual(["a", "b"]);
    expect(p2HandSeenBy(game, P2)).toEqual(["a", "b"]);
  });

  // ── (b) the facedown LOOK ────────────────────────────────────────────────────────────────────────

  test("(b) after the Deathknell P1's view of facedown-bf2 names Hidden Blade — a private LOOK grant for seat P1 (128.4 lifted for P1 only)", async () => {
    const game = await crabDiedLookGranted();
    expect(facedownBf2SeenBy(game, P1)).toEqual(["blade"]);
    expect(game.zoneOf("blade")).toBe("facedown-bf2"); // still facedown, still P2's
    expect(game.state("blade")).toMatchObject({ controller: P2, isHidden: true, owner: P2 });
  });

  test("(b) it is NOT a Reveal: no public-reveal entry names the Blade, P2's view is unchanged, and the card did not move or resolve", async () => {
    const game = await crabDiedLookGranted();
    expect(publicRevealIds(game)).not.toContain("blade");
    expect(facedownBf2SeenBy(game, P2)).toEqual(["blade"]);
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual(["a", "b"]); // "its controller draws 2" never happened
  });

  test("(b) a third seat still sees an anonymous facedown slot at bf2 (and P2's hand redacted) — the look is P1's alone (424.1 vs 128.4)", async () => {
    const game = await crabDiedLookGranted({ players: 3 });
    expect(facedownBf2SeenBy(game, P1)).toEqual(["blade"]);
    expect(facedownBf2SeenBy(game, P3)).toEqual(["HIDDEN"]);
    expect(p2HandSeenBy(game, P3)).toEqual(["HIDDEN", "HIDDEN"]);
  });

  // ── (c) Saboteur "here" ──────────────────────────────────────────────────────────────────────────

  test("(c) contrast: in the step-1 showdown (no Saboteur at bf2) flipping the Blade WAS on P2's menu (811.6)", async () => {
    const game = await board().build();
    await game.p1.move("crab", "bf2");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "blade")).toBe(true);
  });

  test("(c) step 2: with Saboteur now HERE, 'play Hidden Blade from facedown' is absent from P2's legal actions for the whole showdown (054.1: can't beats can) — even though P1 already knows what it is", async () => {
    const game = await crabDiedLookGranted();
    await saboteurArrives(game);
    expect(game.p2.can("reveal", "blade")).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "blade")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passFocus"]);
    const r = await game.p2.try((p) => p.reveal("blade", { answers: ["sab"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf2");
    expect(game.chain()).toEqual([]);
  });

  test("(c) Saboteur restricts REVEALING only — P1's Crab-granted LOOK keeps showing the Blade's identity throughout the showdown", async () => {
    const game = await crabDiedLookGranted();
    await saboteurArrives(game);
    expect(facedownBf2SeenBy(game, P1)).toEqual(["blade"]);
    await game.p1.passFocus();
    expect(facedownBf2SeenBy(game, P1)).toEqual(["blade"]);
    expect(facedownBf2SeenBy(game, P2)).toEqual(["blade"]);
  });

  // ── (d) P1 conquers bf2 ──────────────────────────────────────────────────────────────────────────

  test("(d) 6 Might into D (3): D dies, P1 takes bf2 (+1 point); at Cleanup the never-flipped Blade is REMOVED to its owner P2's trash (107.3.d) — it never hit the chain, nobody drew 2", async () => {
    const game = await crabDiedLookGranted();
    await saboteurArrives(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash()).toContain("blade");
    expect(game.p2.facedown("bf2")).toEqual([]);
    expect(game.p2.hand()).toEqual(["a", "b"]); // Hidden Blade's "its controller draws 2" never resolved
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) the trash is public (108.2.d): the Blade's identity is now visible in BOTH players' views", async () => {
    const game = await crabDiedLookGranted();
    await saboteurArrives(game);
    await game.settle();
    const p2TrashSeenByP1 = ids((game.p1.view().zones.trash ?? []).filter((c) => c.owner === P2));
    const p2TrashSeenByP2 = ids((game.p2.view().zones.trash ?? []).filter((c) => c.owner === P2));
    expect(p2TrashSeenByP1).toContain("blade");
    expect(p2TrashSeenByP2).toContain("blade");
    expect(p2TrashSeenByP1).not.toContain("HIDDEN");
  });

  // ── (e) the look expires with the turn ───────────────────────────────────────────────────────────

  test("(e) contrast — bf2 stays P2's (no step 2): the Blade is visible to P1 for the rest of P1's turn, and an anonymous slot again from P2's turn on ('this turn'); P2's hand likewise redacted", async () => {
    const game = await crabDiedLookGranted();
    expect(facedownBf2SeenBy(game, P1)).toEqual(["blade"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("blade")).toBe("facedown-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(facedownBf2SeenBy(game, P1)).toEqual(["HIDDEN"]);
    expect(p2HandSeenBy(game, P1).every((v) => v === "HIDDEN")).toBe(true);
    expect(facedownBf2SeenBy(game, P2)).toEqual(["blade"]);
    // …and with no Saboteur around, P2 may flip it again on its own turn.
    expect(game.p2.can("reveal", "blade")).toBe(true);
  });
});
