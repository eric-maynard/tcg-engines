/**
 * Interaction: The Harrowing (ogn-198-298) · Spell · Chaos · 6 + [chaos][chaos] · Action
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   × Jinx, Demolitionist (ogn-030-298) · Champion Unit · Fury · 3 + [fury] · 4 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.) [Assault 2]
 *      When you play me, discard 2."
 *   × Vaults of Helia (unl-219-219) · Battlefield — "When you hold here, your non-token units cost [1] more
 *     to play this turn."
 *   contrast: Portal Rescue (ogn-102-298) · Spell · Mind · 3 + [mind] · Action — "Banish a friendly unit,
 *     then its owner plays it to their base, ignoring its cost."
 *
 * Rules: 356.1.b.1 ("ignoring its cost" zeroes base Energy AND Power), 356.1.b.2 ("ignoring its Energy
 * cost" zeroes only the Energy; the Power pip stays), 356.1.b.3 (an ignored base never shields the card
 * from additional costs / increases added later), 356.2.b.1 + 805.1.a.1 / 805.2 / 805.6 (Accelerate =
 * optional additional [1][C] where C is the unit's domain — fury — declared and paid in that same play;
 * paid → enters ready), 356.3 (increases such as Vaults' +[1] are added on top), 356.6 (one total,
 * paid once), 143.4 (units enter exhausted otherwise), 419.3.b (an effect-play follows every normal step
 * incl. cost determination), 419.3.c (unpayable → nothing is played).
 *
 * Question: P1 held Vaults at the start of this turn. Jinx is in P1's trash; P1 resolves The Harrowing on her.
 *  (a) Accelerate elected → ONE payment of 2 energy + [fury][fury] (0 base + [fury] base pip + [1][fury]
 *      Accelerate + [1] Vaults); enters READY; a non-fury power cannot pay either pip.
 *  (b) Accelerate declined → 1 energy + [fury]; enters exhausted.
 *  (c) Same without having held Vaults: (a) = 1 + [fury][fury] ready; (b) = 0 + [fury] exhausted.
 *  (d) Portal Rescue under Vaults ("ignoring its cost"): replay costs exactly 1 energy, 0 power (not free);
 *      with Accelerate 2 energy + [fury], ready; with 0 energy Jinx cannot be replayed and stays banished.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_HARROWING = "ogn-198-298";
const JINX = "ogn-030-298";
const VAULTS_OF_HELIA = "unl-219-219";
const PORTAL_RESCUE = "ogn-102-298";
const FODDER_A = { cardType: "unit", energyCost: 9, might: 1, name: "Fodder A" } as const;
const FODDER_B = { cardType: "unit", energyCost: 9, might: 1, name: "Fodder B" } as const;

/**
 * P2 is about to end turn 2. P1 controls the Vaults (live text when `vaults`, inert otherwise) with a Holder on it,
 * has Jinx in the TRASH, The Harrowing + two 9-cost fodder cards in hand (discard food). No rune noise.
 */
function harrowingBoard(vaults: boolean) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: !vaults })
    .battlefield("other", { controller: null })
    .unit(P1, "vaults", { might: 2, name: "Holder" }, "holder")
    .trash(P1, JINX, "jinx")
    .hand(P1, THE_HARROWING, "harrowing")
    .hand(P1, FODDER_A, "fodA")
    .hand(P1, FODDER_B, "fodB")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .fillDecks({ main: 10, runes: 0 });
}

/** Same, but Jinx is ON THE BOARD (base, exhausted) and P1 holds Portal Rescue instead. */
function rescueBoard(vaults: boolean) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: !vaults })
    .battlefield("other", { controller: null })
    .unit(P1, "vaults", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", JINX, "jinx", { exhausted: true })
    .hand(P1, PORTAL_RESCUE, "portal")
    .hand(P1, FODDER_A, "fodA")
    .hand(P1, FODDER_B, "fodB")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .fillDecks({ main: 10, runes: 0 });
}

/**
 * P2 ends → P1's turn 3: P1 HOLDS the Vaults (+1, trigger resolves), reaches the open main phase, then floats
 * exactly `spell` + `extra` energy and the given power. (Engine quirk: with 2+ friendly units the Vaults trigger
 * surfaces a target prompt — answered with the Holder; the surcharge is player-wide either way. Flagged below.)
 */
async function holdThenFloat(game: Game, spell: { energy: number; power: Record<string, number> }, extra: { energy: number; power?: Record<string, number> }): Promise<void> {
  await game.p2.endTurn();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "vaults") {
      await game.p1.pick("holder");
    } else {
      break;
    }
  }
  await game.settle();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the Hold happened
  const power: Record<string, number> = { ...spell.power };
  for (const [k, v] of Object.entries(extra.power ?? {})) {
    power[k] = (power[k] ?? 0) + v;
  }
  await game.p1.do("addResources", { energy: spell.energy + extra.energy, power });
}

const HARROWING_COST = { energy: 6, power: { chaos: 2 } };
const RESCUE_COST = { energy: 3, power: { mind: 1 } };

