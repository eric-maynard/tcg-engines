/**
 * Interaction: Sabotage (ogn-156-298) · Spell (Action) · Body · 1+[body]
 *     "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."      — P1's
 *   × Discipline (ogn-058-298) · Spell (REACTION) · Calm · 2 · "Give a unit +2 [Might] this turn. Draw 1."       — in P2's hand
 *   × Stand United (ogn-053-298) · Spell (ACTION, [Hidden]) · Calm · 3 · "Buff a friendly unit. Buffs give an
 *     additional +1 [Might] to friendly units this turn."                                                          — in P2's hand
 *   + U: a vanilla unit in P2's hand; D1: the top card of P2's deck (a GEAR by default, a unit in the contrast).
 *
 * Position: P1's turn. P2 controls bf2 (a Holder unit, no facedown card there) and has 2 energy + 1 any-domain power.
 * P1 casts Sabotage choosing P2 (the only opponent).
 *
 * Question:
 *  (a) Before Sabotage resolves, can P2 shrink the exposed set by (i) playing Discipline in response, (ii) HIDING Stand
 *      United face-down at bf2 in response, (iii) playing Stand United from hand in response?
 *  (b) P2 does (i): Discipline resolves first and P2 draws D1. When Sabotage resolves, which cards are revealed — the
 *      hand as it was at cast time, or as it is NOW {Stand United, U, D1}? Is a non-unit D1 fair game? Must P1 pick?
 *  (c) If after responses P2's hand contains only units (or is empty): a pick, an empty pick, or nothing? Still "played"?
 *  (d) Seat views: what does P1 see of P2's hand while Sabotage is on the chain; during resolution; afterwards; is the
 *      recycled card's identity/position visible in anyone's deck view?
 *
 * Rules: 811.1.b (Hide = "on YOUR turn during an OPEN state" — a discretionary action, not a Reaction), 358.4 (only
 * [Reaction] cards may be added to an existing chain on another player's turn; Stand United is [Action]), 424.1 /
 * 424.3.a / 424.3.a.1 ("reveal their hand" = every card CURRENTLY in it at resolution), 355.10.a (hand cards are never
 * targets — nothing was locked at cast), 128.3 / 108.4.d (Main Deck is secret), 108.7.c/.e (hand identities private,
 * count public), 424.1.a.3 (Revealed ends when the effect finishes resolving), 359.3.e.6 / .e.11 (impossible
 * instruction ignored), 359.3.e.10 (still played), 416.1.c (recycle → bottom of ITS OWNER's deck), 422.1 (recycle is
 * not a discard). RiftJudge Sabotage: reveal/choice/recycle on resolution; opponents may respond first; the pick is
 * mandatory when a non-unit is revealed.
 *
 * Expected: (a)(i) yes; (ii) no — absent from P2's menu, rejected with no residue; (iii) no. (b) the CURRENT hand
 * {Stand United, U, D1}: Discipline escaped (in P2's trash), D1 is revealed and — being a gear — is a legal pick; P1
 * must choose (no decline) among {Stand United, D1}; the chosen card goes to the bottom of P2's deck; nothing is
 * discarded. (c) reveal happens (public record), NO pick Decision at all, Sabotage → P1's trash and counts as played;
 * casting never depended on the hand's contents (legal vs an empty hand). (d) pending: count only; resolving: all seats
 * see the set; after: redacted again for P1, and no seat's deck view names the recycled card (the omniscient record does).
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Decision, Game, Viewer } from "../../../harness";
import { isHiddenView, P1, P2, SPECTATOR, scenario } from "../../../harness";

const SABOTAGE = "ogn-156-298";
const DISCIPLINE = "ogn-058-298";
const STAND_UNITED = "ogn-053-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — U, deck filler, unit-D1
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket (D1)" } as const; // non-unit D1

type HandCard = "disc" | "su" | "unitU";

interface BoardOpts {
  /** P2's opening hand (default Discipline + Stand United + U). */
  hand?: readonly HandCard[];
  /** P2's top deck card D1: a gear (default) or a unit. */
  d1?: "gear" | "unit";
}

