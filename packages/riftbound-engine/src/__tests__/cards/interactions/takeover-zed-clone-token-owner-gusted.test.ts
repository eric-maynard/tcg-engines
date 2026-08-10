/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are there.
 *      Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Zed, Without a Sound (ven-112a-166) · Champion Unit · Chaos · 5 · 5 Might
 *     "When I conquer, play a 0 [Might] Shadow Clone unit token to your base.
 *      [Action] [1][chaos]: Move me and a Shadow Clone you control to each other's locations."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · "[Reaction] Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *
 * Rules: 477.1.a (take control, no zone change), 190.3.a / 344.2 / 469.1 (present under a non-controller →
 * Contested → Non-Combat Showdown → establish control = Conquer, +1), 383.4.c.2.a + 191.4.a (a unit's
 * conquer trigger is controlled by its CURRENT controller), 182 / 183 / 439.4 (a token's controller AND
 * owner = the controller of the ability that created it — the source's owner is irrelevant), 185.2.d (a
 * unit token is a unit), 317.1 + 455 / 456 / 458.1 (Ending Step: lose control, RECALL to its controller's
 * base — board→board, not a move, statuses kept; 124 does not apply), 056.2 (a card entering a player-owned
 * zone goes to its OWNER's), 186.1 (a token in a non-board zone ceases to exist), 427 / 428.2.a (a "kill" is
 * board → trash only — a bounce is not a death).
 *
 * Board (P1's turn): P2's Zed stands alone, EXHAUSTED and BUFFED, at bfZ (P2's). bfX is empty/uncontrolled.
 * P1: a 2-Might Grunt in base, Hostile Takeover in hand, exactly 5 + [rainbow]×2. P2: Gust in hand and a
 * 2-Might Mourner in base ("When a unit dies, draw 1" — a death listener).
 *
 * Question / expected:
 *   (a) HT on Zed → P1 controls him (owner P2), readied; nobody else there → Contested → non-combat showdown
 *       → P1 conquers bfZ, +1. Zed was present and his controller conquered → the trigger goes on the chain
 *       under P1; "your base" = P1's base; the Shadow Clone token is (owner P1, controller P1, P1's base).
 *   (b) End of turn: control reverts, Zed is recalled to P2's base — same object (still buffed), Zed =
 *       (P2, P2, P2.base). The Clone stays exactly where it is under P1.
 *   (c) P2's turn: "a Shadow Clone you control" — P2 controls none → the ability cannot do anything (never
 *       touches P1's Clone).
 *   (d) P1 later walks the Clone onto bfX; P2 Gusts it (0 ≤ 3): "its owner's hand" = P1's hand → as a token it
 *       ceases to exist (186.1); not a death — no "when a unit dies" draw, in nobody's trash or hand.
 *   (e) Contrast: P2 conquers with its own Zed → that Clone's owner is P2; P1's Gust routes it to P2's hand,
 *       where it likewise ceases to exist.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const ZED = "ven-112a-166";
const GUST = "ogn-169-298";

/** P2's death listener: 2 Might, "When a unit dies, draw 1." */
const MOURNER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "any-unit" }, type: "triggered" }],
  cardType: "unit",
  might: 2,
  name: "Mourner",
};

/** P1's turn. P2's exhausted, buffed Zed alone at bfZ; bfX open; P1 Grunt + HT; P2 Mourner + Gust. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bfZ", { controller: P2 })
    .battlefield("bfX", { controller: null })
    .unit(P2, "bfZ", ZED, "zed", { buffed: true, exhausted: true })
    .unit(P2, "base", MOURNER, "mourner")
    .unit(P1, "base", { might: 2, name: "P1 Grunt" }, "grunt")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P2, GUST, "gust");
}

/** All Shadow Clone tokens currently on the board (any side). */
function clonesOnBoard(game: Game): string[] {
  const spots = [...game.p1.base(), ...game.p2.base(), ...game.battlefields().flatMap((bf) => game.cardsAt(bf))];
  return spots.filter((id) => game.state(id).isToken && game.state(id).name === "Shadow Clone");
}

/** HT on Zed → spell resolves → Focus passed through the Non-Combat Showdown → P1 conquers; stops with Zed's trigger on the chain. */
async function conqueredWithStolenZed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "zed" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

/** …and the trigger resolved: returns the game plus the Clone token id. */
async function cloneMade(): Promise<{ game: Game; clone: string }> {
  const game = await conqueredWithStolenZed();
  const r = await game.settle();
  expect(r.reason).toBe("open");
  const clones = clonesOnBoard(game);
  expect(clones).toHaveLength(1);
  return { clone: clones[0] as string, game };
}

