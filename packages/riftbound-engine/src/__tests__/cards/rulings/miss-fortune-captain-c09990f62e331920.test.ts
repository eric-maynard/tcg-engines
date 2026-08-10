/**
 * Ruling c09990f62e331920 — Miss Fortune, Captain (OGN-162 → ogn-162-298) · Champion Unit · Body · 5 · 5 Might
 *     "[Accelerate] [Ganking] The first time I move each turn, you may ready something else that's exhausted."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) "When I move, discard 1, then draw 1."
 *   × Crackshot Corsair (OGN-130 → ogn-130-298) "When I attack, deal 1 to an enemy unit here."
 *
 * Q: Does Miss Fortune's "first time I move" trigger happen together with "when I attack" triggers, or before combat?
 * A: Before combat. Sequence: units move in (combat is staged) → the move trigger(s) go on a chain and resolve (they can
 *    be responded to with Reactions) → only then combat begins → the initial combat chain carries the "when I attack /
 *    defend" triggers → attacker acts, defender acts → combat resolves. Every "when I move" trigger (Merchant too)
 *    is done before combat starts; move triggers and attack triggers live on different chains.
 * Rules: 460 (a Combat starts at a Cleanup with an EMPTY chain), 464.2 (designations + initial combat chain),
 *        383.3.d (simultaneous triggers), 336–340 (chain / priority / LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MF_CAPTAIN = "ogn-162-298";
const MERCHANT = "ogn-185-298";
const CORSAIR = "ogn-130-298";
/** A 1-cost [Reaction] so "P2 may respond to the move trigger" is observable. */
const QUICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Quick Thought",
  timing: "reaction",
} as const;

/**
 * P1's turn. P2 holds bf1 with a 2-Might Poro and has a Reaction + 1 energy. P1: Miss Fortune, Traveling Merchant,
 * Crackshot Corsair ready in base, an EXHAUSTED Sleepy unit (the thing MF readies), one junk card in hand (Merchant's
 * discard) and a known deck top.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MF_CAPTAIN, "mf")
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", CORSAIR, "corsair")
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
    .hand(P1, "ogn-175-298", "junk")
    .deck(P1, ["ogn-175-298"], ["d1"])
    .resources(P2, { energy: 1 })
    .hand(P2, QUICK, "quick");
}

function combatBegun(game: Game): boolean {
  return (game.gameState.interaction?.showdownStack ?? []).some((s) => s.active && s.isCombatShowdown === true);
}

/** MF's "you may ready something else" — P1 opts in and names Sleepy. */
async function answerMf(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mf" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("sleepy");
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling c09990f62e331920 — Miss Fortune's move trigger resolves on its own chain BEFORE combat and its attack triggers", () => {
  test("MF + Corsair move in: only MF's MOVE trigger is on the chain — Corsair's 'when I attack' is not, nobody is attacker/defender yet, no showdown", async () => {
    const game = await board().build();
    await game.p1.move(["mf", "corsair"], "bf1");
    await answerMf(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "corsair")).toBe(false);
    expect(game.state("mf").combatRole).toBeNull();
    expect(game.state("corsair").combatRole).toBeNull();
    expect(game.state("poro").combatRole).toBeNull();
    expect(combatBegun(game)).toBe(false);
    expect(game.state("sleepy").isExhausted).toBe(true); // trigger not resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the move trigger can be responded to: P2 gets priority on that chain and may play a Reaction before it resolves", async () => {
    const game = await board().build();
    await game.p1.move(["mf", "corsair"], "bf1");
    await answerMf(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "quick")).toBe(true);
    await game.p2.cast("quick");
    expect(game.chain().map((c) => c.cardId)).toEqual(["mf", "quick"]);
    expect(combatBegun(game)).toBe(false);
    await passBoth(game); // Quick Thought resolves (P2 draws)
    expect(game.zoneOf("quick")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["mf"]);
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(combatBegun(game)).toBe(false);
  });

  test("after the move trigger resolves (Sleepy readied) combat BEGINS: designations are assigned and the initial combat chain now holds Corsair's 'when I attack' trigger; then attacker Focus, then defender", async () => {
    const game = await board().build();
    await game.p1.move(["mf", "corsair"], "bf1");
    await answerMf(game);
    await passBoth(game); // MF's trigger resolves
    expect(game.state("sleepy").isReady).toBe(true);
    expect(combatBegun(game)).toBe(true);
    expect(game.state("mf").combatRole).toBe("attacker");
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", controller: P1, triggered: true })]);
    await passBoth(game); // Corsair: 1 to the Poro (only enemy here)
    expect(game.state("poro").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker acts first
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // then defender
    await game.settle(); // combat resolution: 8 vs 2
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("ALL 'when I move' triggers happen before combat: MF + Traveling Merchant + Corsair move together — MF readies Sleepy and the Merchant discards/draws while no combat exists; Corsair's attack trigger only appears afterwards", async () => {
    const game = await board().build();
    await game.p1.move(["mf", "merchant", "corsair"], "bf1");
    // Both move triggers are pending/on the chain; the attack trigger is not.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || combatBegun(game)) {
        break;
      }
      expect(game.chain().some((c) => c.cardId === "corsair")).toBe(false);
      expect(game.state("mf").combatRole).toBeNull();
      if (d.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        const keys = d.options.map((o) => o.card ?? o.key);
        await game.p1.pick(keys.includes("sleepy") ? "sleepy" : keys.includes("junk") ? "junk" : (d.options[0]?.key as string));
      } else if (d.kind === "order") {
        expect(d.seat).toBe(P1); // P1 orders its own simultaneous triggers
        await game.p1.order([]);
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    // Every move trigger has resolved …
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    // … and only now has combat begun, with the attack trigger on the initial combat chain.
    expect(combatBegun(game)).toBe(true);
    expect(game.state("mf").combatRole).toBe("attacker");
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "corsair", triggered: true })]);
    expect(game.violations()).toEqual([]);
  });
});
