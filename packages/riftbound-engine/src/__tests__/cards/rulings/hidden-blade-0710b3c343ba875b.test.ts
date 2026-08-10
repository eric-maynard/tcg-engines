/**
 * Ruling 0710b3c343ba875b — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · 2+[order] · [Hidden] [Action]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (OGN-269 → ogn-269-298) · Legend (Sett) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead. …"
 *
 * Q: Is Sett's (The Boss) ability a triggered ability that goes on the chain, or a replacement effect applied during
 *    resolution?
 * A: A replacement effect ("When" should read "If"). It never goes on the chain: while the killing effect resolves, the
 *    unit's controller immediately chooses recall-or-die; opponents cannot respond. Nuances: a recalled unit never died, so
 *    Deathknell doesn't trigger; the unit keeps a legal controller so Hidden Blade's "its controller draws 2" still
 *    resolves; a recall is not a play (no "when you play me").
 * Rules: 370–371.2 (optional replacement decided as the event would occur), 359.3.e.14.b, 458 (recall is not a move/play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";

/** 3-Might unit: "When you play me, draw 1. [Deathknell] — Draw 1." — both extra draws would be visible in P1's hand. */
const PIT_FIGHTER = {
  abilities: [
    { effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  keywords: ["Deathknell"],
  might: 3,
  name: "Test Pit Fighter",
  rulesText: "When you play me, draw 1.\n[Deathknell] — Draw 1.",
} as const;

/**
 * P2's turn. P1: The Boss (ready), 1 spare rainbow, a BUFFED Pit Fighter holding bf1 (+ an Anchor so bf1 stays P1's),
 * empty hand, known deck d1..d4. P2: Hidden Blade + 2 + [order], and a Reaction in hand to prove it never gets a window.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { rainbow: 1 } })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PIT_FIGHTER, "pit", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"])
    .hand(P2, HIDDEN_BLADE, "blade");
}

/** P2 Blades the Pit Fighter; both pass; the kill instruction hits the Boss's replacement → P1's yes/no. */
async function bladeThePit(): Promise<Game> {
  const game = await board().build();
  expect(game.state("pit")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p2.cast("blade", { targets: "pit" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 0710b3c343ba875b — The Boss is a replacement effect decided mid-resolution, not a chain trigger", () => {
  test("as Hidden Blade's kill executes, P1 (the unit's controller) is asked at once — a REPLACEMENT prompt, with Hidden Blade still the only chain item (no Sett item added)", async () => {
    const game = await bladeThePit();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(d?.kind === "yes-no" ? d.timing : undefined).not.toBe("FIN"); // not a trigger being finalized
    // Hidden Blade is mid-resolution (the engine has already lifted it off the chain); crucially NO Sett item exists.
    expect(game.chain().filter((c) => c.cardId !== "blade")).toEqual([]);
    expect(game.zoneOf("blade")).not.toBe("hand");
    expect(game.zoneOf("pit")).toBe("battlefield-bf1"); // nothing has happened to it yet
    expect(game.p1.hand()).toEqual([]);
  });

  test("YES: the Pit Fighter is healed, exhausted, un-buffed and RECALLED instead of dying — no chain item is ever created for it and P2 gets no window to respond before it happens", async () => {
    const game = await bladeThePit();
    await game.p1.yes();
    // Immediately after the choice: unit already in base, no Boss item, and the next decision is not P2 responding to Sett.
    expect(game.zoneOf("pit")).toBe("base");
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    const d = game.decision();
    expect(d?.kind === "action" && d.context === "chain" && d.seat === P2 && game.chain().length > 0).toBe(false);
    await game.settle();
    expect(game.state("pit")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, zone: "base" });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuances on YES: the unit never died ⇒ NO Deathknell draw; recall is not a play ⇒ NO 'when you play me' draw; but 'its controller draws 2' still resolves ⇒ P1's hand is exactly d1, d2", async () => {
    const game = await bladeThePit();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.trash()).not.toContain("pit");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p2.hand()).toEqual([]); // "its controller" = P1, not the caster
  });

  test("contrast — NO: the Pit Fighter dies; P1 draws Hidden Blade's 2 AND the Deathknell 1 (three cards); Boss stays ready, rainbow unspent", async () => {
    const game = await bladeThePit();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("pit")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2", "d3"]);
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
