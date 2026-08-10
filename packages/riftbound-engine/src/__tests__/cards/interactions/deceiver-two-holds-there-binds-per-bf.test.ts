/**
 * Interaction: Deceiver (unl-199-219) · Legend (LeBlanc)
 *     "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there.
 *      It becomes a copy of another unit there. Give it [Temporary]."
 *   × Vilemaw (unl-060-219) · Unit · Calm · 8 Might · "[Ambush] Enemy units here with less Might than me don't deal
 *     combat damage. When I hold, draw 1."                                       — P1, alone at bfA
 *   × Scout — vanilla 2-Might unit                                              — P1, alone at bfB
 *
 * Rules: 315.2.b.2 / 469.2 / 470 (Beginning Phase: the turn player Holds EACH battlefield they control — one score
 * event per battlefield), 471.2 / 471.2.b (score abilities trigger AT the battlefield that scored), 383.4.d.2.a (a
 * unit's "When I hold" — Vilemaw, at A only) vs 383.4.d.2.b (an ability referencing the holding PLAYER — Deceiver —
 * triggers once per Hold), 383.3.d (same-controller simultaneous triggers: that player orders them), 383.3.a (leading
 * "you may" → opt-in decided at finalization) + 383.3.b / 383.3.b.1 ("discard 1 and exhaust me TO …" is the
 * trigger's base cost, paid to finalize; unpayable → the instance cannot be performed), 383.3.a.2 (declined → removed,
 * never triggered), 477.1.b (copy = name/Might/text of "another unit THERE"), 187.6 (Reflection token), 816.1.b
 * (Temporary).
 *
 * Question: P1's turn begins controlling A (lone Vilemaw) and B (lone Scout), Deceiver ready, 2 cards in hand.
 *   (a) how many score events / Deceiver instances, and is each bound to a battlefield for "there"?
 *   (b) P1 has the B-instance be the one performed: token where, copying what? Can the A-instance then be paid too?
 *   (c) contrast: the A-instance is the one performed.
 *   (d) can the B-hold instance ever put the token at A (next to the juicier Vilemaw)?
 *
 * Expected: (a) two Holds → 2 points; Deceiver triggers TWICE (one instance per held battlefield, each carrying that
 * battlefield as "there"), Vilemaw once; all three are P1's — P2 decides nothing. (b) B-instance performed (discard 1 +
 * exhaust Deceiver): a READY Reflection at B that is a copy of the Scout (2 Might) with Temporary; the A-instance's
 * cost now needs an already-exhausted legend → unpayable → it does nothing (no second discard, no prompt that can be
 * accepted). One Reflection total, at B. (c) A-instance performed: Reflection at A copying Vilemaw (8 Might); the
 * B-instance cannot be paid. One Reflection, at A. (d) No — "there" is fixed per instance (471.2): the B-instance only
 * ever makes a token at B copying a unit at B; P1's only lever is WHICH instance to pay for, so the decision P1 is
 * shown must identify the battlefield each Deceiver instance belongs to.
 *
 * Engine mechanics note (CR 2026-03-30, 383.3.a / 383.3.b.1): the opt-in AND its discard+exhaust cost happen at
 * FINALIZATION, oldest pending item first (A's instance is asked before B's); "having the B-instance be the one
 * performed" therefore means declining A's opt-in and accepting B's. The 383.3.d ordering offer then covers the
 * items that were actually finalized.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";
const VILEMAW = "unl-060-219";
const FODDER = "ogn-175-298"; // vanilla Shipyard Skulker — discard fodder

/** P2 is about to end turn 2. P1: Deceiver ready, Vilemaw alone at bfA, Scout alone at bfB, two fodder cards in hand. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", VILEMAW, "vilemaw")
    .unit(P1, "bfB", { might: 2, name: "Scout" }, "scout")
    .hand(P1, FODDER, "fodder0")
    .hand(P1, FODDER, "fodder1")
    .fillDecks({ main: 10, runes: 0 });
}

/** P2 ends the turn → P1's Beginning Phase scores both Holds; stop at the first prompt (nothing answered). */
async function held(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

type RawItem = { id: string; cardId: string; triggerEvent?: { battlefieldId?: string; type?: string } };
const rawItems = (game: Game): RawItem[] => ((game.gameState.interaction?.chain?.items ?? []) as unknown as RawItem[]).slice();

/** The battlefield the chain item behind an opt-in prompt was triggered at ("there"). */
function thereOf(game: Game, d: Decision | null): string | undefined {
  const id = d?.source?.chainItemId;
  return rawItems(game).find((it) => it.id === id)?.triggerEvent?.battlefieldId;
}

/** Is `d` a Deceiver opt-in that may actually be accepted? */
const isDeceiverOptIn = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "leblanc" && d.canAccept !== false;

/**
 * Answer the Deceiver opt-ins so that the instance bound to `payFor` is the one performed (decline the other if it
 * is asked first), discard fodder0 for it, accept any trigger-order offer as listed, and stop at the first priority
 * window. Returns the battlefields whose opt-in was offered as acceptable, in the order asked.
 */
async function perform(game: Game, payFor: "bfA" | "bfB"): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      break;
    }
    if (d.kind === "yes-no") {
      if (d.canAccept === false) {
        await game.p1.no();
        continue;
      }
      const there = thereOf(game, d);
      asked.push(there ?? "?");
      await (there === payFor ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick") {
      const want = d.options.find((o) => (o.card ?? o.key) === "fodder0") ?? d.options[0]!;
      await game.p1.pick(want.key);
    } else if (d.kind === "order") {
      await game.p1.order(d.items.map((o) => o.key));
    } else {
      break;
    }
  }
  return asked;
}

