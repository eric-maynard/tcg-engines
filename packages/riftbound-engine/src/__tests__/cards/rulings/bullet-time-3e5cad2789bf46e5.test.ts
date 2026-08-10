/**
 * Ruling 3e5cad2789bf46e5 — Bullet Time (OGN-268 → ogn-268-298) · Spell [1] · Body/Chaos · [Action]
 *   "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   (× Teemo, Strategist ogn-121-298 cited as the same "amount decided on resolution" pattern.)
 *
 * Q: When is Bullet Time's power paid, and can runes be exhausted/recycled for it during resolution?
 * A: On resolution (only the base energy is paid on cast; the battlefield is chosen on cast). While paying on
 *    resolution you may use Reaction-speed Add abilities — exhaust runes for energy and recycle runes for power.
 *    If Bullet Time is countered, no power is ever paid.
 * Rules: 204.3.b (X paid on resolution), 444.2.c / 416.3 (Add abilities usable whenever told to pay), 346 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const DEFY = "ogn-045-298";

/** P1: [1] energy, 1 floating [rainbow], three ready Fury runes; P2 holds bf1 with two 2-Might units and keeps one in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .runes(P1, "fury", 3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 2, name: "Grunt B" }, "gb")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, BULLET_TIME, "bt");
}

async function castAndResolve(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt", { targets: "bf1" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling 3e5cad2789bf46e5 — Bullet Time's [rainbow] is paid on resolution, with Add abilities available then", () => {
  test("cast: only the base [1] energy is paid and the battlefield is chosen; NO amount is asked yet (the opponent responds blind)", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "bt")?.fields ?? [];
    expect(fields.map((f) => f.arg)).toEqual(["targets"]); // no x / amount field at play time
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // power untouched
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1, targets: ["bf1"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a priority window, not a payment
  });

  test("resolution: P1 is NOW asked how much [rainbow] to pay; paying 1 deals 1 to each enemy unit at bf1 only", async () => {
    const game = await castAndResolve();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
    await game.p1.chooseX(1);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("ga").damage).toBe(1);
    expect(game.state("gb").damage).toBe(1);
    expect(game.state("home").damage).toBe(0); // not at a battlefield
    expect(game.zoneOf("bt")).toBe("trash");
  });

  // 444.2.c / 416.3: while the pay-X prompt is open, Reaction-speed Add abilities (exhaust a rune for [1], recycle a rune
  // for [rainbow]) are legal, so P1 can recycle two runes and pay 3 to wipe both Grunts.
  test("during the resolution-time payment P1 may recycle runes for [rainbow] (and tap for energy), then pay 3 → both Grunts die", async () => {
    const game = await castAndResolve();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1 });
    const verbs = (d?.kind === "integer" ? (d.actions ?? []) : []).map((a) => a.verb);
    expect(verbs).toContain("recycleRune");
    expect(verbs).toContain("tapRune");
    await game.p1.recycleRune();
    await game.p1.recycleRune();
    expect(game.p1.power()).toBe(3);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 3, seat: P1 });
    await game.p1.chooseX(3);
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.zoneOf("home")).toBe("base");
  });

  test("nuance — countered (Defy): Bullet Time never resolves, so no amount is asked and no power is paid", async () => {
    const game = await board().resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, DEFY, "defy").build();
    await game.p1.cast("bt", { targets: "bf1" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("defy", { targets: "bt" });
    let askedX = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      askedX ||= game.decision()?.kind === "integer";
      await game.acting().passPriority();
    }
    askedX ||= game.decision()?.kind === "integer";
    expect(askedX).toBe(false);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // only the base [1] was ever spent
    expect(game.state("ga").damage).toBe(0);
    expect(game.state("gb").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
