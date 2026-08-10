/**
 * Interaction: Bone Skewer (unl-139-219) · Spell · Chaos · 2 + [chaos] · [Hidden]
 *     "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that
 *      unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Mageseeker Warden (ogn-070-298) · Unit · Calm · 6 + [calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla — the unit in P2's hand)
 *
 * Rules: 355.5 / 355.10.b ("Choose a battlefield" is an explicit play-time choice), 358.3.a (an effect that
 * PREVENTS an action never makes the card that INSTRUCTS it illegal — the instruction is just skipped),
 * 419.3 / 419.3.b (the forced play is a Limited Play performed by P2, following every normal step incl.
 * location legality), 419.3.c (no eligible card → nothing happens, resolution continues), 054.1 (can't beats
 * can — the Warden's "only to their base" beats "to that battlefield"), 128.6 ("you may choose" is declinable),
 * 356.5.a (any-and-all → total 0), 387 (the reflexive "When they do, Stun it" only exists if they DID),
 * 424.1 (a revealed hand is shown to all players), 190.3.a.1 / 323.12 / 323.13 / 348.2.a.1 (a unit played
 * to a battlefield its controller doesn't control contests it → showdown / combat at the next cleanup).
 *
 * Question — P1's turn; P2's hand = Vanguard Sergeant + one spell; P1 casts Bone Skewer from hand naming a
 * battlefield other than bf1 (bf2 open, or bf3 which P1 holds with a Picket).
 *  (a) P1's Warden stands AT bf1: is P2's hand revealed? Is P1 offered the Sergeant? Anything played/stunned?
 *  (b) P1's Warden is in P1's BASE instead.
 *  (c) The Warden is P2's own (at bf1): does it stop P2's forced play?
 *  (d) Rollback probe on (a): a raw answer naming the Sergeant anyway.
 *
 * Expected:
 *  common — legal to cast on every board (358.3.a), 2 + [chaos] paid, P2 gets a priority window.
 *  (a) The reveal executes (P2's hand public for the resolution). The play would be BY P2 "to that
 *      battlefield"; P2 is an opponent of the Warden's controller and the Warden is at a battlefield → P2 may
 *      only play units to base → no card in P2's hand is eligible → 419.3.c: P1 is offered nothing but
 *      "decline" (or no prompt), nothing is played, no Stun trigger, Sergeant stays in hand, the named
 *      battlefield is untouched (no Contested / showdown), Bone Skewer → P1's trash, chain empty.
 *  (b) Warden in base imposes nothing: P1 offered {Sergeant} + decline; picking it → P2 plays it to the named
 *      battlefield for 0 (P2's empty pool untouched), exhausted, under P2's control, then Stunned. Named bf2
 *      (open) → P2 contests → Non-Combat Showdown, all pass → P2 conquers bf2 (+1) on P1's turn. Named bf3
 *      (P1's) → Contested by P2 → combat with P2 attacking / on Focus first.
 *  (c) The Warden only binds OPPONENTS of its controller; P2 controls it → exactly as (b).
 *  (d) The raw pick is rejected; state identical to the legal (a) outcome.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const MAGESEEKER_WARDEN = "ogn-070-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const JUNK_SPELL = { abilities: [], cardType: "spell", energyCost: 1, name: "Junk Spell", timing: "action" } as const;

type WardenAt = "p1-bf1" | "p1-base" | "p2-bf1";

/**
 * P1's turn 2 with exactly 2 + [chaos]. bf1: held by whoever owns the Warden there (P1's Holder stands in when
 * the Warden is in P1's base). bf2: open. bf3: P1's, held by a 2-Might Picket. P2: empty pool, hand =
 * Vanguard Sergeant + Junk Spell. P1's hand: Bone Skewer.
 */
function board(warden: WardenAt) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: warden === "p2-bf1" ? P2 : P1 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "bf3", { might: 2, name: "Picket" }, "picket")
    .hand(P2, VANGUARD_SERGEANT, "sarge")
    .hand(P2, JUNK_SPELL, "junk")
    .hand(P1, BONE_SKEWER, "bs")
    .fillDecks({ main: 10, runes: 0 });
  if (warden === "p1-bf1") {
    s = s.unit(P1, "bf1", MAGESEEKER_WARDEN, "warden");
  } else if (warden === "p1-base") {
    s = s.unit(P1, "base", MAGESEEKER_WARDEN, "warden").unit(P1, "bf1", { might: 2, name: "Holder" }, "holder");
  } else {
    s = s.unit(P2, "bf1", MAGESEEKER_WARDEN, "warden");
  }
  return s;
}

