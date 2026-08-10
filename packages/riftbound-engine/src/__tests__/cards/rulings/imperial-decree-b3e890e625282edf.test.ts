/**
 * Ruling b3e890e625282edf — Imperial Decree (OGN-221 → ogn-221-298) · Action · 5+[order][order] · "When any unit takes damage
 *     this turn, kill it."
 *   × Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might · "[Deflect] The first time I win a combat each turn, you score 1 point.
 *     When I die in combat, choose an opponent. They score 1 point."
 *   × Glorious Executioner (sfd-185-221, Draven legend) "When you win a combat, draw 1."
 *
 * Q: I cast Imperial Decree, then attack into my opponent's Draven, Audacious. Does the Decree's delayed trigger kill Draven
 *    during or after combat? Does the Draven legend draw?
 * A: During combat — the "took damage → kill it" trigger is handled as an outstanding item before the Resolution step names a
 *    winner. Draven therefore DIES IN COMBAT: the attacker's player scores 1 off Draven's own death trigger, Draven never "wins"
 *    the combat, and the Glorious Executioner legend does not draw.
 * Rules: 383 / 390.2 (delayed trigger), 465.2 → 465.3 (damage step, then outstanding triggers, then resolution/winner),
 *        467 (a unit that dies before resolution died "in combat").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const DRAVEN_AUDACIOUS = "sfd-148-221";
const GLORIOUS_EXECUTIONER = "sfd-185-221";

/**
 * P1's turn with 5 + [order][order]. P2 (legend Glorious Executioner) holds bf1 with Draven, Audacious (6).
 * P1's Raider (3) is ready in base — it deals 3 (non-lethal) to Draven and takes 6 back. Known P2 deck top.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .legend(P2, GLORIOUS_EXECUTIONER, "exec")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DRAVEN_AUDACIOUS, "draven")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2"]);
}

async function decreeThenAttack(withDecree: boolean): Promise<Game> {
  const game = await board().build();
  if (withDecree) {
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
  }
  const p2Hand = game.p2.hand().length;
  await game.p1.move("raider", "bf1");
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P2) {
      // Draven's "choose an opponent" — only P1 exists.
      await game.p2.pick(d.options[0]!.key);
      continue;
    }
    if (r.reason !== "open" || (d?.kind === "action" && d.context === "main")) {
      break;
    }
  }
  (game as unknown as { p2HandBefore: number }).p2HandBefore = p2Hand;
  return game;
}

describe("Ruling b3e890e625282edf — Imperial Decree kills Draven, Audacious DURING combat: attacker scores, Draven legend does not draw", () => {
  test("control (no Decree): Raider 3 into Draven 6 — Raider dies, Draven survives with 3 damage and WINS: P2 scores Draven's point and Glorious Executioner draws P2 a card", async () => {
    const game = await decreeThenAttack(false);
    const before = (game as unknown as { p2HandBefore: number }).p2HandBefore;
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // "first time I win a combat each turn, you score 1"
    expect(game.p2.hand()).toHaveLength(before + 1); // legend: "When you win a combat, draw 1"
    expect(game.p1.points()).toBe(0);
  });

  test("with Imperial Decree active: Draven takes 3 in the damage step and the Decree trigger kills him BEFORE the winner is determined — he is in the trash, died 'in combat', and P1 scores 1 off his death trigger", async () => {
    const game = await decreeThenAttack(true);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // it took 6 — lethal anyway (and Decree'd)
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no conquer — the point below is Draven's death trigger
    expect(game.p1.points()).toBe(1); // "When I die in combat, choose an opponent. They score 1 point."
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…and since Draven did not survive to the resolution step P2 did NOT win the combat: no Draven win-point for P2 and Glorious Executioner draws nothing", async () => {
    const game = await decreeThenAttack(true);
    const before = (game as unknown as { p2HandBefore: number }).p2HandBefore;
    expect(game.p2.points()).toBe(0);
    expect(game.p2.hand()).toHaveLength(before);
    expect(game.p2.deck()[0]).toBe("p2d1");
  });
});
