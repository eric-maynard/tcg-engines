/**
 * Ruling 9ba5021511abbc31 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Icathian Rain (OGN-248 → ogn-248-298) · Spell · 7 + [rainbow]×3 · "Deal 2 to a unit." ×6
 *
 * Q: A 2-Might unit whose controller has TWO Zhonya's in play is hit by Icathian Rain three times. Do both
 *    Zhonya's disappear, and does the unit die?
 * A: The unit survives. Units don't die the moment lethal damage is marked by a spell — death happens in the
 *    Cleanup after the spell resolves, where Zhonya's replacement saves it. Both Zhonya's are consumed in the
 *    process, but the unit does not die.
 * Rules: 359.3.e.8 / 322–323 (Cleanup kills lethally-damaged units after resolution), 369–373 (replacement
 *        effects; "kill this instead", heal/exhaust/recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const ICATHIAN_RAIN = "ogn-248-298";

/** P2's turn with Rain's [7]+3 rainbow. P1: a 2-Might Pawn at bf1 and TWO face-up Zhonya's in base. P2: an 8-Might bystander soaks the other 3 hits. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .gear(P1, ZHONYAS, "zh1")
    .gear(P1, ZHONYAS, "zh2")
    .unit(P2, "base", { might: 8, name: "Bystander" }, "big")
    .hand(P2, ICATHIAN_RAIN, "rain");
}

/** Cast Rain: 3 instances at the Pawn, 3 at the Bystander; resolve everything (P1 answers any replacement-order ask with the first option). */
async function rained(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.gear().sort()).toEqual(["zh1", "zh2"]);
  await game.p2.cast("rain", { targets: ["pawn", "pawn", "pawn", "big", "big", "big"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    // rule 372 / 373 — if the engine asks which Hourglass applies (first), that is the Pawn's controller's call.
    expect(d?.seat).toBe(P1);
    if (d?.kind === "pick") {
      await game.p1.pick(d.options[0]?.key as string);
    } else if (d?.kind === "order") {
      await game.p1.order(d.items.map((o) => o.key));
    } else if (d?.kind === "yes-no") {
      await game.p1.yes();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("rain")).toBe("trash");
  return game;
}

describe("Ruling 9ba5021511abbc31 — 2-Might unit + two Zhonya's vs three Icathian Rain hits: the unit lives", () => {
  test("the 2-Might unit does NOT die: Zhonya's replaces the death — it ends healed (0 damage), exhausted and recalled to P1's base", async () => {
    const game = await rained();
    expect(game.zoneOf("pawn")).not.toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, location: "base", might: 2 });
    expect(game.p1.units()).toEqual(["pawn"]);
    // the bystander simply wears its 6
    expect(game.state("big")).toMatchObject({ damage: 6, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("at least one Zhonya's was killed 'instead' — it is in P1's trash, not the Pawn", async () => {
    const game = await rained();
    const trashedHourglasses = game.p1.trash().filter((c) => c === "zh1" || c === "zh2");
    expect(trashedHourglasses.length).toBeGreaterThanOrEqual(1);
    expect(game.p1.trash()).not.toContain("pawn");
  });

  // RULING-CONFLICT: riftjudge 9ba5021511abbc31 says BOTH Hourglasses are consumed. Rule 370.2's own worked example
  // only reaches that outcome because a spell had first turned the gear into UNITS: Hourglass #1 killing itself is
  // then "a friendly unit would die", an event #2 can apply to. With ordinary gear, #1's self-kill is a GEAR dying,
  // which never qualifies for #2's "If a friendly unit would die" — so the Pawn's single would-die event is replaced
  // exactly once (rule 370.1.b / 370.2) and the second Hourglass stays in play. The engine follows the CR here.
  test("engine/CR: exactly ONE Hourglass is consumed — the other stays in play (rule 370.2)", async () => {
    const game = await rained();
    expect(game.p1.trash().filter((c) => c === "zh1" || c === "zh2")).toHaveLength(1);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.zoneOf("pawn")).toBe("base");
  });
});
