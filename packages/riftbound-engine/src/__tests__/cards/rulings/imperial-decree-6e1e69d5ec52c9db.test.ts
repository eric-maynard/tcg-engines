/**
 * Ruling 6e1e69d5ec52c9db — Imperial Decree (OGN-221 → ogn-221-298) · [Action] [5]+[order][order] "When any unit takes damage this
 *     turn, kill it."
 *   × Solari Shrine (OGN-072 → ogn-072-298) · Gear "When you kill a stunned enemy unit, you may exhaust this to draw 1."
 *
 * Q: On my opponent's turn I Decree during the showdown; my STUNNED 5-Might unit takes 4 combat damage from their 4-Might unit
 *    and dies. Does the opponent get credit for the kill and trigger their Solari Shrine?
 * A: No. The 4 damage is not lethal; it is Imperial Decree's delayed trigger that kills the unit, so the kill belongs to the
 *    Decree's controller (me), not to the opponent whose unit dealt the damage — their Shrine does not trigger.
 * Rules: 383 / 389 (delayed trigger; its controller performs the kill), 429-ish kill attribution ("you kill" = your effect),
 *        423.1.b (stunned units deal no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const SOLARI_SHRINE = "ogn-072-298";

/**
 * P2's turn. P1 holds bf1 with a STUNNED Sleeper (5); P1 has Imperial Decree + exactly [5]+2 order. P2: Solari Shrine in base,
 * a Raider of `raiderMight` in base, two known cards on top of the deck.
 */
function board(raiderMight: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Sleeper" }, "sleeper", { stunned: true })
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider")
    .gear(P2, SOLARI_SHRINE, "shrine")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Settle to the open main phase, recording (and accepting) any Solari Shrine offer made to P2. */
async function finish(game: Game): Promise<boolean> {
  let shrineOffered = false;
  for (let i = 0; i < 14; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P2 && d.source?.cardId === "shrine") {
      shrineOffered = true;
      await game.p2.yes();
    } else {
      break;
    }
  }
  return shrineOffered;
}

describe("Ruling 6e1e69d5ec52c9db — a Decree kill is credited to the Decree's controller, so the attacker's Solari Shrine stays quiet", () => {
  test("control: when P2's own 6-Might Raider kills the stunned Sleeper in combat, P2 'killed a stunned enemy unit' — Shrine offers, exhausts, P2 draws 1", async () => {
    const game = await board(6).build();
    await game.p2.move("raider", "bf1");
    const offered = await finish(game);
    expect(game.zoneOf("sleeper")).toBe("trash");
    expect(offered).toBe(true);
    expect(game.state("shrine").isExhausted).toBe(true);
    expect(game.p2.hand()).toEqual(["d1"]);
  });

  test("P1 casts Imperial Decree in the showdown (an Action, on P2's turn, while holding Focus); it resolves and sets up its delayed trigger", async () => {
    const game = await board(4).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "decree")).toBe(true);
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("sleeper")).toBe("battlefield-bf1"); // nothing has taken damage yet
  });

  test("combat: the 4-Might Raider deals a NON-lethal 4 to the stunned 5-Might Sleeper; the Decree trigger kills it — P2's Shrine is never offered, stays ready, P2 draws nothing", async () => {
    const game = await board(4).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("decree");
    const offered = await finish(game);
    expect(game.zoneOf("sleeper")).toBe("trash"); // died — to the Decree, not to lethal damage
    expect(offered).toBe(false);
    expect(game.state("shrine").isExhausted).toBe(false);
    expect(game.p2.hand()).toEqual([]);
    // The stunned Sleeper dealt no combat damage, so the Raider is untouched — but it was still
    // present at the Combat Cleanup with a live Defender, so rule 466.1.a.2 step 3d recalled it
    // before the Decree trigger resolved: No Result (466.3.d), and bf1 empties to Uncontrolled.
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
