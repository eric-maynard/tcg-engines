/**
 * Interaction: Undying Legion (unl-025-219) · Unit · Fury · 3 · 3 Might
 *     "[Legion] > You may play me from your trash for [3][fury]."
 *   × Deathgrip (sfd-163-221) · Spell · Order · 2 · Reaction
 *     "Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit
 *      this turn. Draw 1."
 *
 * Rules: 366.1 (a non-board passive self-describes its zone — Undying Legion is the rulebook's own
 * example: the permission applies only while it is IN THE TRASH), 812.1.b.1 / 812.1.c (Legion is
 * Active once a DIFFERENT card has been Finalized by you this turn), 419.4.b (a finalized Reaction
 * counts as "played"), 356.1.a ("play me for [cost]" replaces the base cost), 124 / 124.1 (board →
 * trash and trash → board each make a NEW object: damage, buffs and modifiers are gone), 143.4
 * (units enter exhausted), 310.1.a / 419.2 (a unit is played only on your turn in an Open state —
 * the permission substitutes zone + cost, not timing), 365.1.
 *
 * Question:
 *   (a) P1's main phase, nothing played yet. Buffed, damaged Undying Legion + another unit on P1's
 *       board. P1 Deathgrips the Legion. Right after the chain empties, is "play Undying Legion from
 *       trash for [3][fury]" legal (permission registered on board→trash AND Legion satisfied by
 *       Deathgrip itself)? What does the replayed copy look like?
 *   (b) Same kill on P2's turn (Deathgrip in response): replay that turn? At the start of P1's next
 *       turn before playing anything? After P1 plays any card that turn?
 *   (c) Undying Legion in HAND with Legion on: does the [3][fury] / trash text matter?
 *   (d) On the BOARD with Legion on: is any "play me from trash" action surfaced? When exactly does
 *       it appear / disappear?
 * Expected: (a) yes — UL dies → trash (new object: 3 Might, no damage, unbuffed), Heir +4 this turn,
 * P1 draws 1, Deathgrip → trash; the trash play is legal at once, costs exactly [3][fury], enters
 * base exhausted / unbuffed / undamaged and the permission is gone once it leaves the trash.
 * (b) not on P2's turn; not at the start of P1's turn with nothing played; yes after any card.
 * (c) hand copy = plain 3-energy unit, no fury. (d) never for a board/hand copy; appears exactly on
 * board→trash (and discard→trash), disappears on trash→board.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNDYING_LEGION = "unl-025-219";
const DEATHGRIP = "sfd-163-221";
const CHEAP = { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Cheap Recruit" } as const;
/** A vanilla 1-cost P2 spell for P1 to respond to on P2's turn. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Ponder",
  timing: "action",
} as const;

/**
 * P1: buffed (+1) Undying Legion with 1 damage and a 2-Might Heir in base, Deathgrip in hand,
 * 5 energy + 1 fury (2 for Deathgrip, [3][fury] for the replay). bf1 is P1's (empty).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", UNDYING_LEGION, "ul", { buffed: true, damage: 1 })
    .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, DEATHGRIP, "dg");
}

/** Cast Deathgrip on `victim`, naming Heir for the +Might, and let the chain empty. */
async function deathgrip(game: Game, victim = "ul"): Promise<void> {
  await game.p1.cast("dg", { answers: ["heir"], targets: victim });
  await game.settle();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("heir");
    await game.settle();
  }
}

/** Every action option of P1's that names `card`. */
const optionsFor = (game: Game, card: string) => game.p1.legal().filter((o) => o.card === card);

