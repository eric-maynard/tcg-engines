/**
 * Interaction: Edge of Night (sfd-139-221) · Gear — Equipment · Chaos · 3 energy · +2 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      When you play this from face down, attach it to a unit you control (here).
 *      [Equip] [chaos]"
 *   × Gust (ogn-169-298) · Spell · 1 energy
 *     "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit (the defender / Gust-able bearer)
 *
 * Question: P1 controls bf1 with Skulker (3) and has Edge of Night facedown there since last turn; P1
 * also has a unit in base. On P2's turn Vanguard Sergeant (4) attacks bf1. In the showdown P1 flips
 * Edge of Night for [0].
 *   (a) It is a GEAR — does it enter P1's base (359.2.d) or bf1?
 *   (b) Which units may the play-from-facedown trigger attach it to — Skulker only, or the base unit too?
 *   (c) P2 responds to the attach trigger with Gust on Skulker. What becomes of Edge of Night — trashed
 *       with the facedown cleanup, stuck at bf1, or something else? Who wins bf1?
 *   (d) Contrast, no Gust: Skulker's final Might and the combat outcome.
 *   (e) Contrast, played normally from hand: where does it enter, does the attach trigger fire?
 *
 * Rules:
 *   811.1.d.1 / 811.1.d.1.a / 152.2 — a hidden permanent is played TO the battlefield it was hidden at;
 *       this expressly includes gear and overrides 359.2.d (gear enters base).
 *   811.1.d.2 + card text "(here)" — the play effect's target must be a unit P1 controls AT bf1.
 *   359.3.e.2 / 359.3.e.5 — Skulker bounced to hand is an illegal target; the attach instruction is
 *       ignored. Edge of Night is a permanent on the board, not a facedown card, so 107.3.d / 466.5.c
 *       (remove hidden cards when control is lost) do not touch it.
 *   466.3.a / 466.5.d — P2 is the only player with units at bf1 → wins the combat and conquers.
 *   323.7 / 149.3 — at the next cleanup an UNATTACHED non-unit gear at a battlefield is recalled to its
 *       controller's base (not trashed, not returned to hand); P1 may later [Equip] it for [chaos].
 *   811.3 — from hand it is an ordinary gear play: base, full cost, no trigger, no "here" restriction.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EDGE_OF_NIGHT = "sfd-139-221";
const GUST = "ogn-169-298";
const SHIPYARD_SKULKER = "ogn-175-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P2's turn. P1 controls bf1 with Skulker (3) and Edge of Night facedown there (hidden on an
 * earlier turn). P1 has Home Guard (2) in base. P2 has Vanguard Sergeant (4) in base, Gust in hand and
 * exactly 1 energy to pay for it.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
    .unit(P2, "base", { might: 4, name: "Vanguard Sergeant" }, "sergeant")
    .facedown(P1, "bf1", EDGE_OF_NIGHT, "edge")
    .hand(P2, GUST, "gust");
}

/** Sergeant attacks bf1, P2 passes Focus, P1 flips Edge of Night. P1 now holds priority with the trigger pending. */
async function flipped(s = board()): Promise<G> {
  const game = await s.build();
  await game.p2.move("sergeant", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p1.can("reveal", "edge")).toBe(false); // attacker holds Focus first
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "edge")).toBe(true);
  await game.p1.reveal("edge");
  return game;
}

/** From `flipped()`: P1 passes, P2 answers the trigger with Gust on Skulker. Chain is [trigger, Gust]. */
async function gusted(): Promise<G> {
  const game = await flipped();
  await game.p1.passPriority();
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "skulker" });
  return game;
}

