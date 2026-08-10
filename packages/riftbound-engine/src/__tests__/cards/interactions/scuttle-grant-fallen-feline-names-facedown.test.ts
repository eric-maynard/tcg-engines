/**
 * Interaction: a private LOOK grant × naming a card × a facedown [Hidden] spell.
 *   × Scuttle Crab (unl-053-219) · Unit · Calm · 2 · 0 Might
 *     "When you play me, draw 1. [Deathknell][>] Choose an opponent. They reveal their hand. You can look at their
 *      facedown cards this turn. Gain 1 XP."                                                            — P1's
 *   × Fallen Feline (ven-132-166) · Unit · Order · 2+[order] · 3 Might
 *     "When you play me, name a spell. While I'm at a battlefield, opponents can't play spells with that name." — P1's
 *   × Consult the Past (ogn-083-298) · Spell · Mind · 4 · "[Hidden] [Reaction] Draw 2."   — P2's, FACEDOWN at bf2
 *   (props: Discipline ogn-058-298 — a differently-named [Reaction] in P2's hand; Gust ogn-169-298 — P1's 1-cost
 *    [Reaction], only to open a priority window; Falling Star ogn-029-298 — P2's way to kill Feline next turn.)
 *
 * Rules: 424.1 / 424.1.a.3 (a Reveal is public and ends with the revealing effect), 424.2.b (looking / being shown is
 * not revealing), 128.2.a / 128.4 (a facedown card is Private — only its controller may look — unless an effect lets
 * someone else look; privacy is a property of state, not of memory), 107.3.f (the facedown zone is public, its card
 * private), 811.1.b / 811.1.c.3 (playing a Hidden card from facedown for [0] as a Reaction IS playing that spell),
 * 421.4 (a facedown card that changes zones is revealed to all), 108.1.b (a card's name is a public characteristic
 * once the card/choice is public), 054.1 (can't beats can).
 *
 * Q: P1's turn (turn 3). P2 holds bf2 with Defender D and hid Consult the Past there on an earlier turn. P1's Scuttle
 *    Crab attacks bf2 alone, dies, Deathknell resolves on P2. Then P1 plays Fallen Feline to bf1 and names
 *    "Consult the Past".
 *   (a) After the Deathknell: does P1's view name P2's facedown card while P2's is unchanged and a third seat still
 *       sees a placeholder; nothing on the public reveal record for it?
 *   (b) Feline's NAME prompt: is the vocabulary the full spell registry, byte-identical to a control game with no
 *       grant; is the chosen name public on Feline in both views?
 *   (c) While Feline is at bf1: is the facedown flip absent from P2's legal actions (derivable from P2's own view),
 *       other Reactions still legal?
 *   (d) Next turn: grant expired → P1's view redacted again; once Feline is gone P2 flips it normally (public via the
 *       chain, draws 2).
 *
 * Expected: (a) yes — turn-scoped private grant for P1 only; P2 unchanged; P3 placeholder; publicReveals names P2's
 * HAND cards (the one-shot reveal) but never the facedown card. (b) kind "name", cardType spell, the whole registry
 * (contains names P2 owns nowhere), identical list with/without the grant; P2 sees only a summary of the prompt;
 * afterwards Feline carries namedCard "Consult the Past" in both views. Nuance: while Feline's play trigger is still
 * on the chain nothing is named yet, so in THAT window P2 could still flip it. (c) in a later window (P1's Gust on
 * the chain) P2's legal actions = pass / concede / Discipline — no facedown flip; a forced flip is refused with no
 * side effects; control with Feline in P1's base: the flip is offered. (d) on P2's turn P1's view of facedown-bf2 is
 * the placeholder again and the grant is gone; P2 still can't flip while Feline stands at bf1; after Falling Star
 * kills Feline the flip is legal, costs 0, puts Consult the Past on the chain (named in P1's view) and draws P2 two.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Decision, Game } from "../../../harness";
import { P1, P2, P3, isHiddenView, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";
const FALLEN_FELINE = "ven-132-166";
const CONSULT_THE_PAST = "ogn-083-298";
const DISCIPLINE = "ogn-058-298";
const GUST = "ogn-169-298";
const FALLING_STAR = "ogn-029-298";
const FILLER = "ogn-175-298";

type NamePrompt = Extract<Decision, { kind: "name" }>;

const ids = (views: readonly CardView[] | undefined): string[] => (views ?? []).map((v) => (isHiddenView(v) ? "HIDDEN" : v.id));
const facedownBf2SeenBy = (game: Game, seat: string): string[] => ids(game.seat(seat).view().zones["facedown-bf2"]);
const p2HandSeenBy = (game: Game, seat: string): string[] => ids((game.seat(seat).view().zones.hand ?? []).filter((c) => c.owner === P2));
const publicRevealIds = (game: Game): string[] => (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);

/** Feline's `namedCard` as a given seat's view of bf `at` reports it (undefined if that seat can't see it). */
function felineNameSeenBy(game: Game, seat: string, at: "bf1" | "base"): unknown {
  const v = game.seat(seat).view();
  const pool = at === "base" ? (v.zones.base ?? []) : (v.battlefields.find((b) => b.id === at)?.units ?? []);
  const f = pool.find((c) => !isHiddenView(c) && c.id === "feline");
  return f && !isHiddenView(f) ? f.meta.namedCard : undefined;
}