describe("Undying Legion × Deathgrip — kill it yourself, replay it from the trash at once", () => {
  // ── (a) P1's turn: Deathgrip → immediate trash replay ───────────────────────────────────────

  test("(a) setup sanity: on the board UL is 4 Might (3 + buff) with 1 damage; nothing played yet; no trash-play option exists for the on-board copy", async () => {
    const game = await board().build();
    expect(game.state("ul")).toMatchObject({ damage: 1, isBuffed: true, might: 4, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    // The only thing P1 can do with "ul" on the board is move it — no play / playFrom option.
    expect(optionsFor(game, "ul").map((o) => o.verb)).toEqual([]);
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.can("playFrom", "ul")).toBe(false);
  });

  test("(a) Deathgrip resolves: UL → P1's trash, Heir gets +4 (the victim's buffed Might) this turn, P1 draws 1, Deathgrip → trash, chain empty, P1 back in an open main phase", async () => {
    const game = await board().build();
    const deck = game.p1.deck().length;
    await game.p1.cast("dg", { answers: ["heir"], targets: "ul" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", targets: ["ul"], triggered: false })]);
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("heir");
      await game.settle();
    }
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.state("heir").might).toBe(6); // 2 + (3 printed + 1 buff)
    expect(game.p1.hand()).toHaveLength(1); // Deathgrip spent, drew 1
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // Deathgrip itself (419.4.b)
  });

  test("(a) the trashed UL is a NEW object (124/124.1): printed 3 Might, no damage, not buffed, no modifiers", async () => {
    const game = await board().build();
    await deathgrip(game);
    expect(game.state("ul")).toMatchObject({ baseMight: 3, damage: 0, isBuffed: false, might: 3, mightModifier: 0, zone: "trash" });
  });

  test("(a) immediately after the chain empties, 'play Undying Legion from trash' IS a legal action — the permission registered on board→trash and Legion is satisfied by Deathgrip itself (366.1, 812.1.c)", async () => {
    const game = await board().build();
    await deathgrip(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("play", "ul")).toBe(true);
    const opts = optionsFor(game, "ul");
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ moveId: "playUnit", verb: "play" });
    expect(opts[0]?.fields.find((f) => f.arg === "to")?.options).toContain("base");
  });

  test("(a) the replay pays exactly the alternative cost [3][fury] (356.1.a): 3 energy + 1 fury → 0 / 0", async () => {
    const game = await board().build();
    await deathgrip(game);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    await game.p1.play("ul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(a) Legion on but the [fury] pip missing (or only 2 energy) → the trash play is NOT offered: the alt cost is [3][fury], not [3]", async () => {
    const noFury = await board().resources(P1, { energy: 5, power: { fury: 0 } }).build();
    await deathgrip(noFury);
    expect(noFury.p1.energy()).toBe(3);
    expect(noFury.p1.power("fury")).toBe(0);
    expect(noFury.p1.can("play", "ul")).toBe(false);
    const short = await board().resources(P1, { energy: 4, power: { fury: 1 } }).build();
    await deathgrip(short);
    expect(short.p1.energy()).toBe(2);
    expect(short.p1.can("play", "ul")).toBe(false);
  });

  test("(a) the replayed copy: trash → base, enters EXHAUSTED (143.4), 3 Might, undamaged, unbuffed — again a new object; trash now holds only Deathgrip; counts as a 2nd card played", async () => {
    const game = await board().build();
    await deathgrip(game);
    await game.p1.play("ul", { to: "base" });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.state("ul")).toMatchObject({ baseMight: 3, damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.p1.trash()).toEqual(["dg"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    // Heir keeps its +4 for the turn regardless.
    expect(game.state("heir").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("(a) once UL has left the trash the permission deregisters: no play/playFrom option names the on-board copy any more", async () => {
    const game = await board().build();
    await deathgrip(game);
    expect(optionsFor(game, "ul")).toHaveLength(1);
    await game.p1.play("ul", { to: "base" });
    await game.settle();
    expect(optionsFor(game, "ul")).toEqual([]);
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.can("playFrom", "ul")).toBe(false);
  });

  test("(a) 'this turn': at P1's next turn Heir is back to 2 and the replayed UL (still on the board) readies normally", async () => {
    const game = await board().build();
    await deathgrip(game);
    await game.p1.play("ul", { to: "base" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("heir").might).toBe(2);
    await game.advanceTurn(); // → P1
    expect(game.state("ul")).toMatchObject({ isReady: true, might: 3, zone: "base" });
  });

  // ── (b) the kill happens on P2's turn ───────────────────────────────────────────────────────

  /** P2's turn; P2 casts a cantrip, P1 responds with Deathgrip on UL; chain empties. */
  async function killedOnP2sTurn(): Promise<Game> {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 1 })
      .hand(P2, PONDER, "ponder")
      .hand(P1, CHEAP, "cheap")
      .build();
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dg")).toBe(true); // Reaction with priority on the opponent's turn
    await game.p1.cast("dg", { answers: ["heir"], targets: "ul" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder", "dg"]);
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("heir");
      await game.settle();
    }
    return game;
  }

  test("(b) on P2's turn: Deathgrip (a Reaction, in response) kills UL → trash, Heir +4, P1 drew — but P1 has NO 'play UL from trash' action: a unit is played at unit timing (310.1.a/419.2), even with [3][fury] in pool", async () => {
    const game = await killedOnP2sTurn();
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.state("heir").might).toBe(6);
    expect(game.p1.hand()).toContain("cheap");
    expect(game.p1.hand()).toHaveLength(2); // cheap + the drawn card
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // could afford [3][fury]
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.can("playFrom", "ul")).toBe(false);
    expect(optionsFor(game, "ul")).toEqual([]);
    const r = await game.p1.try((p) => p.play("ul", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ul")).toBe("trash");
  });

  test("(b) start of P1's NEXT turn, resources available, nothing played yet: the trash play is NOT offered — Legion is inactive (no other card finalized THIS turn, 812.1.c)", async () => {
    const game = await killedOnP2sTurn();
    await game.advanceTurn(); // P2 ends → P1's turn 3 main phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    await game.p1.do("addResources", { energy: 5, power: { fury: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.state("heir").might).toBe(2); // last turn's +4 has expired
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(optionsFor(game, "ul")).toEqual([]);
    // The ordinary hand play is of course available.
    expect(game.p1.can("play", "cheap")).toBe(true);
  });

  test("(b) …after P1 finalizes ANY card that turn (a 1-cost unit), the trash play IS offered and resolves for [3][fury] into base, exhausted", async () => {
    const game = await killedOnP2sTurn();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 5, power: { fury: 1 } });
    const before = game.p1.resources();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: before.energy - 1, power: before.power });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("play", "ul")).toBe(true);
    expect(optionsFor(game, "ul").map((o) => o.moveId)).toEqual(["playUnit"]);
    await game.p1.play("ul", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: before.energy - 4, power: { ...before.power, fury: (before.power.fury ?? 0) - 1 } });
    await game.settle();
    expect(game.state("ul")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3, zone: "base" });
    expect(optionsFor(game, "ul")).toEqual([]);
  });

  test("(b) tapping runes at the start of that turn is not 'playing a card' — still not offered until a card is finalized", async () => {
    const game = await killedOnP2sTurn();
    await game.advanceTurn(); // P1 channels 2 runes at turn start
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    const ready = game.p1.runes({ ready: true }).length;
    expect(ready).toBeGreaterThanOrEqual(2);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "ul")).toBe(false);
  });

  // ── (c) the HAND copy ───────────────────────────────────────────────────────────────────────

  test("(c) in HAND with Legion on, UL is a plain 3-energy unit: ONE play option (no alt-cost variant), pays 3 energy and NO fury, enters base exhausted (366.1 — the trash text confers nothing in hand)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .hand(P1, UNDYING_LEGION, "ulHand")
      .hand(P1, CHEAP, "cheap")
      .build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // Legion condition met
    const opts = optionsFor(game, "ulHand");
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ moveId: "playUnit", variantCount: 1 });
    expect(opts[0]?.fields.map((f) => f.arg)).toEqual(["to"]); // no cost / alternative field
    await game.p1.play("ulHand", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // 3 energy, fury untouched
    await game.settle();
    expect(game.state("ulHand")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) the hand copy gets no discount from the trash text: with 2 energy + 3 fury (enough for nothing but '[3][fury]−ish' thinking) it is NOT playable; with 3 energy + 0 fury it IS", async () => {
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 3 } }).hand(P1, UNDYING_LEGION, "ulHand").hand(P1, CHEAP, "cheap").build();
    await poor.p1.play("cheap", { to: "base" }); // 3 → 2 energy, Legion on
    await poor.settle();
    expect(poor.p1.can("play", "ulHand")).toBe(false);
    const fine = await scenario().resources(P1, { energy: 4 }).hand(P1, UNDYING_LEGION, "ulHand").hand(P1, CHEAP, "cheap").build();
    await fine.p1.play("cheap", { to: "base" }); // 4 → 3, no fury at all
    await fine.settle();
    expect(fine.p1.can("play", "ulHand")).toBe(true);
  });

  // ── (d) where the permission lives ──────────────────────────────────────────────────────────

  test("(d) on the BOARD with Legion satisfied: no play / playFrom action is surfaced for the on-board copy (its self-described zone is the trash, 366.1)", async () => {
    const game = await board().hand(P1, CHEAP, "cheap").build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.zoneOf("ul")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } }); // could afford [3][fury]
    expect(optionsFor(game, "ul")).toEqual([]);
    expect(game.p1.can("play", "ul")).toBe(false);
    expect(game.p1.can("playFrom", "ul")).toBe(false);
  });

  test("(d) the action appears exactly at the board→trash transition (Deathgrip kill) and drops again at trash→board (the replay)", async () => {
    const game = await board().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CHEAP, "cheap").build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(optionsFor(game, "ul")).toEqual([]); // on board: nothing
    await deathgrip(game);
    expect(game.zoneOf("ul")).toBe("trash");
    expect(optionsFor(game, "ul").map((o) => o.moveId)).toEqual(["playUnit"]); // in trash: offered
    await game.p1.play("ul", { to: "base" });
    await game.settle();
    expect(game.zoneOf("ul")).toBe("base");
    expect(optionsFor(game, "ul")).toEqual([]); // back on board: gone
  });

  test("(d) it also registers on a DISCARD into the trash (hand → trash), not only on a death — with Legion on the discarded copy is playable for [3][fury]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .hand(P1, UNDYING_LEGION, "ulHand")
      .hand(P1, CHEAP, "cheap")
      .build();
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    await game.p1.do("discardCard", { cardId: "ulHand" });
    expect(game.zoneOf("ulHand")).toBe("trash");
    expect(game.p1.can("play", "ulHand")).toBe(true);
    await game.p1.play("ulHand", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("ulHand")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
  });

  test("(d) a discarded copy with Legion OFF (nothing else played this turn) just sits in the trash — the permission exists but is inactive", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, UNDYING_LEGION, "ulHand").build();
    await game.p1.do("discardCard", { cardId: "ulHand" });
    expect(game.zoneOf("ulHand")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0); // discarding is not playing
    expect(game.p1.can("play", "ulHand")).toBe(false);
    expect(optionsFor(game, "ulHand")).toEqual([]);
  });

  test("(d) an on-board copy is not a legal Deathgrip-then-replay for the OPPONENT: P2 never gets a play option on P1's trashed UL", async () => {
    const game = await board().resources(P2, { energy: 5, power: { fury: 1 } }).hand(P2, CHEAP, "p2cheap").build();
    await deathgrip(game);
    await game.advanceTurn(); // → P2's turn
    await game.p2.do("addResources", { energy: 5, power: { fury: 1 } });
    await game.p2.play("p2cheap", { to: "base" }); // P2 has "played another card"
    await game.settle();
    expect(game.zoneOf("ul")).toBe("trash");
    expect(game.p2.legal().filter((o) => o.card === "ul")).toEqual([]);
    expect(game.p2.can("play", "ul")).toBe(false);
  });
});
