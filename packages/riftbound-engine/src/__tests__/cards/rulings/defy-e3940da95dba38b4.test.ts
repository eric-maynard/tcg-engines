/**
 * Ruling e3940da95dba38b4 — Defy (OGN-045 → ogn-045-298) · [Reaction] · 1+[calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Discipline (OGN-058 → ogn-058-298) · [Reaction] · 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *   × Dredge Up (VEN-049 → ven-049-166) · 2 · "Draw 1." (the original "Spell A")
 *
 * Q: P1 has Defied a spell; P2 responds with Discipline and DRAWS their own Defy. Can P2 now react to P1's Defy with it
 *    and counter it?
 * A: Yes. The chain resolves one item at a time (LIFO) with a priority window after each: Discipline resolves (P2 +2
 *    Might, draws Defy), then — before P1's Defy resolves — P2 may play the freshly drawn Defy targeting P1's Defy.
 *    P2's Defy resolves first and counters P1's Defy; Spell A then resolves normally.
 * Rules: 340 (LIFO, priority after each resolution), 336–338 (Reactions in a Closed State), 425.1.a (countered item
 *        removed and does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DISCIPLINE = "ogn-058-298";
const DREDGE_UP = "ven-049-166";
const FILLER = "ogn-175-298";

/**
 * P2's turn. P2: [5] + 1 calm (Dredge Up 2 + Discipline 2 + Defy 1+[calm]), a Pupil to Discipline, Dredge Up + Discipline in
 * hand, deck top = Defy then a filler. P1: Defy in hand with exactly 1+[calm].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, DREDGE_UP, "spellA")
    .hand(P2, DISCIPLINE, "disc")
    .deck(P2, [DEFY, FILLER], ["defy2", "next"])
    .hand(P1, DEFY, "defy1");
}

/** Spell A → P1's Defy on it → P2's Discipline on top. */
async function threeDeep(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("spellA");
  await game.p2.passPriority();
  await game.p1.cast("defy1", { targets: "spellA" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["spellA", "defy1"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "disc")).toBe(true);
  await game.p2.cast("disc", { targets: "pupil" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["spellA", "defy1", "disc"]);
  expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  return game;
}

/** Both pass → Discipline (top) resolves alone; then P1 (who gets priority next) passes so P2 holds priority with two items left. */
async function disciplineResolvedP2Window(): Promise<Game> {
  const game = await threeDeep();
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["spellA", "defy1"]); // only the top item resolved
  expect(game.state("pupil").might).toBe(4);
  expect(game.p2.hand()).toEqual(["defy2"]); // Discipline drew the Defy
  // A fresh priority round opens before the next item resolves.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling e3940da95dba38b4 — a Defy drawn off Discipline mid-chain can still counter the opposing Defy", () => {
  test("steps 1–4: Spell A → P1's Defy → P2's Discipline; Discipline resolves FIRST and alone (Pupil +2, P2 draws Defy) while Spell A and P1's Defy stay on the chain", async () => {
    await disciplineResolvedP2Window();
  });

  test("steps 5–6: in the priority window after Discipline, P2 may cast the just-drawn Defy — P1's Defy (1+[calm]) is a legal target — and it goes on top", async () => {
    const game = await disciplineResolvedP2Window();
    expect(game.p2.can("cast", "defy2")).toBe(true);
    const offered = (game.p2.option("cast", "defy2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("defy1");
    await game.p2.cast("defy2", { targets: "defy1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spellA", "defy1", "defy2"]);
  });

  test("step 7: P2's Defy resolves first and counters P1's Defy (removed, does nothing); Spell A then resolves normally — P2 draws its card", async () => {
    const game = await disciplineResolvedP2Window();
    await game.p2.cast("defy2", { targets: "defy1" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy2")).toBe("trash");
    expect(game.zoneOf("defy1")).toBe("trash"); // countered (425.1.a)
    expect(game.zoneOf("spellA")).toBe("trash"); // resolved
    expect(game.p2.hand()).toEqual(["next"]); // Spell A's "Draw 1" happened
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // P1's Defy cost stays spent
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 does not use the drawn Defy: P1's Defy resolves and counters Spell A (no draw for P2)", async () => {
    const game = await disciplineResolvedP2Window();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy1")).toBe("trash");
    expect(game.zoneOf("spellA")).toBe("trash");
    expect(game.p2.hand()).toEqual(["defy2"]); // nothing more drawn
    expect(game.p2.deck()[0]).toBe("next");
  });
});
