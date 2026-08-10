/**
 * Interaction: Shady Spectacles (ven-137-166) · Gear (Equipment) · Order · 4 · +0 · [Equip] [1][order]
 *     "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that unit for
 *      as long as this is attached to it."                                                    — P1's, worn by …
 *   × Daring Poro (ogn-210-298) · Unit · Order · 2 · 2 Might · Poro · "[Assault]"              — P1's, at bf1, exhausted, damaged,
 *     copying P1's Ruined Rex (unl-067-219 · Unit · Mind · 6 + [mind] · 6 Might · "[Deathknell] Deal 4 to an enemy unit.")
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction · "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."                                                                          — P2's hand
 *   × Rebuke (ogn-172-298) · Spell · Chaos · 2 + [chaos][chaos] · Action · "Return a unit at a battlefield to its owner's
 *     hand."                                                                                  — P2's hand
 *   (+ P2's inline "Test Ping" 0: deal 1 to a unit — re-marks the 1 damage on P2's turn; P1's 1-Might Flag keeps bf1.)
 *
 * Question — rule 124 round-trip: (a) can P2 Gust the Spectacled Poro (reads "Ruined Rex", 6)? Contrast: bare Poro.
 * (b) P2 Rebukes it: what arrives in P1's hand, at what cost, with damage/exhausted/copy? Where do the Spectacles end
 * up, in what state? Any Deathknell? (c) Next turn P1 replays it: what is paid, and the full sheet of the replayed unit.
 * (d) Can P1 re-Equip the same Spectacles to it, and must the model be Rex again?
 *
 * Rules: 477.1.b.1 / .1.a (copy = name, type, tags, cost, domain, rules text; Might per the copy), 124 / 124.1 / 124.2
 * (board → hand = NEW object; damage, statuses, Equipped, applied layer alterations all cease), 206 (cost in hand =
 * printed), 435.1 / 435.1.c (a card cannot stay attached to one that left the board → detached, Effect Text inactive),
 * 457.1 (loose gear at a battlefield is recalled to its controller's base at the next Cleanup), 808.1.d (Deathknell
 * needs a kill → trash; a bounce is not a death), 143.4 (units enter exhausted), 370.1.b.1 ("As this is attached, choose
 * …" is evaluated anew at each attachment).
 *
 * Expected: (a) NO — Gust reads current Might: 6 > 3 → not offered / rejected; the un-Spectacled Poro (2) IS offered.
 * (b) Rebuke → P1's HAND holds printed "Daring Poro": cost 2, Order, 2 Might, [Assault], Poro, 0 damage, not exhausted,
 * no attachments, not a copy. Spectacles: detached, unattached, READY, P1's, back in P1's base after the Cleanup, never
 * in a trash. No Deathknell (P2's Wall undamaged, chain empty). (c) P1 pays the printed 2; fresh Daring Poro — 2 Might,
 * [Assault], Poro, Order, cost 2, 0 damage, enters EXHAUSTED, unequipped, not a copy. (d) YES: [1][order] Equip is
 * offered onto it again and the model choice is asked afresh — Rex OR the Flag; choosing the Flag makes it a 1-Might
 * "Flag", proving nothing of the earlier choice persisted.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
// Read-only peek at copyable TAGS (477.1.b.1.a) — CardState does not surface tags.
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const SHADY_SPECTACLES = "ven-137-166";
const DARING_PORO = "ogn-210-298";
const RUINED_REX = "unl-067-219";
const GUST = "ogn-169-298";
const REBUKE = "ogn-172-298";

/** P2's inline pinger: 0 cost Action, "Deal 1 to a unit." (re-marks the Poro's 1 damage on P2's turn — 3c healed turn 2's). */
const TEST_PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Ping",
  rulesText: "Deal 1 to a unit.",
  timing: "action",
};

const tagsOf = (card: string): readonly string[] => getGlobalCardRegistry().get(card)?.tags ?? [];

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn 2. bf1 (P1's): P1's Daring Poro EXHAUSTED + P1's 1-Might Flag (keeps bf1 P1's throughout). bf2: P2's Wall (5)
 * — P2's only unit, so a (wrong) Rex Deathknell would have to hit it. P1 base: Ruined Rex, loose Shady Spectacles;
 * P1 has exactly [1][order] for the Equip. P2 hand: Gust, Rebuke, Test Ping (P2's resources are added on P2's turn).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", DARING_PORO, "poro", { exhausted: true })
    .unit(P1, "bf1", { might: 1, name: "Flag" }, "flag")
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P2, GUST, "gust")
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, TEST_PING, "ping");
}

/** Activate [Equip] Spectacles → `bearer`, let it resolve, and choose `model` when asked. */
async function equipCopying(game: Game, bearer: string, model: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: bearer } });
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain(model);
  await game.p1.pick(model);
  await game.settle();
  expect(game.state("specs").attachedTo).toBe(bearer);
}

/**
 * The question's position, reached by play: turn 2 P1 Equips the Spectacles onto the Poro copying Rex; → P2's turn 3;
 * P2 floats 3 + [chaos][chaos] and pings the Poro for 1. Result: P1's "Ruined Rex" (really the Poro) at bf1, exhausted,
 * 1 damage, wearing the Spectacles; P2 to act with Gust + Rebuke in hand.  `bare` skips the Equip (contrast).
 */
