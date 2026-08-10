/**
 * Ruling 00d018e15615df4d — Void Assault (UNL-202 → unl-202-219) · Spell · Body/Chaos · 2 + [C]
 *   "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't
 *    control, you're the attacker.)"
 *   × Crescent Strike (UNL-072 → unl-072-219) [Action] "Choose a battlefield and an enemy unit there.
 *     Deal 4 to that unit and 1 to each other enemy unit there."
 *
 * Q: Can you respond to Void Assault with Crescent Strike? Does Void Assault fully resolve before a
 *    combat showdown starts?
 * A: No — Crescent Strike is an [Action]; with a chain open (Closed state) only [Reaction]s may be played.
 *    Void Assault resolves entirely (friendly unit moves, then enemy unit moves) and only afterwards, if
 *    opposing units share a battlefield, does a combat showdown begin (attack/defend triggers go on a
 *    new chain then).
 * Rules: 330–333 (Open/Closed state, Action vs Reaction timing), 446.3, 460, 464.2.c.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const CRESCENT_STRIKE = "unl-072-219";

/** P1's turn. bf1 is P2's, held by Sentinel (5). P1's Runner (3) in base; P2's Brute (2) in base; P2 holds Crescent Strike fully funded. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Brute" }, "brute")
    .hand(P1, VOID_ASSAULT, "va")
    .hand(P2, CRESCENT_STRIKE, "cs");
}

type ShowdownView = { battlefieldId: string; active: boolean; isCombatShowdown?: boolean; focusPlayer?: string; attackingPlayer?: string; defendingPlayer?: string };
function openShowdown(game: Game): ShowdownView | undefined {
  const stack = (game.gameState.interaction as { showdownStack?: ShowdownView[] } | undefined)?.showdownStack ?? [];
  const top = stack.at(-1);
  return top?.active ? top : undefined;
}

/** P1 casts Void Assault: Runner → bf1, then Brute → bf1; stops with the spell on the chain and P2 holding priority. */
async function castVoidAssault(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("va", { targets: ["runner", "brute"] });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "runner" } });
  await game.p1.pick("battlefield-bf1");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "brute" } });
  await game.p1.pick("battlefield-bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["va"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 00d018e15615df4d — Void Assault: no Action-speed response; resolves fully before any showdown", () => {
  test("with Void Assault on the chain (Closed state) P2 cannot play the [Action] Crescent Strike even though it is fully funded", async () => {
    const game = await castVoidAssault();
    expect(game.p2.can("cast", "cs")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "cs")).toBe(false);
    const r = await game.p2.try((p) => p.cast("cs", { targets: "runner" }));
    expect(r.ok).toBe(false);
    // Nothing changed: still P2's priority with only Void Assault on the chain.
    expect(game.chain().map((c) => c.cardId)).toEqual(["va"]);
    expect(game.p2.hand()).toContain("cs");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { mind: 1 } });
  });

  test("while Void Assault is pending nothing has moved and no showdown exists; once both pass it resolves ENTIRELY — Runner then Brute arrive at bf1 — and only then a combat showdown opens with P1 attacking", async () => {
    const game = await castVoidAssault();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.locationOf("brute")).toBe("base");
    expect(openShowdown(game)).toBeUndefined();

    await game.p2.passPriority(); // Void Assault resolves
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.chain()).toEqual([]); // the spell is fully done; combat triggers (none here) would start a NEW chain
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.locationOf("brute")).toBe("bf1");
    // Combat begins after resolution: P1's Runner applied Contested → P1 attacks and holds Focus.
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("sentinel").combatRole).toBe("defender");
    expect(game.state("brute").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("contrast: inside the resulting showdown Crescent Strike IS playable once P2 has Focus (Actions are legal in showdowns) — it deals 4 to Runner and kills it", async () => {
    const game = await castVoidAssault();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "cs")).toBe(false); // not yet — P1 has Focus
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "cs")).toBe(true);
    await game.p2.cast("cs", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("trash"); // 4 ≥ 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
