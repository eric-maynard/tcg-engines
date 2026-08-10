/**
 * Ruling 372d83909ebca712 — Acceptable Losses (OGN-179 → ogn-179-298) · Action · Chaos · [1]
 *     "Each player kills one of their gear."
 *   × Gold (SFD-T03 → sfd-t03) · Gear token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: If Acceptable Losses would kill my Gold token, can I still crack the Gold for power in response — or must I then
 *    pick a different gear to kill?
 * A: Yes: play Acceptable Losses (it goes on the chain), then activate Gold's [Reaction] ability in response — killing
 *    Gold is its COST, so it is gone at once and you get the [rainbow]. When Acceptable Losses resolves you choose among
 *    the gear you have THEN: with no other gear the instruction is simply skipped for you (no substitute is demanded);
 *    the spell does not target, everyone chooses at resolution.
 * Rules: 401.1 / 356 (kill-this is a cost, paid on activation), 429 ([Add] abilities resolve immediately), 359.3
 *        (LIFO), 359.3.e.6 / .11 (an instruction that can't be followed is ignored), 355.10.e (no targeting).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const GOLD = "sfd-t03";
const TRINKET = { cardType: "gear", energyCost: 1, name: "Test Trinket" } as const;

/** P1's turn with exactly [1]. P1: a ready Gold token (its only gear unless `extraGear`). P2: one Trinket. */
function board(extraGear = false) {
  const s = scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, GOLD, "gold")
    .gear(P2, TRINKET, "p2trinket")
    .unit(P1, "base", { might: 2, name: "Body" }, "body")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
  return extraGear ? s.gear(P1, TRINKET, "p1trinket") : s;
}

/** P1 plays Acceptable Losses (closed state), then — holding priority — cracks its own Gold in response. */
async function castThenCrackGold(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // open state
  await game.p1.cast("al", { targets: [] }); // no up-front choice: the spell targets nothing, players choose at resolution
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]); // nothing targeted
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // now closed: P1 has priority
  expect(game.p1.can("activate", "gold")).toBe(true);
  await game.p1.activate("gold");
}

describe("Ruling 372d83909ebca712 — cracking your Gold in response to Acceptable Losses: you get the power, and kill nothing else if it was your only gear", () => {
  test("Gold's [Reaction] Add ability is legal in response to your own Acceptable Losses; killing Gold is the COST — it is gone immediately and the [rainbow] is added at once, the spell still waiting on the chain", async () => {
    const game = await board().build();
    await castThenCrackGold(game);
    expect(game.zoneOf("gold")).toBe("gone"); // token killed as a cost → ceased to exist
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["al"]); // [Add] never used the chain
  });

  test("Acceptable Losses then resolves: P2's Trinket dies; P1 — with no gear left — kills nothing, is NOT asked to pick a substitute, and keeps the [rainbow]", async () => {
    const game = await board().build();
    await castThenCrackGold(game);
    let p1Asked = false;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick") {
          p1Asked = true;
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(p1Asked).toBe(false);
    expect(game.zoneOf("p2trinket")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("body")).toBe("base"); // units are not gear
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 DOES have another gear, cracking Gold doesn't dodge the spell: at resolution P1's remaining Trinket is the gear that dies", async () => {
    const game = await board(true).build();
    await castThenCrackGold(game);
    expect(game.p1.gear()).toEqual(["p1trinket"]);
    await game.settle({ policy: "first" }); // a lone legal choice may be auto-taken or asked; either way it must die
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("p1trinket")).toBe("trash");
    expect(game.zoneOf("p2trinket")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("control — not cracking it: Acceptable Losses kills the Gold (P1's only gear) as an EFFECT, so no [rainbow] is produced", async () => {
    const game = await board().build();
    await game.p1.cast("al", { targets: [] }); // no up-front choice: the spell targets nothing, players choose at resolution
    await game.settle();
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("p2trinket")).toBe("trash");
  });
});
