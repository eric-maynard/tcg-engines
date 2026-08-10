/**
 * Ruling 4652b50c690480c3 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · [4][chaos] · 4
 *     "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *      for [rainbow]."
 *   × Stacked Deck (OGN-183 → ogn-183-298) · Action · [1] · "Look at the top 3 cards of your Main Deck. Put 1 into your
 *     hand and recycle the rest."
 *
 * Q: Can you play Nocturne (found via Stacked Deck during a showdown) to the contested battlefield?
 * A: Only if you CONTROL it. The attacker never controls the contested battlefield, so mid-showdown they cannot play
 *    Nocturne there. The defender still controls it (contested AND controlled), so they can.
 * Rules: 340.2 / 620 (units are played to your base or a battlefield you control), 181.3 (contested ≠ uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

/**
 * P1 is always the Stacked Deck / Nocturne player with exactly [1] + [rainbow]; deck top: Nocturne, s1, s2, s3.
 * attacker case: P1's turn, P1's Raider (3) attacks P2's bf1 (Guard 2); P1 also controls bf2.
 * defender case: P2's turn, P2's Raider attacks P1's bf1 (Guard 2); P2 controls bf2.
 */
function board(role: "attacker" | "defender") {
  const b = scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: role === "defender" ? P1 : P2 })
    .battlefield("bf2", { controller: role === "defender" ? P2 : P1 })
    .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
    .hand(P1, STACKED_DECK, "sd");
  // rule 190.4.a — bf2 (the "own battlefield" destination) stays its controller's only with a unit of theirs on it.
  return role === "defender"
    ? b.active(P2).unit(P2, "base", { might: 3, name: "Raider" }, "raider").unit(P1, "bf1", { might: 2, name: "Guard" }, "guard").unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    : b.unit(P1, "base", { might: 3, name: "Raider" }, "raider").unit(P2, "bf1", { might: 2, name: "Guard" }, "guard").unit(P1, "bf2", { might: 1, name: "Holder" }, "holder");
}

/**
 * With the showdown at bf1 open and P1 holding Focus: cast Stacked Deck, resolve it, accept Nocturne's banish and
 * play offers, take s1 for Stacked Deck — and stop at Nocturne's destination prompt (returned).
 */
async function stackedDeckIntoNocturne(game: Game): Promise<PickDecision> {
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("sd");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
      await game.p1.yes(); // "you may banish me" → then "you may play me for [rainbow]"
      continue;
    }
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
      // Stacked Deck's own pick — Nocturne is already banished, only the Skulkers remain.
      expect(d.options.map((o) => o.card)).toEqual(["s1", "s2"]);
      await game.p1.pick("s1");
      continue;
    }
    break;
  }
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "noc" } });
  return dest as PickDecision;
}

const where = (d: PickDecision) => d.options.map((o) => o.zone ?? o.key).sort();

describe("Ruling 4652b50c690480c3 — Nocturne off Stacked Deck mid-showdown goes only where you CONTROL", () => {
  test("ATTACKER: bf1 is contested by P1 but controlled by P2 — Nocturne's destinations are P1's base and P1's own bf2, never the contested bf1", async () => {
    const game = await board("attacker").build();
    await game.p1.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const dest = await stackedDeckIntoNocturne(game);
    expect(where(dest)).toEqual(["base", "battlefield-bf2"]);
    expect(where(dest)).not.toContain("battlefield-bf1");
    // An attempt to name bf1 anyway is refused.
    const r = await game.p1.try((p) => p.answer({ keys: ["battlefield-bf1"], kind: "pick" }));
    expect(r.ok).toBe(false);
    await game.p1.pick("base");
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // played "for [rainbow]"
    expect(game.p1.hand()).toEqual(["s1"]);
    expect(game.violations()).toEqual([]);
  });

  test("DEFENDER: bf1 is contested by P2 yet still CONTROLLED by P1 — Nocturne may be played straight to bf1 and joins as a defender", async () => {
    const game = await board("defender").build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.p2.passFocus(); // Focus to the defender
    const dest = await stackedDeckIntoNocturne(game);
    expect(where(dest)).toContain("battlefield-bf1");
    expect(where(dest)).toContain("base");
    expect(where(dest)).not.toContain("battlefield-bf2"); // P2's battlefield is not P1's to play to
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("noc").combatRole).toBe("defender");
    // The showdown carries on; with Nocturne (4) + Guard (2) defending, the Raider (3) dies and P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
