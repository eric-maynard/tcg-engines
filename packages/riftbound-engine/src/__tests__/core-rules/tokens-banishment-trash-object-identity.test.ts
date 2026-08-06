/**
 * Core rules — Zones: tokens leaving the board, Banishment, Trash, and
 * zone-change object identity.
 *
 * Rules covered (riftbound-rules ids):
 *   180-187.1      tokens: created on the board, not cards, cost 0, no domain, follow their type;
 *                  186 / 186.1 a token put into a non-board zone ceases to exist right after arriving
 *   439.4.a        created objects are owned/controlled by their creator
 *   143.4          units enter exhausted
 *   428.1, 428.1.a.1, 428.2, 428.2.a   kill = board → trash; death triggers (808.1.d, 808.1.d.1-3, 383.3.e.2.b)
 *   383.2.c.2      a listener that leaves the board simultaneously cannot see the event
 *   427.1, 427.2, 427.2.a, 427.3, 427.3.a, 108.6.c-e   banishment: direct, public, not a kill, inert
 *   108.2.c, 108.2.d        trash is public and unordered
 *   124, 124.1, 124.2, 705, 705.1, 747   non-board zone change = new object (mods wiped);
 *   458.1, 142.2, 703       board → board (recall / move) keeps everything
 *   421.4          a facedown card leaving the facedown zone is revealed; control loss trashes it
 *   811.1.b, 186   Hide only works from hand / champion zone — never for a token
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, getInternalState, isHiddenView, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler spells / abilities
// ---------------------------------------------------------------------------

function spell(name: string, effect: Record<string, unknown>, timing: "action" | "reaction" = "action") {
  return { abilities: [{ effect, timing, type: "spell" }], cardType: "spell", energyCost: 0, name, timing };
}

/** "Play a 1-Might Recruit unit token to your base." */
const MAKE_RECRUIT = spell("Make Recruit", { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" });
/** "Play a 1-Might Sneak unit token with [Hidden] to your base." */
const MAKE_HIDDEN_TOKEN = spell("Make Sneak", { location: "base", token: { keywords: ["Hidden"], might: 1, name: "Sneak", type: "unit" }, type: "create-token" });
/** "Draw 1." */
const CANTRIP = spell("Cantrip", { amount: 1, type: "draw" });
/** "Deal 1 to a unit." */
const PING = spell("Ping", { amount: 1, target: { type: "unit" }, type: "damage" });
/** "Deal 1 to all enemy units in a base." */
const BASE_SWEEP = spell("Base Sweep", { amount: 1, target: { controller: "enemy", location: "base", quantity: "all", type: "unit" }, type: "damage" });
/** "Kill a unit with cost 2 or less." */
const CULL = spell("Cull", { target: { filter: { cost: { lte: 2 } }, type: "unit" }, type: "kill" });
/** "Kill a unit." */
const KILL = spell("Kill", { target: { type: "unit" }, type: "kill" });
/** "Choose a Recruit." (buff it) — probes the Recruit tag. */
const RALLY_RECRUIT = spell("Rally Recruit", { target: { filter: { tag: "Recruit" }, type: "unit" }, type: "buff" });
/** "Return a unit to its owner's hand." */
const BOUNCE = spell("Bounce", { target: { type: "unit" }, type: "return-to-hand" });
/** "Recycle a unit (its owner puts it on the top or bottom of their Main Deck)." */
const RECYCLE = spell("Recycle", { from: "board", position: "owner-choice", target: { type: "unit" }, type: "recycle" });
/** "Banish a unit." */
const BANISH = spell("Banish", { target: { type: "unit" }, type: "banish" });
/** "Recall a unit." */
const RECALL = spell("Recall", { target: { type: "unit" }, type: "recall" });
/** "Move a unit to base." */
const MOVE_HOME = spell("Move Home", { target: { type: "unit" }, to: "base", type: "move" });
/** "Give a unit +2 Might this turn." */
const PLUS_TWO = spell("Plus Two", { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" });
/** "Give a unit [Tank] this turn." */
const GRANT_TANK = spell("Grant Tank", { duration: "turn", keyword: "Tank", target: { type: "unit" }, type: "grant-keyword" });
/** "Discard 3." */
const DISCARD_THREE = spell("Discard Three", { amount: 3, player: "self", type: "discard" });
/** "Draw 1 for each friendly unit." */
const MUSTER_DRAW = spell("Muster Draw", { amount: { count: { controller: "friendly", quantity: "all", type: "unit" } }, type: "draw" });

/** Unit: "When another friendly unit dies, draw 1." */
const LISTENER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "friendly-other-units" }, type: "triggered" }],
  might: 1,
  name: "Listener",
} as const;
/** "Deathknell — draw 1." (functionally "When I die, draw 1", 808.1.c) */
const DEATHKNELL_DRAW = { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" } as const;
/** "When you play a spell, play me from your trash, ignoring my cost." — an ability that functions from the TRASH (383.2.c.1 style). */
const RISE_FROM_TRASH = {
  effect: { from: "trash", ignoreCost: true, target: "self", type: "play" },
  trigger: { event: "play-spell", on: "controller" },
  type: "triggered",
} as const;
/** Gear: "If a friendly unit would die, instead heal it, exhaust it, and recall it." */
const SAFETY_NET = {
  abilities: [
    {
      replacement: {
        effects: [
          { amount: "all", target: { type: "trigger-source" }, type: "heal" },
          { target: { type: "trigger-source" }, type: "exhaust" },
          { target: { type: "trigger-source" }, type: "recall" },
        ],
        type: "sequence",
      },
      replaces: "die",
      target: { controller: "friendly", type: "unit" },
      type: "replacement",
    },
  ],
  cardType: "gear",
  name: "Safety Net",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokensOf(game: Game, owner = P1): string[] {
  return game.findAll({ owner }).filter((id) => game.state(id).isToken);
}

async function makeToken(game: Game, alias = "mk"): Promise<string> {
  const before = new Set(tokensOf(game));
  await game.p1.cast(alias);
  await game.settle();
  const fresh = tokensOf(game).filter((id) => !before.has(id));
  expect(fresh.length).toBe(1);
  return fresh[0] as string;
}

/** Total number of live objects the engine tracks for a player (all zones). */
function objectCount(game: Game, owner = P1): number {
  return game.findAll({ owner }).length;
}

/** Answer a play-effect's "choose a destination" prompt (if any) with base. */
async function landInBase(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.options.some((o) => o.key === "base")) {
    await game.seat(d.seat).answer("base");
    await game.settle();
  }
}

// ===========================================================================
// Tokens
// ===========================================================================

describe("Token characteristics: a Recruit token is a real unit with cost 0 and no domain (180-187.1, 439.4.a, 143.4)", () => {
  test("created in base: might 1, isToken, owner = controller = creator, enters EXHAUSTED, cost reads 0, no domains; a 'cost ≤ 2' kill can target it; leaves no card behind", async () => {
    const game = await scenario().hand(P1, MAKE_RECRUIT, "mk").hand(P1, CULL, "cull").build();
    const tok = await makeToken(game);
    const s = game.state(tok);
    expect(s.zone).toBe("base");
    expect(s.cardType).toBe("unit");
    expect(s.might).toBe(1);
    expect(s.isToken).toBe(true);
    expect(s.owner).toBe(P1);
    expect(s.controller).toBe(P1);
    expect(s.isExhausted).toBe(true); // 143.4 / 185.2.d
    expect(s.energyCost).toBe(0); // 185.3.a.1
    expect(s.domains).toEqual([]); // 185.3.b
    // 185.3.a.1: "cost 2 or less" predicates see cost 0.
    expect(game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options).toEqual([[tok]]);
    await game.p1.cast("cull", { targets: tok });
    await game.settle();
    expect(game.has(tok)).toBe(false);
    // Must NOT: the token is not counted as a card anywhere off-board (185).
    expect(game.p1.trash()).toEqual(["mk", "cull"]);
  });

  test("it IS a unit for unit counts ('draw 1 for each friendly unit' with one plain unit + the token draws 2)", async () => {
    const game = await scenario().unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P1, MAKE_RECRUIT, "mk").hand(P1, MUSTER_DRAW, "muster").build();
    await makeToken(game);
    const h = game.p1.hand().length; // muster only
    await game.p1.cast("muster");
    await game.settle();
    expect(game.p1.hand().length).toBe(h - 1 + 2);
  });

  test("it can take the standard move next turn and deals 1 in combat (kills a 1-Might defender)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Weak Defender" }, "D")
      .hand(P1, MAKE_RECRUIT, "mk")
      .build();
    const tok = await makeToken(game);
    expect(game.p1.can("standardMove")).toBe(false); // exhausted this turn
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(tok).isReady).toBe(true);
    await game.p1.move(tok, "bf1");
    await game.settle();
    // Token dealt 1 → D dead; D dealt 1 → token dead (and it then ceases to exist, 186.1).
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.has(tok)).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("187.1 — a Recruit token carries the Recruit TAG, so 'choose a Recruit' can target it (engine registers the token without tags)", async () => {
    // Expected: RALLY_RECRUIT (filter tag Recruit) offers the token as a legal target.
    // Actual: create-token registers { name, might } only — no tags — so the spell has no target.
    const game = await scenario().hand(P1, MAKE_RECRUIT, "mk").hand(P1, RALLY_RECRUIT, "rally").build();
    const tok = await makeToken(game);
    expect(game.p1.option("cast", "rally")?.fields.find((f) => f.arg === "targets")?.options).toEqual([[tok]]);
  });
});

