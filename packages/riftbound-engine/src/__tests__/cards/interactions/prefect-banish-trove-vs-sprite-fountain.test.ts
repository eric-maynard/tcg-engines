/**
 * Interaction: Ravenbloom Prefect (ven-102-166) · Unit · Chaos · 3 · 3 Might
 *     "When an opponent plays a gear, you may banish me to banish it."
 *   × Treasure Trove (ogn-186-298) · Gear · Chaos · 2
 *     "When this leaves the board, draw 1 and channel 1 rune exhausted. [chaos], [Exhaust]: Kill this."
 *   × Sprite Fountain (unl-078-219) · Gear · Mind · 2+[mind]
 *     "[Temporary] When you play this, play a ready 3 [Might] Sprite unit token with [Temporary] to your base.
 *      [Deathknell][>] Repeat this gear's play effect."
 *   (+ Brittle Steel ven-003-166 · Spell · Fury · 2+[fury] · "Kill a gear." for the contrast.)
 *
 * Rules: 337.2 (a finalized gear resolves at once), 383.3.a / 383.3.b / 383.3.b.1 (a leading "you may … [cost] to"
 * is an opt-in + base cost, both settled at FINALIZATION), 383.3.d.1 (cross-player simultaneous triggers go on in
 * turn order), 337.4 (controller of the newest item gets priority first), 355.10.d ("it" is determined, not
 * targeted), 355.9.c (an ability is independent of its source), 359.3.e.13 (look-back), 359.3.e.15 (only the
 * ability itself leaving the chain stops it), 427.2 / 427.2.a (banish goes straight to banishment; banish is not
 * a kill), 808.1.d / 808.1.d.2 / 808.1.d.3 (Deathknell = killed AND sent to trash; leave-board triggers are
 * pended as the card leaves), 124 (can't beats can).
 *
 * Question — P1's turn; P2 controls Ravenbloom Prefect.
 *   Case 1: P1 plays Treasure Trove, P2 opts in. Trove is BANISHED, not killed — does P1 still draw 1 and channel
 *   a rune? When does P2 banish the Prefect, and does the Prefect's ability still resolve with its source gone?
 *   Case 2: P1 plays Sprite Fountain. Two triggers at once (P1's play effect, P2's Prefect): chain order, who has
 *   priority first, does the play effect still make a Sprite after the Fountain was banished from under it, and
 *   does the Fountain's Deathknell fire? Contrast: Fountain later KILLED by Brittle Steel.
 *
 * Expected:
 *   Case 1: Trove enters P1's base immediately (no play effect). Prefect triggers for P2; P2 decides the opt-in and
 *   banishes the Prefect during finalization — before anyone holds priority; P2 then holds priority first. On
 *   resolution Trove goes board → banishment (427.2). That IS leaving the board → Trove's trigger is queued for
 *   P1; when it resolves P1 draws 1 and channels 1 rune exhausted. Net: Prefect + Trove banished, P1 +1 card +1
 *   exhausted rune.
 *   Case 2: Fountain enters base; chain oldest→newest = [Fountain play effect (P1), Prefect (P2)] (383.3.d.1); no
 *   order prompt for either seat; P2 opts in + pays at finalization; P2 holds priority first (337.4). LIFO:
 *   Prefect resolves → Fountain banished (NOT a death → no Deathknell). Then the play effect still resolves →
 *   one ready 3-Might Temporary Sprite in P1's base. End: exactly one Sprite; Prefect and Fountain in banishment.
 *   Contrast: P2 declines, Fountain stays; Brittle Steel kills it → trash → Deathknell → a SECOND Sprite.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_PREFECT = "ven-102-166";
const TREASURE_TROVE = "ogn-186-298";
const SPRITE_FOUNTAIN = "unl-078-219";
const BRITTLE_STEEL = "ven-003-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn (turn 2, main). P1 holds Trove (2), Fountain (2+[mind]) and Brittle Steel (2+[fury]) with exactly
 * 6 energy + [mind] + [fury] floating. P2 has the Prefect and a vanilla bystander in base. One inert battlefield.
 */
function board(opts: { prefect?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "grunt")
    .hand(P1, TREASURE_TROVE, "trove")
    .hand(P1, SPRITE_FOUNTAIN, "fountain")
    .hand(P1, BRITTLE_STEEL, "brittle");
  return opts.prefect === false ? s : s.unit(P2, "base", RAVENBLOOM_PREFECT, "prefect");
}

const sprites = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Sprite");

interface Step {
  readonly kind: Decision["kind"] | "priority";
  readonly seat: string;
  readonly chain: readonly { cardId: string; controller: string; triggered: boolean }[];
  readonly prefectZone?: string;
  readonly troveZone: string;
  readonly fountainZone: string;
  readonly p1Hand: number;
  readonly p1Runes: number;
  readonly sprites: number;
}

