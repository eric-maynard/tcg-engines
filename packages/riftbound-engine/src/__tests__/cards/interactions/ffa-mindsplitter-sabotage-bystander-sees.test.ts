/**
 * Interaction (3-player FFA — who SEES a hand reveal, and where the picked card ends up):
 *   Mindsplitter (ogn-192-298) · Unit · Chaos · 7 + [chaos][chaos] · 7 Might
 *     "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard that card."
 *   × Sabotage (ogn-156-298) · Spell · Body · 1 + [body] · Action
 *     "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."
 *   × Consult the Past (ogn-083-298) · Spell · Mind · 4 · [Hidden] [Reaction] "Draw 2."  — facedown at P3's battlefield
 *
 * Rules: 424.1 (revealing presents the cards to ALL players — Sabotage 3-player ruling), 424.1.a.3 (until the
 * revealing effect finishes), 424.3.a (the whole current hand), 128.2.a / 128.4 (afterwards the hand is Private
 * again; other hands untouched), 108.2.d (trash is Public), 416 / 108.4.d / 128.3 (recycle → bottom of the Main
 * Deck, whose contents/order are Secret to everyone), 422.1 (discard), 651.1–651.3 / 652.1 / 652.3 (a conceding
 * player is removed while the game continues: banish their permanents / facedown cards, remove their cards),
 * 421.4 (a facedown card that changes zones is revealed by its owner to all players).
 *
 * Question — P1's turn; P2's hand = {unit U, gear G}; P3's hand = {X, Y, Z}; P3 has Consult the Past facedown at bf3.
 *  (a) Mindsplitter: the choose-opponent prompt offers {P2, P3}. Naming P3: during the pick the BYSTANDER P2's view
 *      lists X/Y/Z by id+name (attributed to P3); P1's and P2's hands stay private. P1 picks X → X is public in P3's
 *      trash in all three views from then on; Y/Z are anonymous again to P1 and P2 once the ability finishes.
 *  (b) Sabotage naming P2: P2 reveals {U, G} to all three seats; only G is a legal (mandatory) pick; G is recycled →
 *      no seat's view (P2's included) lists G anywhere, only P2's deck count rose — the opposite end state of (a).
 *  (c) P3 concedes, game continues: P3's facedown Consult the Past is banished (652.1) and thereby revealed to P1 and
 *      P2 (421.4) — before that neither could see it; P3's cards are then removed (652.3); P3 takes no more turns.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, SPECTATOR, scenario } from "../../../harness";

const MINDSPLITTER = "ogn-192-298";
const SABOTAGE = "ogn-156-298";
const CONSULT_THE_PAST = "ogn-083-298";

// Distinctive names so substring searches over serialized views are reliable leak detectors.
const CARD_X = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Xray Xenolith", timing: "action" } as const;
const CARD_Y = { abilities: [], cardType: "spell", domain: "fury", energyCost: 9, name: "Yankee Yowler", timing: "action" } as const;
const CARD_Z = { abilities: [], cardType: "unit", domain: "fury", energyCost: 9, might: 2, name: "Zulu Zealot" } as const;
const UNIT_U = { abilities: [], cardType: "unit", domain: "fury", energyCost: 9, might: 2, name: "Uniform Usher" } as const;
const GEAR_G = { abilities: [], cardType: "gear", domain: "fury", energyCost: 9, name: "Golf Gadget" } as const;
const P1_SECRET = { abilities: [], cardType: "spell", domain: "calm", energyCost: 9, name: "Omega Secret", timing: "action" } as const;

type Seat = typeof P1;
type Viewer = Seat | typeof SPECTATOR;

/** P1's turn 2 in a 3-player FFA. P3 controls bf3 (unit there) with Consult the Past facedown at it. */
function board() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 8, power: { body: 1, chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf3", { controller: P3 })
    .unit(P3, "bf3", { might: 2, name: "P3 Guard" }, "p3guard")
    .facedown(P3, "bf3", CONSULT_THE_PAST, "ctp")
    .hand(P1, MINDSPLITTER, "ms")
    .hand(P1, SABOTAGE, "sab")
    .hand(P1, P1_SECRET, "p1sec")
    .hand(P2, UNIT_U, "uU")
    .hand(P2, GEAR_G, "gG")
    .hand(P3, CARD_X, "xX")
    .hand(P3, CARD_Y, "yY")
    .hand(P3, CARD_Z, "zZ");
}