describe("Token killed: death triggers fire, then the token ceases to exist — the trash gains no object (186.1, 428.1, 808.1.d)", () => {
  test("listener 'when another friendly unit dies' triggers on the token's death; hand +1; trash size unchanged; token exists nowhere; object count −1", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", LISTENER, "L")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "token-recruit-t")
      .hand(P2, PING, "ping")
      .build();
    expect(game.state("token-recruit-t").isToken).toBe(true);
    const trashBefore = game.p1.trash().length;
    const handBefore = game.p1.hand().length;
    const objectsBefore = objectCount(game);

    await game.p2.cast("ping", { targets: "token-recruit-t" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // The kill happened: L's trigger is on the chain (must NOT be skipped because "tokens don't go to trash").
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "L", controller: P1, triggered: true })]);
    // 186.1: the token already ceased to exist — not in trash, not anywhere.
    expect(game.has("token-recruit-t")).toBe(false);
    expect(game.p1.trash().length).toBe(trashBefore);
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(game.p1.trash().length).toBe(trashBefore);
    expect(game.findAll({ owner: P1, zone: "trash" })).not.toContain("token-recruit-t");
    expect(objectCount(game)).toBe(objectsBefore - 1);
  });
});

describe("A token with its own Deathknell still resolves the trigger after ceasing to exist (184.3, 808.1.d.2-3); a replaced death removes it (808.1.d.1)", () => {
  test("active kill (Kill instruction) on a Deathknell token: trigger pending before the move, token gone, trigger still resolves from last-known info → draw 1", async () => {
    const game = await scenario()
      .unit(P1, "base", { abilities: [DEATHKNELL_DRAW], might: 1, name: "Recruit" }, "token-recruit-dk")
      .hand(P1, KILL, "kill")
      .build();
    expect(game.state("token-recruit-dk").isToken).toBe(true);
    const h = game.p1.hand().length; // includes "kill"
    await game.p1.cast("kill", { targets: "token-recruit-dk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.has("token-recruit-dk")).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "token-recruit-dk", triggered: true })]);
    await game.settle();
    // Must NOT fizzle because the source no longer exists.
    expect(game.p1.hand().length).toBe(h - 1 + 1);
    expect(game.p1.trash()).toEqual(["kill"]);
  });

  test("contrast: the (lethal-damage) death is REPLACED by 'heal, exhaust, recall' → the token stays on the board (base is a board zone) and the Deathknell never resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .gear(P1, SAFETY_NET, "net")
      .unit(P1, "bf1", { abilities: [DEATHKNELL_DRAW], might: 1, name: "Recruit" }, "token-recruit-dk")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, PING, "ping")
      .build();
    const h = game.p1.hand().length;
    await game.p1.cast("ping", { targets: "token-recruit-dk" });
    await game.settle();
    expect(game.has("token-recruit-dk")).toBe(true);
    expect(game.zoneOf("token-recruit-dk")).toBe("base");
    expect(game.state("token-recruit-dk").isToken).toBe(true);
    expect(game.state("token-recruit-dk").isExhausted).toBe(true);
    expect(game.state("token-recruit-dk").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(h - 1); // no Deathknell draw
    expect(game.p1.trash()).toEqual(["ping"]);
  });

  test.failing("BUG: 428.1.a.1 / 808.1.d.1 — a Kill INSTRUCTION is also a 'would die' event, so the board replacement must apply to it too (engine only replaces lethal-damage deaths)", async () => {
    // Expected: KILL on the token is replaced → token recalled to base exhausted, no Deathknell draw.
    // Actual: the kill effect trashes the unit directly, bypassing board `die` replacements.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .gear(P1, SAFETY_NET, "net")
      .unit(P1, "bf1", { abilities: [DEATHKNELL_DRAW], might: 1, name: "Recruit" }, "token-recruit-dk")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, KILL, "kill")
      .build();
    const h = game.p1.hand().length;
    await game.p1.cast("kill", { targets: "token-recruit-dk" });
    await game.settle();
    expect(game.has("token-recruit-dk")).toBe(true);
    expect(game.zoneOf("token-recruit-dk")).toBe("base");
    expect(game.p1.hand().length).toBe(h - 1);
  });
});

