/**
 * Ruling f9b4023a6721f203 — Lotus Trap (UNL-013 → unl-013-219) · [Hidden][Reaction] · 2 · "Choose a unit. Double all damage that would be
 *     dealt to it this turn."
 *   × Deadly Flourish (UNL-073 → unl-073-219) · Spell (no timing keyword) · 4 · "Deal 3 to an enemy unit. When it dies this turn, play a
 *     Gold gear token exhausted."
 *
 * Q: To deal 6 with the pair, is the right line "Deadly Flourish first, then Lotus Trap on top", so that LIFO puts the doubling in
 *    place before the damage resolves?
 * A: Yes. Flourish (slow) must be played in an Open State; Lotus Trap (Reaction) can go on top of it; LIFO resolves Lotus Trap first
 *    (its replacement is now active for the turn), then Flourish's 3 is doubled to 6. Playing Lotus Trap first and letting it resolve,
 *    THEN Flourish, gives the same 6 — the doubling lasts the whole turn.
 * Rules: 336–339 (chain, LIFO), 346/151 (slow spells need an Open State; Reactions any time), 367–370 (replacement applied as the
 *        damage is dealt).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const DEADLY_FLOURISH = "unl-073-219";

/** P1's turn with exactly [6] (4 + 2). P2's 8-Might Brute holds bf1 (survives 6, so damage is readable). */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Brute" }, "brute")
    .hand(P1, LOTUS_TRAP, "lotus")
    .hand(P1, DEADLY_FLOURISH, "flourish");
}

const doubled = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.state("brute").grantedKeywords.some((k) => k.keyword === "DoubleIncomingDamage" && k.duration === "turn");

describe("Ruling f9b4023a6721f203 — Deadly Flourish + Lotus Trap = 6: Flourish first, Trap on top (LIFO)", () => {
  test("1–2. Flourish (Open State) then Lotus Trap on top of it: chain = [flourish, lotus], both aimed at the Brute, all 6 energy spent", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "flourish")).toBe(true);
    await game.p1.cast("flourish", { targets: "brute" });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "lotus")).toBe(true); // a Reaction may be added to the existing chain
    await game.p1.cast("lotus", { targets: "brute" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => ({ cardId: c.cardId, targets: c.targets }))).toEqual([
      { cardId: "flourish", targets: ["brute"] },
      { cardId: "lotus", targets: ["brute"] },
    ]);
    expect(game.state("brute").damage).toBe(0);
  });

  test("resolution is LIFO: Lotus Trap resolves FIRST (doubling now active on the Brute, no damage yet, Flourish still waiting)…", async () => {
    const game = await board().build();
    await game.p1.cast("flourish", { targets: "brute" });
    await game.p1.cast("lotus", { targets: "brute" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Lotus Trap) resolves
    expect(game.zoneOf("lotus")).toBe("trash");
    expect(doubled(game)).toBe(true);
    expect(game.state("brute").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["flourish"]);
  });

  test("…then Deadly Flourish resolves and its 3 is doubled: the Brute takes 6", async () => {
    const game = await board().build();
    await game.p1.cast("flourish", { targets: "brute" });
    await game.p1.cast("lotus", { targets: "brute" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flourish")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("timing note: Deadly Flourish has no [Action]/[Reaction] — with Lotus Trap already on the chain (Closed State) it can NOT be played, while Lotus Trap CAN be played onto a pending Flourish", async () => {
    const game = await board().build();
    await game.p1.cast("lotus", { targets: "brute" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lotus"]);
    expect(game.p1.can("cast", "flourish")).toBe(false);
    const other = await board().build();
    await other.p1.cast("flourish", { targets: "brute" });
    expect(other.p1.can("cast", "lotus")).toBe(true);
  });

  test("reverse order works too in this scenario: Lotus Trap first and RESOLVED, then Flourish from the Open State — still 6, because the doubling lasts 'this turn'", async () => {
    const game = await board().build();
    await game.p1.cast("lotus", { targets: "brute" });
    await game.settle();
    expect(doubled(game)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("flourish", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(6);
  });

  test("control: Flourish alone deals exactly 3", async () => {
    const game = await board().build();
    await game.p1.cast("flourish", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(3);
  });
});
