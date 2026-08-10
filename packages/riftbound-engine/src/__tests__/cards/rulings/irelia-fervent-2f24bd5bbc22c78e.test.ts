/**
 * Ruling 2f24bd5bbc22c78e — Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me,
 *     give me +1 [Might] this turn."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield · "When a player chooses a friendly unit here with a spell for
 *     the first time each turn, they draw 1."
 *   Spell choosing her: Discipline (ogn-058-298, [2] Reaction "Give a unit +2 [Might] this turn. Draw 1.");
 *   counter: Defy (ogn-045-298, [1][calm] Reaction "Counter a spell that costs no more than [4] and no more than [rainbow].")
 *
 * Q: Does countering the spell that chose Irelia stop her "when you choose me" ability?
 * A: No. She triggers when she is chosen — at the spell's finalization, before anyone can counter it — so her trigger is
 *    already on the chain and resolves even if the spell is countered. Same for other "when chosen" effects (Dreaming
 *    Tree); and activating [Equip] onto her also counts as choosing her, triggering before the gear attaches.
 * Rules: 383.4.b.2 (targeting triggers fire on finalization), 354/359.3.a (finalize → priority), 412 (Counter removes the
 *        spell only), 340 (LIFO), 818.1.b.1 (Equip's unit is a chosen target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";
const DORANS_SHIELD = "sfd-033-221"; // Equipment · +1 · [Equip][calm]

/** P1's turn. Irelia (4) in P1's base; P1: Discipline + [2]. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .unit(P1, "base", IRELIA, "irelia")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Discipline on Irelia, passes; P2 counters it with Defy. */
async function counteredDiscipline(game: Game): Promise<void> {
  await game.p1.cast("disc", { targets: "irelia" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "disc" });
}

describe("Ruling 2f24bd5bbc22c78e — Irelia's 'when you choose me' trigger survives the choosing spell being countered", () => {
  test("steps 1–2: finalizing Discipline with Irelia chosen puts her trigger on the chain ABOVE the spell immediately — before P2 has had any chance to act", async () => {
    const game = await board().build();
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("disc", { targets: "irelia" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "disc", controller: P1, targets: ["irelia"], triggered: false }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P2 not asked yet
    expect(game.p2.legal()).toEqual([]);
  });

  test("step 3: only now can P2 counter — Defy is offered exactly the spell (not the trigger) and goes on top", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    await game.p1.passPriority();
    const targets = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["disc"]);
    await game.p2.cast("defy", { targets: "disc" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "irelia", "defy"]);
  });

  test("step 4: Discipline is countered (no +2, no draw) yet Irelia's trigger still resolves — she ends the chain at 4 + 1 = 5", async () => {
    const game = await board().build();
    await counteredDiscipline(game);
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash"); // countered → trash, never resolved
    expect(game.p1.hand()).toHaveLength(p1Hand); // Discipline's "Draw 1" never happened
    expect(game.state("irelia")).toMatchObject({ baseMight: 4, might: 5 }); // +1 (her trigger) — not +3
    expect(game.violations()).toEqual([]);
  });

  test("control: uncountered, both resolve — Irelia is 4 + 1 + 2 = 7 and P1 drew 1", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
  });

  test("nuance (Dreaming Tree): the Tree's 'chooses a friendly unit here with a spell' trigger is likewise already on the chain — countering Discipline still leaves P1 the Tree's draw and Irelia's +1", async () => {
    const game = await scenario()
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", IRELIA, "irelia")
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("disc", { targets: "irelia" });
    // Two simultaneous P1 triggers (Irelia, Tree): P1 may order them (383.3.d) — accept the listed order.
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.acceptTriggerOrder();
    }
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["disc", "irelia", "tree"]);
    expect(game.chain()[0]?.cardId).toBe("disc"); // both triggers sit above the spell
    const p1Hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // the Tree's draw only (Discipline's draw was countered)
    expect(game.state("irelia").might).toBe(5);
  });

  test("nuance (Equip): activating [Equip] onto Irelia chooses her — her trigger goes on the chain at activation, while the Shield is still unattached; afterwards she is 4 + 1 (Shield) + 1 (trigger) = 6", async () => {
    const game = await scenario()
      .unit(P1, "base", IRELIA, "irelia")
      .resources(P1, { power: { calm: 1 } })
      .gear(P1, DORANS_SHIELD, "shield")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "shield", unitId: "irelia" } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "shield", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
    expect(game.state("shield").attachedTo).toBeUndefined(); // triggered before the gear actually attaches
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("irelia");
    expect(game.state("irelia").might).toBe(6);
  });
});