/** `owner`'s hand as `viewer` sees it: "id:name", or "hidden". */
function handAsSeenBy(game: Game, viewer: Viewer, owner: Seat): string[] {
  return (game.view(viewer).zones.hand ?? []).filter((c) => c.owner === owner).map((c) => ("id" in c ? `${c.id}:${c.name}` : "hidden"));
}

function zoneAsSeenBy(game: Game, viewer: Viewer, zone: string, owner: Seat): string[] {
  return (game.view(viewer).zones[zone] ?? []).filter((c) => c.owner === owner).map((c) => ("id" in c ? `${c.id}:${c.name}` : "hidden"));
}

function publicReveals(game: Game): { playerId: string; cardIds: readonly string[] }[] {
  return [...(game.gameState.publicReveals ?? [])];
}

/** Pass chain priority for every seat until nobody holds it (never passes Focus). */
async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 9; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

/** The seats a pending "choose a player/opponent" prompt offers P1 right now (undefined when no such prompt is open). */
function opponentPromptSeats(game: Game): string[] | undefined {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.seatRef !== undefined)) {
    return d.options.map((o) => o.seatRef ?? o.key).sort();
  }
  return undefined;
}

/** Answer a pending choose-opponent prompt with `seat` (no-op when the engine did not ask). */
async function nameOpponentIfAsked(game: Game, seat: Seat): Promise<boolean> {
  if (opponentPromptSeats(game) === undefined) {
    return false;
  }
  await game.p1.answer({ keys: [seat], kind: "pick" });
  return true;
}

/** Play Mindsplitter to base naming `victim`, let the trigger resolve down to P1's reveal-and-pick. */
async function mindsplitterOn(game: Game, victim: Seat): Promise<void> {
  await game.p1.play("ms", { to: "base" });
  await nameOpponentIfAsked(game, victim);
  await passAll(game);
  await nameOpponentIfAsked(game, victim);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
}

/** Cast Sabotage naming `victim`, everyone passes → P1's reveal-and-pick. */
async function sabotageOn(game: Game, victim: Seat): Promise<void> {
  await game.p1.cast("sab");
  await nameOpponentIfAsked(game, victim);
  await passAll(game);
  await nameOpponentIfAsked(game, victim);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
}

