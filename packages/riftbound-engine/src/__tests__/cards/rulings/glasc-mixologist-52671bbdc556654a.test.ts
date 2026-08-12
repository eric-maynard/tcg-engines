/**
 * Ruling 52671bbdc556654a — Glasc Mixologist (SFD-165 → sfd-165-221) · [5][order] · 5 [Might]
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *   ignoring its cost."
 *
 * Q: Can Glasc play the Deathknell unit to the battlefield he is ATTACKING, or only when he is the defender?
 * A: Only as the defender. Attacking does not give you control of the battlefield — you only get it by winning
 *    the showdown — so at the moment the Deathknell resolves (inside the combat) it is not "a battlefield you
 *    control" and is not offered. The defender already controls it, so it is.
 * Rules: 190.4 / 323.6 (control is only re-checked at a Cleanup in an Open State — during the combat the
 *        defender keeps it), 466.5 (the attacker establishes control only at the Resolution Step), 355.2 (units
 *        may be played to your base or a battlefield you control), 808.1.d ([Deathknell] resolves in the Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const SKULKER = "ogn-175-298"; // 3-cost, 3-Might vanilla unit — a legal Deathknell play

/** P1's turn. P2 holds bf1 with a 12-Might Titan; P1's Mixologist attacks into it and dies. P1 really controls bf2. */
function attackingBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 12, name: "Titan" }, "titan")
    .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .unit(P1, "base", GLASC, "glasc")
    .trash(P1, SKULKER, "skulker");
}

/** P2's turn. P1 HOLDS bf1 with the lone Mixologist; P2's 5-Might Titan attacks and they trade. */
function defendingBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC, "glasc")
    .trash(P1, SKULKER, "skulker")
    .unit(P2, "base", { might: 5, name: "Titan" }, "titan");
}

const keys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Accept the "you may", name the Skulker, and stop on the destination prompt. */
async function toDestinationPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no") {
      await game.seat(d.seat).yes();
      continue;
    }
    if (d?.kind === "pick" && keys(d).includes("skulker")) {
      await game.seat(d.seat).pick("skulker");
      continue;
    }
    if (d?.kind === "pick" && keys(d).some((k) => k === "base" || k.startsWith("battlefield-"))) {
      return d;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  return null;
}

describe("Ruling 52671bbdc556654a — Glasc's Deathknell unit may not be played to a battlefield he was only attacking", () => {
  test("attacker: the Mixologist dies attacking bf1 and the battlefield he attacked is NOT among the destinations — only P1's own base and the battlefield P1 really controls are", async () => {
    const game = await attackingBoard().build();
    await game.p1.move("glasc", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("glasc")).toBe("trash");
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(keys(d)).not.toContain("battlefield-bf1"); // attacking is not controlling
    expect(keys(d)).toContain("base");
    expect(keys(d)).toContain("battlefield-bf2");
  });

  test("…and bf1 stays with the defender: the replacement unit lands in base and P1 scores nothing", async () => {
    const game = await attackingBoard().build();
    await game.p1.move("glasc", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await toDestinationPrompt(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("defender: the same Mixologist dying at a battlefield P1 already controls DOES offer that battlefield", async () => {
    const game = await defendingBoard().build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("glasc")).toBe("trash");
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(keys(d)).toContain("battlefield-bf1");
  });

  test("…and playing it there keeps the defence alive: P1 still holds bf1 once the combat is over, so P2 never conquers", async () => {
    const game = await defendingBoard().build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await toDestinationPrompt(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual(["skulker"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
  });
});
