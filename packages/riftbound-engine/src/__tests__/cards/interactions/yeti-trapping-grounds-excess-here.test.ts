/**
 * Interaction: two "if you assigned 3 or more excess damage" conquer triggers that differ ONLY in
 * whether they are scoped to "here".
 *
 *   Trapping Grounds (unl-217-219) — Battlefield. "When you conquer HERE, if you assigned 3 or more
 *                      excess damage, play a 1 [Might] Bird unit token with [Deflect]."
 *   Yeti Brawler     (unl-018-219) — Unit, Fury, [6], 6 Might. "When I conquer, if you assigned 3 or
 *                      more excess damage, play two Gold gear tokens exhausted."
 *   Cleave           (ogn-004-298) — Spell, Fury, [1], [Action]. "Give a unit [Assault 3] this turn."
 *
 * Q: attacking a single defender AT Trapping Grounds with >= 3 excess — do BOTH triggers fire, and is
 * the resulting pair of simultaneous same-controller triggers presented in an answerable order offer?
 * Attacking the OPPONENT'S OTHER battlefield with the same >= 3 excess — does only the Yeti's fire,
 * because Trapping Grounds' clause is scoped to "here"? And with a second live defender, does
 * 465.2.c.4 cap the assignment so excess is 0 and NEITHER fires?
 *
 * Rules: 113 (battlefields are presented in the pregame), 465.2.c.1.a (combat damage is dealt
 * simultaneously), 465.2.c.3 / 465.2.c.4 (one allocation for the side; no unit is assigned more than
 * lethal while other units are unassigned — that cap is what eats the excess), 466.3.a / 466.5 /
 * 466.5.d / 469.1 (control is established and the battlefield is conquered), 470 (one conquer point
 * per battlefield per turn), 486.5 / 486.6 (a decided game's battlefields leave the match; the game
 * state resets), 809.1.d ([Deflect]'s mandatory surcharge in the chooser's pay line), 355.8 /
 * 358.3.a (every offered option is legal and no prompt is a dead end), 383.3.d (the same-controller
 * trigger-order offer is soft — see DESIGN "Known deviations").
 */
import { describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import type { RiftboundMoves } from "../../../game-definition/moves";
import type { Decision, DistributeDecision, Game, HarnessEngine, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { buildPregamePayload, createGameFromDecks, selectBattlefield } from "../../../../../../apps/riftbound-app/server/pregame";
import { getInternalSnapshot } from "../../../../../../apps/riftbound-app/server/state";

const YETI = "unl-018-219";
const TRAPPING_GROUNDS = "unl-217-219";
const CLEAVE = "ogn-004-298";

/** The app's battlefield-id shape (`${playerId}-bf-${defId}`), so 486.5's derivation sees the defId. */
const TG_ID = `${P1}-bf-${TRAPPING_GROUNDS}`;
const P2_BF = `${P2}-bf-ogn-294-298`;

const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

const tokensNamed = (game: Game, name: string) =>
  [...game.p1.base(), ...game.p1.units("base"), ...game.battlefields().flatMap((bf) => game.cardsAt(`battlefield-${bf}`))]
    .filter((id, i, all) => all.indexOf(id) === i)
    .filter((id) => game.state(id).name === name && game.state(id).controller === P1);

/**
 * P1 presented Trapping Grounds; P2 currently holds it (`bf1`) and its own plain battlefield
 * (`bf2`). P1's Yeti Brawler waits in base with Cleave in hand ([Assault 3] → 9 Might attacking).
 */
function board(opts: { tgDefenders: (number | "stunned6" | "stunned3" | "stunned2")[]; bf2Defender?: number }) {
  const s = scenario()
    .battlefield(TG_ID, { controller: P2, def: TRAPPING_GROUNDS, inert: false, owner: P1 })
    .battlefield(P2_BF, { controller: P2, owner: P2 })
    .unit(P1, "base", YETI, "yeti")
    .resources(P1, { energy: 1 })
    .hand(P1, CLEAVE, "cleave");
  opts.tgDefenders.forEach((d, i) => {
    const might = d === "stunned6" ? 6 : d === "stunned3" ? 3 : d === "stunned2" ? 2 : d;
    const meta = typeof d === "string" ? { stunned: true } : undefined;
    s.unit(P2, TG_ID, { might, name: `Def${i + 1}` }, `d${i + 1}`, meta);
  });
  if (opts.bf2Defender !== undefined) {
    s.unit(P2, P2_BF, { might: opts.bf2Defender, name: "Outpost" }, "outpost");
  }
  return s;
}

function mv(engine: HarnessEngine, move: string, pid: string, params: Record<string, unknown> = {}) {
  return engine.executeMove(move as keyof RiftboundMoves & string, {
    params: { playerId: pid, ...params } as never,
    playerId: pid as CorePlayerId,
  });
}

/** A never-answering script entry: records every decision put to the seat without changing play. */
function tracer(seen: string[]): ((d: Decision) => undefined)[] {
  return Array.from({ length: 24 }, () => (d: Decision) => {
    seen.push(`${d.kind}|${d.prompt}`);
    return undefined;
  });
}

describe("Trapping Grounds 'conquer HERE' × Yeti Brawler 'when I conquer' × excess damage", () => {
  // -------------------------------------------------------------------------
  // 1 — pregame (113 / 486.5): Trapping Grounds is one of the three cards P1 presents
  // -------------------------------------------------------------------------
  test("113 — Trapping Grounds is one of the three battlefields in P1's picker, and lock-in is final", () => {
    const deck = { ...buildDefaultDeck(), battlefieldIds: [TRAPPING_GROUNDS, "ogn-294-298", "ogn-276-298"] };
    const session = createGameFromDecks(deck, deck, "tg-pregame", { gameMode: "match", gameNumber: 1 });
    expect(session.pregame?.phase).toBe("battlefield_select");
    const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string; name: string; used?: true }[] };
    expect(payload.battlefieldOptions).toHaveLength(3);
    expect(payload.battlefieldOptions.map((o) => o.id)).toContain(TRAPPING_GROUNDS);
    expect(payload.battlefieldOptions.find((o) => o.id === TRAPPING_GROUNDS)?.name).toBe("Trapping Grounds");
    expect(payload.battlefieldOptions.every((o) => o.used === undefined)).toBe(true); // nothing used in game 1

    expect(selectBattlefield(session, P1, TRAPPING_GROUNDS)).toEqual({ completed: false, ok: true });
    // Final: a second pick from the same seat is refused, and an unpresented card was never a choice.
    expect(selectBattlefield(session, P1, "ogn-294-298")).toEqual({ error: "Battlefield already locked in", ok: false });
    expect(selectBattlefield(session, P2, "unl-195-219")).toEqual({ error: "Invalid battlefield choice", ok: false });
  });

  // -------------------------------------------------------------------------
  // 2 / 3 / 4 — YES side: one defender at Trapping Grounds, >= 3 excess
  // -------------------------------------------------------------------------
  /** Cleave the Yeti to 9 attacking Might and take Trapping Grounds off its lone 6-Might defender. */
  async function conquerHere(seen?: string[]) {
    const b = board({ tgDefenders: [6] });
    if (seen) {
      b.script(P1, tracer(seen));
    }
    const game = await b.build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    expect(game.state("yeti").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    await game.p1.move("yeti", TG_ID);
    await game.settle({ maxSteps: 80 });
    return game;
  }

  test("YES side — 9 assigned into a lone 6-Might defender is 3 excess: P1 conquers HERE (466.3.a/466.5/469.1) for one point (470) and BOTH triggers fire", async () => {
    const game = await conquerHere();
    // 465.2.c.1.a — the defender took its lethal 6 and died as the damage was dealt.
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.locationOf("yeti")).toBe(TG_ID);
    expect(game.gameState.battlefields[TG_ID]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // 470 — one conquer point, once per battlefield per turn

    // Trapping Grounds asks WHERE to play the Bird: both options legal, never P2's battlefield.
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", `battlefield-${TG_ID}`]);
    await game.p1.pick("base");
    await game.settle();

    const birds = tokensNamed(game, "Bird");
    const golds = tokensNamed(game, "Gold");
    expect(birds).toHaveLength(1);
    expect(golds).toHaveLength(2);
    expect(game.state(birds[0] as string)).toMatchObject({ baseMight: 1, cardType: "unit", isToken: true, might: 1, name: "Bird" });
    expect(game.state(birds[0] as string).keywords).toContain("Deflect");
    for (const g of golds) {
      expect(game.state(g)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, zone: "base" });
    }
    expect(game.violations()).toEqual([]);
  });

  test("383.3.d / 355.8 — the two simultaneous same-controller triggers raise an ORDER offer whose every listed item is legal; it is soft, so nothing stalls on it", async () => {
    const seen: string[] = [];
    const game = await conquerHere(seen);
    expect(seen.some((s) => s.startsWith("order|"))).toBe(true);
    // DESIGN (FIXER-PRIMER "Known deviations", rule 383.3.d): the same-controller order prompt is a
    // SOFT offer — settle() accepts the listed order rather than stopping on it — so the only
    // decision left standing is the Bird's destination, which is itself fully answerable.
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "destination" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("809.1.d — the Bird's [Deflect] shows up as a mandatory [rainbow] surcharge in the OPPONENT's later pay line, and is unpayable from a bare Energy pool", async () => {
    const game = await conquerHere();
    await game.p1.pick("base");
    await game.settle();
    const bird = tokensNamed(game, "Bird")[0] as string;

    // Hand P2 a bolt for its own turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.do("drawCard", { count: 0 });
    const withBolt = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { rainbow: 1 } })
      .unit(P1, "base", { keywords: ["Deflect"], might: 1, name: "Bird" }, "bird")
      .unit(P1, "base", { might: 3, name: "Plain" }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const f = withBolt.p2.option("cast", "bolt")?.fields.find((x) => x.name === "targets");
    const options = (f?.options ?? []).map((v) => (Array.isArray(v) ? (v[0] as string) : (v as string)));
    expect(options).toEqual(expect.arrayContaining(["bird", "plain"]));
    expect(f?.surcharge?.[options.indexOf("bird")]).toBe(1);
    expect(f?.surcharge?.[options.indexOf("plain")]).toBe(0);

    // And on the real board the token really does carry it.
    expect(game.state(bird).keywords).toContain("Deflect");
  });

  // -------------------------------------------------------------------------
  // 5 — NO side: the same excess, but conquered somewhere else
  // -------------------------------------------------------------------------
  test("NO side (wrong battlefield) — conquering the OPPONENT'S other battlefield with the same 3 excess fires the Yeti only: two Golds, never a Bird", async () => {
    const game = await board({ bf2Defender: 6, tgDefenders: [2] }).build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    await game.p1.move("yeti", P2_BF);
    await game.settle({ maxSteps: 80 });
    expect(game.zoneOf("outpost")).toBe("trash");
    expect(game.gameState.battlefields[P2_BF]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);

    expect(tokensNamed(game, "Gold")).toHaveLength(2); // Yeti's clause has no location scope
    expect(tokensNamed(game, "Bird")).toEqual([]); // "here" was not conquered — an extra Bird is scope leakage
    // Trapping Grounds is untouched: still P2's, still holding its own defender.
    expect(game.gameState.battlefields[TG_ID]?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 6 — NO side: 465.2.c.4 caps the assignment, so excess is 0
  // -------------------------------------------------------------------------
  test("NO side (two defenders) — 465.2.c.4 refuses the over-assign, the remainder must go to the second unit, and 1 excess fires NEITHER trigger", async () => {
    // Both defenders are stunned, so P1's side is the only one assigning: 9 Might over lethal
    // needs of 6 and 2 — one allocation short of the 3 excess both clauses demand.
    const game = await board({ tgDefenders: ["stunned6", "stunned2"] }).interactive().build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    await game.p1.move("yeti", TG_ID);
    await game.p1.passFocus();
    await game.p2.passFocus();

    const d = game.decision() as DistributeDecision;
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 9 });
    expect(Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal]))).toEqual({ d1: 6, d2: 2 });
    // 465.2.c.4 — no unit may take more than lethal while another is still unassigned: dumping all
    // 9 on the first is refused outright, even though the total is right.
    expect((await game.p1.try((s) => s.distribute({ d1: 9, d2: 0 }))).ok).toBe(false);
    expect((await game.p1.try((s) => s.distribute({ d1: 0, d2: 9 }))).ok).toBe(false);
    await game.p1.distribute({ d1: 7, d2: 2 }); // lethal to both; the 1 spare rides on the first
    await game.settle({ maxSteps: 80 });

    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.gameState.battlefields[TG_ID]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // the HUD shows only the conquer point
    // 383.2.a.1 — the "if you assigned 3 or more excess damage" clause is part of each trigger's
    // Condition, so below the threshold neither ability is even put on the chain: no tokens, no prompt.
    expect(tokensNamed(game, "Bird")).toEqual([]);
    expect(tokensNamed(game, "Gold")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("NO side (exact cap) — with lethal needs of 6 and 3 against 9 Might the cap leaves exactly ONE legal allocation: no choice is put to the player, excess 0, no tokens", async () => {
    const game = await board({ tgDefenders: ["stunned6", "stunned3"] }).interactive().build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    await game.p1.move("yeti", TG_ID);
    await game.p1.passFocus();
    await game.p2.passFocus();
    // 465.2.c.4 leaves 6/3 as the only allocation, so there is nothing to ask (355.8 — an offer
    // with one legal answer is not a decision about damage).
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.gameState.battlefields[TG_ID]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(tokensNamed(game, "Bird")).toEqual([]);
    expect(tokensNamed(game, "Gold")).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 7 / 8 — into game 2 of the Bo3
  // -------------------------------------------------------------------------
  test("486.5 / 486.6 — P1 wins game 1 holding Trapping Grounds: it is recorded as used for the match and the reset takes the Bird and the Golds with it", async () => {
    const game = await board({ tgDefenders: [6] }).points(P1, 6).build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    await game.p1.move("yeti", TG_ID);
    await game.settle({ maxSteps: 80 });
    await game.p1.pick(`battlefield-${TG_ID}`);
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(tokensNamed(game, "Bird")).toHaveLength(1);
    expect(tokensNamed(game, "Gold")).toHaveLength(2);

    // P1 ends; P2 ends; P1's hold at Trapping Grounds is the 8th point and wins the game.
    await game.advanceTurn();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);

    expect(mv(game.engine, "startNextGame", P1).success).toBe(true);
    expect(game.gameState.match?.usedBattlefields ?? []).toContain(TG_ID);
    expect(game.gameState.match?.gameNumber).toBe(2);
    expect(game.gameState.match?.results).toEqual([{ winner: P1 }]);
    // 486.6 — setup re-opens with the battlefields gone and the scoreboard back to zero.
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    // DESIGN: the engine's `startNextGame` re-opens SETUP; it does not wipe the zones, because the
    // app throws the whole engine away and builds game 2 from the decks (server/match.ts
    // startNextGame → createGameFromDecks). That fresh board is where 486.6's "no leftovers" is
    // observable — a Bird or a Gold could only survive by being carried across engines.
    const deck = { ...buildDefaultDeck(), battlefieldIds: [TRAPPING_GROUNDS, "ogn-294-298", "ogn-276-298"] };
    const g2 = createGameFromDecks(deck, deck, "tg-reset", { gameMode: "match", gameNumber: 2 });
    const cards = Object.values(getInternalSnapshot(g2.engine).cards) as { definitionId?: string; name?: string }[];
    expect(cards.some((c) => c.name === "Bird" || c.name === "Gold")).toBe(false);
  });

  test("486.5 — game 2's picker still SHOWS Trapping Grounds but marks it used and refuses to select it", () => {
    const deck = { ...buildDefaultDeck(), battlefieldIds: [TRAPPING_GROUNDS, "ogn-294-298", "ogn-276-298"] };
    const session = createGameFromDecks(deck, deck, "tg-g2", {
      excludedBattlefields: { [P1]: [TRAPPING_GROUNDS] },
      gameMode: "match",
      gameNumber: 2,
    });
    const payload = buildPregamePayload(session, P1) as { battlefieldOptions: { id: string; used?: true }[] };
    expect(payload.battlefieldOptions.find((o) => o.id === TRAPPING_GROUNDS)?.used).toBe(true);
    expect(payload.battlefieldOptions.filter((o) => o.used === undefined).map((o) => o.id)).toEqual(["ogn-294-298", "ogn-276-298"]);
    expect(selectBattlefield(session, P1, TRAPPING_GROUNDS)).toMatchObject({ ok: false });
    expect(selectBattlefield(session, P1, "ogn-294-298")).toMatchObject({ ok: true });
  });
});