/** Cast The Harrowing on Jinx (its own 6 + [chaos][chaos] paid at once) and let it resolve (both pass). */
async function resolveHarrowing(game: Game): Promise<void> {
  const before = game.p1.resources();
  await game.p1.cast("harrowing", { targets: "jinx" });
  expect(game.p1.energy()).toBe(before.energy - 6);
  expect(game.p1.power("chaos")).toBe((before.power.chaos ?? 0) - 2);
  expect(game.zoneOf("jinx")).toBe("trash"); // nothing about Jinx is paid or moved yet
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Cast Portal Rescue on Jinx and let it resolve (both pass). */
async function resolveRescue(game: Game): Promise<void> {
  const before = game.p1.resources();
  await game.p1.cast("portal", { targets: "jinx" });
  expect(game.p1.energy()).toBe(before.energy - 3);
  expect(game.p1.power("mind")).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/**
 * Finalize the effect-play of Jinx: answer the location prompt with `to` (if asked) and the Accelerate offer per
 * `accelerate` (if offered and acceptable). Stops once Jinx's cost is settled (her play trigger pending / main phase).
 */
async function finalizeJinx(game: Game, opts: { to?: string; accelerate: boolean }): Promise<{ accelOffered: boolean; locations: string[] }> {
  const out = { accelOffered: false, locations: [] as string[] };
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      out.locations = d.options.map((o) => o.key).sort();
      await game.p1.pick(opts.to ?? "base");
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      out.accelOffered = d.canAccept !== false;
      await (opts.accelerate && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else {
      break;
    }
  }
  return out;
}

/** Drain Jinx's "When you play me, discard 2" (pass priority, discard the two fodder cards). */
async function resolveDiscard(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => o.key === "fodA" || o.key === "fodB")?.key ?? (d.options[0]?.key as string);
      await game.p1.pick(want);
    } else {
      break;
    }
  }
}

