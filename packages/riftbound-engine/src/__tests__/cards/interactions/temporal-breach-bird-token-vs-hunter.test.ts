/**
 * Interaction: Temporal Breach (ven-066-166) × Frisky Hunter (unl-033-219) / its Bird token × Spectral Centaur (unl-068-219)
 *
 *   Temporal Breach — Spell · Mind · 2 + [mind]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      Banish a unit, then its owner plays it to the same location, ignoring its cost."      — P2's, facedown at bf1 (+ a copy in P1's hand)
 *   Frisky Hunter — Unit · Calm · 4 · 3 Might
 *     "When you play me, play a 1 [Might] Bird unit token with [Deflect] here."             — P1's; the Bird: 1 Might token, [Deflect] (187.7)
 *   Spectral Centaur — Unit · Mind · 6 · 5 Might
 *     "When another friendly unit dies, give me +2 [Might] this turn."                       — P1's (death probe)
 *
 * Rules: 809.1.c / 809.1.d ([Deflect]: an OPPONENT's spell/ability choosing it pays 1 Power of any domain more — a
 * mandatory additional cost, on top of whatever the spell costs, even [0] from Hidden), 186.1 (a token put into a
 * non-board zone ceases to exist immediately), 056.2 (banished → its OWNER's banishment), 427.2.a / 428.2.a (banish
 * is not a kill; "dies" needs board → trash), 182–184 (tokens are real units on the board), 811 (Hidden: [0],
 * Reaction, choices restricted to that battlefield), 359.2 (a played unit enters exhausted), 383.4.a ("When you
 * play me" fires again on the replay).
 *
 * Question: P1's Frisky Hunter made a Bird; P1 also has Spectral Centaur. P1 attacks P2's bf1 (a Sentry + P2's
 * facedown Breach) with Hunter, Bird and Centaur; P2 flips Temporal Breach.
 *   (a) On the BIRD: does P2 owe the Deflect power although the flip is free? On resolution — is the Bird banished,
 *       does it come back, is anything left in P1's banishment, does the Centaur get +2?
 *   (b) P1 Breaches its own Bird: Deflect? Does it come back?
 *   (c) P2 flips it on FRISKY HUNTER instead: what happens — a second Bird?
 *
 * Expected: (a) yes, [rainbow] on top of [0] or the Bird can't be chosen. The Bird goes to P1's banishment and ceases
 * to exist (186.1); "its owner plays it" has nothing to play; banishment empty; not a death → Centaur stays 5.
 * (b) no Deflect for its controller; same outcome — gone, not replayed. (c) Hunter is a card: banished, replayed by
 * P1 at bf1 (exhausted), its play trigger fires again → a NEW Bird at bf1; the original Bird is untouched → two Birds.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const FRISKY_HUNTER = "unl-033-219";
const SPECTRAL_CENTAUR = "unl-068-219";

/**
 * Turn 2, P1 active. bf1: P2's, held by a vanilla 1-Might Sentry, with P2's Temporal Breach already face down there.
 * P1: exactly 4 energy + Frisky Hunter in hand (played to base this turn → the Bird appears in base), Spectral
 * Centaur in base, a Temporal Breach of its own in hand and three mind runes to pay for it later (case b).
 * P2: one fury rune — recycled when needed for a single off-domain Power (the would-be Deflect payment).
 * The action happens on turn 4 (P1 again), when Hunter, Bird and Centaur are all ready.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .facedown(P2, "bf1", TEMPORAL_BREACH, "breach")
    .unit(P1, "base", SPECTRAL_CENTAUR, "centaur")
    .hand(P1, FRISKY_HUNTER, "hunter")
    .hand(P1, TEMPORAL_BREACH, "myBreach")
    .runes(P1, "mind", 3)
    .runes(P2, "fury", 1);
}

const birdsOf = (game: Game, at?: "base" | "bf1") => game.p1.units(at).filter((id) => game.state(id).name === "Bird");

/** Turn 2: P1 plays Frisky Hunter to base (Bird token appears there); two turn passes → turn 4, P1's open main phase. */
async function turn4(): Promise<{ game: Game; bird: string }> {
  const game = await board().build();
  await game.p1.play("hunter");
  await game.settle();
  const [bird] = birdsOf(game, "base");
  expect(bird).toBeDefined();
  await game.advanceTurn(); // → P2 (turn 3)
  await game.advanceTurn(); // → P1 (turn 4)
  expect(game.turnPlayer()).toBe(P1);
  return { bird: bird as string, game };
}

