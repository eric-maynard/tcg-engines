/**
 * Tricksy Tentacles — unl-054-219 · Spell · Calm · 4 energy + [calm] · (no timing keyword)
 *
 *   Move any number of enemy units with the same controller and a total Might of 8 or less
 *   to a single location.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - 355.13 "any number" includes zero: castable with no enemy unit anywhere; resolves to trash.
 *  - The cap is on the SUM of the chosen units' current (effective) Might: {4,3} ok, {8} ok,
 *    {4,5} and {9} not; a buffed 4 (+5) counts as 9. 355.11.b: re-checked as a group on resolution.
 *  - "same controller" only bites with 3+ players: P2's and P3's units can never be mixed.
 *  - "to a single location" (198.1: locations = battlefields AND bases): all chosen units go to
 *    ONE destination — another battlefield or their controller's base; never split.
 *  - Moving enemy units into a battlefield you hold makes it Contested (450) — the spell is a
 *    tempo tool, and moving them OUT of a battlefield they hold alone leaves it uncontrolled.
 *  - No [Action]/[Reaction]: standard timing only (your turn, open state, empty chain) — not in
 *    a showdown even while holding Focus, not on the opponent's turn.
 * Engine status: the hand-authored ability filters targets on a pseudo-keyword "same-controller",
 * so NO enemy unit is ever offered — every "moves something" clause below is a BUG test.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, P3, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-054-219";

function board(energy = 4, power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "tt");
}

/** Legal `targets` tuples offered for the cast, normalised to "a+b" strings. */
function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "tt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

/** Cast with `targets`, then drive resolution choosing `dest` whenever a destination is asked. */
async function castTo(game: Game, targets: string[], dest: string): Promise<void> {
  await game.p1.cast("tt", { targets });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = r.decision;
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const opt = d.options.find((o) => o.key === dest || o.zone === `battlefield-${dest}` || o.key === `battlefield-${dest}` || o.label.includes(dest));
    await game.p1.pick(opt?.key ?? dest);
  }
}