describe("The Harrowing → Jinx under Vaults of Helia: Energy ignored, Power pip + Accelerate + Vaults surcharge still due", () => {
  // ── (a) Vaults held, Accelerate elected ─────────────────────────────────────────────────────

  test("(a) The Harrowing's own 6 + [chaos][chaos] is paid when it is cast; when it resolves Jinx becomes a pending play whose location set is {base, the controlled Vaults} and whose Accelerate is OFFERED (acceptable with 2 energy + 2 fury floating)", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 2, power: { fury: 2 } });
    await resolveHarrowing(game);
    expect(game.zoneOf("harrowing")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, fury: 2 } }); // nothing of Jinx's paid yet
    const seen = await finalizeJinx(game, { accelerate: true, to: "base" });
    expect(seen.locations).toEqual(["base", "battlefield-vaults"]);
    expect(seen.accelOffered).toBe(true);
  });

  test("(a) Accelerate elected: ONE payment of exactly 2 energy + [fury][fury] (0 base energy · [fury] base pip kept, 356.1.b.2 · +[1][fury] Accelerate · +[1] Vaults, 356.3) → pool 0/0, Jinx enters READY (805.6)", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 2, power: { fury: 2 } });
    await resolveHarrowing(game);
    await finalizeJinx(game, { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ controller: P1, isReady: true, might: 4, zone: "base" });
    // Her "When you play me, discard 2" is now the pending trigger.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true, type: "ability" })]);
  });

  test("(a) 'When you play me, discard 2' then resolves: P1 discards the two fodder cards (hand −2, both in the trash)", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 2, power: { fury: 2 } });
    await resolveHarrowing(game);
    await finalizeJinx(game, { accelerate: true, to: "base" });
    const hand = game.p1.hand().length;
    await resolveDiscard(game);
    expect(game.p1.hand()).toHaveLength(hand - 2);
    expect(game.zoneOf("fodA")).toBe("trash");
    expect(game.zoneOf("fodB")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) the pips must be FURY (805.1.a.1): with 2 energy + 1 fury + 1 calm the Accelerate [1][fury] cannot be met — no acceptable offer, only 1 energy + [fury] is taken, the calm is untouched, Jinx enters EXHAUSTED", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 2, power: { calm: 1, fury: 1 } });
    await resolveHarrowing(game);
    const seen = await finalizeJinx(game, { accelerate: true, to: "base" }); // would accept if legal
    expect(seen.accelOffered).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0, fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("(a) nor can calm stand in for the BASE [fury] pip: with 1 energy + 1 calm (no fury) under Vaults Jinx cannot be played at all — she stays in the trash, nothing else is spent (419.3.c)", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 1, power: { calm: 1 } });
    await resolveHarrowing(game);
    await finalizeJinx(game, { accelerate: false, to: "base" });
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0 } });
    expect(game.zoneOf("harrowing")).toBe("trash");
  });

  // ── (b) Vaults held, Accelerate declined ─────────────────────────────────────────────────────

  test("(b) Accelerate declined: 0 + [fury] + Vaults [1] = exactly 1 energy + [fury] → pool 0/0, Jinx enters EXHAUSTED (143.4)", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 1, power: { fury: 1 } });
    await resolveHarrowing(game);
    const seen = await finalizeJinx(game, { accelerate: false, to: "base" });
    expect(seen.accelOffered).toBe(false); // 1+1 cannot also cover [1][fury] — nothing acceptable to decline
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 4, zone: "base" });
  });

  test("(b) 356.1.b.3 — the ignored Energy never shields her from Vaults' +[1]: with 0 energy + 1 fury under Vaults the play is unpayable → Jinx stays in the trash, the fury is not spent", async () => {
    const game = await harrowingBoard(true).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 0, power: { fury: 1 } });
    await resolveHarrowing(game);
    await finalizeJinx(game, { accelerate: false, to: "base" });
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 1 } });
    expect(game.p1.hand().sort()).toEqual(["fodA", "fodB", "player-1:filler0"].sort()); // no discard trigger either
  });

  // ── (c) contrast: Vaults NOT held (inert battlefield) ────────────────────────────────────────

  test("(c) without Vaults, Accelerate elected: [1] + [fury][fury] → with exactly 1 energy + 2 fury the pool hits 0/0 and Jinx enters READY", async () => {
    const game = await harrowingBoard(false).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 1, power: { fury: 2 } });
    await resolveHarrowing(game);
    const seen = await finalizeJinx(game, { accelerate: true, to: "base" });
    expect(seen.accelOffered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("(c) without Vaults, Accelerate declined: [0] + [fury] → with 0 energy + 1 fury she is played, the fury is spent, enters EXHAUSTED", async () => {
    const game = await harrowingBoard(false).build();
    await holdThenFloat(game, HARROWING_COST, { energy: 0, power: { fury: 1 } });
    await resolveHarrowing(game);
    await finalizeJinx(game, { accelerate: false, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, zone: "base" });
    await resolveDiscard(game);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: Portal Rescue ("ignoring its cost") under Vaults ───────────────────────────

  test("(d) Portal Rescue under Vaults is NOT free: 'ignoring its cost' zeroes base Energy AND the [fury] pip (356.1.b.1) but Vaults still adds [1] (356.3) → with exactly 1 energy + 0 power the replay costs that 1; Jinx returns to base as a new object, EXHAUSTED", async () => {
    const game = await rescueBoard(true).build();
    await holdThenFloat(game, RESCUE_COST, { energy: 1 });
    await resolveRescue(game);
    await finalizeJinx(game, { accelerate: false });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("jinx")).toMatchObject({ controller: P1, isExhausted: true, zone: "base" });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("portal")).toBe("trash");
    // it WAS played: her play trigger is pending
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", triggered: true })]);
  });

  test("(d) with 0 energy left after Portal Rescue under Vaults the [1] cannot be paid → Jinx is banished and STAYS in banishment (not replayed, no discard trigger)", async () => {
    const game = await rescueBoard(true).build();
    await holdThenFloat(game, RESCUE_COST, { energy: 0 });
    await resolveRescue(game);
    await finalizeJinx(game, { accelerate: false });
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("banishment");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(3); // fodA, fodB, drawn card — nothing discarded
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d) Portal Rescue under Vaults with Accelerate elected: [0] + [1][fury] + Vaults [1] = 2 energy + [fury] → pool 0/0, Jinx enters READY", async () => {
    const game = await rescueBoard(true).build();
    await holdThenFloat(game, RESCUE_COST, { energy: 2, power: { fury: 1 } });
    await resolveRescue(game);
    const seen = await finalizeJinx(game, { accelerate: true });
    expect(seen.accelOffered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.state("jinx")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("(d) control — Portal Rescue WITHOUT Vaults really is free: 0 energy, 0 power → Jinx replayed to base exhausted", async () => {
    const game = await rescueBoard(false).build();
    await holdThenFloat(game, RESCUE_COST, { energy: 0 });
    await resolveRescue(game);
    await finalizeJinx(game, { accelerate: false });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.banishment()).toEqual([]);
  });

  // ── engine quirk met while building (d) ──────────────────────────────────────────────────────

  // Expected: Vaults' hold trigger chooses nothing — "your non-token units cost [1] more" is a player-wide
  // surcharge on future plays, so after the Hold P1's Beginning Phase proceeds with no decision sourced from
  // the Vaults. Actual: with two friendly units on the board (Holder + Jinx) the trigger surfaces a mandatory
  // "Choose a target for Vaults of Helia" pick between them (the surcharge is applied player-wide regardless).
  test("holding Vaults of Helia with two friendly units on board must not ask P1 to 'choose a target' — the surcharge has no object (356.3, unl-219-219 text)", async () => {
    const game = await rescueBoard(true).build();
    await game.p2.endTurn();
    const d = game.decision();
    const vaultsPick = d?.kind === "pick" && d.source?.cardId === "vaults";
    expect(vaultsPick).toBe(false);
  });
});
