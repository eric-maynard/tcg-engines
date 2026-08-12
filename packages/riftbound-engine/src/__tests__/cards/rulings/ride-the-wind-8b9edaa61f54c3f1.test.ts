/**
 * Ruling 8b9edaa61f54c3f1 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2][chaos]
 *   "Move a friendly unit and ready it."
 *   × Shen, Kinkou (ogn-241-298) 3 Might, [Shield 2] (+2 Might while a defender), [Tank].
 *
 * Q: P1 walks a unit into an UNCONTROLLED battlefield (a neutral showdown); P2 then rides a unit in during
 *    P1's pass window. Who is attacker and who is defender?
 * A: P1 — the player who applied Contested — is the attacker; P2 is the DEFENDER and gets the defender-side
 *    benefits ([Shield], "when I defend" triggers). This is the "surprise defence".
 * Rules: 190.3.a/450 (Contested is applied by the arriving unit's controller), 345 (Focus to that player),
 *        344.1 / 464.2.c.3.a (a second player's unit turns the neutral showdown into a Combat and assigns
 *        the roles), 466.5 (whoever remains establishes control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const SHEN = "ogn-241-298";

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).at(-1);

/** P1's turn. bf1 is uncontrolled and empty; P1 has a Striker in base, P2 has Shen and Ride the Wind. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .unit(P2, "base", SHEN, "shen")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** P1 contests the empty bf1, passes Focus, and P2 rides Shen in. */
async function surpriseDefence(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("rtw", { answers: ["battlefield-bf1"], targets: "shen" });
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 8b9edaa61f54c3f1 — riding in during the pass window is a surprise DEFENCE, not a counter-attack", () => {
  test("the first arrival alone is a NON-combat showdown: nobody controls bf1, P1 applied Contested and holds Focus", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.state("striker").combatRole).toBeNull(); // no combat, so no designations yet
  });

  test("Shen arriving makes it a Combat: P1 (who applied Contested) is the ATTACKER, P2 the DEFENDER — and Shen's [Shield 2] applies", async () => {
    const game = await surpriseDefence();
    expect(game.locationOf("shen")).toBe("bf1");
    // CR 344.1 upgrades the running non-combat showdown in place rather than queueing a second one; either
    // way the designations land where the ruling says.
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("striker").combatRole).toBe("attacker");
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.state("shen").might).toBe(5); // 3 printed + [Shield 2] as a defender
  });

  test("the surprise defence wins: the 3-Might Striker cannot break a 5-Might defender, dies, and P2 takes bf1", async () => {
    const game = await surpriseDefence();
    await game.settle();
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — had P1's Striker walked in unopposed, the neutral showdown would simply have handed P1 the battlefield", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });
});
