/**
 * Ruling 306ad75d8109cd70 — (general combat maths with a stunned attacker; no specific card)
 *   Vanilla stand-ins only: my Titan (7) defending; the opponent attacks with a STUNNED Brute (7) and a
 *   ready Scrapper (4).
 *
 * Q: My 7-Might unit is defending; the opponent attacks with a stunned 7 and a 4. Does my unit die?
 * A: No. The stunned attacker contributes nothing, so the attacking side's whole combat damage is 4 —
 *    short of the 7 needed to be lethal. My unit takes 4 damage and lives (and the damage is healed in the
 *    Combat Cleanup). My 7 goes back the other way and I choose how to spread it, the stunned unit included.
 * Rules: 423.1.b (a stunned unit deals no combat damage but still takes it), 465.2.c.3 (each side's player
 *        assigns its combat damage), 465.2.c.2 (lethal = damage ≥ Might), 466.1.a.1-2 (heal, then recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P2's turn. P1 holds bf1 with the Titan (7). P2's Brute (7, stunned) and Scrapper (4) wait in base. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Titan" }, "titan")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute", { stunned: true })
    .unit(P2, "base", { might: 4, name: "Scrapper" }, "scrapper");
}

/** Both attackers move in; stops on P1's combat-damage assignment. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  expect(game.state("brute").isStunned).toBe(true);
  await game.p2.move(["brute", "scrapper"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.passFocus();
  await game.p1.passFocus(); // both passed ⇒ the combat runs up to the damage assignment
  return game;
}

describe("Ruling 306ad75d8109cd70 — a stunned attacker adds nothing: the 7-Might defender takes only 4 and lives", () => {
  test("the defender is asked to assign its own 7 combat damage — the stunned Brute is a legal recipient alongside the Scrapper (423.1.b: it deals none, it still takes some)", async () => {
    const game = await attacked();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 7 });
    const buckets = d?.kind === "distribute" ? d.buckets.map((b) => b.key).sort() : [];
    expect(buckets).toEqual(["brute", "scrapper"]);
  });

  test("assigning all 7 to the stunned Brute kills it (7 ≥ 7); my Titan survives on 4 damage from the lone unstunned 4 and is healed in the Combat Cleanup", async () => {
    const game = await attacked();
    await game.p1.distribute({ brute: 7 });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("titan")).toBe("battlefield-bf1"); // 4 < 7 — not lethal
    expect(game.state("titan").damage).toBe(0); // healed at 466.1.a.1
    expect(game.locationOf("scrapper")).toBe("base"); // defenders remained ⇒ attackers recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("spreading the 7 as 4/3 instead kills the Scrapper only — the Titan still takes just the 4 the unstunned attacker deals and lives", async () => {
    const game = await attacked();
    await game.p1.distribute({ brute: 3, scrapper: 4 });
    await game.settle();
    expect(game.zoneOf("scrapper")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("base"); // 3 < 7, survived and was recalled
    expect(game.zoneOf("titan")).toBe("battlefield-bf1");
    expect(game.state("titan").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
