/**
 * Interaction: Karthus, Eternal (ogn-236-298, 3 Might) "Your [Deathknell] effects trigger an
 *   additional time."
 *   × Kog'Maw, Caustic (ogn-190-298, 1 Might) "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Watchful Sentry (ogn-096-298, 1 Might, enemy) "[Deathknell] — Draw 1."
 *
 * Question: A controls Karthus and Kog'Maw at bf1; B has Watchful Sentry there. Kog'Maw is killed
 * (Hextech Ray). (a) How many Kog'Maw Deathknell triggers, one chain item or two? (b) The first
 * "Deal 4 to all units at my battlefield" kills Karthus and B's Sentry — does the second Kog'Maw
 * trigger still resolve, and where does the Sentry's Deathknell land? (c) Is B's Sentry doubled?
 * Contrast: Karthus NOT on the board when Kog'Maw dies.
 *
 * Rules: 808.2 (each Deathknell instance triggers separately), 428.1.a.1.b (dies-trigger is added
 * as a Pending Item, noting location, before the unit hits the trash), 323.4/323.5 (Cleanup kills
 * lethal-damaged units and queues their Deathknells), 365.1 / 337.1.b / 340.1 (triggered items are
 * independent chain items; newest resolves first; an item already on the chain resolves even if
 * its source/enabler left), 383.3.d ("Your" = controller-scoped static).
 *
 * Expected: (a) two independent Kog'Maw items. (b) top Kog item: 4 to Karthus (dies) + Sentry
 * (dies) + others; Sentry's Deathknell goes on ABOVE the remaining Kog item → B draws 1 first; then
 * the second Kog item still resolves and deals 4 again. (c) No — "Your"; B draws exactly 1.
 * Contrast: without Karthus on board at the moment of death, exactly one trigger; Karthus cannot
 * be added retroactively.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const KOGMAW = "ogn-190-298";
const SENTRY = "ogn-096-298";
const HEXTECH_RAY = "ogn-009-298"; // Deal 3 to a unit at a battlefield — kills the 1-Might Kog'Maw

function board(opts: { karthusOnBoard: boolean }) {
  const s = scenario()
    .resources(P1, { energy: 20, power: { chaos: 5, fury: 5, order: 5, rainbow: 5 } })
    .resources(P2, { energy: 20 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", SENTRY, "sentry") // B's 1-Might Deathknell unit at Kog'Maw's battlefield
    .unit(P2, "bf1", { might: 9, name: "Big Wall" }, "wall") // survives 4, records the damage waves
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere") // NOT at "my battlefield"
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home") // base is not a battlefield
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, HEXTECH_RAY, "ray2");
  return opts.karthusOnBoard ? s.unit(P1, "bf1", KARTHUS, "karthus") : s.hand(P1, KARTHUS, "karthus");
}

/** A casts Hextech Ray at Kog'Maw and both players pass so the Ray (only) resolves. */
async function killKogMaw(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): Promise<void> {
  await game.p1.cast("ray", { targets: "kog" });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Karthus × Kog'Maw × Watchful Sentry — doubled Deathknell on the chain", () => {
  test("Kog'Maw killed by spell damage: it goes to the trash and its Deathknell is put on the chain as A's triggered item (428.1.a.1.b)", async () => {
    const game = await board({ karthusOnBoard: true }).build();
    await killKogMaw(game);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("kog")).toBe("trash");
    const chain = game.chain();
    expect(chain.length).toBeGreaterThanOrEqual(1);
    for (const item of chain) {
      expect(item).toMatchObject({ cardId: "kog", controller: P1, triggered: true });
    }
    // Nothing has been dealt yet — the trigger is waiting on the chain.
    expect(game.state("wall").damage).toBe(0);
    expect(game.locationOf("karthus")).toBe("bf1");
    expect(game.actingSeat()).toBe(P1);
  });

  test("(a) with Karthus on board Kog'Maw's Deathknell triggers TWICE — two independent chain items (808.2, Karthus static) — engine adds only one", async () => {
    // Expected: chain = [Kog'Maw trigger, Kog'Maw trigger], both controlled by A.
    // Actual: Karthus's "trigger an additional time" static is not applied; one item.
    const game = await board({ karthusOnBoard: true }).build();
    await killKogMaw(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "kog", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "kog", controller: P1, triggered: true }),
    ]);
  });

  test.failing("BUG: Kog'Maw's Deathknell resolves as 'Deal 4 to all units at my (former) battlefield' — engine throws while resolving the target ('target.location?.startsWith is not a function')", async () => {
    // Expected (no Karthus, single trigger): every unit at bf1 takes 4 → Sentry (1) dies and B draws 1,
    // the 9-Might wall carries 4 damage; units at bf2 / in base are untouched.
    // Actual: passChainPriority is rejected with an EXECUTION_ERROR from the target resolver.
    const game = await board({ karthusOnBoard: false }).build();
    const p2Hand = game.p2.hand().length;
    await killKogMaw(game);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.state("wall").damage).toBe(4);
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.state("elsewhere").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });

  test.failing("BUG: (b) first Kog'Maw wave kills Karthus + Sentry; Sentry's Deathknell lands ABOVE the second Kog'Maw item (B draws 1 first); the second wave still resolves without Karthus and deals 4 again", async () => {
    // Expected sequence (chain listed bottom → top):
    //   [Kog, Kog] → resolve top: Karthus(3) & Sentry(1) die, wall 4 dmg → [Kog, Sentry] → B draws 1 → [Kog]
    //   → resolves (already on the chain; Karthus leaving is irrelevant, 340.1) → wall 8 dmg.
    // Actual: only one Kog item is created and its resolution throws.
    const game = await board({ karthusOnBoard: true }).build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await killKogMaw(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog", "kog"]);

    // Newest Kog'Maw item resolves first.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("karthus")).toBe("trash"); // 4 ≥ 3
    expect(game.zoneOf("sentry")).toBe("trash"); // 4 ≥ 1
    expect(game.state("wall").damage).toBe(4);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "kog", controller: P1, triggered: true }), // still waiting
      expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true }), // on top (323.4)
    ]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // not drawn yet

    // Sentry's Deathknell resolves before the remaining Kog'Maw item.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    expect(game.state("wall").damage).toBe(4);

    // Second Kog'Maw wave: Karthus is gone but the item was already on the chain → still resolves.
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.state("wall").damage).toBe(8);
    expect(game.locationOf("wall")).toBe("bf1"); // 8 < 9
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // (c) Sentry drew exactly once — not "Your" Deathknell
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // A only spent the Ray; Karthus/Kog'Maw draw nothing
    expect(game.state("elsewhere").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });

  test("(c) Karthus says 'Your': B's Watchful Sentry dying while A's Karthus is on board triggers ONCE — one chain item, B draws exactly 1", async () => {
    const game = await board({ karthusOnBoard: true }).build();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("ray", { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.locationOf("karthus")).toBe("bf1");
    expect(game.locationOf("kog")).toBe("bf1");
  });

  test("contrast: Karthus in hand (not on board) when Kog'Maw dies → exactly ONE Deathknell item; Karthus cannot be played onto the open chain to add one retroactively", async () => {
    const game = await board({ karthusOnBoard: false }).build();
    expect(game.zoneOf("karthus")).toBe("hand");
    await killKogMaw(game);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
    // A unit (no Reaction/Action timing) is not playable while the chain is open.
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "karthus")).toBe(false);
    const r = await game.p1.try((p) => p.play("karthus", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toHaveLength(1);
  });
});
