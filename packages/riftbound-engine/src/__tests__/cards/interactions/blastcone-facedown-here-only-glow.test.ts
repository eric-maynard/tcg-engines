/**
 * Interaction: Blastcone Fae (ogn-097-298) × Pouty Poro (ogn-013-298) × Navori Scout (sfd-037-221)
 *
 *   Blastcone Fae — Unit · Mind · 2 · 2 Might · "[Hidden] / When you play me, give a unit
 *     -2 [Might] this turn, to a minimum of 1 [Might]."
 *   Pouty Poro — Unit · Fury · 2 Might · "[Deflect]"   (at the SAME battlefield as the facedown Fae)
 *   Navori Scout — Unit · Calm · 4 Might · "[Deflect]" (at the OTHER battlefield)
 *
 * Question: while the Fae is facedown at battlefield A, who may see it? And when it is played from
 * face down, are the on-play choice's legal targets restricted to units at A even though the
 * printed text just says "a unit"?
 *
 * Rules: 811.1.b (hidden at a battlefield you control; playable for [0] from the next turn on),
 * 811.1.c.3 (playing from face down opens a chain), 811.1.d.1 (a hidden permanent must be played
 * to that battlefield), 811.1.d.2 (a play effect of a card played from Hidden chooses among options
 * AT that battlefield — the rule's own worked example is this very card), 811.5.a (being facedown
 * is independent of having [Hidden]), 128.4 (a facedown board card is Private to its CONTROLLER),
 * 421.3, 355.10.d.2 (a sole legal choice is still a target), 809.1 ([Deflect]).
 *
 * This is the ENGINE-level half of the browser scenario: per-seat visibility is asserted on the
 * seat observations the client renders from (`game.view(seat)`), and "what glows" on the target set
 * the engine offers. DOM-level assertions (tilt class, hover preview, banner) live in the gated
 * live-app suite under `src/__tests__/harness-browser/`.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const FAE = "ogn-097-298";
const PORO = "ogn-013-298";
const SCOUT = "sfd-037-221";

/**
 * P2's turn. P1 controls bfA (held by a Guard) with the Fae hidden there; P2 controls bfB with the
 * Navori Scout on it and attacks bfA with the Pouty Poro, so both players have a unit at bfA and
 * P1 gets Focus — the window a hidden card is actually flipped in.
 */
function board(rainbow: number, guardMight = 6) {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { power: { rainbow } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: guardMight, name: "Guard" }, "guard")
    .unit(P2, "bfB", SCOUT, "scout")
    .unit(P2, "base", PORO, "poro")
    .facedown(P1, "bfA", FAE, "fae");
}

/** Open the combat at bfA and hand Focus to P1. */
async function intoShowdown(rainbow = 1, guardMight = 6): Promise<Game> {
  const game = await board(rainbow, guardMight).build();
  await game.p2.move("poro", "bfA");
  await game.p2.passFocus();
  return game;
}

const pickKeys = (game: Game): string[] => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key) : [];
};

