/**
 * Ruling a9f132bc03c6d48a — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · [3][mind]
 *     "[Equip] [1][mind] … [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *      (Use only if unattached.) [Deathknell] — Banish me."
 *   × Sprite (OGN-274 → ogn-274-298) · 3-Might [Temporary] unit TOKEN.
 *
 * Q: Can Sprite tokens be banished with the Zero Drive and played again later?
 * A: No. A token can exist only on the board; the instant it would move to any non-board zone — hand, deck,
 *    trash, banishment — it ceases to exist. So a banished Sprite is not sitting in banishment waiting to be
 *    replayed, and the Drive's [3][mind] ability finds nothing of it to bring back. Real cards do come back.
 * Rules: 186.1 (a token ceases to exist as soon as it leaves the board), 427.1 (banish → banishment zone),
 *        394–397 ("banished with this" = the Drive's own linked banishes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const SPRITE = "ogn-274-298";
/** A plain removal spell so a Sprite can be made to leave the board mid-test. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Execute",
  timing: "action",
} as const;
const REAL_RECRUIT = { cardType: "unit", energyCost: 4, might: 4, name: "Real Recruit" } as const;

/** P1's turn with exactly [3][mind]: the Drive sits unattached in base, linked to one Sprite token and one real card. */
function loaded() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .card("zd", { def: ZERO_DRIVE, meta: { exiledByThis: ["sprite", "real"] }, owner: P1, zone: "base" })
    .banishment(P1, SPRITE, "sprite")
    .banishment(P1, REAL_RECRUIT, "real");
}

describe("Ruling a9f132bc03c6d48a — a banished Sprite token has ceased to exist, so the Zero Drive can never replay it", () => {
  test("intermediate fact: a Sprite token that reaches the banishment zone is not there at all — it stopped existing", async () => {
    const game = await loaded().build();
    expect(game.has("sprite")).toBe(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.banishment()).toEqual(["real"]); // only the real card is really banished
  });

  test("ruling: activating [3][mind], Banish this plays back the REAL card only — no Sprite returns to the board", async () => {
    const game = await loaded().build();
    await game.p1.activate("zd");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("zd")).toBe("banishment"); // "Banish this" is a cost
    expect(game.zoneOf("real")).toBe("base");
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.units()).toEqual(["real"]);
    expect(game.violations()).toEqual([]);
  });

  test("the same thing happens live: a Sprite token that dies on the board goes nowhere — it is gone, not in the trash", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", SPRITE, "sprite")
      .hand(P2, EXECUTE, "execute")
      .build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, name: "Sprite" });
    await game.p2.cast("execute", { targets: "sprite" });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.trash()).not.toContain("sprite");
    expect(game.p1.banishment()).not.toContain("sprite");
    expect(game.violations()).toEqual([]);
  });
});