/**
 * Turn 4: P1 attacks bf1 with Hunter + Bird + Centaur (combat showdown, P1 has Focus) and passes Focus; P2 — after
 * recycling its fury rune for 1 Power if `power` — flips the Breach for [0] and is asked for its target.
 */
async function breachFlipped(opts: { power: boolean }): Promise<{ game: Game; bird: string }> {
  const { game, bird } = await turn4();
  await game.p1.move(["hunter", bird, "centaur"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  if (opts.power) {
    await game.p2.recycleRune(undefined, "fury");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  }
  expect(game.p2.can("reveal", "breach")).toBe(true);
  await game.p2.reveal("breach");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "breach" } });
  return { bird, game };
}

/** …P2 picks `target`, then P2 and P1 pass priority → Temporal Breach resolves (the replay, if any, happens inside it). */
async function breachResolvedOn(target: "bird" | "hunter"): Promise<{ game: Game; bird: string }> {
  const { game, bird } = await breachFlipped({ power: true });
  await game.p2.pick(target === "bird" ? bird : "hunter");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", controller: P2, targets: [target === "bird" ? bird : "hunter"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("breach")).toBe("trash");
  return { bird, game };
}

describe("setup — the Bird is a real 1-Might [Deflect] unit TOKEN owned and controlled by P1", () => {
  test("Frisky Hunter played to base makes exactly one Bird there: token, 1 Might, [Deflect], owner = controller = P1; by turn 4 everything is ready, P2 still holds bf1 (scored it once) with the Breach face down", async () => {
    const { game, bird } = await turn4();
    expect(birdsOf(game)).toEqual([bird]);
    expect(game.state(bird)).toMatchObject({ controller: P1, isExhausted: false, isToken: true, keywords: ["Deflect"], might: 1, owner: P1, zone: "base" });
    expect(game.state("hunter")).toMatchObject({ isExhausted: false, zone: "base" });
    expect(game.state("centaur")).toMatchObject({ isExhausted: false, might: 5, zone: "base" });
    expect(game.zoneOf("breach")).toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // P2 held bf1 on turn 3
  });
});