/** perform(payFor) and then let everything resolve into P1's open main phase. */
async function performedAndSettled(payFor: "bfA" | "bfB"): Promise<Game> {
  const game = await held();
  await perform(game, payFor);
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.phase()).toBe("main");
  expect(game.chain()).toEqual([]);
  return game;
}

const tokensAt = (game: Game, loc: string) => game.p1.units(loc as "base").filter((id) => game.state(id).isToken);
const allTokens = (game: Game) => [...tokensAt(game, "bfA"), ...tokensAt(game, "bfB"), ...tokensAt(game, "base")];

describe("(a) two Holds → two score events, two battlefield-bound Deceiver instances + one Vilemaw trigger, all P1's", () => {
  test("P1 scores 2 points in the Beginning Phase (one Hold per controlled battlefield, 469.2 / 470) and keeps both battlefields", async () => {
    const game = await held();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  test("three pending P1 items: Deceiver ×2 (once PER Hold, 383.4.d.2.b) and Vilemaw ×1 ('When I hold' — only at A, 383.4.d.2.a)", async () => {
    const game = await held();
    const items = game.chain();
    expect(items).toHaveLength(3);
    expect(items.filter((c) => c.cardId === "leblanc")).toHaveLength(2);
    expect(items.filter((c) => c.cardId === "vilemaw")).toHaveLength(1);
    expect(items.every((c) => c.controller === P1 && c.triggered && c.type === "ability")).toBe(true);
  });

  test("each Deceiver instance is bound to the battlefield whose Hold produced it (471.2.b): one carries bfA, the other bfB; Vilemaw's carries bfA", async () => {
    const game = await held();
    const raw = rawItems(game);
    const deceiverThere = raw.filter((it) => it.cardId === "leblanc").map((it) => it.triggerEvent?.battlefieldId).sort();
    expect(deceiverThere).toEqual(["bfA", "bfB"]);
    expect(raw.find((it) => it.cardId === "vilemaw")?.triggerEvent).toMatchObject({ battlefieldId: "bfA", type: "hold" });
  });

  test("the first thing anyone is asked is P1's Deceiver opt-in (383.3.a, at finalization); nothing is paid yet; P2 has no decision", async () => {
    const game = await held();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "leblanc" }, timing: "FIN" });
    expect(["bfA", "bfB"]).toContain(thereOf(game, d) ?? "none");
    expect(game.state("leblanc").isExhausted).toBe(false);
    expect(game.p1.hand().sort()).toEqual(["fodder0", "fodder1"]);
    expect(game.actingSeat()).toBe(P1);
  });

  // BUG — expected: since P1's only lever is WHICH instance to perform, the decision shown to P1 must say which
  // battlefield this Deceiver instance belongs to. Actual: both opt-ins read "Pay [discard 1] and exhaust to use
  // Deceiver [leblanc]'s optional ability?" with a source of { cardId, chainItemId } only — indistinguishable without
  // digging the trigger event out of raw engine state.
  test("the Deceiver opt-in decision itself names its battlefield ('there') so the two instances are distinguishable", async () => {
    const game = await held();
    const d = game.decision()!;
    const there = thereOf(game, d)!;
    const surface = JSON.stringify({ prompt: d.prompt, source: d.source, consequence: (d as { consequence?: string }).consequence });
    expect(surface).toContain(there);
  });

  test("P1 orders its own surviving simultaneous triggers (383.3.d) — the order offer is P1's and lists the performed Deceiver instance + Vilemaw; P2 is never asked to order anything", async () => {
    const game = await held();
    const seen: Decision[] = [];
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context !== "main")) {
        break;
      }
      seen.push(d);
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]!.key);
      } else if (d.kind === "order") {
        expect(d.seat).toBe(P1);
        expect(d.items.map((o) => o.card).sort()).toEqual(["leblanc", "vilemaw"]);
        await game.p1.order(d.items.map((o) => o.key));
      } else {
        break;
      }
    }
    expect(seen.some((d) => d.kind === "order" && d.seat === P1)).toBe(true);
    expect(seen.every((d) => d.seat === P1)).toBe(true);
  });
});

