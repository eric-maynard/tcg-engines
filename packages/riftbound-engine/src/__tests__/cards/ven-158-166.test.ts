/**
 * Heisho, Shell of the World — ven-158-166 · Battlefield · colorless
 *
 *   Players ignore [Deflect] while paying for spells and abilities choosing something here.
 *
 * Rules: 809 (Deflect [X]: opponents' spells AND abilities that choose this pay X more Power, any
 * domain, as a mandatory additional cost — 356.2.a.2), 765–767 (an "ignore [ability] while …"
 * instruction treats that ability as Inactive ONLY for the named procedure — here: paying costs —
 * and only for objects "here"; everyone else / everywhere else Deflect still bites), 809.3 (Deflect
 * remains a characteristic even while ignored), 105/190 (a battlefield's passive text applies no
 * matter who controls it — "Players").
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Scope is LOCATION, not controller: a Deflect unit AT Heisho is cheap to target for everybody;
 *     the same player's Deflect unit in a base or at another battlefield is taxed as usual (767).
 *  2. "spells AND abilities": a legend/gear activated ability choosing a unit here skips the tax too.
 *  3. "Players" — symmetric: it helps whoever is targeting, including the battlefield's non-controller.
 *  4. Deflect 2 (Sivir, Ambitious) is waived entirely, not reduced by one.
 *  5. Only the PAYMENT ignores it: the unit still HAS Deflect (keyword checks, "units with Deflect").
 *  6. With power in pool, targeting something here must not silently drain that power either.
 *
 * Engine status: the card's abilities did not parse (abilities: []), so every positive clause is a
 * BUG test; the negative-space clauses (Deflect elsewhere still taxed) hold today.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-158-166";
const POUTY_PORO = "ogn-013-298"; // Unit · Fury · 2 might · [Deflect]
const SIVIR_AMBITIOUS = "sfd-120-221"; // Unit · Body · 7 might · [Deflect 2]
const VOIDREAVER = "unl-201-219"; // Legend · "Spend 1 XP, [Exhaust]: [Buff] a unit." (ability index 1)
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};

/** P2 to act with `power`; P1's Poro sits at Heisho ("here"), another Poro in P1's base, a third at a plain battlefield. */
function board(power: Record<string, number> = {}, heishoController: typeof P1 | typeof P2 | null = P1) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power })
    .battlefield("heisho", { controller: heishoController, def: CARD, inert: false })
    .battlefield("plain", { controller: P1 })
    .unit(P1, "heisho", POUTY_PORO, "here")
    .unit(P1, "base", POUTY_PORO, "home")
    .unit(P1, "plain", POUTY_PORO, "away")
    .hand(P2, BOLT, "bolt");
}

