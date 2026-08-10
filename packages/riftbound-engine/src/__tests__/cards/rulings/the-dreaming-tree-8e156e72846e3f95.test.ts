/**
 * Ruling 8e156e72846e3f95 — The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield)
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Defy (OGN-045 → ogn-045-298, Reaction, 1+[calm]) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Cleave (OGN-004 → ogn-004-298, Action, 1) "Give a unit [Assault 3] this turn."
 *   (+ Gust ogn-169-298, Reaction: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand" for the
 *    "unit removed before the spell resolves" nuance.)
 *
 * Q: I target my unit at the Dreaming Tree with a spell and the spell gets Defied — do I still draw?
 * A: Yes. The Tree's draw trigger enters the chain when the unit is chosen and does not depend on the spell resolving.
 *    Also: you still draw if the unit is removed before the spell resolves; a spell on your own ATTACKING unit at the Tree
 *    during a showdown (e.g. Cleave) triggers the draw too ("here" includes units there during a showdown).
 * Rules: 383.4.b (choose triggers at finalization), 340 (LIFO), 425 (counter), 359.3.e (target gone → spell does nothing,
 *        independent chain items still resolve).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const DEFY = "ogn-045-298";
const CLEAVE = "ogn-004-298";
const GUST = "ogn-169-298";

/** P1's turn; P1 controls the live Tree with Dreamer (3) there; Cleave + [1]. P2 holds Defy and Gust with 2 energy + [calm]. */
function ownTree() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 8e156e72846e3f95 — the Dreaming Tree draw survives the spell being Defied (or its target vanishing)", () => {
  test("Cleave on my Dreamer → the Tree trigger joins the chain immediately; P2 Defies the CLEAVE; resolution: Cleave countered (no Assault) yet P1 still draws 1", async () => {
    const game = await ownTree().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree"]);
    expect(game.p1.hand()).toEqual([]);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("dreamer").grantedKeywords).toEqual([]); // countered: never resolved
    expect(game.p1.hand()).toEqual(["d1"]); // …but the draw happened regardless
    expect(game.violations()).toEqual([]);
  });

  test("nuance — target removed instead of countered: P2 Gusts the Dreamer back to P1's hand in response; Cleave then does nothing, and P1 STILL draws 1 off the Tree trigger", async () => {
    const game = await ownTree().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dreamer")).toBe("hand");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(new Set(game.p1.hand())).toEqual(new Set(["dreamer", "d1"])); // Dreamer bounced + the Tree draw
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — my ATTACKING unit at the opponent's Dreaming Tree counts as 'here': in the showdown P1 Cleaves its own attacker → a Tree item for P1 and P1 draws 1 (P2, the Tree's controller, draws nothing)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("tree", { controller: P2, def: DREAMING_TREE, inert: false, owner: P2 })
      .unit(P2, "tree", { might: 6, name: "Keeper" }, "keeper")
      .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CLEAVE, "cleave")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .deck(P2, ["ogn-175-298"], ["p2top"])
      .build();
    await game.p1.move("raider", "tree");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("cleave", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree"]);
    // Resolve the chain only (stay in the showdown).
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.p1.hand()).toEqual(["d1"]); // the attacker's controller drew
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.state("raider").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("raider").might).toBe(5); // 2 + Assault 3 while attacking
    await game.settle(); // 5 vs 6: Raider dies, Keeper survives
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
