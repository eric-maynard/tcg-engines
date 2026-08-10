/**
 * Ruling b4a8fb99f1567441 — Divine Judgment (OGN-244 → ogn-244-298) · Action · 7+[order][order]
 *   "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *   (King's Edict ogn-237-298 is cited only as the contrast that DOES forbid duplicate choices.)
 *
 * Q: Can Divine Judgment be cast even if the opponent doesn't have 2 cards in hand or any gear?
 * A: Yes. It targets nothing; all choices are made on resolution, so there is no requirement on what anyone has when it is
 *    cast. On resolution each player chooses; excess units/gear/runes/hand cards are recycled. Nuances: the chosen units/gear
 *    need not be ones the chooser controls, and players may choose the same units — so a caster with 4 units facing an
 *    opponent with none can end up keeping all 4 while the opponent just recycles their own excess.
 * Rules: 355.5 (no targets chosen at play time), 359 (choices made on resolution), 416 (Recycle; 416.6 doesn't target).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";

/** P1's turn with exactly 7 + [order][order]; P1 has FOUR units and nothing else; P2 has NO hand, NO gear, NO units — just 3 runes. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .unit(P1, "base", { might: 1, name: "U1" }, "u1")
    .unit(P1, "base", { might: 2, name: "U2" }, "u2")
    .unit(P1, "base", { might: 3, name: "U3" }, "u3")
    .unit(P1, "base", { might: 4, name: "U4" }, "u4")
    .rune(P2, "fury", { alias: "r1" })
    .rune(P2, "fury", { alias: "r2" })
    .rune(P2, "fury", { alias: "r3" })
    .hand(P1, DIVINE_JUDGMENT, "dj");
}

/** Cast DJ and resolve it, recording every prompt; P1 lets go of u1+u2, P2 of r1. */
async function castAndResolve(): Promise<{ game: Game; prompts: { seat: string; kind: Decision["kind"]; options: string[] }[] }> {
  const game = await board().build();
  const prompts: { seat: string; kind: Decision["kind"]; options: string[] }[] = [];
  await game.p1.cast("dj");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d || d.kind === "action") {
      break;
    }
    const options = d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    prompts.push({ kind: d.kind, options, seat: d.seat });
    if (d.kind !== "pick") {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
    const prefer = d.seat === P1 ? ["u1", "u2"] : ["r1"];
    const take = d.options.filter((o) => prefer.includes((o.card ?? o.key) as string)).slice(0, Math.max(1, d.min));
    await game.seat(d.seat).pick(...(take.length > 0 ? take : [d.options[0]!]).map((o) => o.key));
  }
  return { game, prompts };
}

describe("Ruling b4a8fb99f1567441 — Divine Judgment has no casting requirements; choices happen on resolution", () => {
  test("castable although P2 has 0 cards in hand, 0 gear (and even 0 units): it goes on the chain with NO targets and P1's 7+[order][order] is spent", async () => {
    const game = await board().build();
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.can("cast", "dj")).toBe(true);
    const targetsField = game.p1.option("cast", "dj")?.fields.find((f) => f.name === "targets");
    expect(targetsField?.required ?? false).toBe(false); // nothing is chosen at play time
    await game.p1.cast("dj");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("on resolution the choices are made: P1 (4 units) is asked and ends with exactly 2 units (the other 2 recycled into the Main Deck); P2 is asked only about their 3 runes and keeps 2 (1 back to the Rune Deck); DJ → trash", async () => {
    const { game, prompts } = await castAndResolve();
    expect(prompts.some((p) => p.seat === P1 && p.kind === "pick" && p.options.includes("u4"))).toBe(true);
    expect(prompts.some((p) => p.seat === P2 && p.kind === "pick" && p.options.includes("r3"))).toBe(true);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.p1.units().toSorted()).toEqual(["u3", "u4"]);
    expect(game.zoneOf("u1")).toBe("mainDeck");
    expect(game.zoneOf("u2")).toBe("mainDeck");
    expect(game.p2.runes().toSorted()).toEqual(["r2", "r3"]);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p2.hand()).toEqual([]); // nothing to recycle, nothing demanded
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT / DESIGN: riftjudge b4a8fb99f1567441 adds a nuance — "Each player chooses 2 units" names no
  // controller, so under the ruling each player would choose from EVERY unit on the board and both players may name
  // the same units (an opponent with no units of their own could still spend their two picks keeping yours, letting a
  // 4-unit caster keep all 4). Rule 359 has all of a resolution's choices made at once, which is what makes the two
  // players' picks a simultaneous union; the engine's `pendingChoice` is a single slot whose picks are applied the
  // moment they are made, so it cannot hold both players' choices open and union them before recycling the rest.
  // The engine therefore scopes each player's choice to permanents that player controls (`collectCategory` in
  // abilities/effects/recycle.ts) — identical to the card whenever the players' pools are disjoint, which is every
  // board where nobody spends picks on an opponent's permanents. Asserted so the divergence stays deliberate.
  test("engine/DESIGN: each player is asked only about permanents they control — P2, controlling no units, gets no unit prompt", async () => {
    const { prompts } = await castAndResolve();
    const p2UnitPick = prompts.find((p) => p.seat === P2 && p.options.some((o) => ["u1", "u2", "u3", "u4"].includes(o)));
    expect(p2UnitPick).toBeUndefined();
    const p2Prompts = prompts.filter((p) => p.seat === P2);
    expect(p2Prompts.length).toBeGreaterThan(0);
    expect(p2Prompts.every((p) => p.options.every((o) => ["r1", "r2", "r3"].includes(o)))).toBe(true);
  });
});
