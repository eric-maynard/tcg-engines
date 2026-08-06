/**
 * Ruling 892bcd8cb9f72a4b — Ruined Rex (unl-067-219) · Unit · Mind · 6 · 6 Might
 *   "[Deathknell] Deal 4 to an enemy unit."
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6 · 6 Might
 *   "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *
 * Q: If both die at the same time, can Rex's Deathknell target the Mech tokens Forerunner's Deathknell makes?
 * A: No. Both Deathknells become pending items in the same cleanup (323.4) and ALL pending items are
 *    finalized — Rex choosing its target (355.5) — before any of them resolves (337.3/337.4). Forerunner
 *    only creates the Mechs when it resolves, so whatever the order, no Mech exists when Rex chooses.
 *
 * Setup: P1's Rex (6) attacks P2's Forerunner (6) at bf1 — equal Might, both die in the same combat cleanup.
 * P2 has two 5-Might bystanders in base so Rex's choice is a real decision.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const FERROUS_FORERUNNER = "sfd-021-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type PickD = Extract<Decision, { kind: "pick" }>;

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "bf1", FERROUS_FORERUNNER, "forerunner")
    .unit(P2, "base", { might: 5, name: "Bystander A" }, "bysA")
    .unit(P2, "base", { might: 5, name: "Bystander B" }, "bysB");
}

const mechsOf = (game: Game) => game.p2.units("base").filter((u) => game.state(u).isToken || /mech/i.test(game.state(u).name));

/** Pass focus/priority for whoever holds it until a non-pass decision (or the open main phase) appears. */
async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.context !== "chain" && d.context !== "showdown") || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 892bcd8cb9f72a4b — Rex's Deathknell target is chosen before Forerunner's Mechs exist", () => {
  test("supporting fact: Forerunner's Mech tokens are created only when its Deathknell RESOLVES — while it is merely on the chain there are no Mechs (so nothing for a simultaneously-finalized Rex to choose)", async () => {
    const game = await board().build();
    await game.p1.move("rex", "bf1");
    // Both pass focus → combat: 6 vs 6, both take lethal and die in the same cleanup.
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toContain("forerunner");
    expect(mechsOf(game)).toEqual([]);
    expect(game.p2.units("base").sort()).toEqual(["bysA", "bysB"]);
    await game.settle({ policy: "first" });
    expect(mechsOf(game)).toHaveLength(2);
    for (const m of mechsOf(game)) {
      expect(game.state(m).might).toBe(3);
    }
  });

  test("ruling 892bcd8cb9f72a4b — both Deathknells pend together; P1 is asked for Rex's target while NO Mech exists and is offered exactly the two bystanders (never a Mech); the pick takes 4, and the Mechs arrive later unharmed; engine never fires Rex's Deathknell", async () => {
    // Expected: a P1 pick (Rex's "an enemy unit") with options {bysA, bysB} only, surfaced before Forerunner's
    // trigger has resolved (finalize-all-pending first, 337.3). Actual: Rex's Deathknell does not trigger at all.
    const game = await board().build();
    await game.p1.move("rex", "bf1");
    await passAll(game);
    let rexPick: PickD | undefined;
    for (let i = 0; i < 8 && !rexPick; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        rexPick = d as PickD;
        break;
      }
      if (d?.kind === "order") {
        await game.seat(d.seat).order(d.items.map((it) => it.key)); // any order — the answer holds "regardless"
      } else if (!d || d.kind === "action") {
        break;
      }
      await passAll(game);
    }
    expect(rexPick).toBeDefined();
    // At the moment Rex chooses, the Mechs do not exist …
    expect(mechsOf(game)).toEqual([]);
    // … and so cannot be among the choices: exactly P2's two real units.
    const offered = (rexPick as PickD).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["bysA", "bysB"]);
    await game.p1.pick("bysA");
    await game.settle({ policy: "first" });
    expect(game.state("bysA").damage).toBe(4);
    expect(game.state("bysB").damage).toBe(0);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("forerunner")).toBe("trash");
    const mechs = mechsOf(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m).damage).toBe(0);
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
