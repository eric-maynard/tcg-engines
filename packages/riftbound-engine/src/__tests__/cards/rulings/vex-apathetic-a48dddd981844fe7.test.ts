/**
 * Ruling a48dddd981844fe7 — Vex, Apathetic (UNL-150 → unl-150-219) · Unit · Chaos · [4] · 4 · "[Deflect] When an opponent
 *     plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12][body]×4 · 10 · "Any amount of your damage is enough to kill
 *     enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *
 * Q: With Vex at a battlefield, does an Elder Dragon the opponent plays still deal its damage?
 * A: Yes. Elder's "When you play me" goes on the chain (its choices made), Vex's trigger goes on top; Vex resolves first and
 *    stuns the Dragon; then Elder's trigger resolves and deals 1 to the chosen enemy units. Stun only stops combat-damage
 *    contribution (and, via Vex, movement) — it does not switch off the Dragon's passive ("any amount of your damage is
 *    lethal") nor stop its already-triggered ability.
 * Rules: 423.1.b (stunned: no combat damage), 383 (LIFO), 522 (passives stay active), 142.4 (lethal damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const ELDER_DRAGON = "unl-118-219";

/** P1's turn with exactly [12] + body×4 (nothing spare for Vex's Deflect). P2's Vex (4) holds bf1; P2's Brute (6) sits in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VEX, "vex")
    .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P1, ELDER_DRAGON, "elder");
}

/** P1 plays Elder Dragon and finalizes its trigger's choice (the Brute in P2's base — Vex is behind Deflect P1 can't pay). */
async function playElder(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("elder");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "elder" }, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["brute"]);
  await game.p1.pick("brute");
  return game;
}

describe("Ruling a48dddd981844fe7 — Vex stuns the Elder Dragon, which still deals its play damage (lethal via its passive)", () => {
  test("both triggers are on the chain: Elder's 'When you play me' (P1, → Brute) underneath, Vex's stun (P2) on top; the Dragon is on the board", async () => {
    const game = await playElder();
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["elder", P1, true],
      ["vex", P2, true],
    ]);
    expect(game.chain()[0]?.targets).toEqual(["brute"]);
    expect(game.state("elder").isStunned).toBe(false);
  });

  test("Vex resolves first (LIFO): the Dragon is stunned and can't move this turn — while its own trigger is still pending underneath", async () => {
    const game = await playElder();
    for (let i = 0; i < 6 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder"]);
    expect(game.state("elder").isStunned).toBe(true);
    expect(game.state("elder").grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect(game.state("brute").damage).toBe(0); // not yet
  });

  test("Elder's trigger then resolves anyway and deals 1 to the Brute — and since the STUNNED Dragon's passive is still active, that 1 damage kills the 6-Might Brute", async () => {
    const game = await playElder();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("elder")).toMatchObject({ isStunned: true, zone: "base" });
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p2.trash()).toContain("brute");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1"); // not chosen (Deflect unpaid) → untouched
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
