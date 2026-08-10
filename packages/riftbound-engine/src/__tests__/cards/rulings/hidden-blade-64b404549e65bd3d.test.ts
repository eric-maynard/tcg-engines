/**
 * Ruling 64b404549e65bd3d — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] [2][order] "Kill a unit at a battlefield.
 *     Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *
 * Q: If I Hidden Blade my OWN unit and then recall it, do I draw 2 and channel 1?
 * A: Hidden Blade never channels anything (not in its text). (1) If the unit is recalled BEFORE Hidden Blade resolves, it is
 *    no longer "a unit at a battlefield": the target is invalid, nothing is killed and — with no "its controller" — nobody
 *    draws. (2) If instead a death REPLACEMENT (Zhonya's) saves it during resolution, the target was valid: the controller
 *    still draws 2.
 * Rules: 355.11 (target legality rechecked at resolution), 359.3.e.14 (dependent "its controller" instruction), 371–372.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
/** Inline 0-cost Reaction: recall a friendly unit (send it to base — not a move). */
const FALL_BACK = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Fall Back",
  timing: "reaction",
} as const;

/** P1's turn. P1 holds bf1 with a 2-Might Pawn; Hidden Blade + Fall Back in hand; exactly [2][order]; known deck; 2 runes channeled. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .runes(P1, "order", 2)
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, FALL_BACK, "fallback")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function bladeOwnPawn(game: Game): Promise<void> {
  const offered = (game.p1.option("cast", "blade")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(offered).toContain("pawn"); // "a unit" — your own is legal
  await game.p1.cast("blade", { targets: "pawn" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["pawn"] })]);
}

describe("Ruling 64b404549e65bd3d — Hidden Blade on your own unit: recall first ⇒ no kill, no draw; Zhonya's ⇒ still draw 2; never a channel", () => {
  test("control: unanswered, Hidden Blade kills the Pawn and ITS CONTROLLER (P1) draws 2 — and no rune is channeled", async () => {
    const game = await board().build();
    const runes = game.p1.runes().length;
    const runeDeck = game.p1.runeDeck().length;
    await bladeOwnPawn(game);
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "fallback"]);
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("(1) recalled in response: Fall Back resolves first (Pawn → base); Hidden Blade then finds its target no longer at a battlefield — nothing is killed and NOBODY draws; no channel either", async () => {
    const game = await board().build();
    const runes = game.p1.runes().length;
    await bladeOwnPawn(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("fallback", { targets: "pawn" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "fallback"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fall Back resolves
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    await game.settle(); // Hidden Blade resolves against an invalid target
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]); // no draw 2
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(2) Zhonya's Hourglass instead: the Pawn WOULD die so the Hourglass is killed in its place — Pawn healed, exhausted, recalled to base — and since the target was valid P1 still draws 2; no channel", async () => {
    const game = await board().gear(P1, ZHONYAS, "zhonyas").build();
    const runes = game.p1.runes().length;
    await bladeOwnPawn(game);
    game.script(P1, [(d) => (d.kind === "yes-no" && d.source?.cardId === "zhonyas" ? true : undefined)]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).not.toContain("pawn");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "fallback"]); // drew 2
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.violations()).toEqual([]);
  });
});
