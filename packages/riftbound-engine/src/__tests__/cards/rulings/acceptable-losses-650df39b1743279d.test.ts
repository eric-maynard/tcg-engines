/**
 * Ruling 650df39b1743279d — Acceptable Losses (OGN-179 → ogn-179-298) · [Action] · [1] "Each player kills one of their gear."
 *   × Gold (SFD-T03 → sfd-t03) · Gear token "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: If I play Acceptable Losses, can I destroy my only Gold token myself before Acceptable Losses destroys it?
 * A: Yes. Acceptable Losses on the chain closes the state, but Gold's ability is a [Reaction] so it may be activated in
 *    response; killing the token is its COST (paid immediately). LIFO: Gold's ability is done first; when Acceptable
 *    Losses resolves your Gold is gone, and with no other gear your "kill a gear" instruction is simply ignored.
 * Rules: 309.1 / 309.1.a (closed state, Reactions allowed), 401.1 (kill as activation cost), 359.3 (LIFO), 359.3.e.6.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const GOLD = "sfd-t03";
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;

/** P1's turn, exactly [1]. P1's only gear is a ready Gold token; P2 owns one Trinket. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, GOLD, "gold")
    .gear(P2, TRINKET, "trinket")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

async function castLosses(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // open state
  await game.p1.cast("al", { targets: [] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1 })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // closed state now
}

describe("Ruling 650df39b1743279d — crack your own Gold in response to your Acceptable Losses", () => {
  test("with Acceptable Losses on the chain (closed state) Gold's [Reaction] ability is still legal for P1", async () => {
    const game = await board().build();
    await castLosses(game);
    expect(game.p1.can("activate", "gold")).toBe(true);
    // …whereas a non-Reaction play (e.g. ending the turn / a standard move) is not on the menu.
    expect(game.p1.legal().some((o) => o.verb === "endTurn")).toBe(false);
  });

  test("activating it: the token is killed AS THE COST (gone at once) and the [rainbow] is added immediately; Acceptable Losses still waits", async () => {
    const game = await board().build();
    await castLosses(game);
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["al"]);
  });

  test("Acceptable Losses then resolves: P2 loses the Trinket; P1 has no gear so its instruction is ignored (no prompt, nothing else dies) and P1 keeps the rainbow", async () => {
    const game = await board().build();
    await castLosses(game);
    await game.p1.activate("gold");
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
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(p1Asked).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 does nothing, Acceptable Losses kills the Gold token itself and P1 gets no rainbow", async () => {
    const game = await board().build();
    await castLosses(game);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(0);
  });
});
