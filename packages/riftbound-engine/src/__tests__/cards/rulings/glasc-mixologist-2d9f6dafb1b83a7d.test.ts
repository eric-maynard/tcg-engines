/**
 * Ruling 2d9f6dafb1b83a7d — Glasc Mixologist (SFD-165 → sfd-165-221) · 5 + [order] · 5 Might
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from
 *    your trash, ignoring its cost."
 *
 * Q: Can the unit summoned by Glasc Mixologist's Deathknell be played to the battlefield where he died?
 * A: Yes, if you control that battlefield — as the DEFENDER you already do, the Deathknell resolves
 *    inside the combat's closed state (before control is re-checked), and the unit you play there
 *    keeps you in control. As the ATTACKER you do not control the battlefield, so it is not offered.
 * Rules: 322.3 / 734.1.d.2 (Deathknell resolves during cleanup, before control settles),
 *        190.4 / 323.6 (control is only lost at a Cleanup in an Open State), 355.2 ("a battlefield
 *        you control" is the play destination).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const SKULKER = "ogn-175-298"; // 3-cost, 3-Might vanilla unit — a legal Deathknell play

/**
 * P2's turn. P1 HOLDS bf1 with a lone Mixologist (5 Might); P2's 5-Might Titan attacks — mutual
 * lethal, so both die and nothing is left standing when the Deathknell resolves.
 */
function defendingBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC, "glasc")
    .trash(P1, SKULKER, "skulker")
    .unit(P2, "base", { might: 5, name: "Titan" }, "titan");
}

/** P1's turn. P2 holds bf1 with a 12-Might Titan; P1's Mixologist attacks into it and dies. */
function attackingBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 12, name: "Titan" }, "titan")
    .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .unit(P1, "base", GLASC, "glasc")
    .trash(P1, SKULKER, "skulker");
}

const keys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Drive to the Deathknell's destination prompt, accepting the "you may" and picking the Skulker. */
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

describe("Ruling 2d9f6dafb1b83a7d — the defender may play the Deathknell unit at the battlefield where the Mixologist died", () => {
  test("premise (defender): the Titan and the lone Mixologist trade, and his Deathknell asks P1 the 'you may' at once", async () => {
    const game = await defendingBoard().build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("ruling: bf1 — the very battlefield he died at — IS among the destinations offered to the defender", async () => {
    const game = await defendingBoard().build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(keys(d)).toContain("battlefield-bf1");
  });

  test("…and choosing it keeps P1 in control: the Skulker stands at bf1 when control is checked", async () => {
    const game = await defendingBoard().build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await toDestinationPrompt(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["skulker"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
    expect(game.violations()).toEqual([]);
  });

  test("contrast (attacker): the Mixologist dies attacking a battlefield P1 does not control — bf1 is NOT offered, only P1's own places", async () => {
    const game = await attackingBoard().build();
    await game.p1.move("glasc", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("glasc")).toBe("trash");
    const d = await toDestinationPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(keys(d)).not.toContain("battlefield-bf1");
    expect(keys(d)).toContain("base");
    expect(keys(d)).toContain("battlefield-bf2"); // the battlefield P1 really does control
  });

  test("…so the attacker's Skulker lands elsewhere and bf1 stays with P2", async () => {
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
    expect(game.violations()).toEqual([]);
  });
});
