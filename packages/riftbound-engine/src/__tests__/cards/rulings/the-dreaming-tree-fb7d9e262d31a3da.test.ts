/**
 * Ruling fb7d9e262d31a3da — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Divine Judgment (OGN-244 → ogn-244-298) · Action [7][order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *   (+ Discipline ogn-058-298 as a targeting control, Meditation ogn-048-298 for the "costs choose too" nuance)
 *
 * Q: Why does the Tree trigger when a spell "chooses" a unit but not for Divine Judgment, which also says "choose"?
 * A: The Tree means choices made in the TARGETING step (while the spell is being finalized). Divine Judgment's "each player
 *    chooses" happens during RESOLUTION, so it is not targeting and does not trigger the Tree. Likewise a COST that has you
 *    choose a unit is paid during finalization but is not a target either.
 * Rules: 355.1 / 355.4 (targets = choices made when the spell is played), 355.10 (resolution-time choices are not targets),
 *        356.2 (additional costs), 383.4.b.2 (targeting triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const DIVINE_JUDGMENT = "ogn-244-298";
const DISCIPLINE = "ogn-058-298";
const MEDITATION = "ogn-048-298";

/**
 * P1's turn. P1 controls the live Tree with Dreamer; two more units in base (3 units → Divine Judgment forces a real choice);
 * hand: Divine Judgment + exactly two keepers; deck top d1,d2. P2 has a couple of units so its side resolves trivially.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .unit(P1, "base", { might: 1, name: "Extra" }, "extra")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .hand(P1, DIVINE_JUDGMENT, "dj")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "KeepA" }, "keepA")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "KeepB" }, "keepB")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Drive Divine Judgment's resolution-time prompts: P1 keeps Dreamer + Homebody (recycles Extra); P2 takes defaults. */
async function resolveJudgment(game: Game): Promise<boolean> {
  let sawTree = false;
  for (let i = 0; i < 16; i++) {
    sawTree ||= game.chain().some((c) => c.cardId === "tree");
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      expect(d.timing).toBe("RES"); // the "choose 2 units" is asked while the spell RESOLVES
      const keys = d.options.map((o) => o.key);
      await game.p1.pick(keys.includes("extra") ? "extra" : keys[0]!);
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options[0]!.key);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  await game.settle();
  return sawTree;
}

describe("Ruling fb7d9e262d31a3da — 'choose' at targeting triggers the Tree; 'choose' at resolution (Divine Judgment) or as a cost does not", () => {
  test("Divine Judgment names nothing when played: no `targets` field, the chain item carries no targets, and no Tree trigger appears on the cast", async () => {
    const game = await board().build();
    expect((game.p1.option("cast", "dj")?.fields ?? []).filter((f) => f.name === "targets")).toEqual([]);
    await game.p1.cast("dj");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
  });

  test("its 'each player chooses 2 units' is a RESOLUTION-time prompt; keeping the Dreamer at the Tree draws nothing — no Tree item ever hits the chain, hand is still exactly the two keepers, d1 still on top", async () => {
    const game = await board().build();
    await game.p1.cast("dj");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const sawTree = await resolveJudgment(game);
    expect(sawTree).toBe(false);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("battlefield-tree");
    expect(game.zoneOf("extra")).toBe("mainDeck");
    expect(game.p1.hand().sort()).toEqual(["keepA", "keepB"]);
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("control — a spell that chooses the Dreamer in its TARGETING step (Discipline) does trigger the Tree: the Tree item is on the chain above the spell at once and P1 ends up drawing 1 (Tree) + 1 (Discipline)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
      .hand(P1, DISCIPLINE, "disc")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  test("nuance — a COST that has you choose a unit is not targeting: Meditation's optional 'exhaust a friendly unit' paid with the Dreamer draws only Meditation's 2, no Tree draw and no Tree item", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
      .hand(P1, MEDITATION, "med")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"])
      .build();
    await game.p1.cast("med", { payOptional: true, targets: "dreamer" });
    expect(game.state("dreamer").isExhausted).toBe(true); // the cost was paid with the Dreamer as the spell was played
    expect(game.chain().map((c) => c.cardId)).toEqual(["med"]); // no Tree trigger
    await game.settle();
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // exactly Meditation's "draw 2"
    expect(game.p1.deck()[0]).toBe("d3");
  });
});