describe("Token → hand / deck / banishment ceases to exist; token recalled or moved on the board survives with damage intact (186.1, 185.2.e, 458.1)", () => {
  test("(a) 'return a unit to its owner's hand' on a token: it leaves the board, hand size unchanged, exists nowhere; not a death (listener silent)", async () => {
    const game = await scenario().unit(P1, "base", LISTENER, "L").hand(P1, MAKE_RECRUIT, "mk").hand(P1, BOUNCE, "bounce").build();
    const tok = await makeToken(game);
    const h = game.p1.hand().length; // bounce
    await game.p1.cast("bounce", { targets: tok });
    await game.settle();
    expect(game.has(tok)).toBe(false);
    expect(game.p1.hand().length).toBe(h - 1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash()).toEqual(["mk", "bounce"]);
  });

  test("(b) 'recycle a unit' on a token: its OWNER (P1) is the one asked top/bottom — the Decision surfaces for P1", async () => {
    const game = await scenario().unit(P1, "base", LISTENER, "L").hand(P1, MAKE_RECRUIT, "mk").hand(P1, RECYCLE, "recycle").build();
    const tok = await makeToken(game);
    await game.p1.cast("recycle", { targets: tok });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["mainDeck-bottom", "mainDeck-top"]);
  });

  test.failing("BUG: 186.1 / 185.2.e — a token recycled into the Main Deck ceases to exist immediately: deck size unchanged, token nowhere (engine leaves the token object inside mainDeck)", async () => {
    // Expected: after the owner answers "bottom", the main deck has the same size and the token is gone.
    // Actual: the token id sits in mainDeck (deck +1) until some later cleanup.
    const game = await scenario().unit(P1, "base", LISTENER, "L").hand(P1, MAKE_RECRUIT, "mk").hand(P1, RECYCLE, "recycle").build();
    const tok = await makeToken(game);
    const deck = game.p1.deck().length;
    const h = game.p1.hand().length;
    await game.p1.cast("recycle", { targets: tok });
    await game.settle();
    await game.p1.answer("mainDeck-bottom");
    await game.settle();
    expect(game.p1.hand().length).toBe(h - 1); // listener silent — not a death
    expect(game.p1.deck()).not.toContain(tok);
    expect(game.p1.deck().length).toBe(deck);
    expect(game.has(tok)).toBe(false);
  });

  test("(c) 'banish a unit' on a token: banishment size unchanged, token exists nowhere, listener silent", async () => {
    const game = await scenario().unit(P1, "base", LISTENER, "L").hand(P1, MAKE_RECRUIT, "mk").hand(P1, BANISH, "banish").build();
    const tok = await makeToken(game);
    const h = game.p1.hand().length;
    await game.p1.cast("banish", { targets: tok });
    await game.settle();
    expect(game.has(tok)).toBe(false);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand().length).toBe(h - 1);
    expect(game.chain()).toEqual([]);
  });

  test("(d) 'recall a unit' on a damaged Mech token at a battlefield: now in base, STILL 1 damage, same object id, still a token", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mech" }, "token-mech-m", { damage: 1 })
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, RECALL, "recall")
      .build();
    expect(game.state("token-mech-m").isToken).toBe(true);
    await game.p1.cast("recall", { targets: "token-mech-m" });
    await game.settle();
    expect(game.has("token-mech-m")).toBe(true);
    expect(game.zoneOf("token-mech-m")).toBe("base");
    expect(game.state("token-mech-m").damage).toBe(1);
    expect(game.state("token-mech-m").isToken).toBe(true);
    expect(game.state("token-mech-m").might).toBe(3);
  });
});

