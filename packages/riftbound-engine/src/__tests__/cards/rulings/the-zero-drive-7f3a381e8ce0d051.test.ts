/**
 * Ruling 7f3a381e8ce0d051 — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · Mind · [3]
 *     "[Equip] [1][mind] … [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *      (Use only if unattached.) [Deathknell] — Banish me."
 *
 * Q: If a Recruit token is banished with the Zero Drive, will the Drive's later ability replay it?
 * A: No. A token ceases to exist the instant it enters any Non-Board zone, banishment included, so by the time the
 *    [3][mind] ability is used there is no token in banishment to find or play. Real cards do come back.
 * Rules: 183.1 / 186.1 (tokens cannot exist outside the board), 427.1 (banish → banishment), 394–397 ("banished with
 *        this" is a linked set).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";

/** Inline [1] action spell: kill a unit — to set off the wearer's granted Deathknell. */
const SLAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Slay",
  timing: "action",
};

const RECRUIT_TOKEN = { cardType: "unit", energyCost: 0, isToken: true, might: 1, name: "Recruit" } as const;
const REAL_UNIT = { cardType: "unit", energyCost: 4, might: 4, name: "Real Soldier" } as const;

/** P1's turn with [4][mind]: `wearer` in base carries the Zero Drive; a Slay in hand kills it. */
function board(wearer: typeof RECRUIT_TOKEN | typeof REAL_UNIT) {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .unit(P1, "base", wearer, "wearer", { equippedWith: ["zd"] } as Record<string, unknown>)
    .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, SLAY, "slay");
}

/** Kill the wearer; its granted "[Deathknell] — Banish me" then banishes it with the Drive. */
async function killWearer(game: Game): Promise<void> {
  await game.p1.cast("slay", { targets: "wearer" });
  await game.settle({ policy: "first" });
}

describe("Ruling 7f3a381e8ce0d051 — a Recruit token banished with the Zero Drive cannot be replayed", () => {
  test("the token wearer dies and is banished by the Drive's Deathknell — and immediately ceases to exist rather than waiting in banishment", async () => {
    const game = await board(RECRUIT_TOKEN).build();
    expect(game.state("wearer").isToken).toBe(true);
    await killWearer(game);
    expect(game.zoneOf("wearer")).toBe("gone");
    expect(game.has("wearer")).toBe(false);
    expect(game.p1.banishment()).not.toContain("wearer");
    expect(game.p1.trash()).not.toContain("wearer");
  });

  test("ruling 7f3a381e8ce0d051 — activating [3][mind], Banish this afterwards plays nothing back: there is no token to find", async () => {
    const game = await board(RECRUIT_TOKEN).build();
    await killWearer(game);
    expect(game.state("zd").attachedTo).toBeUndefined(); // unattached again, so the ability is usable
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle({ policy: "first" });
    expect(game.has("wearer")).toBe(false);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.zoneOf("zd")).toBe("banishment"); // "Banish this" was the cost, spent for nothing
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a REAL card wearing the Drive does wait in banishment and IS played back by the same ability", async () => {
    const game = await board(REAL_UNIT).build();
    await killWearer(game);
    expect(game.zoneOf("wearer")).toBe("banishment");
    await game.p1.activate("zd");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("wearer")).toBe("base");
    expect(game.p1.energy()).toBe(0); // played "ignoring their costs" — nothing extra paid
    expect(game.violations()).toEqual([]);
  });
});
