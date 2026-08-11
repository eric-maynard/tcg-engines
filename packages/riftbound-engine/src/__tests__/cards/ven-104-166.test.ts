/**
 * Tail-Cloaked Matriarch — ven-104-166 · Unit · Chaos · 4 energy (no power) · 4 Might
 *
 *   [Empower] [2][chaos] ([2][chaos]: Empower me. Use only if not Empowered.)
 *   When I become [Empowered], you may choose a unit in your trash with Energy cost no more than [3]
 *   and Power cost no more than [rainbow]. Play it to your base, ignoring its cost.
 *
 * Rules: 827.1.c.1 (Empower = "[Cost]: Empower this. Play only if not Empowered" — an ACTIVATED ability:
 * 381/145.2 your turn, Open state, chain item the opponent may answer), 441.1.c / 441.2.a ("becoming"
 * Empowered is the false→true edge; a redundant empower is no event), 828.1.d (the "When I become
 * Empowered" trigger fires whoever empowered her), 419.3 (a play BY EFFECT: Limited, "treat all steps of
 * Play as normal" except the cost is ignored → the unit is really PLAYED: enters exhausted, its own
 * "When you play me" fires; 419.3.c nothing eligible → nothing happens), "you may" → optional.
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Eligibility filter is two independent caps: Energy ≤ 3 AND Power ≤ 1 — a 3-cost/1-pip unit is IN
 *     (both limits are inclusive), a 4-cost/0-pip or 2-cost/2-pip unit is OUT; spells/gear are out; the
 *     OPPONENT's trash is out ("your trash").
 *  2. "ignoring its cost": no energy and no power leaves the pool, even for the [chaos]-pip Attendant.
 *  3. The revived unit is played, not "put": it enters exhausted and its play trigger fires (Teemo → 4).
 *  4. Trigger source-agnostic: Sanction empowering her also asks; Sanction's end-of-turn disempower then
 *     re-arms her own [Empower] for next turn, and re-empowering asks AGAIN. Already Empowered → nothing.
 *  5. Empower cost edges: exactly [2]+[chaos]; 1 short on either axis, already Empowered, or the
 *     opponent's turn → not offered. Killed in response → never becomes Empowered, no prompt.
 *  (Engine today: the trigger and its yes/no exist, but "yes" does nothing — the trash choice was not parsed.)
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-104-166";
const SKULKER = "ogn-175-298"; // Shipyard Skulker · 3 energy, no power · 3 Might (eligible)
const TEEMO = "ogn-197-298"; // Teemo, Scout · 2 energy · 1 Might · "When you play me, give me +3 Might this turn" (eligible)
const ATTENDANT = "ogn-165-298"; // Cemetery Attendant · 3 energy + [chaos] · 3 Might (eligible — exactly at both caps)
const SANCTION = "ven-035-166"; // Calm Reaction: mode 0 = Empower a unit, disempower it at end of turn
const FOUR_DROP = { cardType: "unit", energyCost: 4, might: 4, name: "Four Drop" } as const; // energy 4 → out
const DOUBLE_PIP = { cardType: "unit", energyCost: 2, might: 2, name: "Double Pip", powerCost: ["chaos", "chaos"] } as const; // 2 pips → out
const CHEAP_SPELL = { abilities: [], cardType: "spell", energyCost: 1, name: "Cheap Trick" } as const; // not a unit → out
const KILL_SHOT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill Shot",
  timing: "reaction",
} as const;

/** Matriarch in P1's base with exactly [2]+[chaos] (+1 spare energy), a mixed trash, and a unit in P2's trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .unit(P1, "base", CARD, "mat")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, TEEMO, "teemo")
    .trash(P1, ATTENDANT, "attendant")
    .trash(P1, FOUR_DROP, "four")
    .trash(P1, DOUBLE_PIP, "pips")
    .trash(P1, CHEAP_SPELL, "trick")
    .trash(P2, SKULKER, "theirs");
}

/** Pass chain priority until a non-action prompt (yes/no, pick) or the open main phase. */
async function toPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return d;
    }
    await game.seat(d.seat).passPriority();
  }
  return game.decision();
}

/** Activate [Empower], let it and the follow-up trigger resolve, and stop at the "you may" prompt. */
async function empowerToOptIn(game: Game): Promise<void> {
  await game.p1.activate("mat");
  const d = await toPrompt(game);
  expect(game.state("mat").isEmpowered).toBe(true);
  expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
}

