/**
 * Interaction: Rumble, Hotheaded (sfd-026-221) · Champion Unit · Fury · 4 · 4 Might · MECH
 *     "Your Mechs each have [Assault]. When I conquer, you may recycle another friendly unit to play a Mech from
 *      your trash. Reduce its Energy cost by the Might of the unit you recycled."                       — P1's
 *   × Production Surge (sfd-076-221) · Spell · Mind · 4 + [mind] ("[2] less if you control a Mech")
 *     "Play a 3 [Might] Mech unit token to your base. Draw 1."                                          — P1's (makes the TOKEN)
 *   × Karma, Channeler (ogn-235-298) · Champion Unit · Order · 6 Might
 *     "When you recycle one or more cards to your Main Deck, buff a friendly unit. (… Runes aren't cards.)" — P1's, in base
 *   × Mega-Mech (ogn-088-298) · Unit · 7 · 8 Might · MECH (vanilla)                                    — in P1's TRASH
 *
 * Question. P1: Rumble (about to conquer the empty enemy bf1), Karma in base, a 3-Might Mech TOKEN in base from an
 * earlier Production Surge, Mega-Mech in trash, N cards in the main deck. Rumble conquers.
 *   (a) May P1 name the Mech TOKEN as "another friendly unit" to recycle (recycle rules speak of "cards")? If so:
 *       where does it go, does the deck become N+1, what discount applies, what is the token afterwards?
 *   (b) Does Karma ("cards") trigger off that recycle?
 *   (c) Contrast: P1 recycles a real (non-token) 3-Might unit card instead — Karma now? deck N+1? discount?
 *
 * Rules: 185 (tokens are not cards) / 185.2.d (a token unit IS a unit and follows unit rules) / 185.2.e (tokens
 * inherit their type's recycle destination → Main Deck), 186.1 (a token put into a non-board zone other than the
 * chain ceases to exist immediately), 052 ("card" on a card = Main Deck card), 416.1 / 416.3 (recycle = bottom of
 * the deck; as a cost it must be completable — it is), 359.3.e.13 (look-back at the recycled unit's Might).
 *
 * Expected: (a) yes — the token is a legal cost object; it goes to the bottom of P1's Main Deck and immediately
 * ceases to exist: deck stays N, the token no longer exists anywhere (harness: zone "gone", has() false); the cost
 * WAS paid, discount = 3 → Mega-Mech is played from trash for 7 − 3 = [4], entering exhausted. (b) No: Karma counts
 * recycled CARDS and a token is not a card — no trigger, nobody buffed. (c) a real unit card physically lands on
 * the bottom (N+1), Karma triggers once and buffs a friendly unit, discount = 3 → [4] again.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const PRODUCTION_SURGE = "sfd-076-221";
const KARMA = "ogn-235-298";
const MEGA_MECH = "ogn-088-298";

/**
 * P1's turn. P2 holds bf1 with nobody on it (Rumble walking in conquers). P1: Rumble + Karma in base, Mega-Mech in
 * trash, Production Surge in hand; 2 + [mind] for the (Mech-discounted) Surge and 4 more for the discounted Mega-Mech.
 * `grunt: true` adds a real vanilla 3-Might unit card "Grunt" to P1's base for the contrast line.
 */
function board(o: { grunt?: boolean; energy?: number } = {}) {
  const b = scenario()
    .resources(P1, { energy: o.energy ?? 6, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, "base", KARMA, "karma")
    .trash(P1, MEGA_MECH, "mega")
    .hand(P1, PRODUCTION_SURGE, "surge")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "them");
  return o.grunt ? b.unit(P1, "base", { might: 3, name: "Grunt" }, "grunt") : b;
}

const mechTokens = (game: Game) => game.p1.units().filter((id) => game.state(id).isToken);

/** Cast Production Surge (2 + [mind] with Rumble the Mech on board) → one exhausted 3-Might Mech token in P1's base. Returns its id. */
async function makeToken(game: Game): Promise<string> {
  await game.p1.cast("surge");
  await game.settle();
  const toks = mechTokens(game);
  expect(toks).toHaveLength(1);
  const token = toks[0] as string;
  expect(game.state(token)).toMatchObject({ controller: P1, isToken: true, might: 3, owner: P1, zone: "base" });
  return token;
}

/** Rumble walks onto the empty enemy bf1; both pass Focus → P1 conquers (+1) and Rumble's trigger pends. */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("rumble", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

type Pred = (d: Decision | null) => boolean;
const isOpenMain: Pred = (d) => d?.kind === "action" && d.context === "main";
const isRumbleOptIn: Pred = (d) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "rumble";
const isKarmaPick: Pred = (d) => d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "karma";
const offers = (d: Decision | null, card: string): boolean => d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === card);