describe("Hostile Takeover × Zed, Without a Sound × Gust — who owns the stolen Zed's Shadow Clone", () => {
  // ── (a) the steal, the conquer, the trigger, the token ──────────────────────────────────────

  test("(a) HT resolves: P1 controls Zed (owner P2), READIED, still buffed, still at bfZ; bfZ is Contested by P1 and a Non-Combat Showdown opens with P1 holding Focus (477.1.a, 190.3.a, 344.2)", async () => {
    const game = await board().build();
    await game.p1.cast("ht", { targets: "zed" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("zed")).toMatchObject({ controller: P1, isBuffed: true, isReady: true, location: "bfZ", might: 6, owner: P2 });
    expect(game.gameState.battlefields.bfZ).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
  });

  test("(a) Focus passes → P1 establishes control = CONQUER (+1, 469.1); Zed's 'When I conquer' goes on the chain controlled by P1 — his current controller (383.4.c.2.a, 191.4.a)", async () => {
    const game = await conqueredWithStolenZed();
    expect(game.gameState.battlefields.bfZ).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bfZ"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zed", controller: P1, triggered: true })]);
  });

  test("(a) the trigger resolves into ONE 0-Might Shadow Clone token in P1's base ('your base' = the ability controller's), EXHAUSTED; its CONTROLLER is P1 (182) and its OWNER is P1 (183 / 439.4) — Zed's owner P2 is irrelevant", async () => {
    const { game, clone } = await cloneMade();
    expect(game.p1.base()).toContain(clone);
    expect(game.p2.base()).not.toContain(clone);
    expect(game.state(clone)).toMatchObject({ baseMight: 0, cardType: "unit", controller: P1, isExhausted: true, isToken: true, location: "base", might: 0, name: "Shadow Clone", owner: P1 });
    // Zed's triple right now: owner P2, controller P1, at bfZ.
    expect(game.state("zed")).toMatchObject({ controller: P1, location: "bfZ", owner: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) end of turn ─────────────────────────────────────────────────────────────────────────

  test("(b) end of P1's turn: P1 loses control and Zed is RECALLED to P2's base (455) — the SAME object: still buffed (458.1; no 124 reset), P2-owned and -controlled; bfZ is left empty and uncontrolled", async () => {
    const { game } = await cloneMade();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has("zed")).toBe(true);
    expect(game.state("zed")).toMatchObject({ controller: P2, damage: 0, isBuffed: true, location: "base", might: 6, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("zed");
    expect(game.p1.base()).not.toContain("zed");
    expect(game.cardsAt("bfZ")).toEqual([]);
    expect(game.gameState.battlefields.bfZ?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
  });

  test("(b) the Clone does NOT go back with him: it stays in P1's base, owned and controlled by P1 (nothing in HT returns objects created while P1 held Zed)", async () => {
    const { game, clone } = await cloneMade();
    await game.advanceTurn();
    expect(game.has(clone)).toBe(true);
    expect(game.state(clone)).toMatchObject({ controller: P1, location: "base", owner: P1 });
    expect(game.p1.base()).toContain(clone);
    expect(game.p2.base().sort()).toEqual(["mourner", "zed"]);
    expect(clonesOnBoard(game)).toEqual([clone]);
  });

  // ── (c) P2's turn: the swap has no Shadow Clone P2 controls ─────────────────────────────────

  test("(c) on P2's turn, with [1][chaos] in pool, Zed's swap finds no 'Shadow Clone YOU control': it is either not activatable or resolves doing nothing — P1's Clone is never offered or moved, Zed stays in P2's base", async () => {
    const { game, clone } = await cloneMade();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 1, power: { chaos: 1 } });
    if (game.p2.can("activate", "zed")) {
      await game.p2.activate("zed");
      const d = game.decision();
      if (d?.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain(clone); // an enemy Clone is not "one you control"
      }
      await game.settle();
    }
    expect(game.state("zed")).toMatchObject({ controller: P2, location: "base" });
    expect(game.state(clone)).toMatchObject({ controller: P1, location: "base", owner: P1 });
    expect(game.p1.base()).toContain(clone);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (d) P2 Gusts P1's Clone at a battlefield ────────────────────────────────────────────────

  /** Through P2's turn to P1's next: the (now ready) Clone walks onto open bfX; P1 passes Focus so P2 may react. */
  async function cloneAtBfXWithP2Focus(): Promise<{ game: Game; clone: string }> {
    const { game, clone } = await cloneMade();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1; the Clone readied at Awaken
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(clone).isReady).toBe(true);
    await game.p1.move(clone, "bfX");
    expect(game.locationOf(clone)).toBe("bfX");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.tapRune(); // 1 energy for Gust from a rune P2 channeled on its own turn
    return { clone, game };
  }

  test("(d) the 0-Might Clone at bfX is a legal Gust target for P2 (≤ 3, at a battlefield); Gust is cast for 1 and resolves", async () => {
    const { game, clone } = await cloneAtBfXWithP2Focus();
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain(clone);
    await game.p2.cast("gust", { targets: clone });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2, targets: [clone] })]);
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("(d) 'return to its OWNER's hand' = P1's hand (183, 056.2) — and a token in a hand ceases to exist at once (186.1): the Clone is GONE, in neither hand, neither trash, not on the board", async () => {
    const { game, clone } = await cloneAtBfXWithP2Focus();
    const p1Hand = game.p1.hand();
    const p2Hand = game.p2.hand();
    await game.p2.cast("gust", { targets: clone });
    await game.settle();
    expect(game.has(clone)).toBe(false);
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.p1.hand()).toEqual(p1Hand); // it never becomes a card in P1's hand …
    expect(game.p2.hand()).toEqual(p2Hand.filter((c) => c !== "gust")); // … and certainly not in P2's
    expect(game.p1.trash()).toEqual(["ht"]);
    expect(game.p2.trash()).toEqual(["gust"]);
    expect(game.cardsAt("bfX")).toEqual([]);
    expect(clonesOnBoard(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) it was not KILLED (428.2.a: no board → trash): P2's 'When a unit dies, draw 1' Mourner stays silent, nothing goes on the chain; bfX just closes uncontrolled", async () => {
    const { game, clone } = await cloneAtBfXWithP2Focus();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("gust", { targets: clone });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // −Gust, no Mourner draw
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bfX?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1); // no conquer of bfX either — nobody remained
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d) control: the Mourner DOES draw when a unit really dies (so its silence above is meaningful) — P1's Grunt attacks Zed at bfZ and dies", async () => {
    const game = await board().unit(P2, "bfZ", { might: 1, name: "leave-zed-company" }, "pal").build();
    // Plain combat death on P1's turn: Grunt (2) walks into bfZ held by exhausted Zed (6) + pal → Grunt dies.
    const p2Hand = game.p2.hand().length;
    await game.p1.move("grunt", "bfZ");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });

  // ── (e) contrast: P2's own conquer → P2-owned Clone → Gust sends it to P2's hand ────────────

  test("(e) contrast: P2 conquers bfZ with its OWN Zed → that Clone is (owner P2, controller P2, P2's base); P2 swaps it onto bfZ; on P1's turn P1's Gust returns it to P2's (its owner's) hand where it ceases to exist — never P1's hand", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } }) // Zed's [1][chaos] swap after the conquer
      .battlefield("bfZ", { controller: null })
      .unit(P2, "base", ZED, "zed")
      .unit(P1, "base", { might: 2, name: "P1 Grunt" }, "grunt")
      .hand(P1, GUST, "gust")
      .build();
    // P2's Zed walks onto open bfZ → Non-Combat Showdown → P2 conquers → trigger → Clone in P2's base.
    await game.p2.move("zed", "bfZ");
    let r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bfZ?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    const clones = clonesOnBoard(game);
    expect(clones).toHaveLength(1);
    const clone = clones[0] as string;
    expect(game.state(clone)).toMatchObject({ controller: P2, isToken: true, location: "base", might: 0, owner: P2 });
    expect(game.p2.base()).toContain(clone);
    // Positive control for (c): P2 DOES control a Shadow Clone now → the swap works: Zed ↔ Clone.
    expect(game.p2.can("activate", "zed")).toBe(true);
    await game.p2.activate("zed");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick(clone);
    }
    r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.locationOf("zed")).toBe("base");
    expect(game.locationOf(clone)).toBe("bfZ");
    expect(game.gameState.battlefields.bfZ?.controller).toBe(P2);
    // P1's turn: tap a rune for Gust's [1] and bounce the Clone.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRune();
    const p1Hand = game.p1.hand();
    const p2Hand = game.p2.hand();
    await game.p1.cast("gust", { targets: clone });
    await game.settle();
    expect(game.has(clone)).toBe(false);
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.p2.hand()).toEqual(p2Hand); // routed to P2's hand → ceased; nothing added
    expect(game.p1.hand()).toEqual(p1Hand.filter((c) => c !== "gust"));
    expect(game.p1.trash()).toEqual(["gust"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.cardsAt("bfZ")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
