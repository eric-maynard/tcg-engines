/**
 * Ruling be19cbf2fe095a11 — Heedless Resurrection (UNL-142 → unl-142-219) Reaction [2][chaos] "As an additional cost to play this,
 *   kill a friendly unit. Play a unit from your trash that costs no more Energy and no more Power than the killed unit, ignoring
 *   its cost." × Elder Dragon (UNL-118 → unl-118-219) [12][body]×4 · 10 Might.
 *
 * Q: I play Heedless Resurrection killing my Elder Dragon. Can I then play that same Elder Dragon from my trash?
 * A: No. The unit to resurrect is chosen and locked while the spell is being played — BEFORE the additional cost is paid. At that
 *    moment the Dragon is still on the board, so it is not a valid choice; killing it afterwards does not make it one.
 * Rules: 355 steps (choices → lock → pay costs → resolve), 355.15, 356 (additional costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const ELDER_DRAGON = "unl-118-219";

/** P1's turn with exactly [2][chaos]. Elder Dragon in P1's base; a 3-cost Corpse already in P1's trash (a legal thing to resurrect). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", ELDER_DRAGON, "dragon")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, { cardType: "unit", energyCost: 3, might: 3, name: "Corpse" }, "corpse")
    .hand(P1, HEEDLESS, "heedless");
}

/** Cast Heedless killing the Dragon; pass priority until the "which unit to play" choice (or the end). Returns every unit offered. */
async function castKillingDragon(game: Game): Promise<string[]> {
  const sac = game.p1.option("cast", "heedless")?.fields.find((f) => f.arg === "sacrifice");
  expect(sac?.options ?? []).toEqual(["dragon"]);
  await game.p1.cast("heedless", { sacrifice: "dragon" });
  expect(game.zoneOf("dragon")).toBe("trash"); // the additional cost is paid up front
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const offered = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      for (const o of d.options) {
        offered.add(o.card ?? o.key);
      }
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("dragon");
      await game.p1.pick("corpse");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  return [...offered];
}

describe("Ruling be19cbf2fe095a11 — the Elder Dragon killed to pay for Heedless Resurrection cannot be the unit it resurrects", () => {
  test("killing the Dragon as the cost puts it in the trash, yet it is NEVER offered as the unit to play — only the Corpse that was already there is", async () => {
    const game = await board().build();
    const offered = await castKillingDragon(game);
    expect(offered).not.toContain("dragon");
    expect(offered.length === 0 || offered.includes("corpse")).toBe(true); // a lone legal choice may be locked without asking
    expect(game.zoneOf("heedless")).toBe("trash");
    expect(game.zoneOf("corpse")).toBe("base"); // resurrected, cost ignored (P1 had 0 resources left)
    expect(game.zoneOf("dragon")).toBe("trash"); // stays dead
    expect(game.p1.units("base")).toEqual(["corpse"]);
    expect(game.violations()).toEqual([]);
  });

  test("with NOTHING in the trash but the soon-to-die Dragon, Heedless Resurrection cannot even be played: there is no valid unit to choose at the time choices are made", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", ELDER_DRAGON, "dragon")
      .hand(P1, HEEDLESS, "heedless")
      .build();
    expect(game.p1.can("cast", "heedless")).toBe(false);
    const r = await game.p1.try((p) => p.cast("heedless", { sacrifice: "dragon" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("heedless")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });
});

void P2;