interface DriveLog {
  recycleOffered: string[];
  karmaPicks: number;
  karmaOffered: string[];
  chainSeen: string[];
}

/**
 * Drive P1 through Rumble's trigger to the open main phase: opt in, name `recycle` as the cost object, `mega` as the
 * Mech, base as its destination; answer a Karma buff pick with `karmaBuff`; pass priority otherwise. Records what the
 * recycle prompt offered, how many Karma picks appeared, and every chain item id seen.
 */
async function drive(game: Game, a: { recycle: string; karmaBuff?: string; optIn?: boolean }): Promise<DriveLog> {
  const log: DriveLog = { chainSeen: [], karmaOffered: [], karmaPicks: 0, recycleOffered: [] };
  for (let i = 0; i < 40; i++) {
    for (const c of game.chain()) {
      const key = `${c.cardId}:${c.triggered ? "trigger" : "card"}`;
      if (!log.chainSeen.includes(key)) {
        log.chainSeen.push(key);
      }
    }
    const d = game.decision();
    if (!d || isOpenMain(d)) {
      break;
    }
    if (isRumbleOptIn(d)) {
      await (a.optIn === false ? game.p1.no() : game.p1.yes());
    } else if (isKarmaPick(d)) {
      log.karmaPicks++;
      log.karmaOffered = d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
      await game.p1.pick(a.karmaBuff ?? "karma");
    } else if (d.seat === P1 && offers(d, a.recycle) && !offers(d, "mega")) {
      log.recycleOffered = d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
      await game.p1.pick(a.recycle);
    } else if (d.seat === P1 && offers(d, "mega")) {
      await game.p1.pick("mega");
    } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered" && !isOpenMain(game.decision())) {
        throw new Error(`unexpected prompt: ${JSON.stringify(r.decision)}`);
      }
    }
  }
  expect(isOpenMain(game.decision())).toBe(true);
  return log;
}