describe("Heisho, Shell of the World (ven-158-166)", () => {
  test("registry payload — expected one static 'ignore Deflect while paying, for choices here' ability; the text did not parse (abilities: [])", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Heisho, Shell of the World" });
    expect(def?.abilities).toHaveLength(1);
    const text = JSON.stringify(def?.abilities?.[0]);
    expect(def?.abilities?.[0]).toMatchObject({ type: "static" });
    expect(text).toMatch(/deflect/i);
    expect(text).toMatch(/here/i);
  });

  test("an opponent's spell choosing my [Deflect] Poro AT Heisho needs no power at all — 1 energy pays it, the Poro takes 2 and dies", async () => {
    // Expected: legal with an empty power pool; only the printed 1 energy is spent. Actual: the
    // Deflect surcharge is still demanded, so the Poro here is not a legal choice.
    const game = await board({}).build();
    await game.p2.cast("bolt", { targets: "here" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("here")).toBe("trash");
  });

  test("with power available, choosing the Poro AT Heisho must not drain it (766: Deflect is inactive for the payment)", async () => {
    const game = await board({ calm: 1 }).build();
    await game.p2.cast("bolt", { targets: "here" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("here")).toBe("trash");
  });

  test("negative space (767): the same player's Deflect Poro in its BASE is still taxed while Heisho is on the table — illegal without power, pays 1 of any domain with it", async () => {
    const broke = await board({}).build();
    const r = await broke.p2.try((p) => p.cast("bolt", { targets: "home" }));
    expect(r.ok).toBe(false);
    expect(broke.zoneOf("bolt")).toBe("hand");
    const funded = await board({ mind: 1 }).build();
    await funded.p2.cast("bolt", { targets: "home" });
    expect(funded.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await funded.settle();
    expect(funded.zoneOf("home")).toBe("trash");
  });

  test("negative space (767): a Deflect Poro at ANOTHER battlefield is still taxed", async () => {
    const broke = await board({}).build();
    expect((await broke.p2.try((p) => p.cast("bolt", { targets: "away" }))).ok).toBe(false);
    const funded = await board({ fury: 1 }).build();
    await funded.p2.cast("bolt", { targets: "away" });
    expect(funded.p2.power("fury")).toBe(0);
    await funded.settle();
    expect(funded.zoneOf("away")).toBe("trash");
  });

  test("809.3: only the PAYMENT ignores it — the Poro at Heisho still has the Deflect keyword", async () => {
    const game = await board({}).build();
    expect(game.state("here").keywords).toContain("Deflect");
    expect(game.state("home").keywords).toContain("Deflect");
    expect(game.locationOf("here")).toBe("heisho");
  });

  test.failing("BUG: 'and abilities' — the opponent's LEGEND ability (Voidreaver: Spend 1 XP, Exhaust: Buff a unit) may choose my Poro at Heisho with no power", async () => {
    // Control: today the engine does tax abilities (with 0 power neither Poro is offered; with 1
    // power both are) — so the only missing piece is Heisho's waiver for the unit here.
    const game = await scenario()
      .active(P2)
      .xp(P2, 1)
      .resources(P2, { energy: 0 })
      .legend(P2, VOIDREAVER, "vr")
      .battlefield("heisho", { controller: null, def: CARD, inert: false })
      .unit(P1, "heisho", POUTY_PORO, "here")
      .unit(P1, "base", POUTY_PORO, "home")
      .build();
    const offered = game.p2.option("activate", "vr")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered).toContainEqual(["here"]);
    expect(offered).not.toContainEqual(["home"]);
    await game.p2.activate("vr", 1, { targets: "here" });
    await game.settle();
    expect(game.state("here").isBuffed).toBe(true);
    expect(game.p2.xp()).toBe(0);
  });

  test("'Players' is symmetric — on MY turn I can target the opponent's Deflect unit at Heisho (a battlefield THEY control) without power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("heisho", { controller: P2, def: CARD, inert: false })
      .unit(P2, "heisho", POUTY_PORO, "theirs")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "theirs" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("[Deflect 2] (Sivir, Ambitious) at Heisho is waived ENTIRELY — legal with zero power, and a lone power in pool is left untouched", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("heisho", { controller: P1, def: CARD, inert: false })
      .unit(P1, "heisho", SIVIR_AMBITIOUS, "sivir")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.state("sivir").keywords).toContain("Deflect");
    await game.p2.cast("bolt", { targets: "sivir" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.settle();
    expect(game.state("sivir").damage).toBe(2);
  });

  test("negative space for Deflect 2 elsewhere: Sivir in her BASE with only one power in the opponent's pool cannot be chosen (needs 2)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("heisho", { controller: P1, def: CARD, inert: false })
      .unit(P1, "base", SIVIR_AMBITIOUS, "sivir")
      .hand(P2, BOLT, "bolt")
      .build();
    expect((await game.p2.try((p) => p.cast("bolt", { targets: "sivir" }))).ok).toBe(false);
    const two = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1, fury: 1 } })
      .battlefield("heisho", { controller: P1, def: CARD, inert: false })
      .unit(P1, "base", SIVIR_AMBITIOUS, "sivir")
      .hand(P2, BOLT, "bolt")
      .build();
    await two.p2.cast("bolt", { targets: "sivir" });
    expect(two.p2.power()).toBe(0);
    await two.settle();
    expect(two.state("sivir").damage).toBe(2);
  });

  test("the controller's own spell was never taxed (809.1.c: opponents only) — P1 bolting its own Poro at Heisho pays just 1 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("heisho", { controller: P1, def: CARD, inert: false })
      .unit(P1, "heisho", POUTY_PORO, "mine")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "mine" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