describe("(b) the B-instance is the one performed → Reflection at B copying the Scout; the A-instance cannot also be paid", () => {
  test("A's opt-in is asked first and declined; B's is then offered and accepted: fodder0 → trash, Deceiver exhausted — before anyone has priority (383.3.b.1)", async () => {
    const game = await held();
    const asked = await perform(game, "bfB");
    expect(asked).toEqual(["bfA", "bfB"]);
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.p1.hand()).toEqual(["fodder1"]);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // The declined A-instance is gone (383.3.a.2): exactly one Deceiver item + Vilemaw remain.
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["leblanc", "vilemaw"]);
    expect(rawItems(game).find((it) => it.cardId === "leblanc")?.triggerEvent?.battlefieldId).toBe("bfB");
  });

  test("after everything resolves: exactly ONE Reflection token, at bfB (not A, not base), READY, controlled by P1", async () => {
    const game = await performedAndSettled("bfB");
    expect(allTokens(game)).toHaveLength(1);
    const toks = tokensAt(game, "bfB");
    expect(toks).toHaveLength(1);
    expect(tokensAt(game, "bfA")).toEqual([]);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isReady: true, isToken: true, owner: P1, zone: "battlefield-bfB" });
  });

  test("it is a copy of 'another unit THERE' = the Scout (the only candidate at B): name Scout, 2 Might — NOT Vilemaw — plus Temporary (477.1.b, 816)", async () => {
    const game = await performedAndSettled("bfB");
    const tok = tokensAt(game, "bfB")[0]!;
    const s = game.state(tok);
    expect(s).toMatchObject({ might: 2, name: "Scout" });
    expect(s.name).not.toBe("Vilemaw");
    expect(s.keywords).toContain("Temporary");
    expect(s.meta.copyOfCardId).toBe("scout");
    expect(game.state("scout")).toMatchObject({ isToken: false, might: 2, zone: "battlefield-bfB" }); // the original is untouched
  });

  test("the A-instance could not be performed on top: only ONE card was discarded, the legend was exhausted once, no second token; Vilemaw's draw and the turn draw still happened (hand: 2 − 1 + 1 + 1 = 3)", async () => {
    const game = await performedAndSettled("bfB");
    expect(game.p1.trash().filter((c) => c.startsWith("fodder"))).toEqual(["fodder0"]);
    expect(game.p1.hand()).toContain("fodder1");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — the A-instance is the one performed → Reflection at A copying Vilemaw; the B-instance is then unpayable", () => {
  test("accepting A's opt-in (asked first) pays discard + exhaust; B's instance is then NEVER offered as acceptable (exhaust unpayable, 383.3.b.1) and leaves the chain", async () => {
    const game = await held();
    const asked = await perform(game, "bfA");
    expect(asked).toEqual(["bfA"]); // B's opt-in never came up as an acceptable choice
    expect(game.zoneOf("fodder0")).toBe("trash");
    expect(game.p1.hand()).toEqual(["fodder1"]);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["leblanc", "vilemaw"]);
    expect(rawItems(game).find((it) => it.cardId === "leblanc")?.triggerEvent?.battlefieldId).toBe("bfA");
  });

  test("result: exactly ONE Reflection, at bfA, READY, a copy of Vilemaw (name Vilemaw, 8 Might) with Temporary; nothing at B but the Scout", async () => {
    const game = await performedAndSettled("bfA");
    expect(allTokens(game)).toHaveLength(1);
    const toks = tokensAt(game, "bfA");
    expect(toks).toHaveLength(1);
    const s = game.state(toks[0]!);
    expect(s).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 8, name: "Vilemaw", zone: "battlefield-bfA" });
    expect(s.keywords).toEqual(expect.arrayContaining(["Ambush", "Temporary"]));
    expect(s.meta.copyOfCardId).toBe("vilemaw");
    expect(game.p1.units("bfB")).toEqual(["scout"]);
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });

  test("the Temporary copy dies at the start of P1's NEXT Beginning Phase before scoring (816.1.b); the real Vilemaw still holds A", async () => {
    const game = await performedAndSettled("bfA");
    const tok = tokensAt(game, "bfA")[0]!;
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(tok)).toBe("battlefield-bfA");
    await game.advanceTurn(); // → P1: Temporary kill, then Holds (Deceiver readied → may be asked again; settle declines/handles)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone");
    expect(game.zoneOf("vilemaw")).toBe("battlefield-bfA");
    expect(game.p1.points()).toBeGreaterThanOrEqual(4); // held A and B again
  });
});

