/**
 * Ruling 8c70d72e9e432afc — Cull the Weak (OGN-209 → ogn-209-298) · Action · Order · 2+[order] · "Each player kills one
 *   of their units."  (The scrape's second card, Cull sfd-134-221, is a name collision and irrelevant.)
 *   Support: Discipline (ogn-058-298, Reaction) as the response; Lecturing Yordle (ogn-087-298, "When you play me, draw 1.")
 *   for the permanent-with-play-trigger nuance.
 *
 * Q: Can you react to a spell like Cull the Weak — does playing cards create a chain?
 * A: Yes: a played spell sits on the chain and the opponent gets priority to play a Reaction before it resolves.
 *    Nuances: a permanent (unit/gear) itself resolves immediately with no reaction window; its "When you play me" trigger IS
 *    a chain item that can be reacted to; [Add]-type actions (tapping a rune) give the opponent no window.
 * Rules: 336–340 (chain, priority, LIFO), 359.2 (permanents don't wait on the chain), 383.4.a (play triggers go on the
 *        chain), 419 ([Add] resource abilities resolve immediately).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const DISCIPLINE = "ogn-058-298";
const LECTURING_YORDLE = "ogn-087-298";

/** P1's turn: Pawn (1) in P1's base, Cull the Weak + Lecturing Yordle in hand, 5 energy + [order], one ready fury rune. P2: Guard (3) at bf1, Discipline + 2 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .rune(P1, "fury", { alias: "rune1" })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, LECTURING_YORDLE, "yordle")
    .hand(P2, DISCIPLINE, "disc");
}

describe("Ruling 8c70d72e9e432afc — playing Cull the Weak opens a chain the opponent can react to", () => {
  test("Cull the Weak goes on the chain (nothing dies yet); P1 has priority first, then P2 — who CAN cast the Reaction Discipline on top of it; LIFO: Discipline resolves first, then Cull kills a unit per player", async () => {
    const game = await board().build();
    // The engine may collect the caster's own "one of their units" up front or on resolution; either way the spell then
    // waits on the chain and nothing dies yet.
    const targetField = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    const upFront = (targetField?.options ?? []).flat().includes("pawn");
    await (upFront ? game.p1.cast("cull", { targets: "pawn" }) : game.p1.cast("cull"));
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1, triggered: false })]);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "disc"]);
    // Discipline resolves first (Guard 3 → 5, P2 draws), Cull still pending.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull"]);
    // Then Cull the Weak: each player kills one of their units.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — a PERMANENT is not reactable but its play trigger is: Lecturing Yordle is in P1's base the moment it is played (before anyone passes), while its 'When you play me, draw 1' waits on the chain and P2 gets priority (and may Discipline) before P1 draws", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("yordle");
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("yordle")).toBe("base"); // the unit itself resolved immediately — no window to stop it
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yordle", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // not drawn yet
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true); // a Reaction is legal against the trigger
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBefore); // drew 1 on resolution
  });

  test("nuance — an [Add] resource action gives no window: tapping a rune adds 1 energy at once, the chain stays empty and it is still P1's open main phase (P2 is never offered priority)", async () => {
    const game = await board().build();
    await game.p1.tapRune("rune1");
    expect(game.p1.energy()).toBe(6);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "disc")).toBe(false);
  });
});
