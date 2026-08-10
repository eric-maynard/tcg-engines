/**
 * Ruling 0457f25075b9cb23 — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · [2] · 2 Might
 *     "[Hidden] … When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that
 *      unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: When Teemo's defend ability triggers, can it target units at ANY battlefield, or only his own?
 * A: Only units at the battlefield where Teemo is. (Hidden cards choose from options at the battlefield they were hidden
 *    at; and Teemo's text says "here" in any case.)
 * Rules: 811.1.d.2 (a hidden permanent's play/trigger targets are chosen from that battlefield), 359.2.c ("here").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] spell — so the reveal deals something
const SKULKER = "ogn-175-298";

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * P2's turn. P1 holds bf1 with a Guard (4) and bf2 (Holder). P2: two attackers in base (Raider A 5, Raider B 5) and a
 * Bystander (3) already sitting at P2's bf3. P1's top 5: two [Hidden] cards among Skulkers.
 */
function base() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "bf3", { might: 3, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 5, name: "Raider A" }, "raiderA")
    .unit(P2, "base", { might: 5, name: "Raider B" }, "raiderB")
    .deck(P1, [BACK_OFF, SKULKER, BACK_OFF, SKULKER, SKULKER, SKULKER], ["h1", "n1", "h2", "n2", "n3", "n4"]);
}

/** Teemo face-up at bf1 next to the Guard. */
const onBoard = () => base().unit(P1, "bf1", TEEMO_STRATEGIST, "teemo");
/** Teemo facedown (hidden) at bf1. */
const hidden = () => base().facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo");

/** Both Raiders attack bf1 together; returns at Teemo's target prompt (face-up Teemo defends at once). */
async function raidersAttack(game: Game): Promise<void> {
  await game.p2.move(["raiderA", "raiderB"], "bf1");
}

describe("Ruling 0457f25075b9cb23 — Teemo's defend trigger chooses only among enemy units HERE", () => {
  test("face-up Teemo defends bf1 against two Raiders: P1 is asked to choose the target and the ONLY candidates are the two Raiders here — the Bystander at bf3 is not offered and cannot be named", async () => {
    const game = await onBoard().build();
    await raidersAttack(game);
    expect(game.state("teemo").combatRole).toBe("defender");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(d).sort()).toEqual(["raiderA", "raiderB"]);
    expect(pickCards(d)).not.toContain("bystander");
    expect((await game.p1.try((p) => p.pick("bystander"))).ok).toBe(false);
    await game.p1.pick("raiderB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raiderB"], triggered: true })]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("raiderB").damage).toBe(2); // two [Hidden] cards among the top five
    expect(game.state("raiderA").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0);
  });

  test("played from HIDDEN mid-showdown: Teemo flips at bf1, becomes a defender there, and his trigger again offers only the Raiders at bf1 (never the bf3 Bystander)", async () => {
    const game = await hidden().build();
    await raidersAttack(game);
    expect(game.state("guard").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // He gains the Defender designation (arrival mid-combat) and the defend trigger asks for its target.
    let asked: Decision | null = null;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        asked = d;
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(asked).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickCards(asked).sort()).toEqual(["raiderA", "raiderB"]);
    expect(pickCards(asked)).not.toContain("bystander");
    await game.p1.pick("raiderA");
    expect(game.chain().find((c) => c.cardId === "teemo")).toMatchObject({ targets: ["raiderA"], triggered: true });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("raiderA").damage).toBe(2);
    expect(game.state("bystander").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
