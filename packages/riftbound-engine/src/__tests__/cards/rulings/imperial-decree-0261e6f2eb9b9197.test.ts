/**
 * Ruling 0261e6f2eb9b9197 — Imperial Decree (OGN-221 → ogn-221-298) · Action spell · Order · [5]+[order][order]
 *     "When any unit takes damage this turn, kill it."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."
 *
 * Q: With Imperial Decree active, if combat damage kills a unit protected by Zhonya's, does the Decree kill it
 *    "a second time", getting through the Hourglass?
 * A: Yes. Combat damage is dealt → the unit would die from lethal damage (Zhonya's replaces THAT death: Hourglass
 *    killed instead, unit healed/exhausted/recalled) → Imperial Decree's delayed trigger ("took damage") then
 *    resolves and kills the unit anyway, regardless of its now-clean damage state. Zhonya's is single-use.
 * Rules: 370–373 (replacement effects apply once per event), 383 (delayed trigger from a resolved spell),
 *        465.2 (combat damage step → cleanup kills lethally damaged units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const ZHONYAS = "ogn-077-298";

/** Inline 1-cost action spell: deal 1 to a unit (non-lethal on its own). */
const STING = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Sting", timing: "action" };

/**
 * P1's turn with [6] + 2 order (Decree 5+[order][order], Sting 1). P2's 3-Might Defender holds bf1 and P2 has a
 * face-up Zhonya's Hourglass in base. P1's 3-Might Attacker waits in base (equal Might → mutual lethal in combat).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "A")
    .gear(P2, ZHONYAS, "zhonyas")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, STING, "sting");
}

async function decreeActive(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Drive the attack on bf1 to completion (auto combat), back to an open main phase. */
async function attack(game: Game): Promise<void> {
  await game.p1.move("A", "bf1");
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "open" || (d?.kind === "action" && d.context === "main")) {
      break;
    }
  }
}

describe("Ruling 0261e6f2eb9b9197 — Imperial Decree kills a Zhonya's-saved unit again after combat damage", () => {
  test("control: with Imperial Decree active, ANY damage kills — a 1-damage Sting on the 3-Might Defender (no Hourglass) sends it to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "D")
      .hand(P1, IMPERIAL_DECREE, "decree")
      .hand(P1, STING, "sting")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("sting", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
  });

  test("control: WITHOUT Imperial Decree, Zhonya's saves the Defender from the mutual-lethal combat — Hourglass to trash, Defender healed, exhausted, recalled to base", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("D")).toBe("base");
    expect(game.state("D")).toMatchObject({ damage: 0, isExhausted: true });
  });

  // Combat damage → D would die → Zhonya's replaces that death (Hourglass killed, D healed/exhausted/recalled)
  // → Imperial Decree's "took damage → kill it" DELAYED TRIGGER then kills D anyway: D ends in TRASH and the
  // Hourglass is spent. rule 383/390.2 — the Decree is a triggered ability, not a take-damage replacement, so
  // the lethal damage and the Decree kill are two separate death events.
  test("ruling 0261e6f2eb9b9197 — Zhonya's is spent on the combat-damage death and the Decree trigger kills the unit a second time", async () => {
    const game = await decreeActive();
    await attack(game);
    expect(game.zoneOf("A")).toBe("trash"); // the attacker took damage too and simply dies
    expect(game.zoneOf("zhonyas")).toBe("trash"); // the Hourglass WAS consumed on the combat-damage death…
    expect(game.zoneOf("D")).toBe("trash"); // …and D died again to Imperial Decree
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // The ruling's "dies twice" comes from LETHAL damage (death #1) plus the Decree kill (death #2). With NON-lethal
  // damage there is only the one Decree kill, which the single-use Hourglass replaces — so D survives in base.
  // This pins that Zhonya's is consumed by exactly one death event.
  test("contrast: non-lethal damage under Decree produces ONE kill event, which Zhonya's replaces — Defender survives in base, Hourglass spent", async () => {
    const game = await decreeActive();
    await game.p1.cast("sting", { targets: "D" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("D")).toBe("base");
    expect(game.state("D")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });
});
