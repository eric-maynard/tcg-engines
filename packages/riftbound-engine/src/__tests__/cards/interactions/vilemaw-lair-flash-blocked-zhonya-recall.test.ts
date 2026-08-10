/**
 * Interaction: Vilemaw's Lair (ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2 · "[Hidden] If a friendly unit would die, kill
 *     this instead. Heal that unit, exhaust it, and recall it. (Send it to base. This isn't a move.)"
 *   (+ Minotaur Reckoner sfd-014-221 · Unit · "Units can't move to base." as the alternative source,
 *    Shipyard Skulker ogn-175-298 as the vanilla 3-Might unit.)
 *
 * Rules: 144.4.b (battlefield→base is a Standard Move destination) vs 054.1 (can't beats can); 144.4.c.1
 * / 810.1.b (Ganking: battlefield→battlefield Standard Move); 355.4.a / 449.1 (a Move effect's legal
 * destinations come from its source — Flash NAMES base, the player chooses nothing); 055 (do as much as
 * you can, ignore impossible instructions); 455 / 456 / 456.1 / 456.3 (a Recall is not a Move, fires no
 * move triggers and cannot be stopped by movement restrictions); 466.1.a.2 (combat cleanup RECALLS
 * surviving attackers when defenders remain).
 *
 * Board: P1 controls the (live) Lair with Shipyard Skulker (3) and a 2-Might [Ganking] unit there, a
 * 2-Might Buddy at P1-held bfB, Zhonya's Hourglass in base, Flash + a 3-damage test bolt in hand, 3
 * energy. Variant (f): the Lair is an inert vanilla battlefield and P2 has Minotaur Reckoner in base.
 *
 * Q/Expected:
 *  (a) Skulker may NOT Standard-Move Lair→base (not even offered; nothing exhausted).
 *  (b) The Ganking unit MAY Standard-Move Lair→bfB.
 *  (c) Flash: Skulker IS a legal target (Flash names base, no destination filtering); on resolution the
 *      Skulker instruction is impossible and ignored, Buddy moves to base, Flash is spent.
 *  (d) Skulker would die at the Lair → Zhonya's dies instead; Skulker healed, exhausted, RECALLED to base
 *      despite the Lair (456.3).
 *  (e) P2 attacks the Lair, both sides survive → the attacker is recalled home by the combat cleanup
 *      (466.1.a.2) regardless of the Lair; no "When I move" trigger fires for that recall (456.1).
 *  (f) Same answers with Minotaur Reckoner as the source (its text is global, so in (c) Buddy can't be
 *      Flashed home either — Flash resolves and does nothing, 055.1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAIR = "ogn-295-298";
const FLASH = "ogs-011-024";
const ZHONYAS = "ogn-077-298";
const SKULKER = "ogn-175-298";
const RECKONER = "sfd-014-221";

/** Inline 1-cost action spell: deal 3 to a unit (the "would die" source for (d)). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P2's 1-Might attacker with "When I move, draw 1." — a move-trigger probe for 456.1. */
const WANDERER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 1,
  name: "Wanderer",
};

type Source = "lair" | "reckoner";

