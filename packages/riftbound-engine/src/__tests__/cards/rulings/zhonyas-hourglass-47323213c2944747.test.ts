/**
 * Ruling 47323213c2944747 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Is Zhonya's Hourglass optional — may I let the unit die to keep the Hourglass for later?
 * A: No. It is not a trigger but a mandatory replacement effect: when a friendly unit would die, the Hourglass is killed
 *    instead, no question asked. The only choice you ever get is WHICH unit to save when several die simultaneously.
 * Rules: 366–371 (replacement effects apply automatically), 373 (single-use replacement vs simultaneous events: its
 *        controller chooses which event it applies to).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
/** Inline "[Action] Deal 3 to a unit." — P1's removal. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline)",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;
/** Inline "[Action] Deal 3 to all enemy units." — simultaneous deaths for the contrast. */
const WAVE = {
  abilities: [{ effect: { amount: 3, target: { controller: "enemy", quantity: "all", type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  name: "Wave (inline)",
  rulesText: "[Action] Deal 3 to all enemy units.",
  timing: "action",
} as const;

/** P1's turn with [3]. P2 has a Pawn (2) and a Knight (3) in base and Zhonya's face up; P2 is scripted STRICT with no answers — any prompt to P2 would throw. */
function board(strictP2: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3 })
    .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 3, name: "Knight" }, "knight")
    .gear(P2, ZHONYAS, "zhonyas")
    .hand(P1, BOLT, "bolt")
    .hand(P1, WAVE, "wave");
  return strictP2 ? s.script(P2, ["pass"], { strict: true }) : s;
}

describe("Ruling 47323213c2944747 — Zhonya's Hourglass is a mandatory replacement, not an optional trigger", () => {
  test("a single friendly unit would die (Bolt on the Pawn): P2 is asked NOTHING — no yes/no, no pick — the Hourglass is killed instead and the Pawn is healed, exhausted and kept (in base)", async () => {
    const game = await board(true).build(); // strict P2 script: only its one priority pass is scripted; any yes/no or pick for P2 would throw
    await game.p1.cast("bolt", { targets: "pawn" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zhonyas")).toBe("trash"); // spent whether P2 likes it or not
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.trash()).toEqual(["zhonyas"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("there is no way to 'save the Hourglass for later': P2 never held a decision between the Bolt resolving and the replacement applying", async () => {
    const game = await board(false).build();
    await game.p1.cast("bolt", { targets: "pawn" });
    await game.p1.passPriority();
    // P2's only decision is ordinary priority on the Bolt — nothing sourced from Zhonya's.
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(d?.kind === "action" ? d.options.map((o) => o.verb).toSorted() : []).toEqual(["concede", "passPriority"]);
    await game.p2.passPriority(); // Bolt resolves → replacement applies inline
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base");
  });

  test("the ONLY choice: when Pawn and Knight would die simultaneously (Wave), P2 — the Hourglass's controller — must pick which one it saves (mandatory pick, no decline); the other dies", async () => {
    const game = await board(false).build();
    await game.p1.cast("wave");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["knight", "pawn"]);
    const declined = await game.p2.try((p) => p.decline());
    expect(declined.ok).toBe(false); // cannot opt out
    await game.p2.pick("knight");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("knight")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