function snap(game: Game, d: Decision): Step {
  return {
    chain: game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, triggered: c.triggered })),
    fountainZone: game.zoneOf("fountain"),
    kind: d.kind === "action" ? "priority" : d.kind,
    p1Hand: game.p1.hand().length,
    p1Runes: game.p1.runes().length,
    prefectZone: game.has("prefect") ? game.zoneOf("prefect") : undefined,
    seat: d.seat,
    sprites: sprites(game).length,
    troveZone: game.zoneOf("trove"),
  };
}

/**
 * From wherever we are: answer P2's Prefect opt-in per `p2Accepts`, accept any soft order offer, pass every
 * priority window — until P1's open main phase. Returns the ordered log of prompts / priority windows.
 */
async function playOut(game: Game, opts: { p2Accepts?: boolean } = {}): Promise<Step[]> {
  const log: Step[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    log.push(snap(game, d));
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no") {
      expect(d.seat).toBe(P2); // only the Prefect ever asks "you may" here
      await (opts.p2Accepts === false ? game.p2.no() : game.p2.yes());
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      throw new Error(`unexpected ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
  return log;
}

describe("Ravenbloom Prefect × Treasure Trove — banished gear still 'leaves the board'", () => {
  test("Trove is a permanent with no play effect: it finalizes and is in P1's base at once (337.2), 2 energy paid, and the very next thing is P2's Prefect opt-in — nobody has had priority", async () => {
    const game = await board().build();
    await game.p1.play("trove");
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, mind: 1 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("prefect");
    expect(game.zoneOf("prefect")).toBe("base"); // asked while still on the board
  });

  test("P2 opts in → 'banish me' is paid during FINALIZATION: at the first priority window the Prefect is already in banishment, the Trove is still in base, the chain holds exactly the Prefect's ability, and P2 (its controller) holds priority first (383.3.b.1, 337.4)", async () => {
    const game = await board().build();
    await game.p1.play("trove");
    const log = await playOut(game);
    const ask = log.findIndex((s) => s.kind === "yes-no");
    const firstPriority = log.findIndex((s) => s.kind === "priority");
    expect(ask).toBe(0);
    expect(firstPriority).toBeGreaterThan(ask);
    expect(log[firstPriority]).toMatchObject({
      chain: [{ cardId: "prefect", controller: P2, triggered: true }],
      prefectZone: "banishment",
      seat: P2,
      troveZone: "base",
    });
  });

  test("the Prefect's ability resolves although its source is already in banishment (355.9.c): Trove goes board → BANISHMENT, never the trash (427.2, 427.2.a)", async () => {
    const game = await board().build();
    await game.p1.play("trove");
    const log = await playOut(game);
    // The moment the Prefect item has left the chain, Trove is in banishment.
    const afterPrefect = log.find((s) => s.kind === "priority" && s.chain.every((c) => c.cardId !== "prefect"));
    expect(afterPrefect).toBeDefined();
    expect(afterPrefect!.troveZone).toBe("banishment");
    expect(game.zoneOf("trove")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("trove");
    expect(game.p1.banishment()).toContain("trove");
  });

  test("banishment IS leaving the board: Trove's 'when this leaves the board' is queued as a P1-controlled triggered chain item right after the Prefect item resolves — P1 (its controller) gets priority over it, then P2 — and nothing has been drawn/channelled yet", async () => {
    const game = await board().build();
    await game.p1.play("trove");
    const log = await playOut(game);
    const troveOnChain = log.filter((s) => s.kind === "priority" && s.chain.length === 1 && s.chain[0]!.cardId === "trove");
    expect(troveOnChain.length).toBeGreaterThanOrEqual(2);
    expect(troveOnChain[0]).toMatchObject({ chain: [{ cardId: "trove", controller: P1, triggered: true }], p1Hand: 2, p1Runes: 0, seat: P1, troveZone: "banishment" });
    expect(troveOnChain[1]!.seat).toBe(P2);
  });

  test("on resolution P1 draws 1 and channels 1 rune EXHAUSTED — P2 spent a 3-Might unit and P1 still got the Trove's payoff", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.play("trove");
    await playOut(game);
    expect(game.p1.hand()).toHaveLength(2 + 1); // fountain, brittle + 1 drawn
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    // net board
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.zoneOf("trove")).toBe("banishment");
    expect(game.p2.units()).toEqual(["grunt"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 DECLINES: the Prefect item is removed (383.3.a.2), nothing is paid or banished, no Trove trigger, no draw; Trove sits in P1's base and the Prefect in P2's", async () => {
    const game = await board().build();
    await game.p1.play("trove");
    const log = await playOut(game, { p2Accepts: false });
    expect(log.filter((s) => s.kind === "priority")).toEqual([]); // no chain ever needed priority
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("contrast — no Prefect at all: Trove simply enters base; P2 is never asked anything", async () => {
    const game = await board({ prefect: false }).build();
    await game.p1.play("trove");
    const log = await playOut(game);
    expect(log).toEqual([]);
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.p1.hand()).toHaveLength(2);
  });
});

describe("Ravenbloom Prefect × Sprite Fountain — two simultaneous triggers, banish is not a death", () => {
  test("Fountain enters P1's base at once for 2+[mind]; TWO triggers arise: chain oldest→newest = [Fountain play effect (P1), Prefect (P2)] — turn player's item first (383.3.d.1)", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, mind: 0 } });
    await game.acceptTriggerOrder(); // no-op unless a soft offer is pending
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["fountain", P1, true],
      ["prefect", P2, true],
    ]);
  });

  test("neither seat gets an ORDER decision (one item each); the only prompt before priority is P2's Prefect opt-in, decided and paid at finalization — Prefect banished before the first priority window", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    const log = await playOut(game);
    expect(log.some((s) => s.kind === "order")).toBe(false);
    const firstPriority = log.findIndex((s) => s.kind === "priority");
    expect(log.slice(0, firstPriority)).toEqual([expect.objectContaining({ kind: "yes-no", prefectZone: "base", seat: P2 })]);
    expect(log[firstPriority]).toMatchObject({ fountainZone: "base", prefectZone: "banishment", sprites: 0 });
  });

  test("P2 — controller of the newest item — holds priority first (337.4); after P2 passes, P1 gets it; nothing has resolved yet", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await game.p2.yes();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toHaveLength(2);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(sprites(game)).toEqual([]);
  });

  test("LIFO: the Prefect's ability resolves FIRST → the Fountain is banished from the board while its own play effect is still waiting on the chain; no Sprite exists yet", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    const log = await playOut(game);
    const playEffectOnTop = log.find((s) => s.kind === "priority" && s.chain.length === 1 && s.chain[0]!.cardId === "fountain");
    expect(playEffectOnTop).toBeDefined();
    expect(playEffectOnTop).toMatchObject({ fountainZone: "banishment", prefectZone: "banishment", sprites: 0 });
  });

  test("banish is NOT a kill (427.2.a; Deathknell needs killed-and-trashed, 808.1.d): no Deathknell item is ever added — after the Prefect item leaves, the chain only ever holds the one original play-effect item", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    const log = await playOut(game);
    const afterPrefect = log.filter((s) => s.kind === "priority" && s.chain.every((c) => c.cardId !== "prefect"));
    expect(afterPrefect.length).toBeGreaterThan(0);
    for (const s of afterPrefect) {
      expect(s.chain).toEqual([{ cardId: "fountain", controller: P1, triggered: true }]);
    }
    expect(game.p1.trash()).not.toContain("fountain");
  });

  test("the Fountain's play effect still resolves with its source in banishment (355.9.c / 359.3.e.15): P1 gets exactly ONE ready 3-Might Sprite token with Temporary in base; Fountain and Prefect both in banishment", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await playOut(game);
    const made = sprites(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(made[0]!).keywords).toContain("Temporary");
    expect(game.zoneOf("fountain")).toBe("banishment");
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.units()).toEqual(["grunt"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("no future Deathknell Sprite either: advancing through P2's turn into P1's next turn, the banished Fountain never produces a second token (the lone Temporary Sprite just dies)", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await playOut(game);
    const [tok] = sprites(game);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Temporary kills the Sprite before scoring)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok!)).toBe(false);
    expect(sprites(game)).toEqual([]);
    expect(game.zoneOf("fountain")).toBe("banishment");
  });

  test("contrast — P2 DECLINES: chain is just the play effect → one Sprite; the Fountain stays in base and the Prefect in P2's base", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    const log = await playOut(game, { p2Accepts: false });
    const first = log.find((s) => s.kind === "priority");
    expect(first?.chain).toEqual([{ cardId: "fountain", controller: P1, triggered: true }]);
    expect(first?.seat).toBe(P1);
    expect(game.zoneOf("fountain")).toBe("base");
    expect(game.zoneOf("prefect")).toBe("base");
    expect(sprites(game)).toHaveLength(1);
  });

  test("contrast — Fountain KILLED instead (P2 declined; P1 then casts Brittle Steel 'Kill a gear' on it): Fountain → TRASH → Deathknell is a new P1 triggered item → it repeats the play effect → a SECOND ready 3-Might Temporary Sprite", async () => {
    const game = await board().build();
    await game.p1.play("fountain");
    await playOut(game, { p2Accepts: false });
    expect(sprites(game)).toHaveLength(1);
    const [first] = sprites(game);
    await game.p1.cast("brittle", { targets: "fountain" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0, mind: 0 } });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([["brittle", false]]);
    // both pass → Brittle Steel resolves → Fountain dies → Deathknell pended + finalized for P1
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fountain", controller: P1, triggered: true })]);
    expect(sprites(game)).toHaveLength(1); // the repeat is a chain item, not instantaneous
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await playOut(game);
    const now = sprites(game);
    expect(now).toHaveLength(2);
    const second = now.find((s) => s !== first)!;
    expect(game.state(second)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3 });
    expect(game.state(second).keywords).toContain("Temporary");
    expect(game.zoneOf("brittle")).toBe("trash");
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
