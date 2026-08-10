/**
 * Ruling 58736c8c86d5d0a9 — Retreat (OGN-104 → ogn-104-298) · Reaction · [1] · "Return a friendly unit to its owner's hand.
 *     Its owner channels 1 rune exhausted."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1."  × Hidden Blade (ogn-213-298) "Kill a unit at a
 *     battlefield. Its controller draws 2."  × Hextech Ray (ogn-009-298) "Deal 3 to a unit at a battlefield."
 *   (Irelia, Fervent sfd-057-221 is only cited for a "decline the may at resolution" nuance that ruling 6d6f177ae63f7aba
 *    supersedes — not encoded here.)
 *
 * Q: Can I use Reaver's Row to retreat a unit when the opponent plays a spell that would kill it? Does the spell fizzle?
 * A: No — "when you defend" only triggers when combat designates defenders, never off a non-combat spell. But a Reaction
 *    such as Retreat can pull the unit, and "at a battlefield" spells (Void Seeker, Hidden Blade) then mistarget. Combat
 *    sequence: attack → initial chain with the Row's defend trigger (target chosen as it triggers) → reactions may be
 *    played onto that chain → it resolves → the attacker (Focus) may then play Actions like Hextech Ray.
 * Rules: 464.2 (initial combat chain), 383 (trigger conditions), 359.3.e (mistargeted instruction is skipped), 337/340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const REAVERS_ROW = "ogn-285-298";
const VOID_SEEKER = "ogn-024-298";
const HIDDEN_BLADE = "ogn-213-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P2's turn. P1 controls the live Reaver's Row with a 3-Might Scout and a 2-Might Buddy there and holds Retreat with [1].
 * P2 holds Void Seeker, Hidden Blade and Hextech Ray with 6 energy + fury×2 + order, and a 5-Might Raider in base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 6, power: { fury: 2, order: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "row", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, VOID_SEEKER, "vs")
    .hand(P2, HIDDEN_BLADE, "hb")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Pass priority around until the chain is empty (or a non-priority prompt appears). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 58736c8c86d5d0a9 — Reaver's Row does not trigger off spells; Retreat at Reaction speed makes 'at a battlefield' spells mistarget", () => {
  test("Void Seeker aimed at the Scout on Reaver's Row: NO 'when you defend' trigger — the chain holds only the spell and P1 is never asked about the Row", async () => {
    const game = await board().build();
    await game.p2.cast("vs", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.chain().some((c) => c.cardId === "row")).toBe(false);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(d?.source?.cardId).not.toBe("row");
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("…but P1 may answer with Retreat (a Reaction): Scout returns to hand, P1 channels 1 rune exhausted; Void Seeker then resolves with its target gone — no damage anywhere", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p2.cast("vs", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "retreat"]);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channelled exhausted
    expect(game.zoneOf("vs")).toBe("trash"); // resolved (not countered), resources stay spent
    expect(game.p2.resources()).toEqual({ energy: 3, power: { fury: 1, order: 1 } });
    expect(game.state("scout").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("same with Hidden Blade: Retreat in response → nothing is killed and nobody draws 2", async () => {
    const game = await board().build();
    await game.p2.cast("hb", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hb"]);
    await game.p2.passPriority();
    const p1Hand = game.p1.hand().length; // retreat + …
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("retreat", { targets: "scout" });
    await drainChain(game);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.trash()).toEqual(["retreat"]);
    // P1's hand: −retreat +scout, and NO extra 2 cards; P2 drew nothing either.
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("combat sequence: Raider attacks the Row → P1 (defender) is asked about the Row's 'may' trigger and names the Scout AS IT TRIGGERS; the item sits on the initial chain where Reactions are legal", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("scout").combatRole).toBe("defender");
    let d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.yes();
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
    await game.p1.pick("scout");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["scout"], triggered: true })]);
    expect(game.locationOf("scout")).toBe("row"); // nothing has moved yet — the choice was only the target
    // Reactions can be played onto the initial chain: Retreat is legal for P1 right now.
    d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    if (d?.seat !== P1) {
      await game.seat(d!.seat).passPriority();
    }
    expect(game.p1.can("cast", "retreat")).toBe(true);
  });

  test("…the Row resolves (Scout moves to base); only AFTER the initial chain is empty does the attacker hold Focus and may play an Action such as Hextech Ray", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    await game.p1.pick("scout");
    // While the trigger is on the chain Hextech Ray (an Action) is NOT playable.
    for (let i = 0; i < 2 && game.decision()?.seat !== P2; i++) {
      await game.acting().passPriority();
    }
    if (game.chain().length > 0 && game.decision()?.seat === P2) {
      expect(game.p2.can("cast", "ray")).toBe(false);
    }
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("scout")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker has Focus
    expect(game.p2.can("cast", "ray")).toBe(true);
  });
});
