/**
 * Interaction: Rumble, Hotheaded (sfd-026-221) · Champion Unit · Fury · 4 · 4 Might
 *     "Your Mechs each have [Assault]. When I conquer, you may recycle another friendly unit to play a
 *      Mech from your trash. Reduce its Energy cost by the Might of the unit you recycled."
 *   × Possession (ogn-203-298) · Spell · Chaos · 8+[chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Mega-Mech (ogn-088-298) · Unit · Mind · 7 · 8 Might · Mech (vanilla) — in P1's trash
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla) — P2's card, Possessed by P1
 *   (+ "Little Buddy", a vanilla P1-owned 2-Might unit, for the contrast)
 *
 * Rules: 740.1.a (friendly = shares a controller), 416.1 / 416.1.a / 416.1.c (Recycle = bottom of the
 * corresponding deck; each player recycles to their OWN deck regardless of who is instructed), 056 /
 * 056.1 / 056.2 (a card never enters another player's non-board zone — it goes to its owner's instead),
 * 383.4.c.2.a / 359.3.e.13 ("the unit you recycled" — look-back at the paid object), 124 / 124.1 (a card
 * entering a non-board zone is a new object; temporary modifications end), 477.1.a (control change is a
 * layer-1 modification), 191.3 (a card played is controlled by its player).
 *
 * Question: P1: Rumble ready in base; a Possessed Vanguard Sergeant (P2's card, 4 Might, ready, in P1's
 * base); Mega-Mech in P1's trash. P1 moves Rumble + Sergeant to open bf1 and conquers; Rumble's trigger:
 * P1 recycles the Sergeant to play Mega-Mech.
 *   (a) is the borrowed Sergeant "another friendly unit" P1 may recycle?
 *   (b) whose deck bottom does it go to — P1's (the recycler) or P2's (the owner)? Deck counts?
 *   (c) discount still 7 − 4 = 3, Mega-Mech from P1's trash?
 *   (d) contrast: recycle P1's own 2-Might Buddy instead — which deck, what cost?
 *   (e) P2 later draws and plays that Sergeant — any trace of Possession?
 *
 * Expected: (a) yes (740.1.a). (b) bottom of P2's main deck (416.1.c, 056.2): P1 deck unchanged, P2 deck
 * +1 with the Sergeant last; no trash involved; (owner, controller, zone) = (P2,P2,bf2) → (P2,P1,base) →
 * (P2,P1,bf1) → (P2,·,P2 mainDeck). (c) yes: Mega-Mech from P1's trash for [3]. (d) Buddy → bottom of P1's
 * deck, Mega-Mech for 7 − 2 = [5]. (e) none — a new object; P2 plays and controls it normally.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const POSSESSION = "ogn-203-298";
const MEGA_MECH = "ogn-088-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * P1's turn 2. P2 holds bf2 with its Vanguard Sergeant (+ a Guard so bf2 stays P2's); bf1 is open.
 * P1: Rumble + (Little Buddy) in base, Mega-Mech in trash, Possession in hand, 8+[chaos]×3 for
 * Possession plus 5 more energy. Short decks (2 fillers each) so deck bottoms are easy to read.
 */
function board(opts: { buddy?: boolean } = {}) {
  let b = scenario()
    .victoryScore(15)
    .fillDecks({ main: 2, runes: 12 })
    .resources(P1, { energy: 13, power: { chaos: 3 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", RUMBLE, "rumble");
  if (opts.buddy !== false) {
    b = b.unit(P1, "base", { might: 2, name: "Little Buddy" }, "buddy");
  }
  return b
    .unit(P2, "bf2", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "bf2", { might: 1, name: "P2 Guard" }, "guard")
    .trash(P1, MEGA_MECH, "mega")
    .hand(P1, POSSESSION, "poss");
}

type OCZ = { owner: string; controller: string; zone: string };
const ocz = (game: Game, card: string): OCZ => {
  const s = game.state(card);
  return { controller: s.controller, owner: s.owner, zone: s.zone };
};

type Pred = (d: Decision | null) => boolean;
const isOpenMain: Pred = (d) => d?.kind === "action" && d.context === "main";
const isRumbleOptIn: Pred = (d) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "rumble";
const offers = (d: Decision | null, card: string): boolean => d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === card);

/** An earlier Possession: P1 takes the Sergeant (→ P1's base, ready, owner P2 / controller P1). 5 energy left. */
async function possessed(opts: { buddy?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("poss", { targets: "sarge" });
  await game.settle();
  expect(game.zoneOf("poss")).toBe("trash");
  expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 0 } });
  return game;
}

