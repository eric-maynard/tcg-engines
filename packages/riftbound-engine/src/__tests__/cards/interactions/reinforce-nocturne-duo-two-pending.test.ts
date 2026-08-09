/**
 * Interaction: Reinforce (ogn-062-298) · Spell · Calm · 5
 *     "Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then
 *      play it, reducing its cost by [5]. Recycle the remaining cards."
 *   × Nocturne, Horrifying (ogn-194-298) · Champion Unit · Chaos · 4 + [chaos] · 4 Might
 *     "[Ganking] As you look at or reveal me from the top of your deck, you may banish me.
 *      If you do, you may play me for [rainbow]."
 *   × Dangerous Duo (ogn-016-298) · Unit · Fury · 3 · 3 Might
 *     "[Legion] — When you play me, give a unit +2 [Might] this turn."
 *
 * Q: P1's first card this turn is Reinforce. Top card is Nocturne; Dangerous Duo is also among
 *    the five. (a) Can P1 take Nocturne's OWN banish-and-play during the look AND still banish /
 *    play Duo with Reinforce — two units off one spell? (b) Order / cost / location / exhausted /
 *    P2 windows of the two pending plays. (c) Is Duo's Legion on, and may its trigger target the
 *    Nocturne from the same spell? (d) Alternative: skip Nocturne's ability and take Nocturne as
 *    Reinforce's unit — cost? (e) Contrast both from hand.
 *
 * Rules: 370.1 / Nocturne ruling ("as you look" = self-replacement applied while the look is
 * processed); 354.1–354.3 (the elected play becomes a Pending item and the resolving spell keeps
 * resolving); 337.1/.1.a/.1.b/.2/.4 (pending items finalize oldest-first, no priority passes,
 * permanents resolve immediately, priority only once nothing is left to finalize); 355.2.a
 * (base or a controlled battlefield); 356.1.a ("for [rainbow]" replaces the base cost); 356.4
 * (−[5] discount, not below 0; an Energy discount cannot eat a Power pip); 359.2.c / 143.4
 * (enters exhausted); 812.1.c / 419.4.b (Legion reads Finalized cards — Reinforce and Nocturne
 * both count by the time Duo finalizes); 355.5.b / 191.3.d (Duo's play trigger picks its target
 * when the trigger finalizes, once, under P1).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const NOCTURNE = "ogn-194-298";
const DUO = "ogn-016-298";
const SKULKER = "ogn-175-298"; // vanilla 2-cost / 3-might filler whose identity we track

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: 5 energy (exactly Reinforce), 1 rainbow (Nocturne's alternative cost), 1 chaos (only
 * needed for alternative (d)). bf1 is P1's, bf2 is P2's. Deck top→: Nocturne, Skulker, Duo,
 * Skulker, Skulker | sixth (not looked at).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2 }, "theirGrunt")
    .deck(P1, [NOCTURNE, SKULKER, DUO, SKULKER, SKULKER, SKULKER], ["noc", "s1", "duo", "s2", "s3", "sixth"])
    .hand(P1, REINFORCE, "rf");
}

function isNocturneDestination(d: Decision | null): d is PickDecision {
  return d?.kind === "pick" && d.semantics === "destination" && d.source?.cardId === "noc";
}

function isReinforcePick(d: Decision | null): d is PickDecision {
  return d?.kind === "pick" && d.semantics === "from-revealed";
}

/** Cast Reinforce, accept BOTH of Nocturne's "you may"s (banish me → play me for [rainbow]). */
async function castAndTakeNocturne(game: Game): Promise<void> {
  await game.p1.cast("rf");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes(); // banish me
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes(); // …play me for [rainbow]
}

interface TwoPendingRun {
  /** Cards Reinforce offered as "a unit from among them" after Nocturne left (undefined = never asked). */
  reinforceOffer?: string[];
  /** Cards Duo's play trigger offered as "+2 Might" targets (undefined = never asked). */
  duoTargetOffer?: string[];
  /** Order in which the engine asked P1 things, by tag. */
  prompts: string[];
  /** Did P2 ever hold an action decision before Duo's trigger target was asked? */
  p2WindowBeforeDuoTrigger: boolean;
}

