/**
 * Interaction: Fizz, Trickster (sfd-140-221, Champion Unit, 3+[chaos], 3 Might)
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *      ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   × Arcane Shift (sfd-200-221, Spell, 3+[rainbow], [Action])
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *      battlefield. Banish this."
 *   × Wind Wall (ogn-064-298, Spell, 3+[calm][calm], [Reaction]) "Counter a spell."
 *   (+ Incinerate ogs-003-024 as a second ≤3 spell in the trash; Ravenbloom Student ogn-103-298 "When you
 *    play a spell, give me +1 [Might] this turn" as P1's spell-played watcher on the countered path.)
 *
 * Question: P1 plays Fizz to bf1 with Arcane Shift in the trash; P2 holds a 3-Might E at bf2 (and Wind Wall).
 *   (a) Is Arcane Shift (Energy 3) an eligible pick, what does P1 pay, when are its two targets chosen, may
 *       Fizz himself be the "friendly unit"?  (b) YES path Fizz + E unanswered: resolution order (354.3), where
 *       the re-played Fizz may go, does "When you play me" trigger again and can it pick Arcane Shift?
 *   (c) KEY: is Arcane Shift RECYCLED (Fizz's rider) or BANISHED (its own last instruction)?
 *   (d) P2 Wind Walls it — trash, recycled or banished?  (e) cards-played count / spell-played triggers.
 *
 * Rules: 206 (eligibility reads the printed Energy cost), 355.10.a (the trash is public → the spell is a
 * TARGET of Fizz's trigger, named at finalization), 419.3 (effect play = Limited Play with all normal steps),
 * 356.1.b.2 (only Energy → 0; the [rainbow] Power is paid, 357.1.a), 355.5 (the replayed spell's own two
 * choices are made in ITS Make-Choices step), 355.9.c (the spell is a separate object → Fizz is a legal
 * "friendly unit"), 354.3 (a play started mid-resolution waits as a Pending item until the resolving spell
 * finishes: banish Fizz → [Fizz pending] → Deal 3 → Banish this → THEN Fizz finalizes), 355.2.a (base or a
 * controlled battlefield), 390.3.a ("Recycle that spell after you play it" = delayed replacement that does
 * NOT apply when leaving the chain was instructed by the spell's own execution — "Banish this"), 425.1.a.1 /
 * 425.1.b / 425.1.c (countered: would go to trash → replaced by the recycle; not "played" for triggers; no
 * refund), 419.4.b (a countered card was still Finalized → counts for Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const ARCANE_SHIFT = "sfd-200-221";
const WIND_WALL = "ogn-064-298";
const INCINERATE = "ogs-003-024"; // [Action] 2, no power: Deal 2 to a unit at a battlefield — a second ≤3 spell
const RAVENBLOOM_STUDENT = "ogn-103-298"; // 2 Might: When you play a spell, give me +1 Might this turn

/**
 * P1's turn. P1: exactly Fizz's 3+[chaos] plus ONE [rainbow] for Arcane Shift's Power; bf1 is P1's (empty —
 * Fizz will be played there), Arcane Shift + Incinerate in the trash. P2: E (3 Might) alone at P2's bf2,
 * Wind Wall in hand with its 3+[calm][calm]. Optional: a second friendly unit for P1 / P1's spell watcher.
 */
