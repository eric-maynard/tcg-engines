/**
 * Ruling 894fa951183d5908 — Ruined Rex (UNL-067 → unl-067-219) × Draven, Audacious (SFD-148 → sfd-148-221)
 *
 *   Ruined Rex — Unit · Mind · 6 · 6 Might — "[Deathknell] Deal 4 to an enemy unit."
 *   Draven, Audacious — Unit · Chaos · 6 · 6 Might · [Deflect]
 *     "The first time I win a combat each turn, you score 1 point. When I die in combat, choose an opponent.
 *      They score 1 point."
 *
 * Q: If Rex's Deathknell kills Draven (after Rex itself has gone to the trash), is that a death "in combat"
 *    that scores the Rex player a point?
 * A: Yes — provided the Deathknell resolves while Draven is still at the battlefield holding his Attacker/
 *    Defender designation. The trigger is put on the chain before Rex leaves (808.1.d.2); Draven killed by
 *    it while designated dies "in combat", so his controller chooses an opponent who scores 1.
 *    Nuance: a Draven who is no longer in combat when the damage lands scores nobody.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const DRAVEN = "sfd-148-221";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: "Deal 3 to a unit at a battlefield."

/**
 * P2's turn. P1's Rex (6) holds bf1 carrying 3 damage; P2's Draven (6) is in base carrying 2 damage (say both
 * from an earlier Challenge this turn). P2 holds Hextech Ray ([Action], deal 3) with 1 + [fury]. P1 has 1 rainbow
 * to cover Draven's [Deflect] when Rex's Deathknell chooses him. Nobody has points.
 */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 0)
    .points(P2, 0)
    .resources(P1, { power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUINED_REX, "rex", { damage: 3 })
    .unit(P2, "base", DRAVEN, "draven", { damage: 2 })
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Answer P1's Deathknell prompts (pay [Deflect] opt-in / pick Draven) and P2's forced "choose an opponent" until the chain is empty. */
async function driveDeathknell(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const s = await game.settle();
    if (s.reason !== "unanswered") {
      return;
    }
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      const want = d.options.find((o) => (o.card ?? o.key) === "draven") ?? d.options.find((o) => o.seatRef === P1) ?? d.options[0];
      await game.seat(d.seat).pick(want?.key as string);
    } else {
      return;
    }
  }
}

describe("Ruling 894fa951183d5908 — Rex's Deathknell killing an attacking Draven is a death in combat", () => {
  test("Draven attacks Rex; during the combat showdown Hextech Ray finishes Rex (3 + 3) → Rex to trash with its Deathknell on the chain while Draven is still the designated attacker at bf1", async () => {
    const game = await board().build();
    await game.p2.move("draven", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.state("draven").combatRole).toBe("attacker");
    expect(game.state("rex").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("ray", { targets: "rex" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hextech Ray resolves: Rex dies
    // Pay Draven's Deflect for the Deathknell choice if asked now.
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("draven");
      } else {
        break;
      }
    }
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
    // Draven is still in combat: at the battlefield, designated, carrying his 2 damage.
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.state("draven").combatRole).toBe("attacker");
    expect(game.state("draven").damage).toBe(2);
  });

  test("the Deathknell (P1 pays Draven's [Deflect]) deals 4 to Draven (2 + 4 ≥ 6): he dies during the combat, before any combat damage; the combat then ends with nothing conquered", async () => {
    const game = await board().build();
    await game.p2.move("draven", "bf1");
    await game.p2.cast("ray", { targets: "rex" });
    await driveDeathknell(game);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(0); // Deflect surcharge paid for the Deathknell choice
    expect(game.p2.points()).toBe(0);
    // Combat then ends with nobody left at bf1; P2 conquered nothing.
    await game.settle();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // Draven still holds his Attacker designation when the Deathknell kills him, so "When I die in combat"
  // triggers and P1 (the chosen opponent) scores 1 — a mid-combat death need not come from combat damage.
  test("ruling 894fa951183d5908 — a designated attacker killed by a Deathknell mid-combat fires 'die in combat' (P1 scores 1)", async () => {
    const game = await board().build();
    await game.p2.move("draven", "bf1");
    await game.p2.cast("ray", { targets: "rex" });
    await driveDeathknell(game);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("nuance / contrast: the same Deathknell killing a Draven who is NOT in combat (sitting in base, no showdown) scores nobody", async () => {
    const game = await board().build();
    // No attack: P2 simply Rays Rex from the main phase; Draven (2 damage) is in base.
    expect(game.state("draven").combatRole).toBeNull();
    await game.p2.cast("ray", { targets: "rex" });
    await driveDeathknell(game);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("trash"); // 2 + 4 ≥ 6, killed by the Deathknell …
    expect(game.p1.points()).toBe(0); // … but not in combat
    expect(game.p2.points()).toBe(0);
  });
});
