/**
 * Ruling b857490f503c76ef — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · [Reaction] unit · 3 Might · "[Shield 2] (+2 [Might] while I'm a
 *     defender.) [Tank]"
 *
 * Q: I move onto an empty battlefield to conquer it and my opponent answers with Ride the Wind, bringing a unit
 *    there. Am I now the defender (so a defender-only card like Shen pays off)?
 * A: No — this "surprise defence" leaves you the ATTACKER. The attacker is whoever's unit first applied Contested
 *    to the battlefield, which was you; the opponent's late arrival is the defender. Being the defender is not
 *    the same as controlling the battlefield.
 * Rules: 450 / 464.2.c (the player who applied Contested first is the Attacker for that combat), 464.2.c.3.a
 *        (a late arrival takes the other designation), 745 ([Shield N] only while a defender).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const SHEN_KINKOU = "ogn-241-298";

/**
 * P1's turn 3. bf2 is open, bf1 is P2's with their Rider (3) on it. P2 holds Ride the Wind with exactly
 * [2][chaos]; P1 holds Shen and [3][order] plus a Pioneer (4) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 4, name: "Pioneer" }, "pioneer")
    .unit(P2, "bf1", { might: 3, name: "Rider" }, "rider")
    .hand(P1, SHEN_KINKOU, "shen")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** P1 walks onto the empty bf2 (non-combat showdown, P1 applied Contested); P1 passes Focus; P2 rides in. */
async function surpriseDefence(game: Game): Promise<void> {
  await game.p1.move("pioneer", "bf2");
  expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rtw", { answers: ["bf2"], targets: "rider" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("rider")).toBe("bf2");
}

describe("Ruling b857490f503c76ef — a surprise defence does not flip the roles: the first player to make the battlefield contested stays the attacker", () => {
  test("P1's Pioneer applied Contested first, so after P2 rides in P1 is the ATTACKER and P2's Rider is the defender", async () => {
    const game = await board().build();
    await surpriseDefence(game);
    expect(game.state("pioneer").combatRole).toBe("attacker");
    expect(game.state("rider").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("…and being the defender is not controlling the battlefield: bf2 is still uncontrolled while the combat runs", async () => {
    const game = await board().build();
    await surpriseDefence(game);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });

  test("so P1's defender-only payoff never applies — P1 cannot even flash Shen into bf2: it is not a battlefield P1 controls", async () => {
    const game = await board().build();
    await surpriseDefence(game);
    // hand the window back to P1
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.seat === P2 && (d.context === "chain" || d.context === "showdown")) {
        await game.p2.pass();
        continue;
      }
      break;
    }
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    const played = await game.p1.try((p) => p.play("shen", { to: "bf2" }));
    expect(played.ok).toBe(false); // Shen's [Reaction] only opens "a battlefield you control", and P1 controls none here
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("the combat is then fought with P1 attacking: the Pioneer (4) beats the lone Rider (3) and P1 conquers bf2", async () => {
    const game = await board().build();
    await surpriseDefence(game);
    await game.settle();
    expect(game.zoneOf("rider")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
