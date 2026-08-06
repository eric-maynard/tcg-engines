/**
 * Ruling 2a1de5fca1bd9d62 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · 2 · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * Q: I move Faefolk to an OPEN battlefield and pull an enemy unit there — who is the attacker?
 * A: The Faefolk player. Moving to the uncontrolled battlefield applies the Contested status (450,
 *    190.3.a); Faefolk's trigger then drags the enemy unit in, and the cleanup after that move stages
 *    a combat (319.8, 323.9). The attacker is the player whose unit applied Contested (464.2.c.1) — P1;
 *    the pulled-in unit's controller defends (464.2.c.2).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRRESISTIBLE_FAEFOLK = "unl-112-219";

/** P1's turn. bf1 is open and empty; Faefolk in P1's base; P2's Victim sits at P2's bf2, a Homebody in P2's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", IRRESISTIBLE_FAEFOLK, "faefolk")
    .unit(P2, "bf2", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody");
}

/** Is Faefolk's trigger observable (a chain item, or a P1 prompt about it)? */
function faefolkTriggerPending(game: Game): boolean {
  const d = game.decision();
  return game.chain().some((c) => c.cardId === "faefolk" && c.triggered) || (d?.seat === P1 && d.kind !== "action");
}

/** Let the trigger resolve and answer P1's prompts: opt in, choose Victim. Asserts the choice is surfaced to P1. */
async function pullVictim(game: Game): Promise<void> {
  let chose = false;
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    expect(d.seat).toBe(P1); // "you may move an enemy unit" — Faefolk's controller chooses
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.card ?? o.key);
      expect(keys).toContain("victim");
      expect(keys).toContain("homebody"); // any enemy unit
      expect(keys).not.toContain("faefolk");
      const opt = d.options.find((o) => (o.card ?? o.key) === "victim");
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
      chose = true;
    } else {
      break;
    }
  }
  expect(chose).toBe(true);
}

describe("Ruling 2a1de5fca1bd9d62 — Faefolk into an open battlefield, enemy pulled in: the Faefolk player attacks", () => {
  test("moving Faefolk to the open bf1 applies Contested BY P1 and opens a showdown there with P1 holding Focus (450, 190.3.a)", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    expect(game.locationOf("faefolk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // Expected: "When I move to a battlefield" is fulfilled → Faefolk's (optional) triggered ability is
  // pending for P1. Actual: the engine's "move" event never matches the parsed `move-to-battlefield`
  // trigger, so nothing goes on the chain and no prompt appears.
  test.failing("BUG: ruling 2a1de5fca1bd9d62 — Faefolk's move trigger becomes pending when it moves to bf1 (engine never fires it)", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    expect(faefolkTriggerPending(game)).toBe(true);
  });

  // Expected: P1 opts in and picks Victim (any enemy unit is offered) → Victim moves bf2 → bf1, "that
  // battlefield". Actual: no trigger; additionally the parsed effect would move the target to BASE.
  test.failing("BUG: ruling 2a1de5fca1bd9d62 — P1 chooses the enemy Victim and it is moved to bf1 (that battlefield), not to base", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    await pullVictim(game);
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.locationOf("homebody")).toBe("base");
    expect(game.locationOf("faefolk")).toBe("bf1");
  });

  // Expected (464.2.c.1/2): opposing units now share the contested bf1 → combat is staged; P1 — whose
  // Faefolk applied Contested — is the ATTACKER (Faefolk = attacker, has Focus), P2's Victim DEFENDS.
  // Actual: no trigger fires, Victim never arrives, no combat.
  test.failing("BUG: ruling 2a1de5fca1bd9d62 — the staged combat has P1 attacking (Faefolk attacker, Focus with P1) and the pulled Victim defending", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    await pullVictim(game);
    // Drain any chain passes; stop at the combat showdown.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("faefolk").combatRole).toBe("attacker");
    expect(game.state("victim").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
    // Let the combat play out: Victim (3) beats Faefolk (1) — the DEFENDER holds, so bf1 does not become P1's.
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });
});