/**
 * Turn 3, P1 active, victory far away. bf1: P1's Holder (2). bf2: P2's Defender D (3) + P2's FACEDOWN Consult the
 * Past (hidden on an earlier turn). P1: Scuttle Crab (0) in base unless `scuttle:false`, Fallen Feline + Gust in hand,
 * 5 energy + [order] (Feline 2+[order], Gust 1). P2: Discipline + Falling Star + a filler in hand, 2 energy + [calm]
 * (exactly Discipline). `players: 3` adds an idle P3 (holding bf3) purely as a privacy observer.
 */
function board(opts: { players?: 2 | 3; scuttle?: boolean } = {}) {
  const b = scenario({ players: opts.players ?? 2 })
    .turn(3)
    .active(P1)
    .victoryScore(15)
    .resources(P1, { energy: 5, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp")
    .hand(P1, FALLEN_FELINE, "feline")
    .hand(P1, GUST, "gust")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, FALLING_STAR, "star")
    .hand(P2, FILLER, "p2a")
    .deck(P2, [FILLER, FILLER, FILLER], ["n1", "n2", "n3"]);
  if (opts.scuttle !== false) {
    b.unit(P1, "base", SCUTTLE_CRAB, "crab");
  }
  if (opts.players === 3) {
    b.battlefield("bf3", { controller: P3 }).unit(P3, "bf3", { might: 1, name: "P3 Holder" }, "h3");
  }
  return b;
}

/** Step 1: the Crab attacks bf2 alone, dies to D; its Deathknell resolves naming P2 (forced — the only opponent in 2p). */
async function crabDied(opts: { players?: 2 | 3 } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("crab", "bf2");
  let settled = await game.settle();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick(P2); // "Choose an opponent" (3p)
    settled = await game.settle();
  }
  expect(settled.reason).toBe("open");
  expect(game.zoneOf("crab")).toBe("trash");
  expect(game.p1.xp()).toBe(1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Play Feline to `to`; let its play trigger resolve; stop AT the name prompt (unanswered). */
async function felineAtNamePrompt(game: Game, to: "bf1" | "base"): Promise<NamePrompt> {
  await game.p1.play("feline", { to });
  expect(game.locationOf("feline")).toBe(to);
  const settled = await game.settle();
  expect(settled.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "name", seat: P1 });
  return d as NamePrompt;
}

/** Steps 1+2: Crab died (grant live), Feline at `to` naming "Consult the Past"; back in P1's open main phase. */
async function felineNamed(to: "bf1" | "base" = "bf1", opts: { scuttle?: boolean } = {}): Promise<Game> {
  const game = opts.scuttle === false ? await board({ scuttle: false }).build() : await crabDied();
  await felineAtNamePrompt(game, to);
  await game.p1.name("Consult the Past");
  const settled = await game.settle();
  expect(settled.reason).toBe("open");
  expect(game.state("feline").meta.namedCard).toBe("Consult the Past");
  return game;
}

/** A later Closed-state window on P1's turn: P1 casts Gust (on its own Holder) and passes → P2 holds priority. */
async function p2WindowOnP1Turn(game: Game): Promise<void> {
  await game.p1.cast("gust", { targets: "h1" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
}

describe("Scuttle Crab's facedown LOOK × Fallen Feline naming that very spell × P2's facedown Consult the Past", () => {
  // ── premise ──────────────────────────────────────────────────────────────────────────────────────

  test("premise: before anything P1 (and a third seat) see one anonymous facedown slot at bf2; only P2 sees Consult the Past there (128.4, 107.3.f)", async () => {
    const game = await board({ players: 3 }).build();
    expect(facedownBf2SeenBy(game, P1)).toEqual(["HIDDEN"]);
    expect(facedownBf2SeenBy(game, P3)).toEqual(["HIDDEN"]);
    expect(facedownBf2SeenBy(game, P2)).toEqual(["ctp"]);
    expect(game.p2.view().battlefields.find((b) => b.id === "bf2")?.facedownCount).toBe(1); // the SLOT is public
    expect(publicRevealIds(game)).toEqual([]);
    expect(game.gameState.visibilityGrants ?? []).toEqual([]);
  });

  // ── (a) after the Deathknell ─────────────────────────────────────────────────────────────────────

  test("(a) after the Deathknell resolves P1's view names Consult the Past in P2's facedown slot — a turn-scoped LOOK grant for seat P1 — while the card is still facedown, P2's, unmoved", async () => {
    const game = await crabDied();
    expect(facedownBf2SeenBy(game, P1)).toEqual(["ctp"]);
    expect(game.gameState.visibilityGrants).toEqual([{ duration: "turn", owner: P2, viewer: P1, zones: ["facedown"] }]);
    expect(game.zoneOf("ctp")).toBe("facedown-bf2");
    expect(game.state("ctp")).toMatchObject({ controller: P2, isHidden: true, owner: P2 });
    expect(game.chain()).toEqual([]);
  });

  test("(a) P2's own view is unchanged, and a THIRD seat still gets the redacted placeholder — the look is per-viewer, not a reveal (424.2.b)", async () => {
    const game = await crabDied({ players: 3 });
    expect(facedownBf2SeenBy(game, P1)).toEqual(["ctp"]);
    expect(facedownBf2SeenBy(game, P2)).toEqual(["ctp"]);
    expect(facedownBf2SeenBy(game, P3)).toEqual(["HIDDEN"]);
    expect(JSON.stringify(game.seat(P3).view().zones["facedown-bf2"])).not.toContain("Consult the Past");
  });

  test("(a) the public reveal record holds P2's HAND (the one-shot 'reveal their hand', 424.1) but never the facedown card; and with that window closed P1's live view of P2's hand is anonymous again (424.1.a.3)", async () => {
    const game = await crabDied();
    expect(publicRevealIds(game).sort()).toEqual(["disc", "p2a", "star"]);
    expect(publicRevealIds(game)).not.toContain("ctp");
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    expect(p2HandSeenBy(game, P1)).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"]);
    expect(p2HandSeenBy(game, P2).sort()).toEqual(["disc", "p2a", "star"]);
  });

  // ── (b) Feline's name prompt ─────────────────────────────────────────────────────────────────────

  test("(b) Feline (2+[order]) to bf1: its play trigger resolves into a NAME prompt for P1 — kind 'name', cardType spell, vocabulary = the spell registry (hundreds of names, incl. 'Consult the Past' AND spells P2 has nowhere, e.g. 'Abandon'); P2's view of it is a bare summary", async () => {
    const game = await crabDied();
    const d = await felineAtNamePrompt(game, "bf1");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 0 } });
    expect(d.cardType).toBe("spell");
    expect(d.vocabulary.length).toBeGreaterThan(100);
    expect(d.vocabulary).toContain("Consult the Past");
    expect(d.vocabulary).toContain("Abandon");
    expect(d.vocabulary).toContain("Discipline");
    expect(d.vocabulary).not.toContain("Fallen Feline"); // units are not nameable here
    expect(new Set(d.vocabulary).size).toBe(d.vocabulary.length);
    const p2d = game.p2.view().decision;
    expect(p2d).toMatchObject({ kind: "name", seat: P1 });
    expect((p2d as { vocabulary?: unknown }).vocabulary).toBeUndefined();
  });

  test("(b) no information leak through option filtering: the vocabulary is byte-identical in a CONTROL game with no Scuttle grant (P1 knows nothing of P2's zones) — same list, same order", async () => {
    const withGrant = await crabDied();
    const dGrant = await felineAtNamePrompt(withGrant, "bf1");
    const control = await board({ scuttle: false }).build();
    expect(control.gameState.visibilityGrants ?? []).toEqual([]);
    expect(facedownBf2SeenBy(control, P1)).toEqual(["HIDDEN"]);
    const dCtrl = await felineAtNamePrompt(control, "bf1");
    expect(dGrant.vocabulary).toEqual(dCtrl.vocabulary);
    expect(dGrant.cardType).toBe(dCtrl.cardType);
    // …and the uninformed P1 may name the facedown spell all the same — legality never needed the look.
    await control.p1.name("Consult the Past");
    expect(control.state("feline").meta.namedCard).toBe("Consult the Past");
  });

  test("(b) the chosen name is a PUBLIC characteristic of the resolved ability: Feline at bf1 carries namedCard 'Consult the Past' in P1's view AND in P2's view", async () => {
    const game = await felineNamed("bf1");
    expect(game.locationOf("feline")).toBe("bf1");
    expect(felineNameSeenBy(game, P1, "bf1")).toBe("Consult the Past");
    expect(felineNameSeenBy(game, P2, "bf1")).toBe("Consult the Past");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // the look grant is still live this turn, independently of Feline
    expect(facedownBf2SeenBy(game, P1)).toEqual(["ctp"]);
  });

  test("(b) nuance: while Feline's play trigger is still ON THE CHAIN nothing has been named yet — in that window P2 (holding priority) could still flip Consult the Past; the lock only exists once a name does", async () => {
    const game = await crabDied();
    await game.p1.play("feline", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "feline", controller: P1, triggered: true })]);
    expect(game.state("feline").meta.namedCard).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "ctp")).toBe(true);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  // ── (c) the lock while Feline is at a battlefield ────────────────────────────────────────────────

  test("(c) later window on P1's turn (P1's Gust on the chain, P2 has priority): 'play Consult the Past from facedown' is ABSENT from P2's legal actions — exactly pass / concede / Discipline remain (811.1.c.3: the flip is playing that spell; 054.1)", async () => {
    const game = await felineNamed("bf1");
    await p2WindowOnP1Turn(game);
    expect(game.p2.can("reveal", "ctp")).toBe(false);
    expect(game.p2.legal().filter((o) => o.card === "ctp")).toEqual([]);
    expect(
      game.p2
        .legal()
        .map((o) => o.key)
        .sort(),
    ).toEqual(["concede:-", "passChainPriority:-", "playSpell:disc"]);
    // a differently-named Reaction is untouched by the lock
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  test("(c) a forced flip is refused with NO side effects: still facedown at bf2, chain still [Gust], P2 still holds priority, nobody drew", async () => {
    const game = await felineNamed("bf1");
    await p2WindowOnP1Turn(game);
    const before = game.decision();
    const p2Hand = game.p2.hand().length;
    await expect(game.p2.reveal("ctp")).rejects.toThrow();
    const raw = await game.p2.try((p) => p.do("revealHidden", { cardId: "ctp" }));
    expect(raw.ok).toBe(false);
    expect(game.zoneOf("ctp")).toBe("facedown-bf2");
    expect(game.state("ctp").isHidden).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
    expect(game.decision()).toMatchObject({ context: "chain", id: before?.id, kind: "action", seat: P2 });
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("(c) P2 can derive the lock from P2's OWN view: Feline at bf1 with its named spell is public, and the facedown card's identity is P2's own private information", async () => {
    const game = await felineNamed("bf1");
    await p2WindowOnP1Turn(game);
    const v = game.p2.view();
    expect(felineNameSeenBy(game, P2, "bf1")).toBe("Consult the Past");
    expect(ids(v.zones["facedown-bf2"])).toEqual(["ctp"]);
    const own = (v.zones["facedown-bf2"] ?? [])[0];
    expect(own && !isHiddenView(own) ? own.name : undefined).toBe("Consult the Past");
    expect(v.decision).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // full decision, it is P2's
  });

  test("(c) control — Feline played to P1's BASE instead (not 'at a battlefield'): in the very same window the flip IS offered, costs [0], and puts Consult the Past on the chain above Gust", async () => {
    const game = await felineNamed("base");
    expect(game.locationOf("feline")).toBe("base");
    await p2WindowOnP1Turn(game);
    expect(game.p2.can("reveal", "ctp")).toBe(true);
    const pool = game.p2.resources();
    await game.p2.reveal("ctp");
    expect(game.p2.resources()).toEqual(pool); // 811.1.b — react for [0]
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["gust", P1],
      ["ctp", P2],
    ]);
  });

  test("(c) control — no Scuttle at all, Feline at bf1 naming it 'blind': the lock works identically (P1 never needed the identity — the look only made the choice informed)", async () => {
    const game = await felineNamed("bf1", { scuttle: false });
    expect(facedownBf2SeenBy(game, P1)).toEqual(["HIDDEN"]);
    await p2WindowOnP1Turn(game);
    expect(game.p2.can("reveal", "ctp")).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  // ── (d) next turn: grant expired; Feline gone → flip is back ─────────────────────────────────────

  test("(d) on P2's turn the 'this turn' grant has lapsed: P1's view of facedown-bf2 is the anonymous placeholder again although P1 'knows' the card (privacy is state, not memory — 128.2.a/128.4); the grant list is empty", async () => {
    const game = await felineNamed("bf1");
    expect(facedownBf2SeenBy(game, P1)).toEqual(["ctp"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("ctp")).toBe("facedown-bf2");
    expect(facedownBf2SeenBy(game, P1)).toEqual(["HIDDEN"]);
    expect(JSON.stringify(game.p1.view().zones["facedown-bf2"])).not.toContain("Consult the Past");
    expect(facedownBf2SeenBy(game, P2)).toEqual(["ctp"]);
    expect(game.gameState.visibilityGrants ?? []).toEqual([]);
    // Feline's lock, by contrast, is NOT turn-scoped: still at bf1 → still no flip for P2, even on P2's own turn.
    expect(game.locationOf("feline")).toBe("bf1");
    await game.p2.do("addResources", { energy: 2, power: { calm: 1 } });
    expect(game.p2.can("reveal", "ctp")).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  test("(d) once Feline LEAVES the battlefield (P2's Falling Star kills it) the restriction is off: P2 flips Consult the Past for [0] → it is on the chain under P2's control and named in P1's view (421.4) → resolves: P2 draws 2, card in P2's trash", async () => {
    const game = await felineNamed("bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2, power: { fury: 2 } }); // exactly Falling Star (2+[fury][fury])
    expect(game.p2.can("reveal", "ctp")).toBe(false);
    await game.p2.cast("star", { targets: ["feline", "feline"] });
    await game.settle();
    expect(game.zoneOf("feline")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "ctp")).toBe(true);
    const pool = game.p2.resources();
    const hand = game.p2.hand().length;
    await game.p2.reveal("ctp");
    expect(game.p2.resources()).toEqual(pool);
    expect(game.zoneOf("ctp")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctp", controller: P2, triggered: false, type: "spell" })]);
    expect(game.p1.view().chain.map((c) => [c.cardId, c.name])).toEqual([["ctp", "Consult the Past"]]);
    expect(ids(game.p1.view().zones.chain)).toContain("ctp"); // public to P1 now — by zone, no grant needed
    await game.settle();
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
    expect(game.p2.facedown("bf2")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