/**
 * P1's turn (Neutral Open). P1: Sabotage + exactly 1 + [body]; own tiny known deck. P2: `hand`, 2 energy + 1 rainbow,
 * controls bf2 via a 2-Might Holder (no facedown card there); deck = D1, d2, d3 exactly (top first).
 */
function board(o: BoardOpts = {}) {
  let s = scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "holder")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["p1d1", "p1d2", "p1d3"])
    .deck(P2, [o.d1 === "unit" ? SKULKER : TRINKET, SKULKER, SKULKER], ["d1", "d2", "d3"])
    .hand(P1, SABOTAGE, "sab");
  for (const h of o.hand ?? ["disc", "su", "unitU"]) {
    s = h === "disc" ? s.hand(P2, DISCIPLINE, "disc") : h === "su" ? s.hand(P2, STAND_UNITED, "su") : s.hand(P2, SKULKER, "unitU");
  }
  return s;
}

/** P2's `zone` as `viewer` sees it: ids for visible cards, "?" for redacted ones. */
function p2ZoneSeenBy(game: Game, viewer: Viewer, zone: "hand" | "mainDeck"): string[] {
  return (game.view(viewer).zones[zone] ?? []).filter((c: CardView) => c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
}

const optionKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Sabotage cast (sole opponent implied), P1 passes → P2 holds priority with Sabotage pending. */
async function sabotagePending(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.cast("sab");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sab"]);
  return game;
}

/** …P2 responds with Discipline on its Holder; both pass → Discipline resolves (P2 draws D1); both pass → Sabotage resolves. */
async function disciplineThenSabotageResolves(o: BoardOpts = {}): Promise<Game> {
  const game = await sabotagePending(o);
  await game.p2.cast("disc", { targets: "holder" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sab", "disc"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Discipline resolves
  expect(game.zoneOf("disc")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["sab"]);
  // both pass again → Sabotage resolves
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
  return game;
}

describe("Sabotage — dodge by REACTION (Discipline), not by Hide / not by an Action; reveal = the hand as it is on resolution", () => {
  // ── (a) what P2 may do in response ────────────────────────────────────────────────────────────

  test("(a)(i) P2 may respond with Discipline (a Reaction): it is in P2's legal menu with the Holder as target; casting it costs 2 and stacks it above Sabotage", async () => {
    const game = await sabotagePending();
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.option("cast", "disc")?.fields.find((f) => f.name === "targets")?.options).toEqual([["holder"]]);
    await game.p2.cast("disc", { targets: "holder" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sab", "disc"]);
    expect(game.zoneOf("disc")).toBe("chain");
  });

  test("(a)(ii) P2 can NOT hide Stand United now — Hide is 'on your turn during an Open State' (811.1.b): 'hide' is absent from P2's menu, the verb and a raw hideCard are both rejected, and there is no residue (Stand United in hand, rainbow unspent, no facedown at bf2, chain unchanged)", async () => {
    const game = await sabotagePending();
    expect(game.p2.legal().map((o) => o.key).sort()).toEqual(["concede:-", "passChainPriority:-", "playSpell:disc"]);
    expect(game.p2.can("hide", "su")).toBe(false);
    const hash0 = game.stateHash();
    await expect(game.p2.hide("su", "bf2")).rejects.toThrow();
    expect((await game.p2.try((p) => p.do("hideCard", { battlefieldId: "bf2", cardId: "su" }))).ok).toBe(false);
    expect(game.stateHash()).toBe(hash0);
    expect(game.zoneOf("su")).toBe("hand");
    expect(game.p2.facedown("bf2")).toEqual([]);
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sab"]);
  });

  test("(a)(ii) control: Hide itself works for P2 on P2's OWN turn in an Open State — same board, P2 active: 'hide su @ bf2' is legal and puts it facedown for the rainbow", async () => {
    const game = await board().active(P2).build();
    expect(game.p2.can("hide", "su")).toBe(true);
    await game.p2.hide("su", "bf2");
    expect(game.zoneOf("su")).toBe("facedown-bf2");
    expect(game.p2.power("rainbow")).toBe(0);
  });

  test("(a)(iii) P2 can NOT play Stand United from hand in response — it is an [Action] card on P1's turn outside a showdown (358.4): not listed, rejected, still in hand", async () => {
    const game = await sabotagePending();
    expect(game.p2.can("cast", "su")).toBe(false);
    await expect(game.p2.cast("su", { targets: "holder" })).rejects.toThrow();
    expect(game.zoneOf("su")).toBe("hand");
    expect(game.p2.energy()).toBe(2);
  });

  // ── (b) Discipline escapes; the reveal is the CURRENT hand ────────────────────────────────────

  test("(b) Discipline resolves first (LIFO): Holder +2 this turn, P2 draws D1; Discipline is in P2's trash — it has escaped the hand before any reveal", async () => {
    const game = await sabotagePending();
    await game.p2.cast("disc", { targets: "holder" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("holder").might).toBe(4);
    expect(game.p2.hand().sort()).toEqual(["d1", "su", "unitU"]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sab"]);
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?", "?"]); // still nothing revealed (108.7.c/.e)
  });

  test("(b) when Sabotage resolves the reveal is the hand AS IT IS NOW (424.3.a): {Stand United, U, D1} — all three named in every seat's view and in the engine's reveal record; Discipline is not among them", async () => {
    const game = await disciplineThenSabotageResolves();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "sab" } });
    expect(p2ZoneSeenBy(game, P1, "hand").sort()).toEqual(["d1", "su", "unitU"]);
    expect(p2ZoneSeenBy(game, SPECTATOR, "hand").sort()).toEqual(["d1", "su", "unitU"]);
    expect(game.gameState.pendingChoice).toMatchObject({ prompter: P1, revealed: expect.arrayContaining(["su", "unitU", "d1"]), revealer: P2, type: "reveal-and-pick" });
    expect((game.gameState.pendingChoice as { revealed?: string[] } | undefined)?.revealed ?? []).not.toContain("disc");
  });

  test("(b) D1 (a gear, drawn BEFORE the reveal) is fair game: P1's options are exactly the non-units {Stand United, D1}; U is revealed but not selectable; the pick is MANDATORY (min 1 / max 1 / no decline)", async () => {
    const game = await disciplineThenSabotageResolves();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(optionKeys(d).sort()).toEqual(["d1", "su"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("unitU"))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // still asking
  });

  test("(b) picking D1 recycles it to the BOTTOM of P2's (its owner's) Main Deck (416.1.c): omniscient order d2, d3, d1; P2's hand {Stand United, U}; nothing was discarded (P2's trash is just Discipline, 422.1); Sabotage → P1's trash", async () => {
    const game = await disciplineThenSabotageResolves();
    await game.p1.pick("d1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("d1")).toBe("mainDeck");
    expect(p2ZoneSeenBy(game, SPECTATOR, "mainDeck")).toEqual(["d2", "d3", "d1"]);
    expect(game.p2.hand().sort()).toEqual(["su", "unitU"]);
    expect(game.p2.trash()).toEqual(["disc"]);
    expect(game.p1.trash()).toEqual(["sab"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) picking Stand United instead: it goes under d2, d3; P2 keeps {U, D1}", async () => {
    const game = await disciplineThenSabotageResolves();
    await game.p1.pick("su");
    await game.settle();
    expect(p2ZoneSeenBy(game, SPECTATOR, "mainDeck")).toEqual(["d2", "d3", "su"]);
    expect(game.p2.hand().sort()).toEqual(["d1", "unitU"]);
  });

  test("(b) contrast — D1 is a UNIT: it is still revealed (part of the current hand) but not selectable; Stand United is then the ONLY legal pick", async () => {
    const game = await disciplineThenSabotageResolves({ d1: "unit" });
    expect(p2ZoneSeenBy(game, P1, "hand").sort()).toEqual(["d1", "su", "unitU"]);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(optionKeys(d)).toEqual(["su"]);
      await game.p1.pick("su");
    }
    await game.settle();
    expect(game.zoneOf("su")).toBe("mainDeck"); // forced either way
    expect(game.p2.hand().sort()).toEqual(["d1", "unitU"]);
  });

  // ── (c) only units / empty ────────────────────────────────────────────────────────────────────

  test("(c) after Discipline P2's hand is ONLY units {U, D1-unit}: Sabotage resolves — the reveal still happens (public record names U and D1), but NO pick Decision is generated at all (359.3.e.6/.e.11); Sabotage → P1's trash and still counts as played (359.3.e.10); P2's hand and deck untouched", async () => {
    const game = await sabotagePending({ d1: "unit", hand: ["disc", "unitU"] });
    await game.p2.cast("disc", { targets: "holder" });
    let sawPick = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
      sawPick ||= game.decision()?.kind === "pick";
    }
    expect(sawPick).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p2.hand().sort()).toEqual(["d1", "unitU"]);
    expect(game.p2.deck()).toEqual(["d2", "d3"]);
    const last = (game.gameState.publicReveals ?? []).at(-1);
    expect(last).toMatchObject({ playerId: P2 });
    expect([...(last?.cardIds ?? [])].sort()).toEqual(["d1", "unitU"]); // revealed, even though nothing was pickable
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?"]); // and private again afterwards
    expect(game.violations()).toEqual([]);
  });

  test("(c) legality never depended on the hand: against an EMPTY P2 hand Sabotage is castable, resolves with nothing to reveal or pick, goes to P1's trash and counts as played", async () => {
    const game = await board({ hand: [] }).build();
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.can("cast", "sab")).toBe(true);
    expect(game.p1.option("cast", "sab")?.fields ?? []).toEqual([]); // no card target over P2's hand (355.10.a)
    await game.p1.cast("sab");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p2.deck()).toEqual(["d1", "d2", "d3"]);
  });

  // ── (d) seat views across the whole exchange ──────────────────────────────────────────────────

  test("(d) while Sabotage is merely on the chain P1 sees only P2's hand COUNT — 3 anonymous cards, then 2 (+Discipline face-up on the public chain), then 3 after the draw — never an identity (108.7.c/.e)", async () => {
    const game = await sabotagePending();
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?", "?"]);
    await game.p2.cast("disc", { targets: "holder" });
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?"]);
    expect(game.p1.view().chain.map((c) => c.cardId)).toEqual(["sab", "disc"]); // Discipline is public on the chain
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?", "?"]); // D1 drawn, still anonymous
    const blob = JSON.stringify([game.p1.view().zones, game.p1.decision()]);
    for (const id of ["su", "unitU", "d1"]) {
      expect(blob.includes(`"${id}"`)).toBe(false);
    }
  });

  test("(d) during resolution ALL seats see the revealed set; P2 sees only a summary of P1's pick (it is P1's choice); afterwards P1's live view of P2's hand is redacted again (424.1.a.3) and later cards are never exposed", async () => {
    const game = await disciplineThenSabotageResolves();
    expect(p2ZoneSeenBy(game, P1, "hand").sort()).toEqual(["d1", "su", "unitU"]);
    expect(p2ZoneSeenBy(game, P2, "hand").sort()).toEqual(["d1", "su", "unitU"]);
    expect(game.p2.view().decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.view().decision).not.toHaveProperty("options");
    await game.p1.pick("su");
    await game.settle();
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(p2ZoneSeenBy(game, P1, "hand")).toEqual(["?", "?"]);
    expect(p2ZoneSeenBy(game, P2, "hand").sort()).toEqual(["d1", "unitU"]); // the owner still sees its own hand
    // the reveal is a matter of public RECORD (424.1), not of ongoing visibility
    const last = (game.gameState.publicReveals ?? []).at(-1);
    expect([...(last?.cardIds ?? [])].sort()).toEqual(["d1", "su", "unitU"]);
  });

  test("(d) the recycled card sits face-down at the bottom of a SECRET zone: neither P1's nor P2's view of P2's Main Deck names Stand United at any position (128.3) — only the omniscient record does", async () => {
    const game = await disciplineThenSabotageResolves();
    await game.p1.pick("su");
    await game.settle();
    expect(p2ZoneSeenBy(game, SPECTATOR, "mainDeck")).toEqual(["d2", "d3", "su"]);
    expect(p2ZoneSeenBy(game, P1, "mainDeck")).toEqual(["?", "?", "?"]);
    expect(p2ZoneSeenBy(game, P2, "mainDeck")).toEqual(["?", "?", "?"]);
    expect(JSON.stringify(game.p1.view().zones.mainDeck)).not.toContain("\"su\"");
    expect(JSON.stringify(game.p2.view().zones.mainDeck)).not.toContain("\"su\"");
  });
});