/** P1's turn. The restriction comes from the Lair itself, or (variant) from P2's Minotaur Reckoner in base. */
function board(source: Source = "lair") {
  const s = scenario()
    .resources(P1, { energy: 3 })
    .battlefield("lair", source === "lair" ? { controller: P1, def: LAIR, inert: false } : { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "lair", SKULKER, "skulker")
    .unit(P1, "lair", { keywords: ["Ganking"], might: 2, name: "Ganker" }, "ganker")
    .unit(P1, "bfB", { might: 2, name: "Buddy" }, "buddy")
    .gear(P1, ZHONYAS, "zhonyas")
    .hand(P1, FLASH, "flash")
    .hand(P1, BOLT, "bolt")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
  return source === "reckoner" ? s.unit(P2, "base", RECKONER, "reckoner") : s;
}

/** P2's turn. P1 holds the Lair with a STUNNED Skulker (deals no combat damage) so a 1-Might attacker and the Skulker both survive. */
function combatBoard(source: Source = "lair") {
  const s = scenario()
    .active(P2)
    .battlefield("lair", source === "lair" ? { controller: P1, def: LAIR, inert: false } : { controller: P1 })
    .unit(P1, "lair", SKULKER, "skulker", { stunned: true })
    .unit(P2, "base", WANDERER, "wanderer");
  return source === "reckoner" ? s.unit(P2, "base", RECKONER, "reckoner") : s;
}

/** Unit-id tuples offered for the `units` field of P1's "move → base" option (flattened). */
function unitsOfferedToBase(game: Game): string[] {
  const field = game.p1.option("standardMove:to:base")?.fields.find((f) => f.name === "unitIds");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Card ids appearing anywhere in Flash's offered target tuples. */
function flashTargetsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "flash")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

for (const source of ["lair", "reckoner"] as const) {
  const tag = source === "lair" ? "Vilemaw's Lair" : "(f) Minotaur Reckoner";

  describe(`${tag} × Standard Move / Flash / Zhonya's / combat recall`, () => {
    // ── (a) Standard Move to base: forbidden ─────────────────────────────────────────────────

    test(`(a) Skulker at the restricted battlefield carries the restriction and is NOT offered a Standard Move to base; forcing it is rejected and exhausts nothing (144.4.b vs 054.1)`, async () => {
      const game = await board(source).build();
      expect(game.state("skulker").keywords).toContain("NoMoveToBase");
      expect(unitsOfferedToBase(game)).not.toContain("skulker");
      expect(unitsOfferedToBase(game)).not.toContain("ganker");
      const r = await game.p1.try((p) => p.move("skulker", "base"));
      expect(r.ok).toBe(false);
      expect(game.locationOf("skulker")).toBe("lair");
      expect(game.state("skulker").isReady).toBe(true);
    });

    if (source === "lair") {
      test("(a) control: the Lair only binds units THERE — Buddy at bfB is still offered the ordinary bfB→base Standard Move", async () => {
        const game = await board(source).build();
        expect(game.state("buddy").keywords).not.toContain("NoMoveToBase");
        expect(unitsOfferedToBase(game)).toEqual(["buddy"]);
        await game.p1.move("buddy", "base");
        expect(game.locationOf("buddy")).toBe("base");
        expect(game.state("buddy").isExhausted).toBe(true);
      });
    } else {
      test("(f)(a) Reckoner's text is global: Buddy at bfB can't Standard-Move home either — no 'move → base' option exists at all", async () => {
        const game = await board(source).build();
        expect(game.state("buddy").keywords).toContain("NoMoveToBase");
        expect(game.p1.option("standardMove:to:base")).toBeUndefined();
        expect((await game.p1.try((p) => p.move("buddy", "base"))).ok).toBe(false);
        expect(game.locationOf("buddy")).toBe("bfB");
      });
    }

    // ── (b) Ganking battlefield → battlefield: fine ──────────────────────────────────────────

    test(`(b) the [Ganking] unit MAY Standard-Move ${source === "lair" ? "Lair" : "battlefield"}→bfB (144.4.c.1 / 810.1.b): it arrives exhausted, no showdown (P1 already holds bfB)`, async () => {
      const game = await board(source).build();
      expect(game.p1.can("gank", "ganker")).toBe(true);
      await game.p1.gank("ganker", "bfB");
      expect(game.locationOf("ganker")).toBe("bfB");
      expect(game.state("ganker").isExhausted).toBe(true);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.locationOf("skulker")).toBe("lair");
    });

    // ── (c) Flash: legal target, impossible instruction ignored ──────────────────────────────

    test("(c) Flash NAMES its destination, so 355.4.a filters nothing: Skulker (and the Ganker) are offered as targets alongside Buddy; [Skulker, Buddy] is a legal pair", async () => {
      const game = await board(source).build();
      const offered = flashTargetsOffered(game);
      expect(offered).toContain("skulker");
      expect(offered).toContain("ganker");
      expect(offered).toContain("buddy");
      expect(offered).not.toContain("bystander"); // friendly only
      await game.p1.cast("flash", { targets: ["skulker", "buddy"] });
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["skulker", "buddy"] })]);
      expect(game.p1.energy()).toBe(1);
    });

    if (source === "lair") {
      test("(c) on resolution the Skulker instruction is impossible and ignored (055): Skulker stays at the Lair (ready, untouched), Buddy moves to base, Flash goes to trash", async () => {
        const game = await board(source).build();
        await game.p1.cast("flash", { targets: ["skulker", "buddy"] });
        await game.settle();
        expect(game.locationOf("skulker")).toBe("lair");
        expect(game.state("skulker").isReady).toBe(true);
        expect(game.locationOf("buddy")).toBe("base");
        expect(game.zoneOf("flash")).toBe("trash");
        expect(game.chain()).toEqual([]);
        expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
        expect(game.violations()).toEqual([]);
      });
    } else {
      test("(f)(c) with the global Reckoner BOTH instructions are impossible: Flash still resolves and is trashed, nobody moves, the energy is not refunded (055.1)", async () => {
        const game = await board(source).build();
        await game.p1.cast("flash", { targets: ["skulker", "buddy"] });
        await game.settle();
        expect(game.locationOf("skulker")).toBe("lair");
        expect(game.locationOf("buddy")).toBe("bfB");
        expect(game.zoneOf("flash")).toBe("trash");
        expect(game.p1.energy()).toBe(1);
        expect(game.chain()).toEqual([]);
        expect(game.violations()).toEqual([]);
      });
    }

    // ── (d) Zhonya's recall ignores the restriction ──────────────────────────────────────────

    test("(d) Skulker takes lethal 3 at the restricted battlefield → Zhonya's is killed instead and Skulker is healed, exhausted and RECALLED to base — a recall is not a move (455 / 456.3)", async () => {
      const game = await board(source).build();
      await game.p1.cast("bolt", { targets: "skulker" });
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.zoneOf("zhonyas")).toBe("trash");
      expect(game.zoneOf("skulker")).toBe("base");
      expect(game.state("skulker")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
      expect(game.zoneOf("bolt")).toBe("trash");
      expect(game.violations()).toEqual([]);
    });

    test("(d) control without Zhonya's: the same bolt simply kills Skulker (so the save above really was the replacement)", async () => {
      const game = await scenario()
        .resources(P1, { energy: 3 })
        .battlefield("lair", source === "lair" ? { controller: P1, def: LAIR, inert: false } : { controller: P1 })
        .unit(P1, "lair", SKULKER, "skulker")
        .hand(P1, BOLT, "bolt")
        .unit(P2, "base", source === "reckoner" ? RECKONER : { might: 1, name: "Bystander" }, "other")
        .build();
      await game.p1.cast("bolt", { targets: "skulker" });
      await game.settle();
      expect(game.zoneOf("skulker")).toBe("trash");
    });

    // ── (e) combat cleanup recall ignores the restriction ────────────────────────────────────

    test("(e) P2's Wanderer attacks the restricted battlefield: while there it carries the restriction too; its 'When I move' trigger fired ONCE for the attack move", async () => {
      const game = await combatBoard(source).build();
      const hand = game.p2.hand().length;
      await game.p2.move("wanderer", "lair");
      expect(game.locationOf("wanderer")).toBe("lair");
      expect(game.state("wanderer").keywords).toContain("NoMoveToBase");
      // The move trigger is P2's chain item; let it resolve but stop before combat resolves.
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wanderer", controller: P2, triggered: true })]);
      for (let i = 0; i < 4 && game.chain().length > 0; i++) {
        await game.acting().passPriority();
      }
      expect(game.chain()).toEqual([]);
      expect(game.p2.hand()).toHaveLength(hand + 1);
      expect(game.locationOf("wanderer")).toBe("lair");
      expect(game.state("wanderer").combatRole).toBe("attacker");
      expect(game.state("skulker").combatRole).toBe("defender");
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    });

    test("(e) both sides survive (stunned Skulker deals no damage, 1 < 3) → step 3d RECALLS the attacker to base despite the restriction (466.1.a.2 / 456.3); Skulker healed and still holding; NO second 'When I move' draw (456.1)", async () => {
      const game = await combatBoard(source).build();
      const hand = game.p2.hand().length;
      await game.p2.move("wanderer", "lair");
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
      expect(game.zoneOf("wanderer")).toBe("base");
      expect(game.state("wanderer")).toMatchObject({ combatRole: null, damage: 0, location: "base" });
      expect(game.locationOf("skulker")).toBe("lair");
      expect(game.state("skulker").damage).toBe(0); // 3c heal
      expect(game.gameState.battlefields.lair?.controller).toBe(P1);
      expect(game.p2.points()).toBe(0);
      expect(game.p2.hand()).toHaveLength(hand + 1); // exactly the one draw from the attack move
      expect(game.chain()).toEqual([]);
      expect(game.violations()).toEqual([]);
    });
  });
}
