/**
 * Ruling 68263df7c15cff6e — Deathgrip (SFD-163 → sfd-163-221) · Reaction · [2] "Kill a friendly unit. If you do, give +[Might] equal to its Might
 *     to another friendly unit this turn. Draw 1."
 *   × Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might "I must be assigned combat damage last. If another unit you control here would die,
 *     if it has less Might than me, instead heal it, exhaust it, and recall it."
 *
 * Q: Deathgrip kills my unit at the same battlefield as Soraka, and it has less Might than her — does it recall to base exhausted?
 * A: Yes. Soraka's ability is a replacement effect on the "die" event: the unit is healed, exhausted and recalled instead of dying. Because it
 *    did not actually die, Deathgrip's "If you do" bonus does not happen; the unlinked "Draw 1" still does.
 * Rules: 366 / 371 (replacement effects), 359.3.e.14.b ("If you do"), 359.3.e.5 (independent instructions), 453 (Recall is not a move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const SORAKA = "sfd-173-221";

/**
 * P1's turn with [2]. P1 controls bf1 where Soraka (4) stands with the Victim (`victimMight`, carrying 1 damage, ready); a 3-Might Brawler
 * waits in base as the would-be "+Might" recipient. Known deck top d1, d2.
 */
function board(victimMight: number) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SORAKA, "soraka")
    .unit(P1, "bf1", { might: victimMight, name: "Victim" }, "victim", { damage: 1 })
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Deathgrip the Victim and drive to P1's open main phase, giving any offered bonus to the Brawler. Returns whether a recipient was asked. */
async function gripVictim(game: Game): Promise<boolean> {
  await game.p1.cast("grip", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  let asked = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "brawler")) {
      asked = true;
      await game.p1.pick("brawler");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else {
      break;
    }
  }
  await game.settle();
  return asked;
}

describe("Ruling 68263df7c15cff6e — Soraka replaces the Deathgrip death: recalled exhausted, no Might bonus, still Draw 1", () => {
  test("Victim (2 < Soraka's 4) at Soraka's battlefield: Deathgrip's kill is replaced — the Victim is HEALED (0 damage), EXHAUSTED and RECALLED to base; it never touches the trash", async () => {
    const game = await board(2).build();
    expect(game.state("victim")).toMatchObject({ damage: 1, isReady: true, location: "bf1" });
    await gripVictim(game);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.trash()).not.toContain("victim");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base", might: 2 });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1"); // Soraka herself is unaffected (no cost, not a chain item)
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("…so 'If you do' fails: no recipient is asked for and the Brawler gets NO Might — but P1 still draws exactly 1 (d1)", async () => {
    const game = await board(2).build();
    const asked = await gripVictim(game);
    expect(asked).toBe(false);
    expect(game.state("brawler")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("victim").mightModifier).toBe(0);
    expect(game.state("soraka").mightModifier).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a 5-Might Victim is NOT below Soraka's 4: no replacement, it dies to Deathgrip, the Brawler gets +5 this turn (→ 8) and P1 draws 1", async () => {
    const game = await board(5).build();
    await gripVictim(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("brawler").might).toBe(8);
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.advanceTurn();
    expect(game.state("brawler").might).toBe(3); // "this turn"
  });

  test("contrast — 'here' matters: the same 2-Might Victim standing in BASE (not at Soraka's battlefield) simply dies; Brawler +2 (→ 5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SORAKA, "soraka")
      .unit(P1, "base", { might: 2, name: "Victim" }, "victim")
      .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
      .hand(P1, DEATHGRIP, "grip")
      .build();
    await gripVictim(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("brawler").might).toBe(5);
  });
});