describe("Simultaneous death (383.2.c.2): a listener that dies in the same cleanup as a token does not see the token die", () => {
  test("'deal 1 to all enemy units in a base' kills Listener and token together → P1 draws 0; L (a card) is in trash, the token is gone", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", LISTENER, "L")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "token-recruit-t")
      .hand(P2, BASE_SWEEP, "sweep")
      .build();
    const h = game.p1.hand().length;
    await game.p2.cast("sweep");
    await game.settle();
    expect(game.zoneOf("L")).toBe("trash");
    expect(game.has("token-recruit-t")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(h);
    expect(game.p1.trash()).toEqual(["L"]);
  });

  test("contrast: only the token is dealt damage → Listener draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", LISTENER, "L")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "token-recruit-t")
      .hand(P2, PING, "ping")
      .build();
    const h = game.p1.hand().length;
    await game.p2.cast("ping", { targets: "token-recruit-t" });
    await game.settle();
    expect(game.zoneOf("L")).toBe("base");
    expect(game.has("token-recruit-t")).toBe(false);
    expect(game.p1.hand().length).toBe(h + 1);
  });
});

// ===========================================================================
// Banishment
// ===========================================================================

function banishBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { abilities: [DEATHKNELL_DRAW], might: 4, name: "Doomed U" }, "U", { buffed: true, damage: 2 })
    .unit(P1, "base", LISTENER, "L")
    .hand(P2, GRANT_TANK, "tank")
    .hand(P2, BANISH, "banish");
}

