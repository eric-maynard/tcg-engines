/**
 * Ruling bbe0c889d6e01b5d — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · "[Ganking] If I have moved twice this turn, I don't
 *     take damage."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · 2+[chaos] · "Move a friendly unit and ready it."
 *
 * Q: When Kayn is recalled to base after failing to conquer, does he return exhausted or in the state he was in when combat resolved?
 * A: In whatever ready/exhausted state he was in — the recall itself never exhausts. Standard move (exhausts) → he comes home
 *    exhausted; moved by Ride the Wind (readies him) → he comes home READY, so he can attack again this turn.
 * Rules: 449 / 465.4 (attackers that neither die nor conquer are recalled — a location change only), 135.4 (the standard Move
 *        exhausts as its cost), 126 (ready/exhausted is a property of the permanent, untouched by recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn with 2+[chaos]. P2 holds bf1 with a STUNNED Wall (7): it deals no combat damage, and Kayn's 6 doesn't kill it — so
 * every attack here ends with both sides alive: Kayn "fails to conquer" and is recalled. Kayn (6) ready in P1's base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall", { stunned: true })
    .unit(P1, "base", KAYN, "kayn")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast Ride the Wind on Kayn; it resolves (both pass) and P1 names bf1 as the destination. */
async function rideToBf1(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "kayn" });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
      break;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

/** Let the showdown/combat at bf1 run to its end (everyone passes). */
async function finishCombat(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "open" || (d?.kind === "action" && d.context === "main")) {
      break;
    }
  }
}

describe("Ruling bbe0c889d6e01b5d — a recalled attacker keeps its ready/exhausted state; recall doesn't exhaust", () => {
  test("standard move: Kayn is exhausted BY THE MOVE, fails to conquer the stunned 7-Might Wall, and is recalled to base — still exhausted", async () => {
    const game = await board().build();
    await game.p1.move("kayn", "bf1");
    expect(game.state("kayn")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    await finishCombat(game);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // no conquer
    expect(game.state("kayn")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.can("move")).toBe(false); // an exhausted Kayn can't go again
  });

  test("Ride the Wind: Kayn is moved to bf1 AND READIED; the same failed conquer recalls him — and he arrives home READY", async () => {
    const game = await board().build();
    await rideToBf1(game);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("kayn")).toMatchObject({ combatRole: "attacker", isReady: true, location: "bf1" });
    await finishCombat(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("kayn")).toMatchObject({ isReady: true, location: "base" }); // recall did not exhaust him
    expect(game.violations()).toEqual([]);
  });

  test("nuance: being ready in base, Kayn can attack AGAIN this turn with a standard move (now exhausting him)", async () => {
    const game = await board().build();
    await rideToBf1(game);
    await finishCombat(game);
    expect(game.state("kayn")).toMatchObject({ isReady: true, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.move("kayn", "bf1");
    expect(game.state("kayn")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
  });
});
