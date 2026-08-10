/**
 * Ruling 1001c77395a5bff7 — Last Rites (SFD-150 → sfd-150-221) · Equipment · Chaos · [3] · +2 Might
 *   "[Equip] — [chaos], Recycle 2 cards from your trash (Pay the cost: Attach this to a unit you control.)
 *    When I conquer or hold, you may play a unit from your trash."
 *
 * Q: Can you equip Last Rites if you don't have two (cards) to recycle?
 * A: No. Recycling two cards from your trash is part of the Equip COST, and costs must be paid in full — with fewer
 *    than two cards in your trash you cannot activate Equip at all. (Any two cards; they need not be units.)
 * Rules: 818 (Equip is an activated ability: cost → attach), 130 / 396–397 (costs paid in full, up front),
 *        416 (recycle → bottom of the deck).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const JUNK_UNIT = { cardType: "unit", energyCost: 1, might: 1, name: "Junk Unit" } as const;
const JUNK_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Junk Spell",
  timing: "action",
} as const;

/** P1's turn: Bearer (3) and an unattached Last Rites in base, one [chaos] in the pool, `trash` = P1's trash contents. */
function board(trash: readonly (typeof JUNK_UNIT | typeof JUNK_SPELL)[]) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 0, power: { chaos: 1 } })
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer")
    .gear(P1, LAST_RITES, "rites")
    .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs");
  trash.forEach((def, i) => s.trash(P1, def, `t${i + 1}`));
  return s;
}

async function equip(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "rites", unitId: "bearer" } });
}

describe("Ruling 1001c77395a5bff7 — Last Rites' 'Recycle 2 cards from your trash' is part of the Equip cost", () => {
  test("empty trash, or just ONE card in it: even with the [chaos] ready, Equip is not a legal action — nothing can be partially paid", async () => {
    for (const trash of [[], [JUNK_UNIT]] as const) {
      const game = await board(trash).build();
      expect(game.p1.can("equipCard")).toBe(false);
      const r = await game.p1.try((p) => equip(game).then(() => p));
      expect(r.ok).toBe(false);
      expect(game.state("rites").attachedTo).toBeUndefined();
      expect(game.p1.power("chaos")).toBe(1);
      expect(game.p1.trash()).toHaveLength(trash.length);
    }
  });

  test("two cards in trash — a unit AND a spell (they need not be units): Equip is legal; paying it spends the [chaos] and recycles both to the deck bottom, then Last Rites attaches (Bearer 3 → 5)", async () => {
    const game = await board([JUNK_UNIT, JUNK_SPELL]).build();
    expect(game.p1.can("equipCard")).toBe(true);
    await equip(game);
    // The two cost cards are named as part of paying (both, here).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["t1", "t2"]);
    await game.p1.pick("t1", "t2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rites"]); // cost paid, the Equip item awaits resolution
    expect(game.state("rites").attachedTo).toBeUndefined();
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("bearer");
    expect(game.state("bearer")).toMatchObject({ attachments: ["rites"], might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("the [chaos] half is just as mandatory: two cards in trash but no power → no Equip", async () => {
    const game = await board([JUNK_UNIT, JUNK_UNIT]).resources(P1, { energy: 5, power: { chaos: 0 } }).build();
    expect(game.p1.can("equipCard")).toBe(false);
  });
});