describe("Banish from the board goes directly to Banishment: public, not a kill, no Deathknell (427.1, 427.2, 427.2.a, 108.6.e)", () => {
  test("banish-from-board: U lands in its OWNER's banishment, visible to both players; not via trash; Deathknell and the die-listener stay silent; empty bf1 becomes uncontrolled", async () => {
    const game = await banishBoard().build();
    await game.p2.cast("tank", { targets: "U" });
    await game.settle();
    expect(game.state("U").keywords).toContain("Tank");
    const h1 = game.p1.hand().length;
    const p1Trash = game.p1.trash().length;

    await game.p2.cast("banish", { targets: "U" });
    await game.settle();
    // 427.2: directly into (the owner's) Banishment.
    expect(game.zoneOf("U")).toBe("banishment");
    expect(game.state("U").owner).toBe(P1);
    expect(game.p1.banishment()).toEqual(["U"]);
    expect(game.p2.banishment()).toEqual([]);
    // 108.6.e: public — full identity in BOTH players' views.
    for (const viewer of [P1, P2]) {
      const seen = game.view(viewer).zones.banishment ?? [];
      const u = seen.find((c) => !isHiddenView(c) && c.id === "U");
      expect(u).toBeDefined();
      expect(seen.some((c) => isHiddenView(c))).toBe(false);
    }
    // 427.2.a: not a kill → no trash visit, no Deathknell, no listener draw.
    expect(game.p1.trash().length).toBe(p1Trash);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(h1);
    // U was P1's last unit at bf1 → uncontrolled after the cleanup.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test.failing("BUG: 124.1 / 705 — the banished card is a new object: 2 damage, the buff and the granted [Tank] must be wiped (engine keeps damage/buff on the card in banishment)", async () => {
    // Expected: U in banishment reads damage 0, not buffed, no granted keywords, might = printed 4.
    // Actual: damage 2 and buffed=true persist on the banished card.
    const game = await banishBoard().build();
    await game.p2.cast("tank", { targets: "U" });
    await game.settle();
    await game.p2.cast("banish", { targets: "U" });
    await game.settle();
    expect(game.zoneOf("U")).toBe("banishment");
    expect(game.state("U").damage).toBe(0);
    expect(game.state("U").isBuffed).toBe(false);
    expect(game.state("U").grantedKeywords).toEqual([]);
    expect(game.state("U").keywords).not.toContain("Tank");
    expect(game.state("U").might).toBe(4);
  });
});

describe("Banishment is inert (but not rules-'permanent'): trash-functioning abilities and other effects cannot reach it (108.6.c, 427.3, 427.3.a)", () => {
  test("the same 'play me from your trash when you play a spell' ability returns the TRASH copy but never the BANISHED copy; the banished card stays put across several turns and is never actionable", async () => {
    const riser = (name: string) => ({ abilities: [RISE_FROM_TRASH], energyCost: 2, might: 2, name });
    const game = await scenario()
      .banishment(P1, riser("Exiled C"), "C")
      .trash(P1, riser("Buried D"), "Dcard")
      .hand(P1, CANTRIP, "c1")
      .build();
    expect(game.zoneOf("C")).toBe("banishment");
    expect(game.zoneOf("Dcard")).toBe("trash");
    // Nothing on P1's menu references the banished card.
    expect(game.p1.legal().some((o) => o.card === "C" || o.key.includes("C:") || o.variants.some((v) => JSON.stringify(v.params).includes('"C"')))).toBe(false);

    await game.p1.cast("c1");
    await game.settle();
    await landInBase(game);
    // Positive: the trash card was reachable by its (trash-scoped) ability …
    expect(game.zoneOf("Dcard")).toBe("base");
    // … the banished one was not.
    expect(game.zoneOf("C")).toBe("banishment");
    expect(game.chain()).toEqual([]);

    // 427.3.a: remains in banishment indefinitely — no automatic return over turn ends.
    for (let i = 0; i < 4; i++) {
      await game.advanceTurn();
      expect(game.zoneOf("C")).toBe("banishment");
    }
    expect(game.p1.banishment()).toEqual(["C"]);
    expect(game.p1.legal().some((o) => o.card === "C")).toBe(false);
  });
});