describe("premise — the token and the conquer", () => {
  test("Production Surge costs 2 + [mind] here (Rumble is a Mech), makes ONE exhausted 3-Might Mech token in P1's base and draws 1; Karma is silent (nothing was recycled)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    const token = await makeToken(game);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
    expect(game.state(token).isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p1.units().some((u) => game.state(u).isBuffed)).toBe(false);
  });

  test("Rumble conquers the empty bf1: +1 point and P1 is asked whether to use the 'you may recycle …' trigger", async () => {
    const game = await board().build();
    await makeToken(game);
    await conquer(game);
    let asked = false;
    for (let i = 0; i < 12 && !isOpenMain(game.decision()); i++) {
      if (isRumbleOptIn(game.decision())) {
        asked = true;
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(asked).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });
});

describe("(a) the Mech TOKEN is a legal 'another friendly unit' to recycle — and then it ceases to exist", () => {
  test("the recycle prompt offers the token alongside Karma (every friendly unit but Rumble himself); never Rumble, never P2's unit", async () => {
    const game = await board().build();
    const token = await makeToken(game);
    await conquer(game);
    const log = await drive(game, { recycle: token });
    expect(log.recycleOffered).toEqual(["karma", token].sort());
    expect(log.recycleOffered).not.toContain("rumble");
    expect(log.recycleOffered).not.toContain("them");
  });

  test("paying with the token: it leaves the board for the deck bottom and IMMEDIATELY ceases to exist (186.1) — zone 'gone', has() false, no longer among P1's units, not in trash, not in the deck: the deck still has exactly N cards", async () => {
    const game = await board().build();
    const token = await makeToken(game);
    const deckN = game.p1.deck().length; // N, measured after the Surge's draw
    await conquer(game);
    await drive(game, { recycle: token });
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.has(token)).toBe(false);
    expect(mechTokens(game)).toEqual([]);
    expect(game.p1.trash()).not.toContain(token);
    expect(game.p1.deck()).not.toContain(token);
    expect(game.p1.deck()).toHaveLength(deckN);
  });

  test("the cost WAS paid, so the effect proceeds: look-back Might of the token = 3 (359.3.e.13) → Mega-Mech is played from the trash for 7 − 3 = [4]: energy 4 → 0, Mega-Mech in P1's base, exhausted, 8 Might", async () => {
    const game = await board().build();
    const token = await makeToken(game);
    expect(game.p1.energy()).toBe(4);
    await conquer(game);
    await drive(game, { recycle: token });
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.state("mega")).toMatchObject({ controller: P1, isExhausted: true, might: 8, zone: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.trash()).toEqual(["surge"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("with only 3 energy left the [4] cannot be paid: Mega-Mech stays in the trash — but the token is still gone (costs are never refunded, 425.1.c)", async () => {
    const game = await board({ energy: 5 }).build();
    const token = await makeToken(game);
    expect(game.p1.energy()).toBe(3);
    await conquer(game);
    await drive(game, { recycle: token });
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.has(token)).toBe(false);
    expect(game.p1.energy()).toBe(3);
  });
});

describe("(b) Karma stays SILENT — a token is not a 'card' (185, 052)", () => {
  // Expected: Karma triggers "when you recycle one or more CARDS to your Main Deck"; on card text "card" means a
  // Main Deck card (052) and tokens are not cards (185) — recycling the Mech token raises nothing and nobody is
  // buffed (her own reminder text makes the same point for runes). Actual: the engine fires Karma's recycle
  // trigger for the token too — P1 is prompted to buff a friendly unit.
  test("recycling the TOKEN raises no Karma item and no buff prompt; afterwards no friendly unit (Rumble, Karma, Mega-Mech) is buffed (185, 052)", async () => {
    const game = await board().build();
    const token = await makeToken(game);
    await conquer(game);
    const log = await drive(game, { recycle: token });
    expect(log.karmaPicks).toBe(0);
    expect(log.chainSeen.filter((k) => k.startsWith("karma"))).toEqual([]);
    for (const u of ["rumble", "karma", "mega"]) {
      expect(game.state(u).isBuffed).toBe(false);
    }
    expect(game.state("rumble").might).toBe(4); // Assault is attacker-only; combat is over
    expect(game.state("karma").might).toBe(6);
  });
});

describe("(c) contrast — recycling a REAL unit card (Grunt, 3 Might)", () => {
  test("the recycle prompt now offers Grunt, Karma and the token; picking Grunt puts the physical card on the BOTTOM of P1's deck → N+1", async () => {
    const game = await board({ grunt: true }).build();
    const token = await makeToken(game);
    const deckN = game.p1.deck().length;
    await conquer(game);
    const log = await drive(game, { karmaBuff: "rumble", recycle: "grunt" });
    expect(log.recycleOffered).toEqual(["grunt", "karma", token].sort());
    expect(game.zoneOf("grunt")).toBe("mainDeck");
    expect(game.p1.deck()).toHaveLength(deckN + 1);
    expect(game.p1.deck().at(-1)).toBe("grunt");
    expect(game.p1.trash()).not.toContain("grunt");
    expect(game.has(token)).toBe(true); // the token was not touched this time
    expect(game.zoneOf(token)).toBe("base");
  });

  test("Karma DOES trigger exactly once ('you recycled a card to your Main Deck'): P1 is asked for a friendly unit (P1's units only) and buffs Rumble → 5", async () => {
    const game = await board({ grunt: true }).build();
    const token = await makeToken(game);
    await conquer(game);
    const log = await drive(game, { karmaBuff: "rumble", recycle: "grunt" });
    expect(log.karmaPicks).toBe(1);
    expect(log.karmaOffered).not.toContain("them");
    expect(log.karmaOffered).not.toContain("grunt"); // already in the deck when Karma resolves
    expect(log.karmaOffered).toEqual(expect.arrayContaining(["karma", "rumble", token]));
    expect(game.state("rumble")).toMatchObject({ isBuffed: true, might: 5, zone: "battlefield-bf1" });
    expect(game.state("karma").isBuffed).toBe(false);
  });

  test("discount = Grunt's 3 → Mega-Mech again costs [4]: energy 4 → 0, Mega-Mech exhausted in base", async () => {
    const game = await board({ grunt: true }).build();
    await makeToken(game);
    await conquer(game);
    await drive(game, { karmaBuff: "rumble", recycle: "grunt" });
    expect(game.state("mega")).toMatchObject({ isExhausted: true, might: 8, zone: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("side by side: token recycle → deck N (nothing drawable later), card recycle → deck N+1 with Grunt at the bottom — same [4] Mega-Mech either way", async () => {
    const viaToken = await board({ grunt: true }).build();
    const t1 = await makeToken(viaToken);
    const n1 = viaToken.p1.deck().length;
    await conquer(viaToken);
    await drive(viaToken, { karmaBuff: "rumble", recycle: t1 });

    const viaCard = await board({ grunt: true }).build();
    await makeToken(viaCard);
    const n2 = viaCard.p1.deck().length;
    await conquer(viaCard);
    await drive(viaCard, { karmaBuff: "rumble", recycle: "grunt" });

    expect([viaToken.p1.deck().length - n1, viaCard.p1.deck().length - n2]).toEqual([0, 1]);
    expect([viaToken.p1.deck().includes(t1), viaCard.p1.deck().at(-1) === "grunt"]).toEqual([false, true]);
    expect([viaToken.p1.energy(), viaCard.p1.energy()]).toEqual([0, 0]);
    expect([viaToken.zoneOf("mega"), viaCard.zoneOf("mega")]).toEqual(["base", "base"]);
  });
});
