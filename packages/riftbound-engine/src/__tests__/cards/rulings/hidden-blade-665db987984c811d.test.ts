/**
 * Ruling 665db987984c811d — Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] "[Hidden] Kill a unit at a battlefield. Its controller
 *     draws 2."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to play me from
 *     your trash."
 *
 * Q: I Hidden Blade my OWN Immortal Phoenix at a battlefield. Can that same Phoenix trigger and come back from the trash?
 * A: Yes. The Phoenix is put in the trash during Hidden Blade's resolution; its trash-zone trigger is evaluated right after the spell
 *    finishes — it is in the trash and you killed a unit with a spell (itself) — so it triggers, and you may pay [1][fury] to play it.
 * Rules: 376.2.c.1 (a zone-specific trigger fires if the object enters that zone as the condition is met — the rules' own Phoenix example),
 *        383 (checked after the spell resolves), 359.3 (play from trash paying the stated cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/** P1's turn. P1's Immortal Phoenix stands at P1's bf1; P1 holds Hidden Blade with [3] + order + fury (2+order for the Blade, 1+fury for the Phoenix). Known deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Cast Hidden Blade on P1's own Phoenix and resolve the spell (both pass). */
async function bladeOwnPhoenix(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("cast", "blade")).toBe(true);
  await game.p1.cast("blade", { targets: "phoenix" }); // your own unit at a battlefield is a legal "unit at a battlefield"
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("blade")).toBe("trash");
  return game;
}

/** From the Phoenix offer onward: answer it with `accept`, place in base if asked, pass everything else. Returns whether the offer appeared. */
async function answerPhoenix(game: Game, accept: boolean): Promise<boolean> {
  let sawOffer = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      sawOffer = true;
      await (accept ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => /base/.test(`${o.key} ${o.zone ?? ""} ${o.label}`));
      await game.p1.pick((base ?? d.options[0])?.key as string);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return sawOffer;
}

describe("Ruling 665db987984c811d — the Phoenix killed by your own Hidden Blade triggers itself from the trash", () => {
  test("Hidden Blade resolves: the Phoenix is killed into P1's trash and ITS CONTROLLER (P1) draws 2", async () => {
    const game = await bladeOwnPhoenix();
    expect(game.p1.trash()).toContain("phoenix");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("right after the spell finishes, the Phoenix's trigger is live: a Phoenix item is on the chain / P1 is offered 'pay [1][fury] to play me from your trash'", async () => {
    const game = await bladeOwnPhoenix();
    // Either the trigger item is visible now, or the opt-in question is already being asked.
    const onChain = game.chain().some((c) => c.cardId === "phoenix" && c.triggered);
    const asked = game.decision()?.kind === "yes-no" && game.decision()?.seat === P1;
    expect(onChain || asked).toBe(true);
    expect(game.zoneOf("phoenix")).toBe("trash"); // still in the trash until paid for and played
  });

  test("accepting: [1][fury] is paid and the very same Phoenix is played from the trash onto P1's board (exhausted, 3 Might)", async () => {
    const game = await bladeOwnPhoenix();
    const saw = await answerPhoenix(game, true);
    expect(saw).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("phoenix"));
    expect(game.p1.trash()).not.toContain("phoenix");
    expect(game.state("phoenix")).toMatchObject({ controller: P1, might: 3 });
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // the draw 2 stands
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'you may': declining leaves the Phoenix in the trash and the [1][fury] unspent", async () => {
    const game = await bladeOwnPhoenix();
    const saw = await answerPhoenix(game, false);
    expect(saw).toBe(true);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