// ===========================================================================
// Trash
// ===========================================================================

describe("Trash is public and unordered (108.2.c, 108.2.d)", () => {
  test("after 'discard 3' both players' views list the full identities of the three cards in P1's trash; P2's trash is likewise visible to P1", async () => {
    const game = await scenario()
      .hand(P1, { might: 1, name: "Card A" }, "A")
      .hand(P1, { might: 2, name: "Card B" }, "B")
      .hand(P1, { might: 3, name: "Card C" }, "Cc")
      .hand(P1, DISCARD_THREE, "d3")
      .trash(P2, { might: 4, name: "Their Junk" }, "junk")
      .build();
    await game.p1.cast("d3");
    await game.settle({ policy: "first" });
    // Answer any "choose which to discard" prompt with whatever is asked for.
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      await game.seat(d.seat).answer({ keys: d.options.slice(0, Math.max(1, d.min)).map((o) => o.key), kind: "pick" });
      await game.settle({ policy: "first" });
    }
    expect(game.p1.hand()).toEqual([]);
    expect(new Set(game.p1.trash())).toEqual(new Set(["A", "B", "Cc", "d3"]));
    for (const viewer of [P1, P2]) {
      const trashView = game.view(viewer).zones.trash ?? [];
      expect(trashView.some((c) => isHiddenView(c))).toBe(false);
      const mine = trashView.filter((c) => !isHiddenView(c) && c.owner === P1).map((c) => (isHiddenView(c) ? "?" : c.id));
      expect(new Set(mine)).toEqual(new Set(["A", "B", "Cc", "d3"]));
    }
    const p2TrashSeenByP1 = (game.view(P1).zones.trash ?? []).filter((c) => !isHiddenView(c) && c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
    expect(p2TrashSeenByP1).toEqual(["junk"]);
    // Zone-summary level: trash is flagged visible to the opponent, hand is not.
    const p2Sees = game.p2.listZones({ all: true });
    expect(p2Sees.find((z) => z.zone === "trash" && z.owner === P1)?.visible).toBe(true);
  });

  test("the engine models trash (and banishment) as UNORDERED public zones and the main deck as an ordered secret one — no top-of-trash invariant exists", async () => {
    const game = await scenario()
      .trash(P1, { might: 1, name: "Unit A" }, "A")
      .trash(P1, { might: 1, name: "Unit B" }, "B")
      .banishment(P1, { might: 1, name: "Unit X" }, "X")
      .build();
    const zones = getInternalState(game.engine).zones;
    expect(zones.trash?.config.ordered).toBe(false);
    expect(zones.trash?.config.visibility).toBe("public");
    expect(zones.banishment?.config.ordered).toBe(false);
    expect(zones.banishment?.config.visibility).toBe("public");
    // Contrast: the main deck IS ordered and not public.
    expect(zones.mainDeck?.config.ordered).toBe(true);
    expect(zones.mainDeck?.config.visibility).not.toBe("public");
  });

  test("permuting the order cards were trashed in yields the identical set of legal actions (nothing depends on trash order)", async () => {
    const build = (order: readonly string[]) => {
      const b = scenario().hand(P1, CANTRIP, "c1");
      for (const id of order) {
        b.trash(P1, { abilities: [RISE_FROM_TRASH], might: 1, name: `Unit ${id}` }, id);
      }
      return b.build();
    };
    const g1 = await build(["A", "B", "Cc"]);
    const g2 = await build(["Cc", "B", "A"]);
    const menu = (g: Game) => new Set(g.p1.legal().map((o) => o.key));
    expect(menu(g1)).toEqual(menu(g2));
    // All three trash-scoped abilities trigger regardless of which was trashed first.
    for (const g of [g1, g2]) {
      await g.p1.cast("c1");
      await g.settle();
      for (let i = 0; i < 6 && g.decision()?.kind === "pick"; i++) {
        await landInBase(g);
      }
      expect(new Set(g.p1.base())).toEqual(new Set(["A", "B", "Cc"]));
    }
  });
});

// ===========================================================================
// Object identity across zone changes
// ===========================================================================