describe("Tricksy Tentacles (unl-054-219)", () => {
  test("cost & zero targets (355.13): castable choosing nothing; 4 energy + [calm] paid, goes on the chain, resolves to trash moving nobody", async () => {
    const game = await board().build();
    expect(targetSets(game)).toContain("");
    await game.p1.cast("tt", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.p2.units("bf1").sort()).toEqual(["five", "four", "three"]);
    expect(game.locationOf("mine")).toBe("base");
  });

  test("unaffordable with 3 energy or without a calm power (rainbow may stand in for [calm])", async () => {
    expect((await board(3, { calm: 1 }).build()).p1.can("cast", "tt")).toBe(false);
    expect((await board(4, {}).build()).p1.can("cast", "tt")).toBe(false);
    expect((await board(4, { fury: 1 }).build()).p1.can("cast", "tt")).toBe(false);
    expect((await board(4, { rainbow: 1 }).build()).p1.can("cast", "tt")).toBe(true);
  });

  test("standard timing: not castable on the opponent's turn, nor in a showdown while holding Focus, nor with a spell already on the chain", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "tt")).toBe(false);

    const showdown = await board().build();
    await showdown.p1.move("mine", "bf2"); // open battlefield → non-combat showdown, P1 has Focus
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "tt")).toBe(false);

    const chained = await board(8, { calm: 2 }).hand(P1, CARD, "tt2").build();
    await chained.p1.cast("tt", { targets: [] });
    expect(chained.p1.can("cast", "tt2")).toBe(false);
  });

  test("friendly units are never legal targets (enemy only)", async () => {
    const game = await board().build();
    expect(targetSets(game).some((s) => s.split("+").includes("mine"))).toBe(false);
    const r = await game.p1.try((p) => p.cast("tt", { targets: ["mine"] }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    expect(game.zoneOf("tt")).toBe("hand");
  });

  test("over the cap is illegal: {Four, Five} = 9 and {Four, Five, Three} = 12 are never offered", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).not.toContain("five+four");
    expect(sets).not.toContain("five+four+three");
    const r = await game.p1.try((p) => p.cast("tt", { targets: ["four", "five"] }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
  });

  test("enemy units totalling ≤ 8 Might should be offered as target sets ({4},{5},{3},{4,3},{5,3},{1},…) — engine offers only the empty set", async () => {
    // Expected: every same-controller subset with total Might ≤ 8 is a legal `targets` value.
    // Actual: the `same-controller` pseudo-keyword filter matches no unit → options = [[]].
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toEqual(expect.arrayContaining(["four", "five", "three", "four+three", "five+three"]));
    expect(sets).toContain("five+three"); // exactly 8 is "8 or less"
  });

  test("moves the chosen enemy units (Four + Three = 7) together to the chosen single location bf2; Five stays; bf2 uncontrolled → P2 now contests it", async () => {
    // Expected: both land at bf2 (446/450), keep their state, spell → trash. Actual: cast rejected (no legal variant).
    const game = await board().build();
    await castTo(game, ["four", "three"], "bf2");
    expect(game.locationOf("four")).toBe("bf2");
    expect(game.locationOf("three")).toBe("bf2");
    expect(game.locationOf("five")).toBe("bf1");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("a single 8-Might enemy unit is a legal choice on its own (boundary: 8 ≤ 8) and can be sent to its base", async () => {
    // Expected: {Eight} offered; destination may be P2's base (198.1 — a base is a location). Actual: nothing offered.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Eight" }, "eight")
      .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
      .hand(P1, CARD, "tt")
      .build();
    expect(targetSets(game)).toContain("eight");
    expect(targetSets(game)).not.toContain("chaff+eight"); // 9
    await castTo(game, ["eight"], "base");
    expect(game.locationOf("eight")).toBe("base");
    expect(game.locationOf("chaff")).toBe("bf1");
  });

  test("the cap uses CURRENT Might — a printed-4 unit carrying +5 this turn counts as 9 and is not offered, while a plain 4 is", async () => {
    // Expected: "pumped" (4+5) absent from every set, "plain" present. Actual: no sets at all, so the positive half fails.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Pumped" }, "pumped", { mightModifier: 5 })
      .unit(P2, "bf1", { might: 4, name: "Plain" }, "plain")
      .hand(P1, CARD, "tt")
      .build();
    expect(game.state("pumped").might).toBe(9);
    const sets = targetSets(game);
    expect(sets.some((s) => s.split("+").includes("pumped"))).toBe(false);
    expect(sets).toContain("plain");
  });

  test("emptying a battlefield P2 held alone — moving its only unit away leaves bf1 uncontrolled (466.5.b/323.6) and P2's unit contests bf2 (190.3.a) → the Cleanup begins that Combat with P2 attacking (323.13); Lone(3) then dies to Holder(6)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Lone" }, "lone")
      .unit(P1, "bf2", { might: 6, name: "Holder" }, "holder")
      .hand(P1, CARD, "tt")
      .build();
    await game.p1.cast("tt", { targets: ["lone"] });
    // rule 355.4 — the shared destination is a play-time choice, asked at finalization
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    await game.p1.pick("battlefield-bf2");
    await game.p1.passPriority(); // now it resolves; its Cleanup follows at once
    await game.p2.passPriority();
    expect(game.locationOf("lone")).toBe("bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf2", isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("lone")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
  });

  test("(3 players) 'same controller' — P2's and P3's units are each offered alone but never mixed in one set", async () => {
    // Expected: "p2u" and "p3u" each legal, "p2u+p3u" not (even though 2+2 ≤ 8). Actual: only [] offered.
    const game = await scenario({ players: 3 })
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "P2Unit" }, "p2u")
      .unit(P3, "bf1", { might: 2, name: "P3Unit" }, "p3u")
      .hand(P1, CARD, "tt")
      .build();
    const sets = targetSets(game);
    expect(sets).toContain("p2u");
    expect(sets).toContain("p3u");
    expect(sets).not.toContain("p2u+p3u");
    const mixed = await game.p1.try((p) => p.cast("tt", { targets: ["p2u", "p3u"] }));
    expect(mixed.ok).toBe(false);
  });

  test("registry payload: a standard-timing calm spell, 4 + [calm], whose one ability is a move of any number of ENEMY units", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 4, name: "Tricksy Tentacles", powerCost: ["calm"], timing: "standard" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { controller: "enemy", quantity: "any", type: "unit" }, type: "move" },
      type: "spell",
    });
    // The printed text has no per-unit Might filter and no timing keyword; the ≤ 8 cap is on the TOTAL.
    const filter = ((def?.abilities?.[0] as { effect?: { target?: { filter?: unknown[] } } })?.effect?.target?.filter ?? []) as Record<string, unknown>[];
    expect(filter.some((f) => "might" in f && (f.might as { lte?: number }).lte === 8)).toBe(true);
  });
});

describe("combat at an uncontrolled battlefield (466.5 / 466.5.e)", () => {
  // Tricksy Tentacles routinely drops enemy units into a battlefield the caster
  // contests; when both sides survive the combat the attackers are recalled
  // (466.1.a.2) and the player left standing here Establishes Control — even
  // though the OTHER player applied Contested (466.5.e).
  test("attackers recalled after a tie → the defending player alone at the uncontrolled battlefield establishes control and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 5, name: "D1" }, "d1", { stunned: true })
      .unit(P2, "bf1", { might: 5, name: "D2" }, "d2", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Raider" }, "a1")
      .build();
    await game.p1.move("a1", "bf1");
    await game.settle();
    // both sides survived: the stunned defenders dealt no damage, and 2 damage
    // is not lethal on either 5-Might defender.
    expect(game.locationOf("d1")).toBe("bf1");
    expect(game.locationOf("d2")).toBe("bf1");
    expect(game.zoneOf("a1")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
  });
});