describe("(a) Mindsplitter in FFA — the reveal is to ALL players, the discard is public forever, the rest re-hides", () => {
  // Mindsplitter text / 402.2: with two opponents P1 is offered {P2, P3} and names one before the hand is revealed.
  test("playing Mindsplitter with two opponents surfaces a choose-opponent prompt to P1 offering exactly {P2, P3} (players are public info)", async () => {
    const game = await board().build();
    await game.p1.play("ms", { to: "base" });
    let offered = opponentPromptSeats(game);
    if (offered === undefined) {
      await passAll(game);
      offered = opponentPromptSeats(game);
    }
    expect(offered).toEqual([P2, P3]);
  });

  test("P1 names P3 → during the pick the BYSTANDER P2's view lists X/Y/Z by id + name, the record attributes them to P3, and P1's / P2's hands stay private to everyone else (424.1, 128.4)", async () => {
    const game = await board().build();
    await mindsplitterOn(game, P3);
    const xyz = ["xX:Xray Xenolith", "yY:Yankee Yowler", "zZ:Zulu Zealot"];
    expect(handAsSeenBy(game, P2, P3).sort()).toEqual(xyz);
    expect(handAsSeenBy(game, P1, P3).sort()).toEqual(xyz);
    expect(publicReveals(game).at(-1)).toMatchObject({ cardIds: ["xX", "yY", "zZ"], playerId: P3 });
    expect(handAsSeenBy(game, P3, P1)).toEqual(["hidden", "hidden"]);
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden", "hidden"]);
    expect(handAsSeenBy(game, P3, P2)).toEqual(["hidden", "hidden"]);
    await game.p1.pick("xX");
    await game.settle();
    for (const viewer of [P1, P2, P3] as const) {
      expect(zoneAsSeenBy(game, viewer, "trash", P3)).toEqual(["xX:Xray Xenolith"]);
    }
    expect(handAsSeenBy(game, P1, P3)).toEqual(["hidden", "hidden"]);
    expect(handAsSeenBy(game, P2, P3)).toEqual(["hidden", "hidden"]);
  });

  test("P1 names P2 instead: the uninvolved P3's view names U/G by id + name during P1's pick exactly as P1's does; the record attributes {U, G} to P2; P2 sees only a summary of P1's decision", async () => {
    const game = await board().build();
    await mindsplitterOn(game, P2);
    const ug = ["gG:Golf Gadget", "uU:Uniform Usher"];
    expect(handAsSeenBy(game, P3, P2).sort()).toEqual(ug); // bystander
    expect(handAsSeenBy(game, P1, P2).sort()).toEqual(ug); // chooser
    expect(handAsSeenBy(game, SPECTATOR, P2).sort()).toEqual(ug);
    expect(publicReveals(game)).toEqual([expect.objectContaining({ cardIds: ["uU", "gG"], playerId: P2 })]);
    expect([...(game.gameState.activeReveals ?? [])].sort()).toEqual(["gG", "uU"]);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["gG", "uU"]); // "a card" — any type
    for (const viewer of [P2, P3] as const) {
      const seen = game.view(viewer).decision;
      expect(seen).toMatchObject({ kind: "pick", seat: P1 });
      expect(seen && "options" in seen).toBe(false);
    }
  });

  test("other hands are untouched by the reveal: P1's hand is anonymous to P2 and P3, P3's hand anonymous to P1 and P2, throughout the window (128.4)", async () => {
    const game = await board().build();
    await mindsplitterOn(game, P2);
    expect(handAsSeenBy(game, P2, P1)).toEqual(["hidden", "hidden"]);
    expect(handAsSeenBy(game, P3, P1)).toEqual(["hidden", "hidden"]);
    expect(handAsSeenBy(game, P1, P3)).toEqual(["hidden", "hidden", "hidden"]);
    expect(handAsSeenBy(game, P2, P3)).toEqual(["hidden", "hidden", "hidden"]);
    for (const viewer of [P2, P3] as const) {
      expect(JSON.stringify(game.view(viewer))).not.toContain("Omega Secret");
    }
    for (const viewer of [P1, P2] as const) {
      expect(JSON.stringify(game.view(viewer))).not.toContain("Xray Xenolith");
    }
  });

  test("P1 picks U → P2 discards it: U sits face-up in P2's PUBLIC trash in all three views (108.2.d) — and still does a full round later; G is anonymous again to P1 and P3 once the ability finished (128.2.a); Mindsplitter is on the board", async () => {
    const game = await board().build();
    await mindsplitterOn(game, P2);
    await game.p1.pick("uU");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("uU")).toBe("trash");
    expect(game.state("uU").owner).toBe(P2);
    for (const viewer of [P1, P2, P3] as const) {
      expect(zoneAsSeenBy(game, viewer, "trash", P2)).toEqual(["uU:Uniform Usher"]);
    }
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden"]);
    expect(handAsSeenBy(game, P3, P2)).toEqual(["hidden"]);
    expect(handAsSeenBy(game, P2, P2)).toEqual(["gG:Golf Gadget"]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    for (const viewer of [P1, P3] as const) {
      expect(JSON.stringify({ d: game.view(viewer).decision, z: game.view(viewer).zones })).not.toContain("Golf Gadget");
    }
    expect(game.zoneOf("ms")).toBe("base");
    // a full round later the discarded card is still public knowledge (state, not a window)
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    for (const viewer of [P1, P2, P3] as const) {
      expect(zoneAsSeenBy(game, viewer, "trash", P2)).toContain("uU:Uniform Usher");
    }
  });
});

