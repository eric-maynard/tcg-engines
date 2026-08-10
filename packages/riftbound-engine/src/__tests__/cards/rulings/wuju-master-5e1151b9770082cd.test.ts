/**
 * Ruling 5e1151b9770082cd — filed under Wuju Master (UNL-191 → unl-191-219); the +2 it describes is the Proving
 *   Grounds Yi legend Wuju Bladesman - Starter (OGS-019 → ogs-019-024): "While a friendly unit defends alone, it gets
 *   +2 [Might]."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Champion Unit · Body · [5][body] · 6 Might
 *     "[Ambush] I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: I attack an UNCONTROLLED, empty battlefield. My opponent (Yi legend) plays Rengar there in response. Is Rengar
 *    now a "surprise defender" with Yi's +2?
 * A: Yes. Moving into the empty battlefield makes it Contested with me as Attacker (442.1.a.1). Rengar may be played
 *    there as a Reaction (Ambush + his own text); on arrival his controller is the Defender (442.1.a.2), and since he
 *    is the only friendly unit there he "defends alone" — the continuous +2 applies immediately (6 → 8).
 * Rules: 442.1.a (Attacker/Defender designations), 323.2.a / 323.14 (units arriving mid-showdown gain their side's
 *        designation; the showdown becomes a combat), passive vs triggered abilities.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_MASTER = "unl-191-219";
const WUJU_BLADESMAN = "ogs-019-024";
const RENGAR = "unl-120-219";

/**
 * P1's turn (P1's legend: Wuju Master, irrelevant at 0 XP). bf1 is uncontrolled and empty. P1's 5-Might Scout in
 * base. P2 (Yi — Wuju Bladesman legend) holds Rengar with exactly [5][body] and has no unit anywhere near bf1.
 */
function board() {
  return scenario()
    .legend(P1, WUJU_MASTER, "master")
    .legend(P2, WUJU_BLADESMAN, "yi")
    .resources(P2, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P2, RENGAR, "rengar");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Scout walks into empty bf1 → non-combat showdown, P1 (Attacker) has Focus and passes it to P2. */
async function scoutIntoEmptyBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 is the Attacker (442.1.a.1) and holds Focus
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** P2 plays Rengar to bf1 and everybody passes until he is on the board. */
async function rengarLands(game: Game): Promise<void> {
  expect(game.p2.can("play", "rengar")).toBe(true);
  const to = game.p2.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? [];
  expect(to.map(String)).toContain("battlefield-bf1"); // enemy units there, none of his own — his text allows it
  await game.p2.play("rengar", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
}

describe("Ruling 5e1151b9770082cd — Rengar dropped into my attack on an empty battlefield defends alone with Yi's +2", () => {
  test("attacking the uncontrolled battlefield: it is Contested by P1, P1's Scout is the Attacker, and P2 (no units there) may still play Rengar TO bf1 during the showdown", async () => {
    const game = await scoutIntoEmptyBf1();
    await rengarLands(game);
    expect(showdown(game)?.active).toBe(true); // still mid-showdown
  });

  test("on arrival Rengar is designated DEFENDER (his controller is not the attacker), the showdown is now a combat, and — defending alone — Yi's passive makes him 8 at once", async () => {
    const game = await scoutIntoEmptyBf1();
    await rengarLands(game);
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, isCombatShowdown: true });
    expect(game.p2.units("bf1")).toEqual(["rengar"]);
    expect(game.state("rengar")).toMatchObject({ baseMight: 6, might: 8 });
    expect(game.chain().some((c) => c.cardId === "yi")).toBe(false); // a passive — nothing was put on the chain for it
    expect(game.violations()).toEqual([]);
  });

  test("it matters: combat resolves 5 vs 8 — the Scout dies, Rengar survives (healed) and P2 ends up holding bf1", async () => {
    const game = await scoutIntoEmptyBf1();
    await rengarLands(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar")).toMatchObject({ combatRole: null, damage: 0, might: 6 }); // no longer defending → back to 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
