/**
 * Ruling 3c203c68157f4f38 — Hwei, Brooding Painter (UNL-080 → unl-080-219) · 5 Might · "When I move, draw 1, then discard 1.
 *   Then, based on the discarded card's type: Spell — Draw 1. Gear — Ready up to 2 runes. Unit — Give me +3 [Might] this turn."
 *   × Cull the Weak (OGN-209 → ogn-209-298) "Each player kills one of their units."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."
 *   × Ashe, Focused (UNL-169 → unl-169-219) on the opponent's side (does not interact).  (Cull sfd-134-221: name collision.)
 *
 * Q: P1 has Hwei (at a battlefield), P2 has Ashe. P2 plays Cull the Weak; P1 responds with Flash. Does Hwei's move
 *    trigger happen?
 * A: Yes. Flash resolves first (LIFO) and MOVES Hwei to base; that fires Hwei's "When I move" trigger as a new item on
 *    top, so P1 draws 1, discards 1 and gets the type bonus before Cull the Weak resolves. Then each player kills a
 *    unit — P1 may pick Hwei or another unit; P2 must kill one of theirs.
 * Rules: 441 (Flash's relocation is a Move), 383 (trigger added on top of the chain), 336–337 (LIFO), 355.10.e.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";
const ASHE_FOCUSED = "unl-169-219";
const CULL_THE_WEAK = "ogn-209-298";
const FLASH = "ogs-011-024";
const DISCIPLINE = "ogn-058-298"; // a SPELL for Hwei to discard (→ "Spell — Draw 1")

/**
 * P2's turn with [2] + order and Cull the Weak; Ashe, Focused in P2's base. P1: Hwei on P1's bf1, a 2-Might Pal in
 * base, Flash + Discipline in hand, [2] floating.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", HWEI, "hwei")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "base", ASHE_FOCUSED, "ashe")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P1, FLASH, "flash")
    .hand(P1, DISCIPLINE, "disc");
}

/** P2 casts Cull the Weak (Ashe, P2's only unit, will bind as its victim on resolution — 355.10.e); P1 responds with Flash on Hwei. */
async function cullThenFlash(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("cull");
  await game.p2.passPriority();
  expect(game.p1.can("cast", "flash")).toBe(true);
  await game.p1.cast("flash", { targets: ["hwei"] });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "flash"]);
  return game;
}

describe("Ruling 3c203c68157f4f38 — Flash in response to Cull the Weak moves Hwei, and his move trigger resolves before the Cull", () => {
  test("Flash resolves first: Hwei is MOVED to base and his 'When I move' trigger is put on the chain on top of the still-waiting Cull the Weak", async () => {
    const game = await cullThenFlash();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("hwei")).toBe("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "cull", controller: P2 }),
      expect.objectContaining({ cardId: "hwei", controller: P1, triggered: true }),
    ]);
  });

  test("Hwei's trigger resolves before the Cull: P1 draws 1, is asked which card to discard (picks the spell Discipline) and draws 1 more — all while Cull the Weak is still on the chain", async () => {
    const game = await cullThenFlash();
    const hand0 = game.p1.hand().length; // disc (+ Flash already gone)
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flash resolves → Hwei trigger
    await game.p1.passPriority();
    await game.p2.passPriority(); // Hwei trigger starts resolving
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("disc");
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // drew 1 before discarding
    await game.p1.pick("disc");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1 - 1 + 1); // discarded a Spell → drew 1 more
    // Cull the Weak has not resolved yet: nobody has died.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull" })]);
    expect(game.zoneOf("ashe")).toBe("base");
    expect(game.zoneOf("pal")).toBe("base");
  });

  test("then Cull the Weak resolves: P1 is offered Hwei OR Pal (may keep Hwei), P2 must kill one of theirs — Ashe dies; Hwei survives in base having already drawn", async () => {
    const game = await cullThenFlash();
    let p1KillOffer: string[] = [];
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "disc")) {
        await game.p1.pick("disc"); // Hwei's discard
      } else if (d.kind === "pick" && d.seat === P1) {
        p1KillOffer = d.options.map((o) => (o.card ?? o.key) as string).toSorted();
        expect(d.source?.cardId).toBe("cull");
        await game.p1.pick("pal");
      } else if (d.kind === "pick" && d.seat === P2) {
        await game.p2.pick("ashe");
      } else {
        break;
      }
    }
    expect(p1KillOffer).toEqual(["hwei", "pal"]);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("ashe")).toBe("trash");
    expect(game.zoneOf("hwei")).toBe("base");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
