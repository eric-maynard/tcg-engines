/**
 * Ruling 90d93c0e31abbc12 — Stacked Deck (OGN-183 → ogn-183-298, [Action] [1]: "Look at the top 3 cards of your Main
 *   Deck. Put 1 into your hand and recycle the rest.") × Nocturne, Horrifying (OGN-194 → ogn-194-298: "As you look at
 *   or reveal me from the top of your deck, you may banish me. If you do, you may play me for [rainbow].")
 *   × Ride the Wind (OGN-173 → ogn-173-298) for the "surprise defense" nuance.
 *
 * Q: I play Stacked Deck during a showdown while defending and see Nocturne — may I play him to the contested
 *    battlefield, or must he go to base?
 * A: To the battlefield you are defending, as long as you CONTROL it (you almost always do when defending). In the rare
 *    "surprise defense" (opponent moved to an open battlefield and you Rode the Wind in), you defend without controlling
 *    it, so Nocturne cannot be played there.
 * Rules: 342 (Action timing in showdowns), 401.3 / 140.2 (units are played to your base or a battlefield you control),
 *        188 (control persists while contested).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const NOCTURNE = "ogn-194-298";
const RIDE_THE_WIND = "ogn-173-298";
const SKULKER = "ogn-175-298";

/** Walk Stacked Deck's resolution: banish Nocturne (yes), play him (yes); stop at his destination prompt (or when he has landed). */
async function resolveIntoNocturne(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.acting().pass();
    } else if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && !d.options.some((o) => o.key === "base")) {
      await game.p1.pick(d.options[0]?.key as string); // Stacked Deck's own "put 1 into your hand"
    } else {
      return;
    }
  }
}

describe("Ruling 90d93c0e31abbc12 — Nocturne off a mid-showdown Stacked Deck may be played to the defended battlefield you control", () => {
  test("defending bf1 (P1 controls it): Stacked Deck is playable with Focus; Nocturne is banished, and his play offers 'base' AND 'bf1' — choosing bf1 puts him into the combat as a defender", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "s1", "s2"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sd")).toBe(true); // [Action] — legal in a showdown with Focus
    await game.p1.cast("sd");
    await resolveIntoNocturne(game);
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    const keys = dest?.kind === "pick" ? dest.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    // finish Stacked Deck (put one Skulker in hand, recycle the other)
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]?.key as string);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.locationOf("noc")).toBe("bf1");
    expect(game.state("noc")).toMatchObject({ combatRole: "defender", controller: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("sd")).toBe("trash");
    // and he fights: Raider (4) into Guard 3 + Nocturne 4
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'surprise defense': Raider walks onto the OPEN bf2, P1 Rides the Wind Guard in (P1 defends bf2 but does not control it) — Nocturne off Stacked Deck is then NOT offered bf2 (only base / P1's own bf1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "s1", "s2"])
      .hand(P1, STACKED_DECK, "sd")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p2.move("raider", "bf2"); // open battlefield → showdown, P2 has Focus
    await game.p2.passFocus();
    await game.p1.cast("rtw", { targets: "guard" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    await game.acting().pass();
    await game.acting().pass(); // Ride the Wind resolves
    expect(game.locationOf("guard")).toBe("bf2");
    // P1 now defends bf2 without controlling it
    for (let i = 0; i < 4 && !(game.actingSeat() === P1 && game.p1.can("cast", "sd")); i++) {
      await game.acting().pass();
    }
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf2?.controller ?? null).not.toBe(P1);
    await game.p1.cast("sd");
    await resolveIntoNocturne(game);
    const d = game.decision();
    // Either a destination prompt without bf2, or no prompt at all (base forced) — never bf2.
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "base")) {
      const keys = d.options.map((o) => o.key);
      expect(keys).not.toContain("battlefield-bf2");
      expect(keys).toContain("base");
      await game.p1.pick(keys.includes("battlefield-bf1") ? "battlefield-bf1" : "base");
    }
    for (let i = 0; i < 6; i++) {
      const dd = game.decision();
      if (dd?.kind === "pick" && dd.seat === P1) {
        await game.p1.pick(dd.options[0]?.key as string);
      } else if (dd?.kind === "action" && dd.context === "chain") {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(["base", "bf1"]).toContain(game.locationOf("noc") as string);
    expect(game.locationOf("noc")).not.toBe("bf2");
    expect(game.p1.power("rainbow")).toBe(0); // he WAS played — just not to bf2
  });
});