/**
 * Drive flow (a): after both Nocturne "yes"es, answer every P1 prompt the rules predict —
 * Nocturne → base, Reinforce pick → Duo, Duo → base, Duo trigger → Nocturne — passing priority
 * otherwise, until P1's open main phase. Tolerant of the engine asking Nocturne's destination
 * before or after Reinforce's own pick.
 */
async function driveTwoPending(game: Game, reinforceChoice: "duo" | "decline" = "duo"): Promise<TwoPendingRun> {
  const run: TwoPendingRun = { p2WindowBeforeDuoTrigger: false, prompts: [] };
  await castAndTakeNocturne(game);
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "main") {
        break;
      }
      if (d.seat === P2 && run.duoTargetOffer === undefined) {
        run.p2WindowBeforeDuoTrigger = true;
      }
      await game.seat(d.seat).pass();
      continue;
    }
    if (isNocturneDestination(d)) {
      run.prompts.push("noc-destination");
      await game.p1.pick("base");
      continue;
    }
    if (isReinforcePick(d)) {
      run.prompts.push("reinforce-pick");
      run.reinforceOffer = d.options.map((o) => o.card ?? o.key).sort();
      await (reinforceChoice === "duo" ? game.p1.pick("duo") : game.p1.decline());
      continue;
    }
    if (d.kind === "pick" && d.semantics === "destination" && d.source?.cardId === "duo") {
      run.prompts.push("duo-destination");
      await game.p1.pick("base");
      continue;
    }
    if (d.kind === "pick" && d.semantics === "target" && d.source?.cardId === "duo") {
      run.prompts.push("duo-target");
      run.duoTargetOffer = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick("noc");
      continue;
    }
    throw new Error(`unexpected prompt: ${d.kind} "${d.prompt}" for ${d.seat}`);
  }
  await game.settle();
  return run;
}