async function p2FacingPoro(opts: { bare?: boolean } = {}): Promise<Game> {
  const game = await board().build();
  if (!opts.bare) {
    await equipCopying(game, "poro", "rex");
  }
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 3, power: { chaos: 2 } });
  await game.p2.cast("ping", { targets: "poro" });
  await game.settle();
  expect(game.state("poro")).toMatchObject({ damage: 1, isExhausted: true, location: "bf1" });
  return game;
}

/** …and P2 resolves Rebuke on it (everyone passes; the Cleanup after resolution has run). */
async function rebuked(): Promise<Game> {
  const game = await p2FacingPoro();
  await game.p2.cast("rebuke", { targets: "poro" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P2, targets: ["poro"] })]);
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

/** …then on to P1's turn 4 with 2 + [1][order] floating (replay + re-Equip); P1 replays the Poro to base. */
async function replayed(): Promise<Game> {
  const game = await rebuked();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 3, power: { order: 1 } });
  await game.p1.play("poro", { to: "base" });
  await game.settle();
  return game;
}

describe("premise: the Spectacled Poro IS 'Ruined Rex' at bf1 — 6 Might, cost 6+[mind], Mind, Deathknell, no Poro tag — exhausted, 1 damage", () => {
  test("Equip → choose Rex: the Poro's sheet becomes Rex's copyable traits (477.1.b.1) while its statuses stay (exhausted); on P2's turn the ping marks 1 damage", async () => {
    const game = await p2FacingPoro();
    expect(game.state("poro")).toMatchObject({
      attachments: ["specs"],
      baseMight: 6,
      damage: 1,
      domains: ["mind"],
      energyCost: 6,
      isExhausted: true,
      location: "bf1",
      might: 6,
      name: "Ruined Rex",
      powerCost: ["mind"],
    });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
    expect(tagsOf("poro")).not.toContain("Poro");
    expect(game.state("specs")).toMatchObject({ attachedTo: "poro", controller: P1, location: "bf1" });
    expect(game.state("rex")).toMatchObject({ location: "base", might: 6, name: "Ruined Rex" }); // the model is untouched
  });
});

describe("(a) Gust checks CURRENT Might: the 6-Might copy is out of reach, the bare 2-Might Poro is not", () => {
  test("NO: with the Spectacles on, Gust (≤ 3 Might at a battlefield) offers only the 1-Might Flag — not the 6-Might 'Ruined Rex' Poro, not the 5-Might Wall — and naming the Poro is rejected", async () => {
    const game = await p2FacingPoro();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(targetsOffered(game, P2, "gust")).toEqual(["flag"]);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "poro" }))).ok).toBe(false);
    expect(game.locationOf("poro")).toBe("bf1");
  });

  test("YES contrast: the same Poro WITHOUT Spectacles is a 2-Might unit at a battlefield → Gust offers it (and the Flag); Gust resolves → Poro in P1's hand", async () => {
    const game = await p2FacingPoro({ bare: true });
    expect(game.state("poro")).toMatchObject({ might: 2, name: "Daring Poro" });
    expect(targetsOffered(game, P2, "gust")).toEqual(["flag", "poro"]);
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toContain("poro");
  });

  test("Rebuke has no Might cap: it offers every unit at a battlefield — the 6-Might copy included (poro, flag, wall), never Rex in base", async () => {
    const game = await p2FacingPoro();
    expect(targetsOffered(game, P2, "rebuke")).toEqual(["flag", "poro", "wall"]);
  });
});

