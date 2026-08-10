/**
 * Ruling 33c2d7418355d2df — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *    from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Honest Broker (SFD-155 → sfd-155-221) · 2 Might "[Deathknell] — Play a Gold gear token exhausted."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might "Your [Deathknell] effects trigger an additional time."
 *
 * Q: Baited Hook kills Honest Broker and I play Karthus off the look — how many times does Broker's Deathknell trigger?
 * A: Once. The Deathknell trigger is created when Broker dies (while Hook is still resolving); Karthus only reaches
 *    the board afterwards, so his doubling static was not there when the trigger happened.
 * Rules: 734.1.d.2 (triggers created mid-resolution wait as pending), 383.2.c (triggers evaluated when the event
 *        is processed), Karthus must be on board at trigger time.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const HONEST_BROKER = "sfd-155-221";
const KARTHUS = "ogn-236-298";

type Pick = Extract<Decision, { kind: "pick" }>;

function base() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", HONEST_BROKER, "broker")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .script(P1, [(d) => (d.kind === "pick" && /target|kill/i.test(d.prompt) && d.options.some((o) => o.key === "broker") ? "broker" : undefined)]);
}

/** Activate the Hook killing Broker and drive to the look-at-5 offer. */
async function hookBroker(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "broker" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P1);
  return d as Pick;
}

function goldTokens(game: Game): string[] {
  return game.p1.gear().filter((g) => game.state(g).name === "Gold");
}

describe("Ruling 33c2d7418355d2df — Karthus played off Baited Hook does not double the Deathknell of the unit the Hook killed", () => {
  test("Hook kills Broker (2 Might → ceiling 3): Karthus (3) is offered from the top 5, is played free, and Broker's Deathknell yields exactly ONE Gold", async () => {
    const game = await base()
      .deck(
        P1,
        [
          KARTHUS,
          { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
          { cardType: "spell", energyCost: 1, name: "Junk" },
          { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
          { cardType: "unit", energyCost: 6, might: 6, name: "Six" },
        ],
        ["karthus", "five", "junk", "four", "six"],
      )
      .build();
    expect(game.state("broker").might).toBe(2);
    const d = await hookBroker(game);
    expect(game.zoneOf("broker")).toBe("trash");
    // No Gold yet: the Deathknell is pending behind the still-resolving Hook (734.1.d.2).
    expect(goldTokens(game)).toEqual([]);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["karthus"]); // Four/Five/Six exceed the ceiling (3); Junk is a spell
    await game.p1.pick("karthus");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // played ignoring cost
    expect(goldTokens(game)).toHaveLength(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Karthus ALREADY on the board when the Hook kills Broker: the Deathknell triggers twice → TWO Gold", async () => {
    const game = await base()
      .unit(P1, "base", KARTHUS, "karthus")
      .deck(P1, [{ cardType: "spell", energyCost: 1, name: "Junk" }], ["junk"])
      .build();
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    if (field) {
      await game.p1.activate("hook", 0, { targets: "broker" });
    } else {
      await game.p1.activate("hook");
    }
    await game.settle({ policy: "first" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline();
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("broker")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(goldTokens(game)).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
