/**
 * Ruling 8add08c2ebe9e043 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might · [Tank]   (+ a 1-Might Poro; kill spells: Hidden Blade
 *     ogn-213-298 from hand, Flurry of Blades ogn-133-298 "[Reaction] Deal 1 to all units at battlefields")
 *
 * Q: Can the opponent force a hidden Zhonya's to save the Poro rather than Blitzcrank when several units are dying?
 * A: Simultaneous deaths (combat damage) → the Zhonya's CONTROLLER chooses which death it replaces. But deaths in
 *    sequence can be forced: opponent casts a kill spell on Blitzcrank, controller flips Zhonya's, opponent responds
 *    with another spell that kills the Poro — it resolves first, the Poro's death is the one replaced (mandatory,
 *    single-use), then the first spell kills Blitzcrank. Being hidden, Zhonya's need not be flipped at all.
 * Rules: 370.1.a.2 (simultaneous events), 371–373 (replacement applies once; its controller assigns it), 337 (LIFO), 811.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BLITZCRANK = "ogn-067-298";
const HIDDEN_BLADE = "ogn-213-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/**
 * Turn 3, P1 active. P2 holds bf1 with Poro (1) and Blitzcrank (5, Tank) and hid Zhonya's there earlier.
 * P1: Bruiser (8) in base, Hidden Blade (2 + [order]) and Flurry of Blades (1) in hand, 3 energy + [order].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Poro" }, "poro")
    .unit(P2, "bf1", BLITZCRANK, "blitz")
    .facedown(P2, "bf1", ZHONYAS, "zhonyas")
    .unit(P1, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, FLURRY_OF_BLADES, "flurry");
}

/** Step until a replacement-assign pick, the open main phase, or an unexpected prompt; take default damage splits. */
async function stepToAssignOrEnd(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return d;
    }
    if (d.kind === "pick" && d.semantics === "replacement-assign") {
      return d;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute(d.defaultAllocation);
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered") {
        return game.decision();
      }
    }
  }
  return game.decision();
}

describe("Ruling 8add08c2ebe9e043 — who decides which unit a flipped Zhonya's saves", () => {
  // ── simultaneous deaths (combat) → controller's choice ─────────────────────────────────────

  test("combat: Bruiser (8) attacks; P2 flips Zhonya's with Focus; 5 to Tank Blitzcrank + 3 to Poro kill BOTH at once → the 'which death' pick surfaces to P2 (Zhonya's controller) naming both", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "zhonyas")).toBe(true);
    await game.p2.reveal("zhonyas");
    expect(game.state("zhonyas")).toMatchObject({ isHidden: false, zone: "base" });
    const d = await stepToAssignOrEnd(game);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["blitz", "poro"]);
    expect(game.actingSeat()).toBe(P2); // P1 has no say
  });

  test("combat: P2 picks Blitzcrank → Zhonya's dies instead, Blitzcrank recalled to base exhausted and healed; the Poro dies; Bruiser takes bf1", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("zhonyas");
    await stepToAssignOrEnd(game);
    await game.p2.pick("blitz");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("blitz")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ── sequential deaths (spells) → the opponent can force it ─────────────────────────────────

  test("spells: P1 Hidden Blades Blitzcrank; P2 — holding priority — MAY flip Zhonya's or simply pass (it is hidden, flipping is optional)", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "blitz" });
    await game.p1.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(d?.kind === "action" ? Boolean(d.passKey) : false).toBe(true);
    expect(game.p2.can("reveal", "zhonyas")).toBe(true);
    // Declining: Blitzcrank just dies, Zhonya's stays hidden.
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.state("zhonyas")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });

  test("ruling 8add08c2ebe9e043 — spells: P2 flips Zhonya's in response; P1 answers with Flurry of Blades (Reaction). Flurry resolves FIRST: only the Poro dies → Zhonya's must replace THAT death (no choice); then Hidden Blade kills Blitzcrank for real", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "blitz" });
    await game.p1.passPriority();
    await game.p2.reveal("zhonyas");
    expect(game.state("zhonyas")).toMatchObject({ isHidden: false, zone: "base" });
    // Back to priority: P2 passes, P1 responds with Flurry of Blades on top of Hidden Blade.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.p1.can("cast", "flurry")).toBe(true);
    await game.p1.cast("flurry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flurry"]);
    // Resolve Flurry (top): 1 to Poro (lethal) and 1 to Blitzcrank.
    await game.p1.passPriority();
    await game.p2.passPriority();
    // A single death → nothing to assign: Zhonya's is consumed on the Poro without asking P2.
    const now = game.decision();
    expect(now?.kind === "pick" && now.semantics === "replacement-assign").toBe(false);
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("blitz")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    // Hidden Blade now resolves: no Hourglass left → Blitzcrank dies; P2 (its controller) draws 2.
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — spells without the second response: Zhonya's flipped, Hidden Blade resolves → the single dying unit Blitzcrank is the one saved; the Poro is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "blitz" });
    await game.p1.passPriority();
    await game.p2.reveal("zhonyas");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("blitz")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });
});