describe("Tail-Cloaked Matriarch (ven-104-166)", () => {
  test("registry payload (line 1): an activated [Empower] costing exactly 2 energy + [chaos], empowering self, restricted to 'not Empowered'; 4-cost Chaos unit, no power, 4 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 4, might: 4, name: "Tail-Cloaked Matriarch" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities?.[0]).toEqual({ cost: { energy: 2, power: ["chaos"] }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
  });

  // Expected: ability #2 is an OPTIONAL trigger on self becoming Empowered whose effect chooses a UNIT in YOUR
  // TRASH with energy ≤ 3 and power ≤ 1 and plays it to base ignoring cost. Actual: emitted as a `spell`-typed
  // ability whose play effect targets a "pending-value" — the trash choice and both caps are missing.
  test("registry payload (line 2) should be an optional become-Empowered trigger that picks a ≤3-energy/≤1-power unit from your trash and plays it to base for free", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities).toHaveLength(2);
    const trig = def?.abilities?.[1] as { type: string; optional?: boolean; trigger?: unknown; effect?: unknown };
    expect(trig).toMatchObject({ optional: true, trigger: { event: "empower", on: "self" }, type: "triggered" });
    const blob = JSON.stringify(trig.effect);
    expect(blob).toContain('"type":"play"');
    expect(blob).toContain('"ignoreCost":true');
    expect(blob).toMatch(/trash/);
    expect(blob).toMatch(/"unit"/);
    expect(blob).toMatch(/3/); // energy cap
    expect(blob).toMatch(/1/); // power cap
  });

  test("[Empower] [2][chaos]: pays exactly 2 + the chaos pip up front, is a NON-triggered chain item P2 may answer, and only on resolution is she Empowered (no exhaust)", async () => {
    const game = await board().build();
    await game.p1.activate("mat");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mat", controller: P1, triggered: false })]);
    expect(game.state("mat").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("mat")).toMatchObject({ isEmpowered: true, isExhausted: false, might: 4 });
  });

  test("cost / timing negative space: 1 energy + 2 chaos, 2 energy + no chaos, already Empowered (827.1.c.1), or the opponent's turn (381) → not offered", async () => {
    expect((await scenario().resources(P1, { energy: 1, power: { chaos: 2 } }).unit(P1, "base", CARD, "m").build()).p1.can("activate", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P1, "base", CARD, "m").build()).p1.can("activate", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", CARD, "m", { empowered: true }).build()).p1.can("activate", "m")).toBe(false);
    expect((await scenario().active(P2).resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", CARD, "m").build()).p1.can("activate", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", CARD, "m").build()).p1.can("activate", "m")).toBe(true);
  });

  test("becoming Empowered puts 'When I become Empowered' on the chain as a triggered item, then asks P1 the optional 'you may'", async () => {
    const game = await board().build();
    await game.p1.activate("mat");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Empower resolves
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mat", controller: P1, triggered: true })]);
    const d = await toPrompt(game);
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("declining the 'you may': nothing leaves the trash, nothing enters the base, no resources move", async () => {
    const game = await board().build();
    await empowerToOptIn(game);
    await game.p1.no();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.trash().sort()).toEqual(["attendant", "four", "pips", "skulker", "teemo", "trick"]);
    expect(game.p1.base()).toEqual(["mat"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  });

  // Expected: after "yes" P1 picks among EXACTLY the eligible units in P1's trash — Skulker (3/0), Teemo (2/0),
  // Attendant (3/1) — never the 4-drop, the 2-pip unit, the spell, or the Skulker in P2's trash. Actual: no prompt.
  test("accepting offers exactly the units in YOUR trash with energy ≤ 3 and power ≤ 1", async () => {
    const game = await board().build();
    await empowerToOptIn(game);
    await game.p1.yes();
    await game.settle(); // rule 402: the "you may" is answered at finalization; the trash pick waits for resolution
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["attendant", "skulker", "teemo"]);
  });

  // Expected: Teemo is PLAYED to base for free — pool untouched (1 energy, 0 chaos left), enters exhausted, and his
  // own "When you play me, +3 Might this turn" fires (419.3.b) → 4 Might; the rest of the trash stays. Actual: nothing.
  test("choosing Teemo plays him to base ignoring cost — exhausted, play trigger fires (1 → 4 Might), pool untouched", async () => {
    const game = await board().build();
    await empowerToOptIn(game);
    await game.p1.yes();
    await game.settle(); // rule 402 (finalization) — the pick comes at resolution
    await game.p1.pick("teemo");
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("base");
    expect(game.state("teemo")).toMatchObject({ controller: P1, isExhausted: true, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.p1.trash().sort()).toEqual(["attendant", "four", "pips", "skulker", "trick"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: the Attendant sits exactly on both caps (3 energy, one [chaos] pip) and is still free — with 0 energy
  // and 0 chaos left after paying for Empower it nonetheless lands in base. Actual: nothing is played.
  test("the 3-energy + [chaos] Attendant (both caps inclusive) is playable for free even with an empty pool", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await empowerToOptIn(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.yes();
    await game.settle(); // rule 402 (finalization) — the pick comes at resolution
    await game.p1.pick("attendant");
    await game.settle({ policy: "first" }); // Attendant's own play trigger may ask for a trash unit — take any
    expect(game.zoneOf("attendant")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // rule 402.4 / 355.10.a — the trash pick is a target in a PUBLIC pile made at finalization, so an all-ineligible
  // trash leaves the trigger no legal choice: it is removed from the chain there and nothing is ever asked
  // (removal is NOT a counter, 402.4.a — the Empower cost stays spent and she stays Empowered).
  test("negative space (419.3.c / 402.4): with only ineligible cards in the trash the trigger is removed at finalization — nothing is asked, board and trash as before", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", CARD, "mat").trash(P1, FOUR_DROP, "four").trash(P1, CHEAP_SPELL, "trick").trash(P2, TEEMO, "theirs").build();
    await game.p1.activate("mat");
    const d = await toPrompt(game);
    expect(game.state("mat").isEmpowered).toBe(true); // 402.4.a — removal is not a counter, the cost stays spent
    if (d?.kind === "yes-no") {
      await game.p1.yes(); // an engine that still asks must at least play nothing
    }
    await game.settle();
    expect(game.p1.base()).toEqual(["mat"]);
    expect(game.p1.trash().sort()).toEqual(["four", "trick"]);
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("source-agnostic (441.2.a / 828.1.d): Sanction empowering her also raises the 'you may'; its end-of-turn disempower re-arms [Empower] next turn, and re-empowering asks AGAIN", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", CARD, "mat").trash(P1, SKULKER, "skulker").hand(P1, SANCTION, "sanc").runes(P1, "chaos", 1).build();
    await game.p1.cast("sanc");
    await game.settle(); // lone unit, lone legal mode → Sanction resolves onto her
    if (game.decision()?.kind === "pick") {
      await game.p1.chooseMode(0);
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("mat");
      }
    }
    expect(await toPrompt(game)).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.state("mat").isEmpowered).toBe(true);
    await game.p1.no();
    await game.advanceTurn(); // Sanction: disempowered at end of turn
    expect(game.state("mat").isEmpowered).toBe(false);
    await game.advanceTurn(); // back to P1: 3 runes (1 chaos seeded + 2 channeled)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRune({ domain: "fury" });
    await game.p1.tapRune({ domain: "fury" });
    await game.p1.recycleRune({ domain: "chaos" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    expect(game.p1.can("activate", "mat")).toBe(true);
    await empowerToOptIn(game); // second time around: asks again
  });

  test("negative space (441.1.c): Sanction on an ALREADY-Empowered Matriarch is no 'becoming' — no trigger, no prompt", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", CARD, "mat", { empowered: true }).trash(P1, SKULKER, "skulker").hand(P1, SANCTION, "sanc").build();
    await game.p1.cast("sanc");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.chooseMode(0);
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("mat");
      }
    }
    await game.settle();
    expect(game.state("mat").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("killed in response to her own [Empower]: the ability resolves without a source on the board — never Empowered, no 'you may', the [2][chaos] stay spent", async () => {
    const game = await board().hand(P2, KILL_SHOT, "shot").build();
    await game.p1.activate("mat");
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: "mat" });
    await game.settle();
    expect(game.zoneOf("mat")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.base()).toEqual([]);
  });
});
