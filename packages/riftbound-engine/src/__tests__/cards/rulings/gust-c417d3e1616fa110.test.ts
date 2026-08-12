/**
 * Ruling c417d3e1616fa110 — Gust (OGN-169 → ogn-169-298) · [Reaction] · Chaos · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Mister Root (UNL-127 → unl-127-219) · 1 Might · "[Accelerate] … When I move to a battlefield, gain 2 XP."
 *
 * Q: When do move triggers happen relative to the combat flowchart, and what if the moving unit is removed (by
 *    Gust) in response to the move trigger?
 * A: The move trigger goes on the chain BEFORE the showdown starts. Answering it by removing the mover means the
 *    staged combat stops being staged before the Steps of Combat begin, so no showdown happens at all. (Gusting
 *    later, once the showdown's own attack/defend triggers are on the chain, is too late — that showdown runs.)
 * Rules: 442/443 (moving stages a showdown; move triggers fire first), 462.1 (a staged combat that stops being
 *        staged before the Steps of Combat is never executed), 344.2 ([Reaction] speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MISTER_ROOT = "unl-127-219";

/** P1's turn 3. P2 holds bf1 with a 5-Might Guard; P1's Mister Root (1) waits in base. P2 has Gust and [1]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", MISTER_ROOT, "root")
    .hand(P2, GUST, "gust");
}

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

describe("Ruling c417d3e1616fa110 — the move trigger is on the chain before any showdown; removing the mover there means no showdown at all", () => {
  test("the move puts Mister Root's 'when I move to a battlefield' trigger on the chain and NO showdown has started yet", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    expect(game.chain().map((c) => `${c.cardId}:${String(c.triggered)}`)).toEqual(["root:true"]);
    expect(showdowns(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 answers that trigger with Gust (it is P2's window once P1 passes priority) and bounces the 1-Might mover", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    expect(game.p2.can("cast", "gust")).toBe(false); // P1 still holds priority
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "root" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    expect(game.zoneOf("root")).toBe("hand");
  });

  test("ruling: with the mover gone the staged combat is never executed — no showdown ever opens and bf1 stays P2's, uncontested", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "root" });
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // it never fought
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: letting the move trigger resolve DOES open the showdown — the same board with nobody gusting goes to combat", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(showdowns(game).at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.state("root").combatRole).toBe("attacker");
  });

  test("…and gusting only THEN is too late: the showdown is already running, so the combat still resolves at bf1", async () => {
    const game = await board().build();
    await game.p1.move("root", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(showdowns(game).at(-1)).toMatchObject({ active: true });
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "root" });
    await game.settle();
    expect(game.zoneOf("root")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // P2 kept it through a real showdown
  });
});