/** Rumble + the Sergeant walk onto open bf1; both pass focus → P1 conquers (+1) and Rumble's trigger pends. */
async function conquer(game: Game): Promise<void> {
  await game.p1.move(["rumble", "sarge"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

/**
 * Drive P1 through Rumble's trigger wherever the engine asks: opt in, name `recycle` as the cost
 * object, `mega` as the Mech, `to` as its destination; pass priority otherwise. Stops when `stop`
 * holds or at P1's open main phase.
 */
async function drive(game: Game, stop: Pred, a: { recycle?: string; to?: string } = {}): Promise<Decision | null> {
  const { recycle = "sarge", to = "base" } = a;
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (stop(d) || isOpenMain(d) || !d) {
      break;
    }
    if (isRumbleOptIn(d)) {
      await ((d as Extract<Decision, { kind: "yes-no" }>).canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.seat === P1 && offers(d, recycle)) {
      await game.p1.pick(recycle);
    } else if (d.seat === P1 && offers(d, "mega")) {
      await game.p1.pick("mega");
    } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick(to);
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered" && !stop(game.decision())) {
        throw new Error(`unexpected prompt: ${JSON.stringify(r.decision)}`);
      }
    }
  }
  return game.decision();
}

describe("Rumble recycles a Possessed unit — it goes to its OWNER's deck; the discount still applies", () => {
  // ── premise ─────────────────────────────────────────────────────────────────────────────────

  test("premise: Possession → the Sergeant is (owner P2, controller P1) READY in P1's base; Rumble + Sergeant Standard-Move together to open bf1 and P1 conquers it (+1)", async () => {
    const game = await possessed();
    expect(ocz(game, "sarge")).toEqual({ controller: P1, owner: P2, zone: "base" });
    expect(game.state("sarge")).toMatchObject({ isReady: true, might: 4 });
    expect(game.p1.units("base").sort()).toEqual(["buddy", "rumble", "sarge"]);
    await conquer(game);
    expect(ocz(game, "sarge")).toEqual({ controller: P1, owner: P2, zone: "battlefield-bf1" });
    expect(game.p1.units("bf1").sort()).toEqual(["rumble", "sarge"]);
  });

  // ── (a) the borrowed unit is "another friendly unit" ────────────────────────────────────────
  // Expected: friendly = shares a controller (740.1.a), so the Possessed Sergeant is a legal object for
  // "recycle another friendly unit" and is offered next to Little Buddy. Actual: the engine enumerates
  // recycle-cost candidates by OWNER — the Sergeant is never a candidate, Buddy is auto-bound as the
  // lone candidate (and with no Buddy the trigger is removed unasked).
  test.failing("BUG: (a) after opting in, the cost-object pick offers BOTH the Possessed Sergeant and Little Buddy (740.1.a, 383.4.c.2.a)", async () => {
    const game = await possessed();
    await conquer(game);
    const d = await drive(game, (x) => x?.kind === "pick" && x.seat === P1 && (offers(x, "sarge") || offers(x, "buddy")));
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(offers(d, "sarge")).toBe(true);
    expect(offers(d, "buddy")).toBe(true);
    expect(offers(d, "rumble")).toBe(false); // "another"
  });

  test.failing("BUG: (a) with the Sergeant as P1's ONLY other unit the opt-in is still offered and acceptable — the borrowed unit can pay the cost (740.1.a, 416.3)", async () => {
    const game = await possessed({ buddy: false });
    await conquer(game);
    let acceptable = false;
    for (let i = 0; i < 20 && !isOpenMain(game.decision()); i++) {
      const d = game.decision();
      if (isRumbleOptIn(d)) {
        acceptable ||= (d as Extract<Decision, { kind: "yes-no" }>).canAccept !== false;
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(acceptable).toBe(true);
  });

  // ── (b) which deck ──────────────────────────────────────────────────────────────────────────
  // Expected: the Sergeant goes to the bottom of P2's main deck (416.1.c / 056.2). Actual: it cannot be
  // recycled at all (see (a)), so it is still on bf1.
  test.failing("BUG: (b) P1 recycles the Sergeant → it is the BOTTOM card of P2's main deck: P2 deck +1, P1 deck unchanged, neither trash gains it (416.1.c, 056.2)", async () => {
    const game = await possessed();
    const p1Deck0 = game.p1.deck();
    const p2Deck0 = game.p2.deck();
    await conquer(game);
    await drive(game, isOpenMain, { recycle: "sarge" });
    expect(game.zoneOf("sarge")).toBe("mainDeck");
    expect(game.p2.deck()).toEqual([...p2Deck0, "sarge"]);
    expect(game.p1.deck()).toEqual(p1Deck0);
    expect(game.p1.trash()).not.toContain("sarge");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("buddy")).toBe("base"); // Buddy was not the one paid
  });

  test.failing("BUG: (b) (owner, controller, zone) trajectory: (P2,P2,bf2) → (P2,P1,base) → (P2,P1,bf1) → owner P2 in P2's main deck — never a P2 card in a P1 pile (056)", async () => {
    const game = await board().build();
    const seen: OCZ[] = [ocz(game, "sarge")];
    await game.p1.cast("poss", { targets: "sarge" });
    await game.settle();
    seen.push(ocz(game, "sarge"));
    await conquer(game);
    seen.push(ocz(game, "sarge"));
    await drive(game, isOpenMain, { recycle: "sarge" });
    expect(seen).toEqual([
      { controller: P2, owner: P2, zone: "battlefield-bf2" },
      { controller: P1, owner: P2, zone: "base" },
      { controller: P1, owner: P2, zone: "battlefield-bf1" },
    ]);
    expect(game.state("sarge")).toMatchObject({ owner: P2, zone: "mainDeck" });
    expect(game.p2.deck().at(-1)).toBe("sarge");
    expect(game.p1.deck()).not.toContain("sarge");
    expect(game.p1.trash()).not.toContain("sarge");
    expect(game.p1.hand()).not.toContain("sarge");
  });

  // ── (c) discount + "your trash" ─────────────────────────────────────────────────────────────
  // Expected: discount = the recycled Sergeant's Might (4) → Mega-Mech costs [3] from P1's trash: energy
  // 5 → 2. Actual: Buddy (2) is force-recycled instead → [5] → energy 0.
  test.failing("BUG: (c) Mega-Mech is played from P1's trash for exactly [3] (7 − the Sergeant's 4): energy 5 → 2, Mega-Mech in P1's base exhausted (359.3.e.13)", async () => {
    const game = await possessed();
    await conquer(game);
    await drive(game, isOpenMain, { recycle: "sarge", to: "base" });
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.state("mega")).toMatchObject({ controller: P1, isExhausted: true, might: 8, owner: P1 });
    expect(game.p1.trash()).toEqual(["poss"]);
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("sarge")).toBe("mainDeck");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: a P1-owned unit ───────────────────────────────────────────────────────────

  test("(d) contrast: recycling P1's own Little Buddy (2) puts it on the bottom of P1's deck; Mega-Mech costs 7 − 2 = [5] (energy 5 → 0) and lands in P1's base; the Sergeant stays on bf1 under P1's control (416.1.a)", async () => {
    const game = await possessed();
    const p1Deck0 = game.p1.deck();
    const p2Deck0 = game.p2.deck();
    await conquer(game);
    await drive(game, isOpenMain, { recycle: "buddy", to: "base" });
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.zoneOf("buddy")).toBe("mainDeck");
    expect(game.p1.deck()).toEqual([...p1Deck0, "buddy"]);
    expect(game.p2.deck()).toEqual(p2Deck0);
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.state("mega")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.p1.energy()).toBe(0);
    expect(ocz(game, "sarge")).toEqual({ controller: P1, owner: P2, zone: "battlefield-bf1" });
    expect(game.p1.trash()).toEqual(["poss"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (e) no trace of Possession ──────────────────────────────────────────────────────────────
  // Depends on (b): the Sergeant must first reach P2's deck.
  test.failing("BUG: (e) the recycled Sergeant is a NEW object in P2's deck (124.1): when P2 later draws and plays it, P2 controls it in P2's base — no lingering control change (477.1.a, 191.3)", async () => {
    const game = await possessed();
    await conquer(game);
    await drive(game, isOpenMain, { recycle: "sarge" });
    expect(game.zoneOf("sarge")).toBe("mainDeck");
    await game.advanceTurn(); // → P2's turn 3 (draws the top filler)
    expect(game.turnPlayer()).toBe(P2);
    for (let i = 0; i < 3 && !game.p2.hand().includes("sarge"); i++) {
      await game.p2.do("drawCard", { count: 1 });
    }
    expect(game.p2.hand()).toContain("sarge");
    expect(game.state("sarge")).toMatchObject({ owner: P2, zone: "hand" });
    await game.p2.do("addResources", { energy: 4 });
    expect(game.p2.can("play", "sarge")).toBe(true);
    await game.p2.play("sarge", { to: "base" });
    await game.settle();
    expect(ocz(game, "sarge")).toEqual({ controller: P2, owner: P2, zone: "base" });
    expect(game.p2.units("base")).toContain("sarge");
    expect(game.p1.units()).not.toContain("sarge");
    expect((game.state("sarge").meta as { controlEffects?: unknown[] }).controlEffects ?? []).toEqual([]);
  });
});
