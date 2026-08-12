/**
 * Interaction: Sandshifter (sfd-158-221) "When you play me, kill an enemy unit with 3 [Might] or less."
 *   × Alpha Wildclaw (unl-057-219) "[Tank] … Your units here with less Might than me can't be
 *     chosen by enemy spells and abilities."
 *
 * Question: the opponent has Alpha Wildclaw (7 Might, Tank) and a 2-Might unit at the SAME
 * battlefield. Sandshifter's play trigger has zero legal victims — does the trigger resolve away
 * cleanly (no modal with no buttons and no exit), and does Sandshifter stay on the board? With the
 * Wildclaw parked at another battlefield the same trigger must open a normal, answerable picker
 * and actually kill.
 *
 * Rules:
 *  - 337.2 — after finalization a Unit chain item resolves immediately; its "when you play me"
 *    ability is a separate, newer chain item.
 *  - 355.6 / 402.2-402.4 — a triggered ability's single caster-chosen target is named at
 *    FINALIZATION, from the legal choices only.
 *  - 054.1 — a card that FORBIDS choosing supersedes the permission to choose, so a protected unit
 *    is not a legal choice for an enemy ability (no amount of power buys past it: it is not Deflect).
 *  - 359.3.e.6 — an instruction that cannot be followed is ignored; the rest of the play stands.
 *  - 815 — Tank is a combat-damage-assignment keyword only; it has nothing to do with choosing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SANDSHIFTER = "sfd-158-221";
const ALPHA_WILDCLAW = "unl-057-219"; // 7 Might, Tank, protects smaller friends at its location

const COST = { energy: 5, power: { order: 2 } };

/** Flatten the offered choices of the currently open pick decision. */
function pickOptions(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? [...(d.options.map((o) => o.card).filter(Boolean) as string[])].sort() : [];
}

/** NO side: the only ≤3-Might enemy stands next to the Wildclaw, so it can't be chosen. */
function shielded() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", ALPHA_WILDCLAW, "alpha")
    .unit(P2, "bf1", { might: 2, name: "Cub" }, "cub")
    .hand(P1, SANDSHIFTER, "ss");
}

/**
 * YES side: same two units, but the Wildclaw is at bf2 — "here" no longer covers the cub. A second
 * small enemy keeps the choice a real one (a lone candidate is auto-bound without asking, 402.2).
 */
function exposed() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", ALPHA_WILDCLAW, "alpha")
    .unit(P2, "bf1", { might: 2, name: "Cub" }, "cub")
    .unit(P2, "base", { might: 3, name: "Runt" }, "runt")
    .hand(P1, SANDSHIFTER, "ss");
}

describe("Sandshifter × Alpha Wildclaw — a trigger with no legal victim says so", () => {
  test("YES side: Sandshifter finalizes and resolves at once (337.2); its play trigger is left on the chain as a separate item", async () => {
    const game = await exposed().build();
    await game.p1.play("ss");
    // 337.2 — the unit itself is already in play; only the triggered ability is still pending.
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ss", controller: P1, triggered: true })]);
  });

  test("YES side: the picker opens with exactly the eligible units and the kill resolves", async () => {
    const game = await exposed().build();
    await game.p1.play("ss");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    // 355.6 — a real, answerable prompt: min 1, max 1, no decline, and the only ≤3 enemy on it.
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(pickOptions(game)).toEqual(["cub", "runt"]);
    expect(pickOptions(game)).not.toContain("alpha"); // 7 Might — over the threshold anyway
    await game.p1.pick("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("NO side: the protected 2-Might unit is not a legal choice (054.1) — no prompt is opened at all", async () => {
    const game = await shielded().build();
    await game.p1.play("ss");
    // 402.4 / 359.3.e.6 — zero legal choices ⇒ the item is dropped at finalization rather than
    // pending a modal with no buttons. P1 is never asked anything; the only decision on offer is
    // the ordinary open-main-phase action menu.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
  });

  test("NO side: the instruction is ignored — nobody dies, Sandshifter stays in play undamaged", async () => {
    const game = await shielded().build();
    await game.p1.play("ss");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.zoneOf("alpha")).toBe("battlefield-bf1");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.state("ss")).toMatchObject({ damage: 0, might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("NO side: the game does not freeze — P1 still holds an open main phase and can act", async () => {
    const game = await shielded().build();
    await game.p1.play("ss");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.legal().length).toBeGreaterThan(0);
    await game.p1.endTurn(); // the turn can still be finished
    expect(game.violations()).toEqual([]);
  });

  test("the block is the Wildclaw's location-scoped static, not the Might threshold: same cub, Wildclaw elsewhere ⇒ choosable", async () => {
    const blocked = await shielded().build();
    await blocked.p1.play("ss");
    await blocked.settle();
    expect(blocked.zoneOf("cub")).toBe("battlefield-bf1"); // alive

    const open = await exposed().build();
    await open.p1.play("ss");
    await open.settle();
    await open.p1.pick("cub");
    await open.settle();
    expect(open.zoneOf("cub")).toBe("trash"); // dead
  });

  test("Rewind takes the whole play back as one step — position identical to before the play", async () => {
    const game = await exposed().build();
    const before = game.snapshotHash();
    await game.p1.play("ss");
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.snapshotHash()).toBe(before);
    expect(game.zoneOf("ss")).toBe("hand");
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { order: 2 } });
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