describe("(b) Rebuke bounces it: P1's hand gets PRINTED Daring Poro (124); Spectacles fall off and go home; no Deathknell", () => {
  test("it goes to its OWNER's hand — P1's — and Rebuke to P2's trash; P2 paid 2 + [chaos][chaos]", async () => {
    const game = await rebuked();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toContain("poro");
    expect(game.p2.hand()).not.toContain("poro");
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  });

  test("124 / 124.1 / 206: the card in hand is a NEW object reading its printed self — 'Daring Poro', cost 2 (no power), Order, 2 Might, [Assault], Poro tag — with NO damage, NOT exhausted, no attachments, not a copy of anything", async () => {
    const game = await rebuked();
    expect(game.state("poro")).toMatchObject({
      attachments: [],
      baseMight: 2,
      damage: 0,
      domains: ["order"],
      energyCost: 2,
      isExhausted: false,
      isStunned: false,
      might: 2,
      mightModifier: 0,
      name: "Daring Poro",
      owner: P1,
      powerCost: [],
      zone: "hand",
    });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(tagsOf("poro")).toEqual(["Poro"]);
    expect(game.findAll({ name: "Ruined Rex" })).toEqual(["rex"]); // only the real Rex answers to that name now
  });

  // 124.1: "all Temporary Modifications of all kinds cease to be tracked on it in all capacities". The engine clears
  // damage/exhausted/copy but leaves the turn-scoped `dealtDamageThisTurn` marker (read by "if I wasn't dealt damage
  // this turn" conditions, ven-024-166) on the card in hand — and it is still there after the replay next turn.
  test("124.1 — the bounced card carries NO 'was dealt damage this turn' history into the hand (engine keeps meta.dealtDamageThisTurn = true on the new object)", async () => {
    const game = await rebuked();
    expect(game.state("poro").meta.dealtDamageThisTurn).not.toBe(true);
  });

  test("435.1 / 457.1: the Spectacles could not follow — DETACHED, unattached, still P1's (owner = controller), READY as before, and after the Cleanup they sit in P1's base; never in any trash or hand", async () => {
    const game = await rebuked();
    expect(game.state("specs")).toMatchObject({
      attachedTo: undefined,
      controller: P1,
      isReady: true,
      location: "base",
      owner: P1,
      zone: "base",
    });
    expect(game.p1.gear()).toEqual(["specs"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash().sort()).toEqual(["ping", "rebuke"]);
  });

  test("808.1.d: a bounce is not a kill — no Deathknell of any kind: nothing was put on the chain, P2's Wall (the only enemy unit) is undamaged, the real Rex untouched; bf1 still P1's via the Flag", async () => {
    const game = await rebuked();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall")).toMatchObject({ damage: 0, location: "bf2", might: 5 });
    expect(game.state("rex")).toMatchObject({ damage: 0, location: "base", might: 6 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) next turn P1 replays it: pays the PRINTED 2; a fresh exhausted Daring Poro, unequipped, not a copy", () => {
  test("on P1's turn the hand Poro is playable for exactly 2 energy (not 6 + [mind]) to base or to P1's bf1; playing it to base spends 2 and leaves the [1][order] meant for the re-Equip", async () => {
    const game = await rebuked();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { order: 1 } });
    expect(game.p1.can("play", "poro")).toBe(true);
    const dests = (game.p1.option("playUnit", "poro")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(dests.map((z) => z.replace(/^battlefield-/, "")).sort()).toEqual(["base", "bf1"]);
    await game.p1.play("poro", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.zoneOf("poro")).toBe("base");
  });

  test("full sheet of the replayed unit: 'Daring Poro', Order, cost 2, 2 Might (base 2, no modifier), [Assault] only, Poro tag, 0 damage, EXHAUSTED (143.4), in P1's base, no attachments, controller = owner = P1 — and it is not 'Ruined Rex' in any respect", async () => {
    const game = await replayed();
    expect(game.state("poro")).toMatchObject({
      attachments: [],
      baseMight: 2,
      controller: P1,
      damage: 0,
      domains: ["order"],
      energyCost: 2,
      grantedKeywords: [],
      isBuffed: false,
      isExhausted: true,
      isStunned: false,
      location: "base",
      might: 2,
      mightModifier: 0,
      name: "Daring Poro",
      owner: P1,
      powerCost: [],
      zone: "base",
    });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(tagsOf("poro")).toEqual(["Poro"]);
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, location: "base" });
    expect(game.findAll({ name: "Ruined Rex" })).toEqual(["rex"]);
    expect(game.violations()).toEqual([]);
  });

  // Same 124.1 leak as in (b), observed one turn later on the board: a unit that has never been dealt damage in
  // this existence reads "dealt damage this turn".
  test("124.1 — the replayed Poro (a new object, played on a later turn) has no 'dealt damage this turn' marker (engine still reports meta.dealtDamageThisTurn = true)", async () => {
    const game = await replayed();
    expect(game.state("poro").meta.dealtDamageThisTurn).not.toBe(true);
  });
});

describe("(d) re-Equipping the same Spectacles: legal, and 'choose another friendly unit' is asked anew (370.1.b.1)", () => {
  test("the loose Spectacles offer [Equip] onto the replayed Poro (and Rex / Flag); paying [1][order] and attaching asks the model AFRESH: Rex | Flag — nothing pre-selected from last time", async () => {
    const game = await replayed();
    const equip = game.p1.option("equipCard:-");
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["specs"]);
    expect([...((equip?.fields.find((f) => f.name === "unitId")?.options as string[] | undefined) ?? [])].sort()).toEqual(["flag", "poro", "rex"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["flag", "rex"]); // "another": never the Poro itself
  });

  test("choosing Rex again works exactly as the first time: the Poro is once more a 6-Might 'Ruined Rex' with Deathknell, still exhausted, 0 damage, wearing the Spectacles", async () => {
    const game = await replayed();
    await equipCopying(game, "poro", "rex");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], damage: 0, energyCost: 6, isExhausted: true, might: 6, name: "Ruined Rex" });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
  });

  test("…but it need not be Rex: choosing the Flag instead makes the Poro a 1-Might 'Flag' (no keywords) — the model is whatever is chosen at THIS attachment", async () => {
    const game = await replayed();
    await equipCopying(game, "poro", "flag");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], baseMight: 1, might: 1, name: "Flag" });
    expect(game.state("poro").keywords).toEqual([]);
    expect(game.findAll({ name: "Ruined Rex" })).toEqual(["rex"]);
    expect(game.violations()).toEqual([]);
  });
});