describe("(d) 'there' is fixed per instance — the B-hold instance can never make a token at A", () => {
  test("performing ONLY the B-instance never yields a token at A or a Vilemaw copy anywhere; no prompt ever offers Vilemaw / bfA as a choice for it", async () => {
    const game = await held();
    const offeredCards: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || d.seat !== P1 || (d.kind === "action" && d.context !== "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        await (d.canAccept !== false && thereOf(game, d) === "bfB" ? game.p1.yes() : game.p1.no());
      } else if (d.kind === "pick") {
        offeredCards.push(...d.options.map((o) => o.card ?? o.key));
        const want = d.options.find((o) => (o.card ?? o.key) === "fodder0") ?? d.options[0]!;
        await game.p1.pick(want.key);
      } else if (d.kind === "order") {
        await game.p1.order(d.items.map((o) => o.key));
      } else {
        break;
      }
    }
    // Resolution: the copy source is named on resolution among units THERE (B) — a forced single candidate (Scout).
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        offeredCards.push(...d.options.map((o) => o.card ?? o.key));
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("vilemaw");
        await game.seat(d.seat).pick(d.options[0]!.key);
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(offeredCards).not.toContain("vilemaw");
    expect(offeredCards).not.toContain("bfA");
    expect(tokensAt(game, "bfA")).toEqual([]);
    expect(tokensAt(game, "bfB")).toHaveLength(1);
    expect(allTokens(game).map((t) => game.state(t).name)).toEqual(["Scout"]);
  });

  test("symmetry check: whichever single instance is performed, the token lands at THAT instance's battlefield and copies a unit from THAT battlefield only", async () => {
    for (const [bf, copyName] of [
      ["bfA", "Vilemaw"],
      ["bfB", "Scout"],
    ] as const) {
      const game = await performedAndSettled(bf);
      const toks = allTokens(game);
      expect(toks).toHaveLength(1);
      expect(game.state(toks[0]!)).toMatchObject({ name: copyName, zone: `battlefield-${bf}` });
    }
  });
});