describe("Reinforce × Nocturne, Horrifying × Dangerous Duo — two pending plays off one spell", () => {
  test("(a) the look hits Nocturne's 'as you look at me' replacement first: banish me → play me; Nocturne goes deck → banishment → chain as a pending permanent while Reinforce is still unresolved (370.1, 354.1–354.3)", async () => {
    const game = await board().build();
    await game.p1.cast("rf");
    expect(game.p1.energy()).toBe(0); // 5 paid for Reinforce
    await game.settle(); // both pass → Reinforce starts resolving
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    expect(game.zoneOf("noc")).toBe("mainDeck");
    await game.p1.yes();
    expect(game.zoneOf("noc")).toBe("banishment");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    await game.p1.yes();
    // Nocturne is now a Pending permanent on the chain; Reinforce has not finished (not in trash yet).
    expect(game.chain().map((c) => ({ cardId: c.cardId, type: c.type }))).toContainEqual({ cardId: "noc", type: "permanent" });
    expect(game.zoneOf("rf")).not.toBe("trash");
    expect(game.actingSeat()).toBe(P1);
  });

  test("(b) Nocturne finalizes for [rainbow] only — base cost 4+[chaos] replaced (356.1.a): energy stays 0, chaos untouched; location = base or P1's bf1, never P2's bf2 (355.2.a); enters exhausted (143.4); Reinforce ends in trash", async () => {
    const game = await board().build();
    await castAndTakeNocturne(game);
    // Walk to Nocturne's location choice (the engine may or may not interpose Reinforce's own pick first).
    for (let i = 0; i < 6 && !isNocturneDestination(game.decision()); i++) {
      const d = game.decision();
      if (isReinforcePick(d)) {
        await game.p1.decline();
      } else {
        await game.settle();
      }
    }
    const dest = game.decision();
    expect(isNocturneDestination(dest)).toBe(true);
    const zones = (dest as PickDecision).options.map((o) => o.zone ?? o.key).sort();
    expect(zones).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    if (isReinforcePick(game.decision())) {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.state("noc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1, rainbow: 0 } });
    expect(game.zoneOf("rf")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  // Expected (354.3): after Nocturne removes itself and becomes Pending, Reinforce KEEPS resolving —
  // "banish a unit from among them" now ranges over the four cards still being looked at (Skulker,
  // Duo, Skulker, Skulker; Nocturne is no longer among them). Actual: once Nocturne's replacement
  // fires the engine abandons Reinforce's instruction entirely — no pick is ever offered.
  test("(a) Reinforce must still offer 'a unit from among' the remaining four after Nocturne took itself out — Duo + three Skulkers, not Nocturne (354.3)", async () => {
    const game = await board().build();
    const run = await driveTwoPending(game, "decline");
    expect(run.reinforceOffer).toEqual(["duo", "s1", "s2", "s3"]);
  });

  // Expected: "Recycle the remaining cards" still happens — the four unpicked cards go to the bottom
  // and the untouched sixth card becomes the top. Actual: the look is abandoned, so Skulker/Duo/…
  // are left sitting on top of the deck in their original order.
  test("(a) the rest of Reinforce still resolves after Nocturne's self-play — the other four looked-at cards are recycled to the bottom, 'sixth' becomes the top card", async () => {
    const game = await board().build();
    await driveTwoPending(game, "decline");
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["duo", "s1", "s2", "s3"]);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.zoneOf("rf")).toBe("trash");
  });

  // Expected (337.1.b, 337.2, 356.4, 812.1.c, 355.5.b, 337.1.a/337.4): Nocturne (pending #1) finalizes
  // first for [rainbow] and resolves at once; then Duo (pending #2) finalizes at 3−5 → 0, enters base
  // exhausted; Reinforce + Nocturne are both Finalized before Duo → Legion active → its play trigger is
  // asked AFTER Duo is on the board and offers Nocturne (and Duo); picking Nocturne makes it 6 this
  // turn. P2 never holds priority until that trigger is on the chain. Actual: Duo is never offered.
  test("(b)(c) two bodies off one spell — Nocturne then Duo (cost 0, exhausted, Legion on); Duo's trigger may target the Nocturne from the same spell (+2 → 6); P2 gets no window in between", async () => {
    const game = await board().build();
    const run = await driveTwoPending(game, "duo");
    // order: Nocturne's play is completed before Duo's; Duo's target is asked last
    expect(run.prompts).toContain("reinforce-pick");
    expect(run.prompts).toContain("duo-destination");
    expect(run.prompts.indexOf("noc-destination")).toBeLessThan(run.prompts.indexOf("duo-destination"));
    expect(run.prompts.at(-1)).toBe("duo-target");
    expect(run.duoTargetOffer).toEqual(["duo", "noc", "theirGrunt"]); // "a unit" — Nocturne is on the board by now
    expect(run.p2WindowBeforeDuoTrigger).toBe(false);
    // final state
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.state("noc").isExhausted).toBe(true);
    expect(game.state("duo").isExhausted).toBe(true);
    expect(game.state("noc").might).toBe(6); // 4 + Duo's +2 this turn
    expect(game.state("duo").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1, rainbow: 0 } }); // rainbow for Nocturne, 0 for Duo
    expect(game.zoneOf("rf")).toBe("trash");
    expect(game.p1.deck()[0]).toBe("sixth");
    expect(game.p1.deck().slice(-3).sort()).toEqual(["s1", "s2", "s3"]);
    expect(game.chain()).toEqual([]);
  });

  test("(d) alternative: decline Nocturne's own ability and take Nocturne as Reinforce's unit — (4+[chaos]) − [5] → 0 energy + [chaos]: the chaos pip is still paid, rainbow untouched; only one unit is played", async () => {
    const game = await board().build();
    await game.p1.cast("rf");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", source: { cardId: "noc" } });
    await game.p1.no(); // keep Nocturne among the looked-at cards
    await game.settle();
    const d = game.decision();
    expect(isReinforcePick(d)).toBe(true);
    expect((d as PickDecision).options.map((o) => o.card).sort()).toEqual(["duo", "noc", "s1", "s2", "s3"]);
    expect((d as PickDecision).allowDecline).toBe(true);
    await game.p1.pick("noc");
    expect(game.zoneOf("rf")).toBe("trash"); // Reinforce is done the moment its pick is made
    await game.settle();
    expect(isNocturneDestination(game.decision())).toBe(true);
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.state("noc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
    expect(game.p1.units()).toEqual(["noc"]);
    expect(game.zoneOf("duo")).toBe("mainDeck");
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["duo", "s1", "s2", "s3"]);
  });

  test("(d′) Reinforce → Duo alone: cost 3−5 → 0, enters base exhausted; Legion is already active because Reinforce itself was Finalized earlier this turn (812.1.c, 419.4.b) → trigger asks for 'a unit' (Duo or the enemy grunt) once Duo is on the board", async () => {
    const game = await board().build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.no();
    await game.settle();
    await game.p1.pick("duo");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "destination", source: { cardId: "duo" } });
    await game.p1.pick("base");
    // Duo is on the board BEFORE its trigger is finalized (355.5.b); the trigger is P1's chain item.
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.chain()).toMatchObject([{ cardId: "duo", controller: P1, triggered: true, type: "ability" }]);
    const t = game.decision();
    expect(t).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "duo" } });
    expect((t as PickDecision).options.map((o) => o.card).sort()).toEqual(["duo", "theirGrunt"]); // "a unit": any unit, Nocturne is not on the board
    await game.p1.pick("duo");
    await game.settle();
    expect(game.state("duo").isExhausted).toBe(true);
    expect(game.state("duo").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1, rainbow: 1 } }); // nothing beyond Reinforce's 5
    expect(game.zoneOf("noc")).toBe("mainDeck"); // recycled with the rest
    expect(game.p1.deck().slice(-4).sort()).toEqual(["noc", "s1", "s2", "s3"]);
  });

  test("(e) contrast from hand: Nocturne costs the full 4 energy + [chaos]; Duo costs 3 and, as P1's FIRST card, its Legion trigger does not fire", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, NOCTURNE, "noc")
      .hand(P1, DUO, "duo")
      .build();
    await game.p1.play("duo", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(7);
    expect(game.chain()).toEqual([]); // no Legion trigger: nothing else was played before Duo
    expect(game.state("duo").might).toBe(3);
    await game.p1.play("noc", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    expect(game.state("noc").might).toBe(4); // Duo's trigger did not retroactively fire
  });

  test("(e) contrast from hand: Nocturne first (a genuinely earlier card), then Duo → Legion active; the trigger's target is chosen at its finalization and offers Nocturne and Duo (355.5.b); each is its own play", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, NOCTURNE, "noc")
      .hand(P1, DUO, "duo")
      .build();
    await game.p1.play("noc", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 0 } });
    // Between the two plays P1 is back in an open main phase — a separate Standard-timing action.
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    await game.p1.play("duo", { to: "base" });
    expect(game.p1.energy()).toBe(3);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "duo" } });
    expect((d as PickDecision).options.map((o) => o.card).sort()).toEqual(["duo", "noc"]);
    expect(game.zoneOf("duo")).toBe("base"); // Duo already entered; the trigger is what is being finalized
    await game.p1.pick("noc");
    // Now — and only now — the opponent gets priority, with Duo's trigger on the chain (337.4).
    expect(game.chain()).toMatchObject([{ cardId: "duo", triggered: true, targets: ["noc"] }]);
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("noc").might).toBe(6);
    expect(game.state("duo").might).toBe(3);
  });
});
