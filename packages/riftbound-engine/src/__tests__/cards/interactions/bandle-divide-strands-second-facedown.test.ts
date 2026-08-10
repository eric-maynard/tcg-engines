/**
 * Interaction: Bandle Tree (ogn-278-298) · Battlefield · "You may hide an additional card here."
 *   × Emperor's Divide (sfd-043-221) · Calm Action spell · 2 · "[Hidden] [Action] Move any number of
 *     friendly units at a battlefield to their base."                       — FACEDOWN at the Tree
 *   × Hidden Blade (ogn-213-298) · Order Action spell · 2+[order] · "[Hidden] [Action] Kill a unit at a
 *     battlefield. Its controller draws 2."                                  — FACEDOWN at the Tree
 *   with Vanguard Sergeant (ogn-219-298, 4 Might vanilla) holding the Tree for P1 and Playful Phantom
 *   (ogn-049-298, 5 Might vanilla) as P2's attacker.
 *
 * Rules: 107.3.b.1 (a Facedown Zone's max occupancy can be raised), 190.6.d ("you" on a battlefield =
 * its controller), 107.3.c / 421.1 / 811.1.b (only the CONTROLLER of a battlefield may hide there),
 * 811.1.d.2 (played from facedown, targets must be at THAT battlefield), 190.4.b + 323.6 (control can't
 * change during a Showdown/Combat; the vacancy check needs an Open state), 323.7 / 107.3.d / 421.4
 * (Hidden cards at a battlefield no longer controlled by the same player go to their owner's trash,
 * revealed, in the same Cleanup), 811.6 (a facedown card has Reaction), 466.3.a/.d + 466.5.b/.c/.d
 * (combat result: sole survivor conquers and strips foreign hidden cards; nobody left = No Result and
 * the battlefield becomes Uncontrolled).
 *
 * Question: P1 controls Bandle Tree with one Sergeant and TWO facedown cards (Divide + Blade) from an
 * earlier turn. (a) Is two-deep hiding legal for P1, and for P2 who merely has units contesting the
 * Tree? (b) P1's own turn: P1 flips Divide — which battlefield's units may it pick, and once Sergeant
 * walks home what happens to the still-facedown Blade, and when? Hand or trash? Does Mushroom Pouch
 * see it next turn? (c) P2's turn: Phantom attacks the Tree; in the combat showdown P1 flips Divide
 * sending Sergeant home. Does P1 lose the Tree/Blade at once, or can Blade still be flipped at Phantom
 * in the same showdown? Final control if both are flipped vs only Divide?
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BANDLE_TREE = "ogn-278-298";
const EMPERORS_DIVIDE = "sfd-043-221";
const HIDDEN_BLADE = "ogn-213-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const MUSHROOM_POUCH = "ogn-101-298"; // "At the start of your Beginning Phase, if you control a facedown card at a battlefield, draw 1."
const PAKAA_CUB = "ogn-135-298"; // a third [Hidden] card, only used to probe the capacity

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten a seat's field `name` of option (verb, card) into the distinct values offered. */
function fieldOffered(game: Game, seat: "p1" | "p2", verb: string, alias: string, name: string): unknown[] {
  const field = game[seat].option(verb, alias)?.fields.find((f) => f.name === name);
  return [...(field?.options ?? [])];
}

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Pass priority back and forth until the chain is empty (or a non-priority prompt appears). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/**
 * Turn 3. P1 controls the (live, non-inert) Bandle Tree with Vanguard Sergeant on it and BOTH
 * Emperor's Divide and Hidden Blade facedown there since turn 1. P1 also controls "yard" with a
 * vanilla Ranger (a friendly unit at ANOTHER battlefield — must not be offered to the facedown Divide).
 * P2 controls "other" with a 2-Might grunt and has Playful Phantom in base.
 */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { power: { rainbow: 2 } })
    .resources(P2, { power: { rainbow: 2 } })
    .battlefield("tree", { controller: P1, def: BANDLE_TREE, inert: false })
    .battlefield("yard", { controller: P1 })
    .battlefield("other", { controller: P2 })
    .unit(P1, "tree", VANGUARD_SERGEANT, "sarge")
    .unit(P1, "yard", { might: 2, name: "Ranger" }, "ranger")
    .unit(P2, "base", PLAYFUL_PHANTOM, "phantom")
    .unit(P2, "other", { might: 2, name: "P2 Grunt" }, "grunt")
    .facedown(P1, "tree", EMPERORS_DIVIDE, "divide", { hiddenOnTurn: 1 })
    .facedown(P1, "tree", HIDDEN_BLADE, "blade", { hiddenOnTurn: 1 })
    .hand(P1, PAKAA_CUB, "cub")
    .hand(P2, PAKAA_CUB, "p2cub");
}