function board(opts: { buddy?: boolean; student?: boolean; p1Power?: Record<string, number> } = {}) {
  let s = scenario()
    .resources(P1, { energy: 3, power: opts.p1Power ?? { chaos: 1, rainbow: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "E" }, "e")
    .trash(P1, ARCANE_SHIFT, "shift")
    .trash(P1, INCINERATE, "inc")
    .hand(P1, FIZZ, "fizz")
    .hand(P2, WIND_WALL, "ww");
  if (opts.buddy) {
    s = s.unit(P1, "base", { might: 1, name: "Buddy" }, "buddy");
  }
  if (opts.student) {
    s = s.unit(P1, "base", RAVENBLOOM_STUDENT, "student");
  }
  return s;
}

const isPick = (d: Decision | null): d is PickDecision => d?.kind === "pick";
const keysOf = (d: Decision | null): string[] => (isPick(d) ? d.options.map((o) => o.key) : []);

/** Play Fizz to bf1, accept the "you may", name Arcane Shift as the trigger's target. P1 then holds priority on the trigger. */
async function playFizzNamingShift(game: Game): Promise<void> {
  await game.p1.play("fizz", { to: "bf1" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" }, timing: "FIN" });
  await game.p1.yes();
  if (isPick(game.decision()) && keysOf(game.decision()).includes("shift")) {
    await game.p1.pick("shift");
  }
}

/**
 * From "P1 holds priority on Fizz's trigger": both pass → the trigger resolves and PLAYS Arcane Shift from
 * the trash; answer any target question of that play with Fizz / E; stop as soon as `seat` holds priority
 * with Arcane Shift on the chain.
 */
async function toPriorityOnShift(game: Game, seat: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      if (d.seat === seat && game.zoneOf("shift") === "chain") {
        return;
      }
      await game.seat(d.seat).passPriority();
    } else if (isPick(d) && d.seat === P1) {
      const keys = keysOf(d);
      await game.p1.pick(keys.includes("fizz") ? "fizz" : keys.includes("e") ? "e" : keys[0]!);
    } else {
      break;
    }
  }
  throw new Error(`never reached ${seat}'s priority on Arcane Shift: ${JSON.stringify(game.decision()?.prompt)}`);
}

/**
 * Generic driver: pass chain priority for everyone, answer P1's picks with `choose` (undefined = stop there),
 * answer P1's yes/no with `optIn`, accept soft trigger orders. Returns every pick decision P1 was shown.
 */
async function drive(game: Game, choose: (d: PickDecision) => string | undefined, optIn: (d: Decision) => boolean): Promise<PickDecision[]> {
  const seen: PickDecision[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      return seen;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (isPick(d)) {
      seen.push(d);
      const key = choose(d);
      if (key === undefined) {
        return seen;
      }
      await game.seat(d.seat).pick(key);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).answer(optIn(d));
    } else if (d.kind === "order") {
      await game.seat(d.seat).order(d.items.map((o) => o.key));
    } else {
      return seen;
    }
  }
  return seen;
}

/** Prefer Fizz as the friendly unit, E as the enemy, bf1 as a destination. */
const preferFizz = (d: PickDecision): string => {
  const keys = keysOf(d);
  return keys.includes("fizz") ? "fizz" : keys.includes("e") ? "e" : keys.includes("battlefield-bf1") ? "battlefield-bf1" : keys[0]!;
};

describe("(a) Fizz names Arcane Shift — eligibility, payment, targets", () => {
  test("Arcane Shift (printed Energy 3 ≤ 3, rule 206) is offered as a TARGET of Fizz's trigger at finalization (355.10.a — trash is public), next to Incinerate; naming it locks it on the chain item before anyone gets priority", async () => {
    const game = await board().build();
    await game.p1.play("fizz", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } }); // Fizz paid 3+[chaos]
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "fizz" }, timing: "FIN" });
    expect(keysOf(d).sort()).toEqual(["inc", "shift"]);
    await game.p1.pick("shift");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, targets: ["shift"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("shift")).toBe("trash"); // nothing is played until the trigger resolves
  });

  test("on resolution P1 PLAYS Arcane Shift from the trash (419.3): Energy ignored (still 0), the [rainbow] Power IS paid (356.1.b.2) — it becomes a non-triggered spell item controlled by P1 and P1 gets priority first", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P1);
    expect(game.zoneOf("shift")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.zoneOf("fizz")).toBe("battlefield-bf1"); // untouched until Arcane Shift resolves
    expect(game.violations()).toEqual([]);
  });

  test("the Power pip is [rainbow] = ANY domain: a second CHAOS power pays it just as well (pool chaos 2 → 0)", async () => {
    const game = await board({ p1Power: { chaos: 2 } }).build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P1);
    expect(game.zoneOf("shift")).toBe("chain");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("Arcane Shifts two targets (friendly unit to banish, enemy unit at a battlefield) must be chosen in the Make-Choices step of THAT play (355.5) — by the time P2 may respond the item should already name [Fizz, E]", async () => {
    // Expected: like any cast of Arcane Shift, the effect-play locks both targets at finalization (with a
    // single candidate per role they simply bind), so P2 decides on Wind Wall knowing what is targeted.
    // Actual: the replayed spell is finalized with NO targets; the friendly unit is auto-selected and the
    // enemy is only asked for (timing RES) while the spell resolves.
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", targets: ["fizz", "e"] })]);
  });

  test("Fizz himself is a legal 'friendly unit' for the spell his own trigger played (355.9.c — the spell is a separate object): with Fizz the only friendly unit Arcane Shift is playable and, unanswered, banishes-and-replays FIZZ", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority(); // both passed → Arcane Shift resolves
    // Fizz was banished and is now being re-played: he is the Pending chain item awaiting his location.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", pending: true, triggered: false })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "fizz" } });
    expect(game.zoneOf("fizz")).toBe("banishment"); // in his owner's banishment until the play finalizes
  });

  test("with a second friendly unit (Buddy in base) P1 must be ASKED which friendly unit Arcane Shift banishes — Fizz and Buddy both offered — and may name Fizz (355.5 / 355.9.c)", async () => {
    // Expected: some prompt to P1 lists both fizz and buddy for the "friendly unit" role; choosing fizz
    // banishes/replays Fizz and leaves Buddy alone. Actual: no such prompt — the engine silently takes
    // Buddy (the first friendly unit it finds), banishes and replays HIM; Fizz never leaves bf1.
    const game = await board({ buddy: true }).build();
    await playFizzNamingShift(game);
    const seen = await drive(game, preferFizz, (d) => d.source?.cardId !== "fizz"); // decline Fizz's 2nd trigger
    const friendlyPrompt = seen.find((d) => keysOf(d).includes("fizz") && keysOf(d).includes("buddy"));
    expect(friendlyPrompt).toBeDefined();
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.state("buddy").isExhausted).toBe(false); // Buddy was never replayed
    expect(game.zoneOf("shift")).toBe("banishment");
  });
});

