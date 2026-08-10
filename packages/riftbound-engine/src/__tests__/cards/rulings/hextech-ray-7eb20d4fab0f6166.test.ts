/**
 * Ruling 7eb20d4fab0f6166 — Hextech Ray (OGN-009 → ogn-009-298) · Action · 1 + [fury] · "Deal 3 to a unit at a battlefield."
 *   × Primal Strength (OGN-154 → ogn-154-298) · Action · 4 + [body] · "Give a unit +7 [Might] this turn."
 *
 * Q: The opponent moves a 1-Might unit to a battlefield and passes; I Hextech Ray it. Is there any window for them to Primal
 *    Strength it out of range?
 * A: No. Having passed Focus without acting, they cannot answer my Ray with an Action (only Reactions go on a chain); the unit
 *    dies when the Ray resolves. Focus then passes back to them and Primal Strength becomes legal — too late. Their only chance
 *    was to cast it BEFORE passing Focus.
 * Rules: 337.2 (only Reactions may be added to a chain), 341–343 (Actions in showdowns start chains with Focus), 345 (Focus
 *        passes after a chain resolves), 428 (lethal damage kills on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const PRIMAL_STRENGTH = "ogn-154-298";

/** P2's turn 3. P1 holds bf1 with a 3-Might Guard and has Ray + 1 + [fury]. P2: a ready 1-Might Scout in base, Primal Strength + 4 + [body]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Other" }, "other") // a surviving Primal Strength target for the "too late" step
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, PRIMAL_STRENGTH, "primal");
}

/** Scout attacks bf1; P2 passes Focus WITHOUT acting; P1 (Focus) Rays the Scout and passes priority to P2. */
async function rayOnScout(game: Game): Promise<void> {
  await game.p2.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("ray", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["scout"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 7eb20d4fab0f6166 — no Primal Strength window once Focus was passed and Hextech Ray is on the chain", () => {
  test("the only chance: BEFORE passing Focus, P2 (attacker, Focus first) could have cast Primal Strength on the Scout", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "primal")).toBe(true);
  });

  test("with the Ray on the chain P2 holds priority but Primal Strength (an Action) is NOT legal — the attempt is refused", async () => {
    const game = await board().build();
    await rayOnScout(game);
    expect(game.p2.can("cast", "primal")).toBe(false);
    const r = await game.p2.try((p) => p.cast("primal", { targets: "scout" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { body: 1 } });
  });

  test("P2 can only pass; the Ray resolves and the 1-Might Scout dies at once (not after 'all chains')", async () => {
    const game = await board().build();
    await rayOnScout(game);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("after the chain resolves Focus comes back to P2, and NOW Primal Strength is legal (on some other unit) — too late for the Scout; that automatic Focus pass did not end the showdown", async () => {
    const game = await board().build();
    await rayOnScout(game);
    await game.p2.passPriority();
    expect(game.zoneOf("scout")).toBe("trash");
    for (let i = 0; i < 3 && !(game.actingSeat() === P2 && game.decision()?.kind === "action"); i++) {
      await game.acting().pass();
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", seat: P2 });
    expect(d?.kind === "action" ? d.context : undefined).toBe("showdown"); // the showdown is still open: nobody "both passed" yet
    expect(game.p2.can("cast", "primal")).toBe(true);
    const targets = (game.p2.option("cast", "primal")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("scout"); // she is gone
    expect(game.violations()).toEqual([]);
  });
});
