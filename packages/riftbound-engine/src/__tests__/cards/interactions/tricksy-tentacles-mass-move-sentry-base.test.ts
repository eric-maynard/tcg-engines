/**
 * Interaction: Tricksy Tentacles (unl-054-219) · Spell · Calm · 4 + [calm] · standard timing
 *     "Move any number of enemy units with the same controller and a total Might of 8 or less to a
 *      single location."
 *   × Determined Sentry (unl-111-219) · Unit · Body · 1 · 1 Might — "I can't move to base."
 *   × Shipyard Skulker (ogn-175-298) 3 Might · Vanguard Sergeant (ogn-219-298) 4 Might (vanilla)
 *   (contrast) Charm (ogn-043-298) "Move an enemy unit." ×3
 *
 * Rules: 355.4 / 355.4.a (move destinations are play-time choices; a valid location is any other
 * location where the units may be PRESENT), 355.7 (chosen units are targets), 323.7 (enemy permanents
 * never sit in your base), 446.3 (moving is instantaneous — a group arrives together), 420.3.a (only
 * the Standard Move exhausts), 054.1 (can't beats can), 359.3.e.6 / 359.3.e.11 (impossible instruction
 * ignored, the rest followed as far as possible), 190.3.a.1 / 450 (the ARRIVING units' controller
 * applies Contested), 190.4.a / 190.4.c / 323.6 (control kept while a unit remains; lost at the Cleanup
 * when none does), 453 (one Cleanup per Move), 323.8 / 323.9 / 323.13 (one Showdown / Combat staged
 * per Contested battlefield; Neutral Open → Combat begins), 464.2.c.1 / .1.a / .3 (Attacker = who applied
 * Contested, gains Focus; all their units there are attackers), 345, 348.2.a (Non-Combat Showdown:
 * sole remaining player conquers), 144.3 (only a Standard Move groups your OWN units).
 *
 * Question: three battlefields, P1's turn, Neutral Open. bfB: P2 holds it with Sentry(1) + Skulker(3)
 * + Sergeant(4) = 8. bfA: P1 holds it with one 6-Might unit. bfC: empty. P1 casts Tricksy Tentacles.
 *  (a) mover set + ONE destination chosen at finalization; offered destinations = {bfA, bfC, P2 base};
 *      a 9-Might set is not constructible; P2's base is offered despite Sentry.
 *  (b) → P2's base: Skulker + Sergeant arrive ready; Sentry can't → stays; P2 keeps bfB; nothing staged.
 *  (c) → bfA: one Contested (by P2), one Combat, P2 attacks with all three (none exhausted) and has
 *      Focus on P1's turn; bfB goes uncontrolled; 8 dmg kills the 6, P2 conquers bfA and scores.
 *  (d) → bfC: one Non-Combat Showdown, P2 has Focus; pass/pass → P2 conquers bfC (+1).
 *  (e) contrast: single-unit Charms — the first arrival at bfA already begins a Combat and Charm
 *      (no Action/Reaction) cannot be cast again until it is over.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRICKSY_TENTACLES = "unl-054-219";
const DETERMINED_SENTRY = "unl-111-219";
const SHIPYARD_SKULKER = "ogn-175-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const CHARM = "ogn-043-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bfA", { might: 6, name: "Six" }, "six")
    .unit(P2, "bfB", DETERMINED_SENTRY, "sentry")
    .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
    .unit(P2, "bfB", VANGUARD_SERGEANT, "sergeant")
    .hand(P1, TRICKSY_TENTACLES, "tt");
}

const TRIO = ["sentry", "skulker", "sergeant"] as const;

/** Legal `targets` sets offered for the cast, normalised to sorted "a+b" strings. */
function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "tt")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const showdownStack = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []) as readonly {
    active?: boolean;
    attackingPlayer?: string | null;
    battlefieldId?: string;
    defendingPlayer?: string | null;
    focusPlayer?: string | null;
    isCombatShowdown?: boolean;
  }[];

function isDestinationPick(d: Decision | null): d is PickDecision {
  return d?.kind === "pick" && d.seat === P1 && d.semantics === "destination";
}

