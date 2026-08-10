/**
 * Ruling 50a1105b3f91e55b — Singularity (OGN-105 → ogn-105-298) · Spell · 6+[mind][mind] · "Deal 6 to each of up to two units."
 *   × Primal Strength (OGN-154 → ogn-154-298) · [Action] "Give a unit +7 [Might] this turn."
 *   (+ Discipline ogn-058-298 and En Garde ogn-046-298 as the two Reaction spells.)
 *
 * Q: If my opponent plays Singularity, can I react with two reaction spells?
 * A: Yes. Singularity starts a chain (no showdown); while it is open only Reactions may be added, and you may keep
 *    adding them — each goes on top and resolves before what is beneath it. Action cards like Primal Strength cannot
 *    be played in response.
 * Rules: 330–337 (chain / closed state), 155.2.b.3 (Reaction timing), 155.2.b.2 (Action timing excludes chains).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const PRIMAL_STRENGTH = "ogn-154-298";
const DISCIPLINE = "ogn-058-298"; // [Reaction] 2: +2 Might this turn, draw 1
const EN_GARDE = "ogn-046-298"; // [Reaction] 1: +1 Might (+1 more if alone there)

/**
 * P1's turn with exactly [6][mind][mind] and Singularity. P2: units A (3) and B (3) in base, hand Discipline + En Garde +
 * Primal Strength, and [7] + 1 body — enough for all three, so only TIMING can forbid Primal Strength.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 7, power: { body: 1 } })
    .unit(P2, "base", { might: 3, name: "Unit A" }, "A")
    .unit(P2, "base", { might: 3, name: "Unit B" }, "B")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, EN_GARDE, "engarde")
    .hand(P2, PRIMAL_STRENGTH, "primal");
}

describe("Ruling 50a1105b3f91e55b — two Reactions may be chained onto Singularity; an Action may not", () => {
  test("Singularity opens a chain (no showdown); in P2's window both Reactions are legal but Primal Strength (Action) is not", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["A", "B"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing"]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("cast", "engarde")).toBe(true);
    expect(game.p2.can("cast", "primal")).toBe(false);
    const r = await game.p2.try((p) => p.cast("primal", { targets: "A" }));
    expect(r.ok).toBe(false);
  });

  test("P2 plays Discipline, keeps priority, and stacks En Garde on top of it: chain = Singularity ← Discipline ← En Garde", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["A", "B"] });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "A" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "disc"]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 }); // P2 may respond to its own Reaction
    expect(game.p2.can("cast", "engarde")).toBe(true);
    expect(game.p2.can("cast", "primal")).toBe(false); // still an Action, still illegal mid-chain
    await game.p2.cast("engarde", { targets: "A" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "disc", "engarde"]);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { body: 1 } }); // 7 − 2 − 1
  });

  test("resolution is LIFO: En Garde, then Discipline (P2 draws 1), then Singularity — 6 to each is still lethal to A (3+2+1) and B", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["A", "B"] });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "A" });
    await game.p2.cast("engarde", { targets: "A" });
    const p2Hand = game.p2.hand().length; // primal + filler…
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde resolves
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "disc"]);
    expect(game.state("A").might).toBe(4); // +1 (not alone in base: B is there too)
    await game.settle(); // Discipline, then Singularity
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Discipline's draw
    expect(game.zoneOf("A")).toBe("trash"); // 6 ≥ 3+2+1
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("primal")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