/** Cast Bone Skewer naming `bf`, both pass once → it resolves (reveal, then P1's pick prompt if any). */
async function castAndResolve(warden: WardenAt, bf: "bf2" | "bf3"): Promise<Game> {
  const game = await board(warden).build();
  await game.p1.cast("bs", { targets: bf });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bs", controller: P1, triggered: false })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's window
  await game.p2.passPriority();
  return game;
}

/** The card ids P1's from-revealed pick offers right now ([] when there is no pick at all). */
function offeredUnits(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Drive to P1's open main phase without ever picking a card: decline picks, pass windows/focus. */
async function finishWithoutPicking(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).decline();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      throw new Error(`unexpected ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
}

/** The full "(a) nothing happened" end state. */
function expectNothingPlayed(game: Game, bf: "bf2" | "bf3"): void {
  expect(game.zoneOf("sarge")).toBe("hand");
  expect(game.p2.hand().sort()).toEqual(["junk", "sarge"]);
  expect(game.p2.units(bf)).toEqual([]);
  expect(game.p2.base()).toEqual([]);
  expect(game.chain()).toEqual([]);
  expect(game.gameState.battlefields[bf]?.contested ?? false).toBe(false);
  expect(game.gameState.battlefields[bf]?.controller ?? null).toBe(bf === "bf3" ? P1 : null);
  expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  expect(game.zoneOf("bs")).toBe("trash");
  expect(game.p1.trash()).toContain("bs");
  expect(game.p1.points()).toBe(0);
  expect(game.p2.points()).toBe(0);
}

describe("common — Bone Skewer is castable on all three boards and offers every battlefield (358.3.a, 355.5)", () => {
  for (const warden of ["p1-bf1", "p1-base", "p2-bf1"] as const) {
    test(`[${warden}] legal, 'Choose a battlefield' offers bf1/bf2/bf3, costs 2 + [chaos], P2 gets a priority window before it resolves`, async () => {
      const game = await board(warden).build();
      expect(game.p1.can("cast", "bs")).toBe(true);
      const offered = game.p1.option("cast", "bs")?.fields.find((f) => f.arg === "targets")?.options;
      expect(offered).toEqual([["bf1"], ["bf2"], ["bf3"]]);
      await castAndResolve(warden, "bf2"); // asserts cost + P2 window on the way
    });
  }
});

describe("(a) P1's own Warden AT bf1 — P2 (an opponent of the Warden) may only play units to base, so the forced play to bf2/bf3 has no eligible card", () => {
  test("'An opponent reveals their hand' still executes: P2's Sergeant + spell go on the public reveal record and P1's view of P2's hand is un-redacted during the resolution (424.1)", async () => {
    const before = await board("p1-bf1").build();
    expect(before.view(P1).zones.hand?.filter((c) => c.owner === P2).every(isHiddenView)).toBe(true);

    const game = await castAndResolve("p1-bf1", "bf2");
    expect(game.gameState.publicReveals?.at(-1)).toEqual({ cardIds: ["sarge", "junk"], playerId: P2, turn: 2 });
    const p2Hand = game.view(P1).zones.hand?.filter((c) => c.owner === P2) ?? [];
    expect(p2Hand.map((c) => (isHiddenView(c) ? "hidden" : c.id)).sort()).toEqual(["junk", "sarge"]);
  });

  test("naming open bf2: P1 is NOT offered the Sergeant — the offered set is empty / decline-only (419.3.c, 054.1)", async () => {
    const game = await castAndResolve("p1-bf1", "bf2");
    expect(offeredUnits(game)).toEqual([]);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ allowDecline: true, seat: P1 });
    }
    await expect(game.p1.pick("sarge")).rejects.toThrow();
  });

  test("naming P1's own bf3 (a battlefield P1 controls) changes nothing: still no Sergeant on offer", async () => {
    const game = await castAndResolve("p1-bf1", "bf3");
    expect(offeredUnits(game)).toEqual([]);
    await expect(game.p1.pick("sarge")).rejects.toThrow();
  });

  test("end state: nothing played, no 'When they do, Stun it' item ever appears, Sergeant in P2's hand un-stunned, bf2 not Contested / no showdown, P2's pool untouched, Bone Skewer → P1's trash, back to P1's open main phase", async () => {
    const game = await castAndResolve("p1-bf1", "bf2");
    let sawStunItem = false;
    for (let i = 0; i < 20; i++) {
      sawStunItem ||= game.chain().some((c) => c.cardId === "bs" && c.triggered);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await (d.kind === "pick" ? game.seat(d.seat).decline() : game.seat(d.seat).pass());
    }
    expect(sawStunItem).toBe(false);
    expectNothingPlayed(game, "bf2");
    expect(game.p1.can("startShowdown")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.activeReveals ?? []).toEqual([]); // the reveal window closed with the resolution
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) rollback probe on board (a) — a raw answer naming the Sergeant is refused and leaves the legal (a) state", () => {
  test("raw resolvePendingChoice{pickedCardId: sarge} is rejected by the engine; afterwards: Sergeant in hand (not on chain / bf2 / base, not stunned), bf2 uncontested, no trigger, P2's resources untouched, Bone Skewer completes to trash", async () => {
    const game = await castAndResolve("p1-bf1", "bf2");
    const raw = await game.p1.try((p) => p.do("resolvePendingChoice", { pickedCardId: "sarge" }));
    expect(raw.ok).toBe(false);
    // immediately after the refused answer nothing has moved
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.chain().some((c) => c.cardId === "sarge")).toBe(false);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: null });
    await finishWithoutPicking(game);
    expectNothingPlayed(game, "bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(b) P1's Warden in P1's BASE — no restriction: the Sergeant is offered and P2 plays it to the named battlefield", () => {
  test("P1 is offered exactly {Vanguard Sergeant} and may decline (128.6); declining plays nothing and Bone Skewer goes to the trash", async () => {
    const game = await castAndResolve("p1-base", "bf2");
    expect(game.locationOf("warden")).toBe("base");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(offeredUnits(game)).toEqual(["sarge"]);
    await game.p1.decline();
    await game.settle();
    expectNothingPlayed(game, "bf2");
  });

  test("picking it: P2 plays the Sergeant to bf2 with total cost 0 (356.5.a — P2's empty pool untouched); it is P2's (owner + controller), EXHAUSTED, and Stunned by the reflexive trigger; Bone Skewer → trash", async () => {
    const game = await castAndResolve("p1-base", "bf2");
    await game.p1.pick("sarge");
    expect(game.state("sarge")).toMatchObject({
      controller: P2,
      isExhausted: true,
      isStunned: true,
      might: 4,
      owner: P2,
      zone: "battlefield-bf2",
    });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.hand()).toEqual(["junk"]);
    expect(game.zoneOf("bs")).toBe("trash");
  });

  test("named OPEN bf2: P2 has applied Contested → a Non-Combat Showdown opens with P2 on Focus first although it is P1's turn (323.12, 345); all pass → P2 conquers bf2, +1 for P2 (348.2.a.1)", async () => {
    const game = await castAndResolve("p1-base", "bf2");
    await game.p1.pick("sarge");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf2");
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("sarge").combatRole).toBeNull();
    await game.settle(); // hands the auto-begun showdown back once…
    await game.settle(); // …then passes Focus for both
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("sarge")).toMatchObject({ isExhausted: true, isStunned: true, zone: "battlefield-bf2" });
  });

  test("named P1's bf3: Contested BY P2 while P1 still controls it → a Combat is staged and begins with P2 the attacker on Focus first, Sergeant attacker / Picket defender; the stunned Sergeant deals 0, Picket's 2 can't kill it → Sergeant recalled to P2's base, P1 keeps bf3, no points", async () => {
    const game = await castAndResolve("p1-base", "bf3");
    await game.p1.pick("sarge");
    expect(game.gameState.battlefields.bf3).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf3");
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.state("picket").combatRole).toBe("defender");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge").controller).toBe(P2);
    expect(game.zoneOf("picket")).toBe("battlefield-bf3");
    expect(game.gameState.battlefields.bf3).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) the Warden is P2's OWN (at bf1) — it restricts only P2's opponents, so P2's forced play proceeds exactly as in (b)", () => {
  test("P1 is offered {Vanguard Sergeant} + decline although a Warden stands at a battlefield", async () => {
    const game = await castAndResolve("p2-bf1", "bf2");
    expect(game.state("warden")).toMatchObject({ controller: P2, location: "bf1" });
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(offeredUnits(game)).toEqual(["sarge"]);
  });

  test("picking it: the Sergeant lands at bf2 for 0 under P2, exhausted + Stunned, contests bf2 for P2 → showdown with P2 on Focus → P2 conquers bf2 (+1) on P1's turn", async () => {
    const game = await castAndResolve("p2-bf1", "bf2");
    await game.p1.pick("sarge");
    expect(game.state("sarge")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true, zone: "battlefield-bf2" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2 });
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf2");
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.actingSeat()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control within (c): the same P2 Warden DOES bind P1 — P1 (4 energy) may play a hand unit to base only, not to its own bf3", async () => {
    const game = await board("p2-bf1").hand(P1, VANGUARD_SERGEANT, "mySarge").build();
    await game.p1.do("addResources", { energy: 4 });
    const locations = game.p1.option("play", "mySarge")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect([...locations].map(String).map((z) => z.replace(/^battlefield-/, "")).sort()).toEqual(["base"]);
    await expect(game.p1.play("mySarge", { to: "bf3" })).rejects.toThrow();
  });
});