describe("Blastcone Fae flipped at its battlefield: private while facedown, 'here' only when played (ogn-097-298 × ogn-013-298 × sfd-037-221)", () => {
  test("(1) while facedown the card is PRIVATE to its controller: P2's seat view carries a redacted placeholder and leaks neither id nor name, P1's own view carries the card, and only the COUNT is public (128.4, 811.5.a)", async () => {
    const game = await board(1).build();
    const theirs = game.view(P2).zones["facedown-bfA"] ?? [];
    expect(theirs).toHaveLength(1);
    expect(isHiddenView(theirs[0]!)).toBe(true);
    expect(theirs[0]).toMatchObject({ hidden: true, owner: P1 });
    const asP2 = JSON.stringify(game.view(P2));
    expect(asP2).not.toContain(FAE);
    expect(asP2).not.toContain("Blastcone");
    expect(game.view(P2).battlefields.find((b) => b.id === "bfA")?.facedownCount).toBe(1);

    const mine = game.view(P1).zones["facedown-bfA"] ?? [];
    expect(isHiddenView(mine[0]!)).toBe(false);
    expect(mine[0]).toMatchObject({ defId: FAE, isHidden: true, owner: P1 });
  });

  test("(2) in the combat at bfA the flip is offered to P1 for [0] and opens a chain (811.1.b/811.1.c.3); the unit arrives at THAT battlefield (811.1.d.1)", async () => {
    const game = await intoShowdown();
    expect(game.p1.can("reveal", "fae")).toBe(true);
    expect(game.p1.energy()).toBe(0); // nothing to pay
    await game.p1.reveal("fae");
    expect(game.locationOf("fae")).toBe("bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
  });

  test("(2) 811.1.d.2 — the on-play choice may only see units AT bfA: the Fae itself, P1's Guard and the enemy Pouty Poro; the Navori Scout at bfB is neither offered nor accepted", async () => {
    const game = await intoShowdown();
    await game.p1.reveal("fae");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "fae" }, timing: "FIN" });
    expect(pickKeys(game).sort()).toEqual(["fae", "guard", "poro"]);
    expect(pickKeys(game)).not.toContain("scout");
    const attempt = await game.p1.try((s) => s.pick("scout"));
    expect(attempt.ok).toBe(false);
  });

  test("(2) the restriction comes from being played from Hidden, not from the card text: the same Fae played from HAND offers the Navori Scout at the other battlefield too", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 4, power: { mind: 2, rainbow: 2 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "bfB", SCOUT, "scout")
      .hand(P1, FAE, "fae")
      .build();
    await game.p1.play("fae", { to: "base" });
    expect(pickKeys(game).sort()).toEqual(["fae", "guard", "scout"]);
  });

  test("(3) resolution: -2 [Might] this turn with a floor of 1 — the 2-Might Poro becomes 1 (not 0), a 6-Might unit becomes 4", async () => {
    const small = await intoShowdown();
    await small.p1.reveal("fae");
    await small.p1.pick("poro");
    await small.p1.passPriority();
    await small.p2.passPriority();
    expect(small.state("poro")).toMatchObject({ baseMight: 2, might: 1, mightModifier: -1 });

    const big = await intoShowdown();
    await big.p1.reveal("fae");
    await big.p1.pick("guard");
    await big.p1.passPriority();
    await big.p2.passPriority();
    expect(big.state("guard")).toMatchObject({ baseMight: 6, might: 4, mightModifier: -2 });
  });

  test("(3) 'this turn' means the Expiration Step: played from hand, outside any combat, the -2 is still on the unit for the rest of the turn and lapses when the turn ends (317.2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 4, power: { mind: 2, rainbow: 2 } })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 6, name: "Guard" }, "guard")
      .hand(P1, FAE, "fae")
      .build();
    await game.p1.play("fae", { to: "base" });
    await game.p1.pick("guard");
    await game.settle();
    expect(game.state("guard")).toMatchObject({ might: 4, mightModifier: -2 });
    await game.advanceTurn();
    expect(game.state("guard")).toMatchObject({ might: 6, mightModifier: 0 });
  });

  test("(3) the -2 really lowers the lethal threshold, and survives its combat: a 4-Might defender debuffed to 2 dies to the Poro's 2 combat damage, while a 6-Might one lives on at 4 with the modifier still on it (465.2.c, 466.7.c is only for 'this combat' changes)", async () => {
    const small = await intoShowdown(1, 4); // the lone defender is a 4-Might Guard
    await small.p1.reveal("fae");
    await small.p1.pick("guard");
    await small.settle();
    expect(small.zoneOf("guard")).toBe("trash"); // 2 [Might], assigned the Poro's 2
    expect(small.zoneOf("poro")).toBe("trash");

    const big = await intoShowdown();
    await big.p1.reveal("fae");
    await big.p1.pick("guard");
    await big.settle();
    expect(big.zoneOf("guard")).toBe("battlefield-bfA");
    expect(big.state("guard")).toMatchObject({ might: 4, mightModifier: -2 }); // still "this turn"
  });

  test("(3) [Deflect] rides on the offer: with one [A] of Power the enemy Poro is offered with its surcharge and choosing it SPENDS that Power (809.1)", async () => {
    const game = await intoShowdown(1);
    await game.p1.reveal("fae");
    const d = game.decision();
    const offers = d?.kind === "pick" ? d.options : [];
    expect(offers.find((o) => o.key === "poro")?.deflect).toBe(1);
    expect(offers.find((o) => o.key === "guard")?.deflect).toBeUndefined(); // friendly — no tax
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.pick("poro");
    expect(game.p1.power("rainbow")).toBe(0);
  });

  // Rules: [Deflect] (809.1) — "Opponents must pay [rainbow] to choose me with a spell or ability".
  // With an empty pool P1 cannot pay, so the Poro must not be a legal choice at all — which is
  // exactly how the engine treats it when the surcharge IS payable: it prices the option and charges
  // it on the pick (test above), and DESIGN.md keeps those picks pool-only.
  // Actual: with 0 Power the Poro is still listed, with no `deflect` marker, and picking it applies
  // the -2 for free — the tax is skipped instead of gating the choice.
  test("a [Deflect] unit is not choosable at all when the chooser has no Power to pay the surcharge (809.1)", async () => {
    const game = await intoShowdown(0);
    await game.p1.reveal("fae");
    expect(pickKeys(game)).not.toContain("poro");
    const attempt = await game.p1.try((s) => s.pick("poro"));
    expect(attempt.ok).toBe(false);
  });

  test("(4) a sole legal option is bound without asking — the Fae is the only unit at its battlefield, so the -2 lands on itself and no pick is raised", async () => {
    // DESIGN / FIXER-PRIMER (trigger finalization, rule 402.2): a finalized item with exactly ONE
    // candidate binds it silently; ≥2 candidates raise the `choose-target` pick. 355.10.d.2 still
    // makes that unit a TARGET (restrictions and taxes apply to it) — it does not demand a
    // confirmation step, and the client-side "confirm the sole option" affordance is a UI concern
    // asserted in the gated harness-browser suite, not here.
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", SCOUT, "scout")
      .facedown(P1, "bfA", FAE, "fae")
      .build();
    await game.p1.reveal("fae");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // no target prompt
    await game.settle();
    expect(game.state("fae")).toMatchObject({ baseMight: 2, might: 1, mightModifier: -1 });
    expect(game.state("scout")).toMatchObject({ might: 4, mightModifier: 0 }); // never in range
    expect(game.violations()).toEqual([]);
  });
});