describe("Board → trash → board is a NEW object: damage, buff, granted keywords, +Might this turn and exhaustion do not carry over (124, 124.1, 705, 747)", () => {
  test.failing("BUG: 124 / 124.1 / 705 — U (might 3): exhausted, 2 damage, buffed, +2 this turn, granted Tank → killed → played back from trash the same turn → must be a fresh unit: might exactly 3, 0 damage, no buff/Tank/+2 (engine brings it back with damage 2, buffed, Might 4+)", async () => {
    // Expected: the returned U reads might 3, damage 0, isBuffed false, no granted keywords, mightModifier 0.
    // Actual: the trash copy keeps damage/buff (and so does the re-played unit).
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { abilities: [RISE_FROM_TRASH], energyCost: 3, might: 3, name: "Subject U" }, "U", { buffed: true, damage: 2, exhausted: true })
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, PLUS_TWO, "plus2")
      .hand(P1, GRANT_TANK, "tank")
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("plus2", { targets: "U" });
    await game.settle();
    await game.p1.cast("tank", { targets: "U" });
    await game.settle();
    expect(game.state("U").might).toBe(3 + 1 + 2);
    expect(game.state("U").keywords).toContain("Tank");
    expect(game.state("U").damage).toBe(2);

    // KILL is itself a spell → once U is in the trash its trash-scoped ability plays it back.
    const energyBefore = game.p1.energy();
    await game.p1.cast("kill", { targets: "U" });
    await game.settle();
    await landInBase(game);
    expect(game.zoneOf("U")).toBe("base");
    expect(game.p1.energy()).toBe(energyBefore); // ignoring cost
    const s = game.state("U");
    expect(s.damage).toBe(0);
    expect(s.isBuffed).toBe(false);
    expect(s.grantedKeywords).toEqual([]);
    expect(s.keywords).not.toContain("Tank");
    expect(s.mightModifier).toBe(0);
    expect(s.might).toBe(3);
    expect(s.baseMight).toBe(3);
    expect(s.isExhausted).toBe(true); // 143.4 — enters exhausted as a (new) unit, not "because it was"
  });

  test.failing("BUG: 705 / 747 — a killed unit's Buff counter ceases to exist: the card in the trash is not buffed and reads its printed Might (engine keeps buffed=true in the trash)", async () => {
    // Expected: trash copy isBuffed false, might 3, damage 0. Actual: buffed=true / might 4 persist.
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Subject U" }, "U", { buffed: true, damage: 1 })
      .hand(P1, KILL, "kill")
      .build();
    expect(game.state("U").might).toBe(4);
    await game.p1.cast("kill", { targets: "U" });
    await game.settle();
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.state("U").damage).toBe(0);
    expect(game.state("U").isBuffed).toBe(false);
    expect(game.state("U").might).toBe(3);
  });
});

describe("Board → board (recall / move between battlefield and base) is NOT a new object: everything persists (124 negative control, 458.1, 142.2, 703)", () => {
  for (const [label, mover] of [
    ["recall a unit", RECALL],
    ["move a unit to base", MOVE_HOME],
  ] as const) {
    test(`'${label}': same id, damage 2, buff, +2 this turn, granted Tank and exhaustion all persist; damage clears only at end of turn`, async () => {
      const game = await scenario()
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 3, name: "Subject U" }, "U", { buffed: true, damage: 2, exhausted: true })
        .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
        .hand(P1, PLUS_TWO, "plus2")
        .hand(P1, GRANT_TANK, "tank")
        .hand(P1, mover, "mover")
        .build();
      await game.p1.cast("plus2", { targets: "U" });
      await game.settle();
      await game.p1.cast("tank", { targets: "U" });
      await game.settle();
      await game.p1.cast("mover", { targets: "U" });
      await game.settle();
      expect(game.has("U")).toBe(true);
      expect(game.zoneOf("U")).toBe("base");
      const s = game.state("U");
      expect(s.damage).toBe(2);
      expect(s.isBuffed).toBe(true);
      expect(s.might).toBe(3 + 1 + 2);
      expect(s.keywords).toContain("Tank");
      expect(s.grantedKeywords).toEqual([expect.objectContaining({ duration: "turn", keyword: "Tank" })]);
      expect(s.isExhausted).toBe(true);
      // End of turn: damage heals and "this turn" effects expire — the buff (a counter) stays.
      await game.advanceTurn();
      expect(game.state("U").damage).toBe(0);
      expect(game.state("U").might).toBe(3 + 1);
      expect(game.state("U").isBuffed).toBe(true);
      expect(game.state("U").keywords).not.toContain("Tank");
    });
  }
});

