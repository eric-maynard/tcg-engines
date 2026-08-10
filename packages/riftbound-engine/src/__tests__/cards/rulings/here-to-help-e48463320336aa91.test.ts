/**
 * Ruling e48463320336aa91 — Here to Help (SFD-111 → sfd-111-221) · Spell · Body · 2 + [body] · [Hidden] [Action]
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Rockfall Path (SFD-216 → sfd-216-221) · Battlefield · "Units can't be played here."
 *
 * Q: Here to Help is played from hidden (at Rockfall Path) while I control no battlefield where units can be played —
 *    what happens?
 * A: It resolves but whiffs: "can't beats can" — Rockfall forbids the play, no other controlled battlefield exists, so no
 *    unit is played (the "may" lets it resolve doing nothing).
 * Rules: 811 (playing from Hidden), 054 ("can't" overrides "can"), 359.3.e.6/128.6 (an impossible optional instruction is skipped).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const ROCKFALL_PATH = "sfd-216-221";
const GRUNT = { cardType: "unit", energyCost: 4, might: 2, name: "Grunt" } as const;

/**
 * Turn 3, P1 active with [5]. P1's ONLY battlefield is `mine` (held by Holder), where Here to Help was hidden earlier;
 * P2 holds bf2. Grunt (cost 4) in P1's hand. `mine` is Rockfall Path (live text) or an inert battlefield.
 */
function board(rockfall: boolean) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5 })
    .battlefield("mine", rockfall ? { controller: P1, def: ROCKFALL_PATH, inert: false } : { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "mine", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .facedown(P1, "mine", HERE_TO_HELP, "help")
    .hand(P1, GRUNT, "grunt");
}

describe("Ruling e48463320336aa91 — Here to Help from hidden at Rockfall Path with no playable battlefield whiffs", () => {
  test("premise: Rockfall Path already forbids playing Grunt there from hand — base is the only offered location", async () => {
    const game = await board(true).build();
    const loc = game.p1.option("playUnit", "grunt")?.fields.find((f) => f.name === "location");
    expect(loc?.options).toEqual(["base"]);
    expect(game.p1.can("reveal", "help")).toBe(true);
  });

  test("revealed at Rockfall Path: Here to Help goes on the chain for [0], resolves, and WHIFFS — no play offer at all, Grunt stays in hand, energy untouched, spell in trash", async () => {
    const game = await board(true).build();
    await game.p1.reveal("help");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "help", controller: P1 })]);
    expect(game.p1.energy()).toBe(5); // played from hidden for [0]
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nothing was asked
    expect(game.zoneOf("help")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.p1.units("mine")).toEqual(["holder"]);
    expect(game.p1.energy()).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same play at an ordinary controlled battlefield DOES offer Grunt (declinable 'may'), and taking it plays Grunt there for 4 − 3 = [1]", async () => {
    const game = await board(false).build();
    await game.p1.reveal("help");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["grunt"]);
    await game.p1.pick("grunt");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("battlefield-mine");
    expect(game.p1.energy()).toBe(4);
    expect(game.zoneOf("help")).toBe("trash");
  });
});
