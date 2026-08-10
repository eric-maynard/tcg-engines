/**
 * Ruling bfacea98c486d20f — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *    among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *   (sacrifice: Honest Broker sfd-155-221 · 2 Might · "[Deathknell] — Play a Gold gear token exhausted.")
 *
 * Q: Baited Hook sacrifices a Deathknell unit and finds Karthus — in what order do things resolve, and does Karthus
 *    double the Deathknell?
 * A: Once only. Hook kills the unit → its Deathknell becomes pending (can't enter the chain mid-resolution); Hook goes on
 *    and adds Karthus as a pending play; pending items finalize in order — Deathknell trigger first, Karthus on top —
 *    Karthus resolves at once as a permanent; players then get priority on the Deathknell trigger; it resolves once,
 *    because Karthus was not on the board when the trigger was CREATED.
 * Rules: 383.2.c / 734.1.d.2 (triggers created mid-resolution wait as pending, then finalize in order), 359.2 (a
 *        permanent finalizes straight to the board), 808 (Deathknell), 365 (passives apply only while on board).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const KARTHUS = "ogn-236-298";
const HONEST_BROKER = "sfd-155-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn with exactly [1][order]. Hook + Honest Broker (2) in base; deck top: Karthus then four non-qualifying cards. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", HONEST_BROKER, "broker")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
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
    .script(P1, [(d) => (d.kind === "pick" && /target|kill/i.test(d.prompt) && d.options.some((o) => o.key === "broker") ? "broker" : undefined)]);
}

const goldTokens = (game: Game) => game.p1.gear().filter((g) => game.state(g).name === "Gold");

/** Activate the Hook on Broker and drive to the look-at-5 offer. */
async function hookToLook(): Promise<{ game: Game; look: Pick }> {
  const game = await board().build();
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "broker" });
  } else {
    await game.p1.activate("hook");
  }
  expect(game.state("hook").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { game, look: d as Pick };
}

describe("Ruling bfacea98c486d20f — Baited Hook into Karthus: Deathknell pending first, Karthus lands, the trigger resolves ONCE", () => {
  test("while the Hook is still resolving (at the look-at-5), Broker is already dead but its Deathknell has produced nothing yet — it is pending, not resolved; only Karthus (3 ≤ 2 + 1) is offered", async () => {
    const { game, look } = await hookToLook();
    expect(game.zoneOf("broker")).toBe("trash");
    expect(goldTokens(game)).toEqual([]);
    expect(look.options.map((o) => o.card ?? o.key)).toEqual(["karthus"]);
  });

  test("picking Karthus: he is banished-then-played free and is ON THE BOARD while Broker's single Deathknell trigger still sits on the chain awaiting priority — players may respond to it", async () => {
    const { game } = await hookToLook();
    await game.p1.pick("karthus");
    // Drive any forced follow-ups of the play (destination) but stop at the first priority window.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick("base");
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.zoneOf("karthus")).toBe("base"); // resolved immediately as a permanent
    const pending = game.chain().filter((c) => c.triggered && c.cardId === "broker");
    expect(pending).toHaveLength(1); // exactly one Deathknell item — not doubled
    expect(game.chain().some((c) => c.cardId === "karthus")).toBe(false);
    expect(goldTokens(game)).toEqual([]); // not resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // a priority window on the trigger
  });

  test("everyone passes → the Deathknell resolves exactly once: ONE Gold token; the other four looked-at cards were recycled", async () => {
    const { game } = await hookToLook();
    await game.p1.pick("karthus");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("karthus")).toBe("base");
    expect(goldTokens(game)).toHaveLength(1);
    for (const c of ["five", "junk", "four", "six"]) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with Karthus ALREADY on the board when the Hook kills Broker, the Deathknell is created doubled → TWO Gold", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", HONEST_BROKER, "broker")
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .deck(P1, [{ cardType: "spell", energyCost: 1, name: "Junk" }], ["junk"])
      .build();
    const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    if (field) {
      await game.p1.activate("hook", 0, { targets: "broker" });
    } else {
      await game.p1.activate("hook", 0, { answers: ["broker"] });
    }
    await game.settle({ policy: "first" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.decline();
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("broker")).toBe("trash");
    expect(goldTokens(game)).toHaveLength(2);
  });
});