describe("(b) Sabotage naming P2 — same public reveal, but the pick is RECYCLED into a Secret zone", () => {
  test("casting Sabotage with two opponents lets P1 choose between exactly {P2, P3}", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "sab")?.fields.find((f) => (f.options ?? []).some((v) => v === P2 || v === P3));
    let offered = field ? [...(field.options ?? [])].map(String).sort() : undefined;
    if (offered === undefined) {
      await game.p1.cast("sab");
      offered = opponentPromptSeats(game);
      if (offered === undefined) {
        await passAll(game);
        offered = opponentPromptSeats(game);
      }
    }
    expect(offered).toEqual([P2, P3]);
  });

  test("P2 reveals {U, G} to ALL three seats (P3 — not involved — sees both faces too); the record attributes them to P2", async () => {
    const game = await board().build();
    await sabotageOn(game, P2);
    const ug = ["gG:Golf Gadget", "uU:Uniform Usher"];
    expect(handAsSeenBy(game, P3, P2).sort()).toEqual(ug);
    expect(handAsSeenBy(game, P1, P2).sort()).toEqual(ug);
    expect(publicReveals(game)).toEqual([expect.objectContaining({ cardIds: ["uU", "gG"], playerId: P2 })]);
    expect(handAsSeenBy(game, P1, P3)).toEqual(["hidden", "hidden", "hidden"]); // P3's own hand untouched
  });

  test("only the NON-unit is a legal pick and it is mandatory: options = [G], min 1, no decline; naming U is rejected", async () => {
    const game = await board().build();
    await sabotageOn(game, P2);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["gG"]);
    await expect(game.p1.pick("uU")).rejects.toThrow();
    expect(game.zoneOf("uU")).toBe("hand");
  });

  test("G is recycled to the BOTTOM of P2's Main Deck; afterwards NO seat's view — P1, P3, or the owner P2 — lists G anywhere (deck contents are Secret, 108.4.d / 128.3); observers only see P2's deck count rise by one and the hand count drop; U is anonymous again", async () => {
    const game = await board().build();
    const deckSeenBefore = zoneAsSeenBy(game, P1, "mainDeck", P2).length;
    await sabotageOn(game, P2);
    await game.p1.pick("gG");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    // omniscient checks
    expect(game.zoneOf("gG")).toBe("mainDeck");
    expect(game.seat(P2).deck().at(-1)).toBe("gG");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("sab")).toBe("trash");
    // per-seat views
    for (const viewer of [P1, P2, P3] as const) {
      const deckSeen = zoneAsSeenBy(game, viewer, "mainDeck", P2);
      expect(new Set(deckSeen)).toEqual(new Set(["hidden"]));
      expect(deckSeen).toHaveLength(deckSeenBefore + 1);
      const s = JSON.stringify({ d: game.view(viewer).decision, z: game.view(viewer).zones });
      expect(s).not.toContain("Golf Gadget");
      expect(s).not.toContain('"gG"');
    }
    expect(handAsSeenBy(game, P1, P2)).toEqual(["hidden"]);
    expect(handAsSeenBy(game, P3, P2)).toEqual(["hidden"]);
    expect(game.gameState.activeReveals ?? []).toEqual([]);
  });

  test("contrast in one game: Mindsplitter's discard (U → trash) stays named in every view while Sabotage's recycle (G → deck) is named in none, although both began with the identical public reveal of {U, G}", async () => {
    const game = await board().build();
    await mindsplitterOn(game, P2);
    await game.p1.pick("uU");
    await game.settle();
    await sabotageOn(game, P2); // P2's hand is now just {G}
    expect(handAsSeenBy(game, P3, P2)).toEqual(["gG:Golf Gadget"]);
    await game.p1.pick("gG");
    await game.settle();
    expect(publicReveals(game).map((e) => e.playerId)).toEqual([P2, P2]);
    for (const viewer of [P1, P2, P3] as const) {
      expect(zoneAsSeenBy(game, viewer, "trash", P2)).toEqual(["uU:Uniform Usher"]);
      expect(JSON.stringify(game.view(viewer).zones)).not.toContain("Golf Gadget");
    }
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P3 concedes while the game continues — the facedown Consult the Past is revealed on its way out (652.1, 421.4, 652.3)", () => {
  test("before the concession the facedown card is Private to P3: P1's and P2's views hold one anonymous placeholder at bf3 (owner P3) and never the id / name; P3 and a spectator see it", async () => {
    const game = await board().build();
    for (const viewer of [P1, P2] as const) {
      expect(game.view(viewer).zones["facedown-bf3"]).toEqual([{ hidden: true, index: 0, owner: P3, zone: "facedown-bf3" }]);
      const s = JSON.stringify(game.view(viewer));
      expect(s).not.toContain("Consult the Past");
      expect(s).not.toContain('"ctp"');
    }
    expect((game.view(P3).zones["facedown-bf3"] ?? []).map((c) => ("id" in c ? c.id : "hidden"))).toEqual(["ctp"]);
    expect((game.view(SPECTATOR).zones["facedown-bf3"] ?? []).map((c) => ("id" in c ? c.id : "hidden"))).toEqual(["ctp"]);
  });

  test("P3 may concede at any time (here: during P1's open main phase); the game is NOT over — P1 and P2 play on, P3's units / facedown card leave the board, bf3 is uncontrolled, and the turn order skips P3 (651.1–651.3, 652.1)", async () => {
    const game = await board().build();
    expect(game.seat(P3).can("concede")).toBe(true);
    await game.seat(P3).concede();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.locationOf("p3guard")).toBeUndefined();
    expect(game.view(P1).zones["facedown-bf3"] ?? []).toEqual([]);
    expect(game.view(P1).battlefields.find((b) => b.id === "bf3")).toMatchObject({ controller: null, facedownCount: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.seat(P3).legal().filter((o) => o.moveId !== "concede")).toEqual([]);
    expect((await game.advanceTurn()).next).toBe(P2);
    expect((await game.advanceTurn()).next).toBe(P1); // P3 never gets a turn again
    expect(game.violations()).toEqual([]);
  });

  test("the concession makes Consult the Past's identity PUBLIC to both remaining players (421.4: a facedown card leaving its zone is revealed by its owner) — via the reveal record and/or the card lying face-up in a public zone in P1's and P2's views", async () => {
    const game = await board().build();
    await game.seat(P3).concede();
    for (const viewer of [P1, P2] as const) {
      const inRecord = (game.view(viewer).state.publicReveals ?? []).some((e) => e.playerId === P3 && e.cardIds.includes("ctp"));
      const faceUpSomewhere = Object.values(game.view(viewer).zones).some((cards) => cards.some((c) => "id" in c && c.id === "ctp" && c.name === "Consult the Past"));
      expect(inRecord || faceUpSomewhere).toBe(true);
    }
  });

  // 421.4 + the shared public-reveal record: a reveal event attributed to P3 names Consult the Past, so the identity
  // is on the log even after 652.3 takes P3's cards out of the game.
  test("the 421.4 reveal is recorded — publicReveals gains an entry { playerId: P3, cardIds: [ctp] } (421.4, 424.1)", async () => {
    const game = await board().build();
    const before = publicReveals(game).length;
    await game.seat(P3).concede();
    expect(publicReveals(game).slice(before)).toEqual([expect.objectContaining({ cardIds: expect.arrayContaining(["ctp"]), playerId: P3 })]);
  });

  // 652.3: "Remove all cards they own from the game" — the conceded player's cards are in no zone any more.
  test("after the reveal, 652.3 removes ALL of P3's cards from the game — Consult the Past, P3's unit and P3's hand are in no zone (`gone`)", async () => {
    const game = await board().build();
    await game.seat(P3).concede();
    for (const id of ["ctp", "p3guard", "xX", "yY", "zZ"]) {
      expect(game.zoneOf(id)).toBe("gone");
    }
  });
});