describe("(b) YES path unanswered — resolution walk (354.3), re-played Fizz, second trigger", () => {
  test("354.3: Arcane Shift finishes FIRST — E (3 Might) has taken 3 and died, and 'Banish this' has already put Arcane Shift into P1's banishment — before the pending Fizz is even asked for a location", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "fizz" } });
    // Everything after "its owner plays it" has already happened:
    expect(game.zoneOf("e")).toBe("trash"); // Deal 3 to a 3-Might unit → dead
    expect(game.zoneOf("shift")).toBe("banishment"); // "Banish this" — it left the chain by its OWN instruction
    expect(game.chain().map((c) => c.cardId)).toEqual(["fizz"]); // only the pending Fizz remains
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } }); // "ignoring its cost": nothing more to pay
  });

  test("location (355.2.a): P1's base OR bf1 — bf1 is still 'a battlefield P1 controls' although Fizz was its only unit, because control cannot lapse in the Closed state of a resolving spell / pending play (190.4, 323.6)", async () => {
    // RULING-CONFLICT: riftjudge 213de1e6a8cd73e7 / 581ad300c36bb43c have control of the emptied battlefield
    // lost mid-Arcane-Shift; CR 190.4 / 323.6 (+ official 9a32c2cc829f221a) only drop control at an OPEN-state
    // Cleanup — engine follows the CR (FIXER-PRIMER § BATTLEFIELD CONTROL TIMING), so bf1 is offered.
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority();
    expect(keysOf(game.decision()).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(keysOf(game.decision())).not.toContain("battlefield-bf2"); // never the enemy battlefield
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("picking bf1: Fizz finalizes there for 0 — exhausted (359.2.c), undamaged, P1's — and as a NEW object his 'When you play me' triggers AGAIN (a fresh FIN yes/no from Fizz on a new chain item)", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority();
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("fizz")).toBe("battlefield-bf1");
    expect(game.state("fizz")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, might: 3, owner: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fizz" }, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the base is an equally legal landing spot: picking base puts the fresh, exhausted Fizz in P1's base (and bf1, now empty, goes uncontrolled at the next Open cleanup)", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority();
    await game.p1.pick("base");
    await drive(game, preferFizz, () => false); // decline the second trigger, drain
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("fizz")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  test("the SECOND trigger cannot pick Arcane Shift — it is in banishment, not the trash: accepting finds only Incinerate (bound as the sole eligible target), which is then played for 0 and, after resolving, RECYCLED to the bottom of P1's deck by this trigger's own rider", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.passPriority();
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("shift")).toBe("banishment");
    await game.p1.yes();
    // Either a one-option prompt without "shift", or Incinerate already bound:
    if (isPick(game.decision()) && game.decision()?.source?.cardId === "fizz") {
      expect(keysOf(game.decision())).toEqual(["inc"]);
      await game.p1.pick("inc");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", targets: ["inc"], triggered: true })]);
    // Let it all resolve: Incinerate's only legal "unit at a battlefield" is Fizz himself (E is dead) → Fizz takes 2.
    await drive(game, preferFizz, () => true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("fizz")).toMatchObject({ damage: 2, zone: "battlefield-bf1" }); // 2 < 3, survives
    expect(game.zoneOf("inc")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("inc"); // recycled = bottom of Main Deck
    expect(game.zoneOf("shift")).toBe("banishment"); // still
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) KEY — after resolving, Arcane Shift is BANISHED by its own 'Banish this', NOT recycled by Fizz", () => {
  test("full YES path (second trigger declined): Arcane Shift ends in P1's BANISHMENT — not at the bottom of the deck, not in the trash, not in hand (390.3.a: leaving the chain was instructed by its own execution → the recycle replacement does not apply)", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await drive(game, preferFizz, (d) => game.zoneOf("shift") !== "banishment" || d.source?.cardId !== "fizz"); // yes to the 1st trigger only
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["shift"]);
    expect(game.p1.deck()).not.toContain("shift");
    expect(game.p1.trash()).toEqual(["inc"]); // Incinerate untouched (2nd trigger declined)
    expect(game.p1.hand()).toEqual([]);
    // and the rest of the board is as walked above
    expect(game.zoneOf("e")).toBe("trash");
    expect(game.state("fizz")).toMatchObject({ damage: 0, isExhausted: true, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — P2 Wind Walls the Fizz-played Arcane Shift", () => {
  test("Wind Wall is legal against it (a spell on the chain; P2 has 3+[calm][calm]) and is the only target offered", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    expect(game.p2.can("cast", "ww")).toBe(true);
    expect(game.p2.option("cast", "ww")?.fields.find((f) => f.name === "targets")?.options).toEqual([["shift"]]);
    await game.p2.cast("ww", { targets: "shift" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift", "ww"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("countered → RECYCLED: it would be cleared to the trash (425.1.a.1) but did not leave the chain by its own execution, so Fizz's delayed replacement (390.3.a) sends it to the BOTTOM OF P1's MAIN DECK — nothing is banished", async () => {
    // RULING-CONFLICT: riftjudge c769ec7c8c80f87b says a countered Fizz-spell goes to the trash; CR 390.3.a's
    // replacement is conditioned only on "finalized" + "not by its own execution" (both true here) — engine
    // follows the CR (same as interactions/fizz-replayed-spell-countered-recycled).
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.cast("ww", { targets: "shift" });
    await drive(game, preferFizz, () => false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("shift")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("shift");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual(["inc"]);
    expect(game.zoneOf("ww")).toBe("trash");
  });

  test("countered → it did nothing: Fizz never left bf1 (still the exhausted unit played from hand, no second trigger), E is undamaged at bf2, and the [rainbow] paid for it is NOT refunded (425.1.c)", async () => {
    const game = await board().build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    await game.p2.cast("ww", { targets: "shift" });
    const seen = await drive(game, preferFizz, () => false);
    expect(seen).toEqual([]); // nobody was asked anything (no destination, no second "you may")
    expect(game.zoneOf("fizz")).toBe("battlefield-bf1");
    expect(game.state("fizz")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("e")).toBe("battlefield-bf2");
    expect(game.state("e").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) Legion / spells-played bookkeeping per path", () => {
  test("YES path: P1 finalized Fizz, Arcane Shift and Fizz AGAIN → cards-played count 3 (second trigger declined)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("fizz", { to: "bf1" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    await game.p1.yes();
    await game.p1.pick("shift");
    await toPriorityOnShift(game, P2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Arcane Shift finalized
    await drive(game, preferFizz, () => false);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(3); // + the re-played Fizz
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
  });

  test("countered path: Arcane Shift was still FINALIZED → count 2 for Legion (419.4.b) plus Wind Wall = 1 for P2; but it was not 'played' for triggers (425.1.b) — P1's Ravenbloom Student ('When you play a spell') never triggers and stays at 2 Might", async () => {
    const game = await board({ student: true }).build();
    await playFizzNamingShift(game);
    await toPriorityOnShift(game, P2);
    expect(game.state("student").might).toBe(2);
    await game.p2.cast("ww", { targets: "shift" });
    await drive(game, preferFizz, () => false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0, zone: "base" });
    expect(game.zoneOf("shift")).toBe("mainDeck");
  });
});
