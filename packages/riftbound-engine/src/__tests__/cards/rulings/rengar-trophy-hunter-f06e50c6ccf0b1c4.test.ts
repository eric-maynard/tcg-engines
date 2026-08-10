/**
 * Ruling f06e50c6ccf0b1c4 — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Unit · Body · 5 · 6 Might
 *     "[Ambush] I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main Deck until
 *     you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: If Aurora's end-of-turn trigger reveals Rengar, Trophy Hunter, can he be played to an enemy-occupied battlefield?
 * A: Yes. Aurora instructs a normal "play"; Rengar's own permission makes a battlefield with enemy units (and none of yours) a
 *    legal destination, so it is offered and may be chosen. Arriving there stages a combat with Rengar attacking.
 * Rules: 349/419 (an effect "plays" a card through the play process), 822.3.a (other permissions can enable a location),
 *        442.1.a / 464 (arrival at an enemy battlefield → contested → combat), 317 (inside the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR_TROPHY_HUNTER = "unl-120-219";
const DAZZLING_AURORA = "ogn-160-298";
const CLEAVE = "ogn-004-298"; // a spell on top (revealed, then recycled)
const SKULKER = "ogn-175-298";

/**
 * P1's turn about to end. Aurora in P1's base; deck: Cleave, Rengar, Skulker. P2 holds bf1 with Holder (3) — NO P1 unit there.
 * P1 holds bf2 with Mine (2).
 */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .deck(P1, [CLEAVE, RENGAR_TROPHY_HUNTER, SKULKER], ["s1", "rengar", "later"]);
}

/** End P1's turn; pass priority on Aurora's trigger until its free play of Rengar asks for a destination. */
async function toRengarDestination(): Promise<{ game: Game; d: Decision | null }> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return { d, game };
  }
  return { d: game.decision(), game };
}

describe("Ruling f06e50c6ccf0b1c4 — Aurora may play the revealed Rengar, Trophy Hunter straight into an enemy-occupied battlefield", () => {
  test("Aurora reveals Cleave (recycled) then Rengar; the play's destination prompt to P1 OFFERS enemy-occupied bf1 (where P1 has no unit) alongside base and P1's bf2", async () => {
    const { d, game } = await toRengarDestination();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "rengar" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    expect(game.p1.units("bf1")).toEqual([]); // no friendly unit there — Rengar's own permission is what makes bf1 legal
    expect(game.p1.deck().at(-1)).toBe("s1"); // the revealed spell was recycled
    expect(game.p1.energy()).toBe(0); // ignoring its cost
  });

  test("choosing bf1: Rengar is played there for free during P1's Ending Phase; bf1 becomes contested and a COMBAT opens with Rengar the attacker and Holder the defender", async () => {
    const { game } = await toRengarDestination();
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
  });

  test("the combat plays out inside that end of turn: Rengar (6) kills Holder (3), conquers bf1 for a point, and only then does P2's turn begin", async () => {
    const { game } = await toRengarDestination();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.deck()[0]).toBe("later"); // Aurora did not trigger a second time
    expect(game.violations()).toEqual([]);
  });
});
