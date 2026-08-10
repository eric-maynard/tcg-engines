/**
 * Ruling b1f7e66eb899c007 — Baited Hook (OGN-242 → ogn-242-298) × Vanguard Captain (OGN-218 → ogn-218-298)
 *   Hook: "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *   from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   Vanguard Captain: "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *   "Back Alley Barkeep" = Glasc Mixologist (sfd-165-221): "[Deathknell] — You may play a unit with cost no more than
 *   [3] and no more than [rainbow] from your trash, ignoring its cost."
 *
 * Q: Hook kills the Deathknell unit; is the unit Hook plays "played" before the Deathknell resolves, so that the
 *    Vanguard Captain the Deathknell then plays has Legion active?
 * A: Yes. Hook resolves fully (kill → Deathknell goes pending; look → the found unit is played immediately). Only then
 *    does the Deathknell resolve and play the Captain — a card was already played this turn, so Legion is on:
 *    final board = Hook's unit + Vanguard Captain + 2 Recruits.
 * Rules: 734.1.d.2 / 383.2.c (Deathknell created mid-resolution waits as pending), 354.2 (a unit played off a
 *        resolving effect is played immediately), 724 (Legion: another card played this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const MIXOLOGIST = "sfd-165-221"; // 5 Might, Deathknell: play a ≤[3]/≤[rainbow] unit from trash free
const VANGUARD_CAPTAIN = "ogn-218-298"; // 3 cost, Legion → two Recruits
const SKULKER = "ogn-175-298"; // vanilla 3 Might — the unit Hook finds
const VENGEANCE = "ogn-229-298"; // "Kill a unit." — for the contrast case
const JUNK = { cardType: "spell", energyCost: 1, name: "Junk" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", MIXOLOGIST, "barkeep")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .trash(P1, VANGUARD_CAPTAIN, "captain")
    .deck(P1, [SKULKER, JUNK, JUNK, JUNK, JUNK, JUNK], ["skulker", "j1", "j2", "j3", "j4", "j5"]);
}

const recruits = (game: Game) => game.p1.units().filter((u) => game.state(u).name === "Recruit");

/** Drive prompts: pass priority, take the named picks, say yes to "you may". Stops at the open main phase. */
async function drive(game: Game, onDecision?: (d: Decision) => void): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    onDecision?.(d);
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const want = d.options.find((o) => o.key === "skulker" || o.key === "captain") ?? d.options[0];
      await game.seat(d.seat).pick(want?.key as string);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      return;
    }
  }
}

describe("Ruling b1f7e66eb899c007 — Hook's unit is played before the killed unit's Deathknell resolves, so Legion is on for the Captain it plays", () => {
  test("Hook kills the Barkeep: its Deathknell waits (pending) while Hook keeps resolving — the look-at-5 offer comes first, with the Captain still in the trash and nothing played yet", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { targets: "barkeep" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Hook is resolving: Barkeep died, the look offer is up.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(game.zoneOf("barkeep")).toBe("trash");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("skulker"); // 3 ≤ 5+1
    // Deathknell has triggered but not resolved: Captain untouched, no Recruits, Skulker still on top of the deck.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "barkeep", triggered: true })]);
    expect(game.zoneOf("captain")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("mainDeck");
    expect(recruits(game)).toEqual([]);
  });

  test("the Skulker off Hook is on the board BEFORE the Deathknell resolves; the Deathknell then plays Vanguard Captain and Legion fires: final board = Skulker + Captain + 2 Recruits", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { targets: "barkeep" });
    let skulkerDownWhenCaptainOffered: boolean | undefined;
    await drive(game, (d) => {
      if (d.kind === "pick" && d.options.some((o) => o.key === "captain")) {
        // The Deathknell is resolving now — Hook's unit has already been played.
        skulkerDownWhenCaptainOffered = game.zoneOf("skulker") === "base";
        expect(game.zoneOf("hook")).toBe("base");
        expect(game.chain().some((c) => c.cardId === "hook")).toBe(false); // Hook fully resolved
      }
    });
    expect(skulkerDownWhenCaptainOffered).toBe(true);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("captain")).toBe("base");
    expect(recruits(game)).toHaveLength(2);
    for (const r of recruits(game)) {
      expect(game.state(r).might).toBe(1);
      expect(game.locationOf(r)).toBe("base"); // "here" = where the Captain was played
    }
    expect(game.p1.units().sort()).toEqual(["captain", "skulker", ...recruits(game)].sort());
    // everything was free
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    // the rest of the looked-at cards were recycled
    for (const j of ["j1", "j2", "j3", "j4"]) {
      expect(game.zoneOf(j)).toBe("mainDeck");
    }
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the Barkeep dies with NO other card played this turn (P2's Vengeance on P2's turn): the Deathknell still plays the Captain, but Legion is off → no Recruits", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", MIXOLOGIST, "barkeep")
      .trash(P1, VANGUARD_CAPTAIN, "captain")
      .hand(P2, VENGEANCE, "vengeance")
      .build();
    await game.p2.cast("vengeance", { targets: "barkeep" });
    await drive(game);
    expect(game.zoneOf("barkeep")).toBe("trash");
    expect(game.zoneOf("captain")).toBe("base");
    expect(recruits(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