describe("(a) P2 flips the hidden Breach at the Bird", () => {
  test("the flip itself is free ([0], 811): a P2 spell on the chain inside P1's combat showdown, P2's energy untouched; its target prompt lists exactly the units AT bf1 (811.1.d.2): Sentry, Hunter, Centaur, Bird", async () => {
    const { game, bird } = await breachFlipped({ power: true });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", controller: P2, triggered: false })]);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual([bird, "centaur", "hunter", "sentry"].sort());
  });

  // Expected (809.1.c/d): Deflect is a MANDATORY additional cost for an opponent choosing the Bird — with an empty
  // power pool P2 simply cannot choose it (the free Hidden cost changes nothing; the surcharge is on top of [0]).
  // Actual: the hidden-reveal target prompt offers the Bird and accepts the pick with 0 Power.
  test("with an EMPTY power pool the Bird is not a choosable target for P2's Breach (Deflect surcharge owed even on a [0] flip — 809.1.d)", async () => {
    const { game, bird } = await breachFlipped({ power: false });
    expect(game.p2.resources().power.fury ?? 0).toBe(0);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("hunter"); // the untaxed units are there
    expect(offered).not.toContain(bird);
    expect((await game.p2.try((p) => p.pick(bird))).ok).toBe(false);
  });

  // Expected: choosing the Bird with 1 fury floating spends it (any domain pays Deflect, 809.1.c.1) → pool 0.
  // Actual: the pick goes through and the fury Power is still there.
  test("with 1 off-domain Power floating, choosing the Bird PAYS it — P2's pool drops to 0 (809.1.c.1)", async () => {
    const { game, bird } = await breachFlipped({ power: true });
    await game.p2.pick(bird);
    expect(game.chain()[0]?.targets).toEqual([bird]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("resolution — the Bird (owner P1, controller P1, at bf1) is banished and immediately CEASES TO EXIST (186.1): not on the board, not in either banishment, no longer a game object; 'its owner plays it' finds nothing to play", async () => {
    const { game, bird } = await breachResolvedOn("bird");
    expect(game.has(bird)).toBe(false);
    expect(game.zoneOf(bird)).toBe("gone");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(birdsOf(game)).toEqual([]); // nothing was (re)played anywhere
    expect(game.p1.units("bf1").sort()).toEqual(["centaur", "hunter"]);
    expect(game.p1.units("base")).toEqual([]);
  });

  test("banish is not a death (427.2.a / 428.2.a): Spectral Centaur gets NO +2 (still 5), no trigger was put on the chain, and the showdown simply continues with Focus back on P1", async () => {
    const { game } = await breachResolvedOn("bird");
    expect(game.state("centaur")).toMatchObject({ might: 5, mightModifier: 0, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("net effect = clean removal: the combat then resolves 3 + 5 vs 1 — the Sentry dies, P1 conquers bf1 and scores; still no Bird anywhere, no violations", async () => {
    const { game } = await breachResolvedOn("bird");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game)).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["centaur", "hunter"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P1 Breaches its OWN Bird (from hand, before attacking)", () => {
  test("no Deflect for the Bird's own controller: with exactly 2 + [mind] the cast is offered with the Bird among its targets and empties P1's pool to 0/0 — no extra Power asked", async () => {
    const { game, bird } = await turn4();
    await game.p1.tapRunes(2);
    await game.p1.recycleRune(undefined, "mind");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } });
    const offered = (game.p1.option("cast", "myBreach")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain(bird);
    await game.p1.cast("myBreach", { targets: bird });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "myBreach", controller: P1, targets: [bird] })]);
  });

  test("same outcome as (a): the Bird vanishes in banishment and is NOT replayed — no Bird in base, banishment empty, Centaur still 5, back to P1's open main phase", async () => {
    const { game, bird } = await turn4();
    await game.p1.tapRunes(2);
    await game.p1.recycleRune(undefined, "mind");
    await game.p1.cast("myBreach", { targets: bird });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("myBreach")).toBe("trash");
    expect(game.has(bird)).toBe(false);
    expect(game.zoneOf(bird)).toBe("gone");
    expect(game.p1.banishment()).toEqual([]);
    expect(birdsOf(game)).toEqual([]);
    expect(game.state("centaur").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — P2 flips it at FRISKY HUNTER (a card, no Deflect)", () => {
  test("choosing the Hunter costs nothing extra (P2 keeps its 1 fury); on resolution the Hunter is banished and immediately replayed by its OWNER P1 to the same battlefield: at bf1, exhausted, owner = controller = P1, banishment empty", async () => {
    const { game } = await breachResolvedOn("hunter");
    expect(game.p2.resources().power.fury).toBe(1);
    expect(game.state("hunter")).toMatchObject({ controller: P1, isExhausted: true, might: 3, owner: P1, zone: "battlefield-bf1" });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("because P1 PLAYED it again, 'When you play me' triggers again — a P1-controlled Frisky Hunter item is on the chain; the original Bird is still at bf1, untouched", async () => {
    const { game, bird } = await breachResolvedOn("hunter");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hunter", controller: P1, triggered: true })]);
    expect(game.has(bird)).toBe(true);
    expect(game.state(bird)).toMatchObject({ controller: P1, might: 1, zone: "battlefield-bf1" });
    expect(birdsOf(game, "bf1")).toEqual([bird]); // the new one does not exist before the trigger resolves
  });

  test("the trigger resolves: a NEW Bird token 'here' = at bf1 → P1 now has TWO Birds at bf1 (both 1-Might [Deflect] tokens, owner/controller P1), plus Hunter and Centaur", async () => {
    const { game, bird } = await breachResolvedOn("hunter");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const birds = birdsOf(game, "bf1");
    expect(birds).toHaveLength(2);
    expect(birds).toContain(bird);
    const newBird = birds.find((b) => b !== bird) as string;
    expect(game.state(newBird)).toMatchObject({ controller: P1, isToken: true, keywords: ["Deflect"], might: 1, owner: P1, zone: "battlefield-bf1" });
    expect(birdsOf(game, "base")).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual([bird, "centaur", "hunter", newBird].sort());
  });

  test("net effect = a gift: the combat still goes P1's way (Sentry dies, P1 conquers and scores) and — with the Sentry's 1 damage steered onto the Hunter — P1 ends with four units on bf1 including both Birds; Centaur never triggered (only an ENEMY unit died)", async () => {
    const { game } = await breachResolvedOn("hunter");
    // Drive the showdown by hand so P2's single point of combat damage lands on the Hunter, not on a 1-Might Bird.
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "distribute") {
        const onHunter = d.buckets.find((b) => (b.card ?? b.key) === "hunter");
        const alloc = d.seat === P2 && onHunter ? { [onHunter.key]: d.total } : (d.defaultAllocation ?? {});
        await game.seat(d.seat).distribute(alloc);
        continue;
      }
      if (d.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game, "bf1")).toHaveLength(2);
    expect(game.p1.units("bf1")).toHaveLength(4);
    expect(game.state("centaur").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