describe("Edge of Night flipped mid-combat × Gust on the intended bearer", () => {
  // ── (a) where does a hidden GEAR enter? ─────────────────────────────────────────────────────

  test("(a) flipped for [0] as a Reaction: it resolves at once as a READY, unattached Equipment controlled by P1 (not trash/hand), and its play-from-facedown trigger is the only chain item", async () => {
    const game = await flipped();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played from hidden ignoring cost
    expect(game.state("edge")).toMatchObject({ attachedTo: undefined, cardType: "equipment", controller: P1, isHidden: false, isReady: true });
    expect(["trash", "hand", "facedown-bf1", "chain"]).not.toContain(game.zoneOf("edge"));
    expect(game.p1.gear()).toContain("edge");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edge", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nobody's Might has changed yet — the attach is still on the chain.
    expect(game.state("skulker").might).toBe(3);
    expect(game.state("home").might).toBe(2);
  });

  test("(a) a hidden gear is played TO the battlefield it was hidden at — Edge of Night should be located at bf1 while its trigger is pending, not in P1's base (811.1.d.1, 811.1.d.1.a, 152.2 override 359.2.d)", async () => {
    // Expected: locationOf(edge) === "bf1" (zone battlefield-bf1) right after the flip.
    // Actual: the engine applies the ordinary gear rule and puts it straight into P1's base.
    const game = await flipped();
    expect(game.locationOf("edge")).toBe("bf1");
    expect(game.zoneOf("edge")).toBe("battlefield-bf1");
  });

  // ── (b) who may receive it? ─────────────────────────────────────────────────────────────────

  test("(b) with Skulker the only unit P1 controls at bf1 the target is locked to Skulker — nothing is asked, and on resolution Skulker (not Home Guard in base) wears it (811.1.d.2, '(here)')", async () => {
    const game = await flipped();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no pick prompt
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.state("edge").attachedTo).toBe("skulker");
    expect(game.state("skulker").attachments).toEqual(["edge"]);
    expect(game.state("home").attachments).toEqual([]);
    expect(game.state("home").might).toBe(2);
    expect(game.locationOf("edge")).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });

  test("(b) the base unit is NOT a legal fallback: once Skulker is gone the trigger attaches to nothing — Home Guard stays bare at 2 Might (811.1.d.2, 359.3.e.5)", async () => {
    const game = await gusted();
    await game.settle();
    expect(game.state("home").attachments).toEqual([]);
    expect(game.state("home").might).toBe(2);
    expect(game.state("edge").attachedTo).toBeUndefined();
  });

  test("(b) with TWO friendly units at bf1 P1 must be asked which one — offered exactly the bf1 units, never Home Guard in base (811.1.d.2)", async () => {
    // rule 811.1.d.2: the holder is a real choice — a pick decision for P1 whose options are exactly
    // the bf1 units {buddy, skulker}; the first-placed unit must never be taken silently.
    const game = await flipped(
      scenario()
        .turn(3)
        .active(P2)
        .resources(P2, { energy: 1 })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
        .unit(P1, "bf1", SHIPYARD_SKULKER, "skulker")
        .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
        .unit(P2, "base", { might: 4, name: "Vanguard Sergeant" }, "sergeant")
        .facedown(P1, "bf1", EDGE_OF_NIGHT, "edge")
        .hand(P2, GUST, "gust"),
    );
    let offered: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        offered = d.options.map((o) => o.card ?? o.key).sort();
        await game.p1.pick("skulker");
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(offered).toEqual(["buddy", "skulker"]);
    expect(offered).not.toContain("home");
    expect(game.state("edge").attachedTo).toBe("skulker");
    expect(game.state("skulker").might).toBe(5);
    expect(game.state("buddy").might).toBe(1);
  });

  // ── (c) Gust the bearer in response ─────────────────────────────────────────────────────────

  test("(c) Gust is a legal response (Skulker is a 3-Might unit at a battlefield); chain is [Edge trigger, Gust], P2 paid 1, and Gust resolves FIRST returning Skulker to P1's hand (LIFO)", async () => {
    const game = await gusted();
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["edge", "gust"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "gust", controller: P2, targets: ["skulker"], triggered: false });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("skulker")).toBe("hand");
    expect(game.p1.hand()).toContain("skulker");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["edge"]); // the attach trigger is still pending
    expect(game.state("edge").attachedTo).toBeUndefined();
  });

  test("(c) the trigger then resolves with its only target gone → instruction ignored: Edge of Night attaches to NOTHING and is neither trashed (it is a permanent, not a facedown card — 107.3.d/466.5.c don't apply) nor returned to hand (359.3.e.2, 359.3.e.5)", async () => {
    const game = await gusted();
    await game.settle();
    expect(game.state("edge").attachedTo).toBeUndefined();
    expect(game.zoneOf("edge")).not.toBe("trash");
    expect(game.zoneOf("edge")).not.toBe("hand");
    expect(game.zoneOf("edge")).not.toBe("facedown-bf1");
    expect(game.p1.trash()).not.toContain("edge");
    expect(game.p1.hand()).not.toContain("edge");
    expect(game.state("edge")).toMatchObject({ controller: P1, isHidden: false, owner: P1 });
    expect(game.chain()).toEqual([]);
  });

  test("(c) the loose gear is recalled to P1's BASE by the cleanup — unattached non-unit gear may not stay at a battlefield (323.7 / 149.3); it does not linger at bf1", async () => {
    const game = await gusted();
    await game.settle();
    expect(game.zoneOf("edge")).toBe("base");
    expect(game.locationOf("edge")).toBe("base");
    expect(game.p1.gear()).toContain("edge");
    expect(game.state("edge")).toMatchObject({ attachedTo: undefined, isReady: true });
  });

  test("(c) P2 is the only player with units at bf1 → wins the combat with no damage dealt and CONQUERS bf1 (+1); Sergeant stays there unhurt (466.3.a, 466.5.d)", async () => {
    const game = await gusted();
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf1");
    expect(game.state("sergeant").damage).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["sergeant"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) epilogue: on P1's next turn the recalled Edge of Night can be [Equip]ped for [chaos] onto a unit P1 controls (Home Guard 2 → 4)", async () => {
    const game = await gusted();
    await game.settle();
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("edge")).toBe("base"); // survived the end-of-turn cleanups too
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false); // no chaos yet
    await game.p1.do("addResources", { power: { chaos: 1 } });
    const equip = game.p1.legal().find((o) => o.moveId === "equipCard");
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["edge"]);
    expect(equip?.fields.find((f) => f.name === "unitId")?.options).toEqual(["home"]);
    await game.p1.choose("equipCard", { params: { equipmentId: "edge", unitId: "home" } });
    expect(game.p1.power("chaos")).toBe(0);
    await game.settle();
    expect(game.state("edge").attachedTo).toBe("home");
    expect(game.state("home").might).toBe(4);
  });

  // ── (d) contrast: no response ───────────────────────────────────────────────────────────────

  test("(d) no Gust: the trigger attaches Edge of Night to Skulker (3+2 = 5) before combat damage; Skulker deals 5 to Sergeant (4) → dies, takes 4 < 5 → survives; P1 keeps bf1, nobody scores", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves, back to the showdown
    expect(game.state("edge").attachedTo).toBe("skulker");
    expect(game.state("skulker")).toMatchObject({ baseMight: 3, might: 5 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // both pass focus → combat damage → resolution
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ damage: 0, might: 5 }); // healed at combat cleanup, still equipped
    expect(game.locationOf("edge")).toBe("bf1");
    expect(game.state("edge").attachedTo).toBe("skulker");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toContain("gust"); // unused
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) contrast: hard-cast from hand ───────────────────────────────────────────────────────

  test("(e) played normally from hand on P1's turn: costs the full 3 energy, enters P1's BASE ready and unattached, puts NOTHING on the chain — the 'from face down' trigger condition is not met (811.3, 359.2.d)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHIPYARD_SKULKER, "skulker")
      .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
      .hand(P1, EDGE_OF_NIGHT, "edge")
      .build();
    // A gear play from hand offers no destination choice — it can only go to base.
    expect(game.p1.option("play", "edge")?.fields.find((f) => f.arg === "to")).toBeUndefined();
    await game.p1.play("edge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("edge")).toBe("base");
    expect(game.locationOf("edge")).toBe("base");
    expect(game.state("edge")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("skulker").might).toBe(3);
    expect(game.state("home").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(e) …and from base [Equip] [chaos] has NO 'here' restriction: both Skulker (bf1) and Home Guard (base) are legal recipients; equipping Skulker makes it 5 and carries the gear to bf1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHIPYARD_SKULKER, "skulker")
      .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
      .hand(P1, EDGE_OF_NIGHT, "edge")
      .build();
    await game.p1.play("edge");
    await game.settle();
    const equip = game.p1.legal().find((o) => o.moveId === "equipCard");
    expect(equip?.fields.find((f) => f.name === "unitId")?.options?.slice().sort()).toEqual(["home", "skulker"]);
    await game.p1.choose("equipCard", { params: { equipmentId: "edge", unitId: "skulker" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("edge").attachedTo).toBe("skulker");
    expect(game.state("skulker").might).toBe(5);
    expect(game.locationOf("edge")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