/**
 * Cast Tricksy Tentacles on the whole trio and drive it up to the (single) destination prompt,
 * wherever the engine asks it (finalization or resolution). Returns that prompt.
 */
async function castTrioToPrompt(game: Game, targets: readonly string[] = TRIO): Promise<PickDecision> {
  await game.p1.cast("tt", { targets: [...targets] });
  let d = game.decision();
  if (!isDestinationPick(d)) {
    d = (await game.settle()).decision;
  }
  expect(isDestinationPick(d)).toBe(true);
  return d as PickDecision;
}

/** Cast on `targets`, answer the destination, and let the spell finish resolving (stops at any begun showdown). */
async function castTrioTo(game: Game, destination: "base" | "battlefield-bfA" | "battlefield-bfC", targets: readonly string[] = TRIO): Promise<void> {
  const d = await castTrioToPrompt(game, targets);
  const wasFinalization = d.timing === "FIN";
  await game.p1.pick(destination);
  if (wasFinalization) {
    // chosen before priority (355.4) → now both pass and it resolves
    await game.p1.passPriority();
    await game.p2.passPriority();
  }
  expect(game.zoneOf("tt")).toBe("trash");
}

describe("Tricksy Tentacles × Determined Sentry — (a) finalization choices", () => {
  test("the mover SET is a play-time choice: {Sentry, Skulker, Sergeant} = exactly 8 is offered and lands on the chain item before anyone gets priority (355.7)", async () => {
    const game = await board().build();
    expect(targetSets(game)).toContain("sentry+sergeant+skulker");
    await game.p1.cast("tt", { targets: [...TRIO] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tt", controller: P1, targets: [...TRIO], triggered: false }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("a set totalling 9 is not constructible: with an extra 1-Might P2 unit, {Sentry, Skulker, Sergeant, Extra} = 9 is neither offered nor accepted, while every offered set sums to ≤ 8", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Extra" }, "extra").build();
    const sets = targetSets(game);
    expect(sets).toContain("extra+sergeant+skulker"); // 1+4+3 = 8, another exact-8 set
    expect(sets).not.toContain("extra+sentry+sergeant+skulker"); // 9
    for (const s of sets) {
      const total = s === "" ? 0 : s.split("+").reduce((sum, id) => sum + game.state(id).might, 0);
      expect(total).toBeLessThanOrEqual(8);
    }
    const r = await game.p1.try((p) => p.cast("tt", { targets: ["sentry", "skulker", "sergeant", "extra"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("tt")).toBe("hand");
  });

  test("the single shared destination is chosen at FINALIZATION, before P1 passes priority (355.4)", async () => {
    // Right after cast() the pending decision is P1's destination pick (timing FIN), THEN priority.
    const game = await board().build();
    await game.p1.cast("tt", { targets: [...TRIO] });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  });

  test("exactly ONE destination decision is made for the whole set ('a single location'), offering {P2's base, bfA, bfC} — not bfB (current) and not P1's base (323.7); P2's base IS offered despite Sentry (355.4.a tests presence, not whether every move will succeed — 359.3.e.6)", async () => {
    const game = await board().build();
    const d = await castTrioToPrompt(game);
    expect(d.max).toBe(1);
    const offered = d.options.map((o) => o.zone ?? o.key).sort();
    expect(offered).toEqual(["base", "battlefield-bfA", "battlefield-bfC"]);
    // "base" is the movers' controller's (P2's) base: picking it lands them in P2's base (see (b)).
    await game.p1.pick("battlefield-bfC");
    // no second destination prompt for the other two movers
    expect(isDestinationPick(game.decision())).toBe(false);
    // chosen before priority (355.4) → both pass and the spell resolves the whole group at once
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (const u of TRIO) {
      expect(game.locationOf(u)).toBe("bfC");
    }
  });
});

describe("Tricksy Tentacles × Determined Sentry — (b) destination = P2's base", () => {
  test("Skulker and Sergeant move together to P2's base and arrive READY (446.3 / 420.3.a — an effect move exhausts nothing)", async () => {
    const game = await board().build();
    await castTrioTo(game, "base");
    for (const u of ["skulker", "sergeant"]) {
      expect(game.locationOf(u)).toBe("base");
      expect(game.state(u).owner).toBe(P2);
      expect(game.p2.base()).toContain(u);
      expect(game.state(u).isExhausted).toBe(false);
    }
    expect(game.p1.base()).not.toContain("skulker");
    expect(showdownStack(game)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Determined Sentry 'can't move to base' — its move is impossible and ignored (054.1 / 359.3.e.6 / .e.11): Sentry stays at bfB and P2 KEEPS control of bfB (190.4.a)", async () => {
    const game = await board().build();
    await castTrioTo(game, "base");
    expect(game.locationOf("sentry")).toBe("bfB");
    expect(game.state("sentry").isExhausted).toBe(false);
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(showdownStack(game)).toHaveLength(0);
  });

  test("Sentry NOT included ({Skulker, Sergeant} = 7 → base): Sentry remains at bfB, so P2 keeps control of bfB and nothing is staged", async () => {
    const game = await board().build();
    await castTrioTo(game, "base", ["skulker", "sergeant"]);
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.locationOf("sergeant")).toBe("base");
    expect(game.locationOf("sentry")).toBe("bfB");
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(showdownStack(game)).toHaveLength(0);
  });

  test("Sentry not PRESENT at all: moving Skulker + Sergeant home empties bfB → the Cleanup strips P2's control (323.6 / 190.4.c); bfB is uncontrolled, not P1's, and nothing is staged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", { might: 6, name: "Six" }, "six")
      .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
      .unit(P2, "bfB", VANGUARD_SERGEANT, "sergeant")
      .hand(P1, TRICKSY_TENTACLES, "tt")
      .build();
    await castTrioTo(game, "base", ["skulker", "sergeant"]);
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(showdownStack(game)).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });
});

describe("Tricksy Tentacles × Determined Sentry — (c) destination = bfA (P1's held battlefield)", () => {
  test("all three arrive at bfA in one instant, unexhausted; Contested is applied ONCE by P2 (their controller, 190.3.a.1/450) even though P1 cast the spell; ONE Combat showdown is begun there with P2 = Attacker holding Focus on P1's turn (464.2.c.1/.1.a, 345)", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfA");
    for (const u of TRIO) {
      expect(game.locationOf(u)).toBe("bfA");
      expect(game.state(u).isExhausted).toBe(false);
    }
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    const stack = showdownStack(game);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(0);
  });

  test("Sentry, Skulker AND Sergeant all carry the Attacker designation, the lone 6 is the Defender (464.2.c.3)", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfA");
    for (const u of TRIO) {
      expect(game.state(u).combatRole).toBe("attacker");
    }
    expect(game.state("six").combatRole).toBe("defender");
  });

  test("the same post-move Cleanup drops P2's control of the now-empty bfB (323.6) — no showdown is staged there and bfC is untouched", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfA");
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: null });
    expect(showdownStack(game).filter((s) => s.battlefieldId !== "bfA")).toHaveLength(0);
  });

  test("pass/pass: 1+3+4 = 8 kills the 6; its 6 damage is assigned lethal-first so at least one attacker survives → P2 conquers bfA and scores +1 on P1's turn", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfA");
    await game.settle();
    expect(game.zoneOf("six")).toBe("trash");
    const survivors = TRIO.filter((u) => game.zoneOf(u) === "battlefield-bfA");
    const dead = TRIO.filter((u) => game.zoneOf(u) === "trash");
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    expect(survivors.length + dead.length).toBe(3);
    // lethal-first: 6 damage must have fully killed whatever it was put on before spilling (any legal split kills ≥ 1)
    expect(dead.length).toBeGreaterThanOrEqual(1);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Tricksy Tentacles × Determined Sentry — (d) destination = bfC (empty, uncontrolled)", () => {
  test("one Contested application by P2, ONE Non-Combat Showdown staged and begun with P2 holding Focus on P1's turn (345)", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfC");
    for (const u of TRIO) {
      expect(game.locationOf(u)).toBe("bfC");
      expect(game.state(u).isExhausted).toBe(false);
    }
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    const stack = showdownStack(game);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
  });

  test("everyone passes → only P2's units remain: P2 establishes control and CONQUERS bfC for +1 on the caster's turn (348.2.a — the Blast-Cone lesson)", async () => {
    const game = await board().build();
    await castTrioTo(game, "battlefield-bfC");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("Tricksy Tentacles × Determined Sentry — (e) contrast: three single-unit Charms", () => {
  function charmBoard() {
    return scenario()
      .resources(P1, { energy: 3, power: { calm: 3 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", { might: 6, name: "Six" }, "six")
      .unit(P2, "bfB", DETERMINED_SENTRY, "sentry")
      .unit(P2, "bfB", SHIPYARD_SKULKER, "skulker")
      .unit(P2, "bfB", VANGUARD_SERGEANT, "sergeant")
      .hand(P1, CHARM, "charm1")
      .hand(P1, CHARM, "charm2")
      .hand(P1, CHARM, "charm3");
  }

  test("the FIRST Charm (Skulker → bfA, destination named at finalization) resolves, its own Cleanup stages AND begins a Combat at bfA at once (453 / 323.13) — Skulker alone is the attacker, P2 has Focus", async () => {
    const game = await charmBoard().build();
    await game.p1.cast("charm1", { targets: "skulker" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    await game.p1.pick("battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("charm1")).toBe("trash");
    expect(game.locationOf("skulker")).toBe("bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdownStack(game)).toHaveLength(1);
    expect(showdownStack(game)[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("sentry").combatRole).toBeNull();
    expect(game.state("sergeant").combatRole).toBeNull();
    // Sentry + Sergeant still hold bfB for P2
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
  });

  test("Charm has no Action/Reaction tag: the 2nd Charm cannot be cast during that combat's showdown — not while P2 holds Focus, and not after Focus passes to P1", async () => {
    const game = await charmBoard().build();
    await game.p1.cast("charm1", { targets: "skulker" });
    await game.p1.pick("battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.can("cast", "charm2")).toBe(false);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "charm2")).toBe(false);
    await expect(game.p1.cast("charm2", { targets: "sergeant" })).rejects.toThrow();
  });

  test("only after that combat resolves (Skulker 3 dies to the 6) is P1 back in a Neutral Open State and may cast Charm #2 — each single-unit move is its own action, Cleanup and showdown", async () => {
    const game = await charmBoard().build();
    await game.p1.cast("charm1", { targets: "skulker" });
    await game.p1.pick("battlefield-bfA");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("six")).toBe("battlefield-bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "charm2")).toBe(true);
    // second Charm: Sergeant → bfA is a NEW arrival → a new Contested application and a second combat
    await game.p1.cast("charm2", { targets: "sergeant" });
    await game.p1.pick("battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2 });
    expect(showdownStack(game).filter((s) => s.active)).toHaveLength(1);
    expect(game.state("sergeant").combatRole).toBe("attacker");
    expect(game.p1.can("cast", "charm3")).toBe(false);
  });

  test("a multi-unit STANDARD Move (144.3) is the own-units analogue: P2 moving all three from base to bfC on P2's turn is ONE action → one arrival, one Contested, one showdown", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", { might: 6, name: "Six" }, "six")
      .unit(P2, "base", DETERMINED_SENTRY, "sentry")
      .unit(P2, "base", SHIPYARD_SKULKER, "skulker")
      .unit(P2, "base", VANGUARD_SERGEANT, "sergeant")
      .build();
    await game.p2.move([...TRIO], "bfC");
    for (const u of TRIO) {
      expect(game.locationOf(u)).toBe("bfC");
      expect(game.state(u).isExhausted).toBe(true); // the Standard Move's cost (420.3.a / 144.3.c)
    }
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P2 });
    expect(showdownStack(game)).toHaveLength(1);
    expect(showdownStack(game)[0]).toMatchObject({ battlefieldId: "bfC", focusPlayer: P2, isCombatShowdown: false });
  });
});
