/**
 * Ruling effa44173dadc859 — Deathgrip (SFD-163 → sfd-163-221) · [Reaction] · [2] "Kill a friendly unit. If you do, give +[Might]
 *     equal to its Might to another friendly unit this turn. Draw 1."
 *   × Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might "If another unit you control here would die, if it has less Might than me,
 *     instead heal it, exhaust it, and recall it."
 *
 * Q: Deathgrip on a friendly unit at Soraka's location that has less Might than her — what happens?
 * A: Soraka's replacement effect turns the "die" into heal + exhaust + recall, so the unit is never killed. Deathgrip's "If
 *    you do" therefore fails — no Might is given — but the unlinked "Draw 1" still happens.
 * Rules: 366 / 371 (replacement effects), 359.3.e.14.b ("If you do" — Deathgrip is the printed example), 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const SORAKA_WANDERER = "sfd-173-221";

/**
 * P1's turn with exactly [2]. P1 holds bf1 with Soraka (4) and the Victim (`victimMight`, 1 damage marked, ready); a 3-Might
 * Brawler in base is the would-be recipient. Known deck d1, d2.
 */
function board(victimMight: number) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SORAKA_WANDERER, "soraka")
    .unit(P1, "bf1", { might: victimMight, name: "Victim" }, "victim", { damage: 1 })
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .unit(P2, "bf2", { might: 3, name: "Onlooker" }, "onlooker")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Cast Deathgrip on the Victim and resolve; take the Brawler if a recipient is asked. */
async function gripVictim(victimMight: number): Promise<{ game: Game; recipientAsked: boolean }> {
  const game = await board(victimMight).build();
  await game.p1.cast("grip", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["victim"] })]);
  let recipientAsked = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) break;
    if (d.kind === "pick" && d.seat === P1) {
      recipientAsked = true;
      expect(d.options.map((o) => o.card ?? o.key)).toContain("brawler");
      await game.p1.pick("brawler");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("grip")).toBe("trash");
  return { game, recipientAsked };
}

describe("Ruling effa44173dadc859 — Deathgrip into Soraka's protection: saved, no bonus, still draw", () => {
  test("Victim (2 < Soraka's 4): the kill is REPLACED — Victim healed (1 → 0 damage), exhausted, recalled to base, not in the trash", async () => {
    const { game } = await gripVictim(2);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.trash()).not.toContain("victim");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
  });

  test("…'If you do' fails: P1 is never asked for a recipient and nobody gains Might; the unlinked 'Draw 1' still draws d1", async () => {
    const { game, recipientAsked } = await gripVictim(2);
    expect(recipientAsked).toBe(false);
    expect(game.state("brawler")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("soraka")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Victim NOT below Soraka's Might (4 = 4): it really dies, P1 chooses the recipient (Brawler +4 → 7 this turn) and draws 1", async () => {
    const { game, recipientAsked } = await gripVictim(4);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(recipientAsked).toBe(true);
    expect(game.state("brawler")).toMatchObject({ might: 7, mightModifier: 4 });
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