describe("Hand round-trip also resets: a bounced unit replayed pays full cost and remembers nothing; a champion loses its buff when it leaves play (124, 705, 705.1)", () => {
  test("U (cost 2, might 2) at bf1 with a buff and 1 damage → returned to hand → replayed the same turn for the FULL 2 energy: base, might 2, no buff, 0 damage, exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { energyCost: 2, might: 2, name: "Subject U" }, "U", { buffed: true, damage: 1 })
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, BOUNCE, "bounce")
      .build();
    expect(game.state("U").might).toBe(3);
    await game.p1.cast("bounce", { targets: "U" });
    await game.settle();
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.state("U").isBuffed).toBe(false);
    expect(game.state("U").damage).toBe(0);
    expect(game.p1.can("play", "U")).toBe(true);
    await game.p1.play("U", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // full cost paid
    expect(game.zoneOf("U")).toBe("base");
    const s = game.state("U");
    expect(s.might).toBe(2);
    expect(s.isBuffed).toBe(false);
    expect(s.damage).toBe(0);
    expect(s.isExhausted).toBe(true);
  });

  test("without the energy the bounced unit cannot be replayed for free (must NOT keep any 'already paid' memory)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { energyCost: 2, might: 2, name: "Subject U" }, "U")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, BOUNCE, "bounce")
      .build();
    await game.p1.cast("bounce", { targets: "U" });
    await game.settle();
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.p1.can("play", "U")).toBe(false);
  });

  test("a killed champion unit goes to the trash and is NOT returned to the Champion Zone by normal means (108.3.c)", async () => {
    const game = await scenario()
      .unit(P1, "base", { isChampion: true, might: 4, name: "Champ" }, "CH", { buffed: true })
      .hand(P1, KILL, "kill")
      .build();
    expect(game.state("CH").might).toBe(5);
    await game.p1.cast("kill", { targets: "CH" });
    await game.settle();
    expect(game.zoneOf("CH")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
  });

  test.failing("BUG: 705 / 705.1 — a buffed champion that leaves play loses its buff (engine keeps buffed=true on the trash copy)", async () => {
    // Expected: CH in trash isBuffed false, might 4. Actual: buffed persists (might 5).
    const game = await scenario()
      .unit(P1, "base", { isChampion: true, might: 4, name: "Champ" }, "CH", { buffed: true })
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("kill", { targets: "CH" });
    await game.settle();
    expect(game.zoneOf("CH")).toBe("trash");
    expect(game.state("CH").isBuffed).toBe(false);
    expect(game.state("CH").might).toBe(4);
  });
});

// ===========================================================================
// Facedown cards & tokens
// ===========================================================================

describe("A facedown card leaving the Facedown Zone is revealed and reset; a token can never be hidden (421.4, 124.1, 811.1.b, 186)", () => {
  test("losing control of bf1 trashes P1's facedown card there in the next cleanup: it is now face-up in the (public) trash for both players, Hidden status cleared", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .facedown(P1, "bf1", { energyCost: 1, keywords: ["Hidden"], might: 2, name: "Ambusher" }, "H")
      .build();
    expect(game.zoneOf("H")).toBe("facedown-bf1");
    expect(game.state("H").isHidden).toBe(true);
    // P2 cannot see its identity while facedown.
    const hiddenToP2 = (game.view(P2).zones["facedown-bf1"] ?? [])[0];
    expect(hiddenToP2 && isHiddenView(hiddenToP2)).toBe(true);

    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.state("H").isHidden).toBe(false);
    for (const viewer of [P1, P2]) {
      const seen = (game.view(viewer).zones.trash ?? []).find((c) => !isHiddenView(c) && c.id === "H");
      expect(seen).toBeDefined();
    }
    expect(game.p1.facedown("bf1")).toEqual([]);
    // Must NOT be playable "from hidden" any more (it is just a trash card now).
    expect(game.p1.legal().some((o) => o.card === "H")).toBe(false);
  });

  test("a token unit — even one printed with [Hidden] — is never offered a Hide action (Hide works only from hand / Champion Zone, where a token cannot exist)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, MAKE_HIDDEN_TOKEN, "mk")
      .hand(P1, { energyCost: 1, keywords: ["Hidden"], might: 2, name: "Real Ambusher" }, "realHidden")
      .build();
    // Control: a real Hidden card in hand CAN be hidden at bf1.
    expect(game.p1.can("hide", "realHidden")).toBe(true);
    const tok = await makeToken(game, "mk");
    expect(game.state(tok).keywords).toContain("Hidden");
    expect(game.p1.can("hide", tok)).toBe(false);
    expect(game.p1.legal().filter((o) => o.moveId === "hideCard").map((o) => o.card)).not.toContain(tok);
    expect((await game.p1.try((p) => p.hide(tok, "bf1"))).ok).toBe(false);
    expect(game.zoneOf(tok)).toBe("base");
  });
});