/** (c) P2's turn: Phantom attacks the Tree (combat showdown, P2 has Focus) and passes Focus to P1. */
async function phantomAttacks(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("phantom", "tree");
  expect(game.actingSeat()).toBe(P2);
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Bandle Tree × Emperor's Divide × Hidden Blade — the second facedown card", () => {
  // ── (a) who may hide two cards at the Tree ────────────────────────────────────────────────

  test("(a) setup is a legal position: P1 (the Tree's controller) has TWO cards facedown there and the invariants are clean (107.3.b.1, 190.6.d)", async () => {
    const game = await board().build();
    expect(game.p1.facedown("tree").sort()).toEqual(["blade", "divide"]);
    expect(game.state("divide").isHidden).toBe(true);
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.violations()).toEqual([]);
    // …and two is the cap: a third [Hidden] card cannot be hidden there even with [rainbow] to spare.
    expect(game.p1.power("rainbow")).toBe(2);
    expect(fieldOffered(game, "p1", "hideCard", "cub", "battlefieldId")).toEqual(["yard"]); // only P1's OTHER battlefield
    expect((await game.p1.try((p) => p.hide("cub", "tree"))).ok).toBe(false);
  });

  test("(a) the controller reaches two by hiding twice: from hand, Divide then Blade are both hidden at the Tree (each for [rainbow]); a third Hide is refused", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { power: { rainbow: 3 } })
      .battlefield("tree", { controller: P1, def: BANDLE_TREE, inert: false })
      .unit(P1, "tree", VANGUARD_SERGEANT, "sarge")
      .hand(P1, EMPERORS_DIVIDE, "divide")
      .hand(P1, HIDDEN_BLADE, "blade")
      .hand(P1, PAKAA_CUB, "cub")
      .build();
    expect(fieldOffered(game, "p1", "hideCard", "divide", "battlefieldId")).toEqual(["tree"]);
    await game.p1.hide("divide", "tree");
    expect(game.p1.can("hide", "blade")).toBe(true);
    await game.p1.hide("blade", "tree");
    expect(game.p1.facedown("tree").sort()).toEqual(["blade", "divide"]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("hide", "cub")).toBe(false);
    expect((await game.p1.try((p) => p.hide("cub", "tree"))).ok).toBe(false);
    expect(game.chain()).toEqual([]); // hiding uses no chain (811.1.b)
  });

  test("(a) P2 with a unit AT the Tree but not controlling it may NOT hide there — contesting is not control (107.3.c, 421.1, 811.1.b); P2's Hide only offers the battlefield P2 controls", async () => {
    const game = await board(P2).unit(P2, "tree", { might: 1, name: "Squatter" }, "squatter").build();
    expect(game.gameState.battlefields.tree?.controller).toBe(P1);
    expect(game.p2.units("tree")).toEqual(["squatter"]);
    expect(fieldOffered(game, "p2", "hideCard", "p2cub", "battlefieldId")).toEqual(["other"]);
    const r = await game.p2.try((p) => p.hide("p2cub", "tree"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("p2cub")).toBe("hand");
    expect(game.p2.power("rainbow")).toBe(2);
  });

  test("(a) …and if P2 controls no battlefield at all, Hide is not on P2's menu even on P2's own turn with [rainbow] available", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { power: { rainbow: 2 } })
      .battlefield("tree", { controller: P1, def: BANDLE_TREE, inert: false, contested: true, contestedBy: P2 })
      .unit(P1, "tree", VANGUARD_SERGEANT, "sarge")
      .unit(P2, "tree", { might: 1, name: "Squatter" }, "squatter")
      .hand(P2, PAKAA_CUB, "p2cub")
      .build();
    expect(game.p2.can("hide", "p2cub")).toBe(false);
    expect(game.p2.legal().some((o) => o.verb === "hide")).toBe(false);
  });

  // ── (b) P1's own turn: Divide from facedown, then the Cleanup ─────────────────────────────

  test("(b) from facedown, Divide may only pick friendly units AT THE TREE: the offered sets are {} and {Sergeant} — the Ranger at P1's other battlefield is never offered (811.1.d.2, 355.13)", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "divide")).toBe(true);
    const sets = fieldOffered(game, "p1", "revealHidden", "divide", "targets") as string[][];
    expect(sets).toContainEqual([]);
    expect(sets).toContainEqual(["sarge"]);
    expect(sets.flat()).not.toContain("ranger");
    expect(sets.flat()).not.toContain("phantom");
    await expect(game.p1.reveal("divide", { targets: ["ranger"] })).rejects.toThrow();
    expect(game.zoneOf("divide")).toBe("facedown-tree");
  });

  test("(b) flipping Divide costs nothing, opens a chain with target [Sergeant]; Blade is still facedown and P1 still controls the Tree while Divide is on the chain", async () => {
    const game = await board().build();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "divide", controller: P1, targets: ["sarge"], triggered: false });
    expect(game.zoneOf("blade")).toBe("facedown-tree");
    expect(game.gameState.battlefields.tree?.controller).toBe(P1);
  });

  test("(b) Divide resolves → Sergeant to base; the SAME Cleanup strips P1's control of the empty Tree (323.6) and trashes the still-facedown Hidden Blade (323.7, 107.3.d) — nothing waits for a later turn", async () => {
    const game = await board().build();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(game); // both pass → Divide resolves → Cleanup
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.gameState.battlefields.tree?.controller).toBe(null);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.facedown("tree")).toEqual([]);
    // Straight back to P1's open main phase — no prompt, no showdown, same turn.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the removed Blade goes to its owner's TRASH, revealed (421.4) — not recalled to hand; P2 can see its identity in P1's trash", async () => {
    const game = await board().build();
    const hand = [...game.p1.hand()];
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(game);
    expect(game.p1.trash().sort()).toEqual(["blade", "divide"]);
    expect(game.p1.hand()).toEqual(hand);
    expect(game.state("blade").isHidden).toBe(false);
    const p2SeesTrash = (game.p2.view().zones.trash ?? []).map((v) => (v as { id?: string }).id);
    expect(p2SeesTrash).toContain("blade");
  });

  test("(b) it does not survive to a later turn: with Mushroom Pouch in base, P1's next Beginning Phase draws nothing extra (no facedown card is controlled any more) — contrast: leaving both cards hidden DOES draw", async () => {
    const flipped = await board().gear(P1, MUSHROOM_POUCH, "pouch").build();
    await flipped.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(flipped);
    const h0 = flipped.p1.hand().length;
    await flipped.advanceTurn(); // → P2
    await flipped.advanceTurn(); // → P1 (channels 2, draws 1)
    expect(flipped.turnPlayer()).toBe(P1);
    expect(flipped.p1.hand()).toHaveLength(h0 + 1); // just the normal draw

    const kept = await board().gear(P1, MUSHROOM_POUCH, "pouch").build();
    const k0 = kept.p1.hand().length;
    await kept.advanceTurn();
    await kept.advanceTurn();
    expect(kept.turnPlayer()).toBe(P1);
    expect(kept.zoneOf("blade")).toBe("facedown-tree");
    expect(kept.p1.hand()).toHaveLength(k0 + 2); // normal draw + Pouch
  });

  // ── (c) P2's turn: Phantom attacks; Divide mid-showdown, then Blade ───────────────────────

  test("(c) in the combat showdown P1 (with Focus) may flip Divide for [0]; after it resolves Sergeant is home but P1 STILL controls the Tree and Blade is STILL facedown — no control change mid-combat (190.4.b, 323.6)", async () => {
    const game = await phantomAttacks();
    expect(game.p1.can("reveal", "divide")).toBe(true);
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(game);
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.gameState.battlefields.tree).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("blade")).toBe("facedown-tree");
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.p1.units("tree")).toEqual([]);
    expect(game.p2.units("tree")).toEqual(["phantom"]);
    // Divide's chain closed → Focus passed to P2 (347.1.b); the showdown is still open.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(c) when Focus comes back, P1 can still flip Hidden Blade (Reaction, 811.6) — its only legal object is Phantom, the enemy unit 'here' (811.1.d.2); Phantom dies and ITS controller (P2) draws 2", async () => {
    const game = await phantomAttacks();
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(game);
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    // Phantom is the only unit at the Tree: either it is bound without asking or it is the only offer.
    if (game.decision()?.kind === "pick") {
      expect(pickOffered(game)).toEqual(["phantom"]);
      await game.p1.pick("phantom");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // played for [0]
    await drainChain(game);
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });

  test("(c) P1 may even flip Blade IN RESPONSE to their own Divide (both still at the Tree then): the pick offers exactly the units at the Tree — Sergeant and Phantom — never the grunt at 'other' or the Ranger at 'yard' (811.1.d.2)", async () => {
    const game = await phantomAttacks();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOffered(game).sort()).toEqual(["phantom", "sarge"]);
    await game.p1.pick("phantom");
    expect(game.chain().map((c) => c.cardId)).toEqual(["divide", "blade"]);
  });

  test("(c) BOTH flipped: at combat resolution neither side has a unit at the Tree → No Result (466.3.d), the Tree becomes UNCONTROLLED (466.5.b), nobody scores, nothing is left facedown", async () => {
    const game = await phantomAttacks();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await drainChain(game);
    await game.p2.passFocus();
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("phantom");
    }
    await game.settle(); // chain resolves, everyone passes Focus, combat resolves
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.gameState.battlefields.tree).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.facedown("tree")).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["blade", "divide"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) ONLY Divide flipped: P2 is the sole player with units → wins the combat and CONQUERS the Tree for 1 point (466.3.a, 466.5.d); the foreign facedown Blade is removed to P1's trash, revealed (466.5.c / 323.7)", async () => {
    const game = await phantomAttacks();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await game.settle(); // Divide resolves, both pass Focus, combat resolves with no defender
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("phantom").damage).toBe(0);
    expect(game.zoneOf("phantom")).toBe("battlefield-tree");
    expect(game.gameState.battlefields.tree).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("blade").isHidden).toBe(false);
    expect(game.p1.facedown("tree")).toEqual([]);
    expect(game.p1.hand()).toEqual(["cub"]); // Blade was not returned to hand
    expect(game.violations()).toEqual([]);
  });

  test("(c) after conquering the Tree, P2 — now its controller — is the one who may hide there ('you' = controller, 190.6.d), up to two cards", async () => {
    const game = await phantomAttacks();
    await game.p1.reveal("divide", { targets: ["sarge"] });
    await game.settle();
    expect(game.gameState.battlefields.tree?.controller).toBe(P2);
    expect((fieldOffered(game, "p2", "hideCard", "p2cub", "battlefieldId") as string[]).sort()).toEqual(["other", "tree"]);
    await game.p2.hide("p2cub", "tree");
    expect(game.p2.facedown("tree")).toEqual(["p2cub"]);
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false); // not P1's turn, and P1 no longer controls it anyway
  });
});
