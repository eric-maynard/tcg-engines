/**
 * Ruling 762273c612fd55bd — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Unit · Body · [5][body] · 6 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) I can be played to a battlefield
 *      where there are enemy units."
 *   × Cursed Sarcophagus (UNL-148 → unl-148-219) · Gear · [4][chaos]
 *     "When you play this, banish all units from your trash. [Exhaust]: Play a unit banished with this. (You must pay its costs.)"
 *
 * Q: Rengar is in my trash and I play Cursed Sarcophagus. Can I later use the Sarcophagus to play Rengar with Ambush on my
 *    OPPONENT's turn, or only on my own turn?
 * A: Only on your turn. The Sarcophagus's "[Exhaust]: Play…" is an activated ability, usable only on its controller's turn in
 *    an Open State; Rengar's Ambush (Reaction speed from hand) is irrelevant because the gear is the source of the play.
 * Rules: 381 (activated abilities: your turn, Open State), 806 (Ambush), 346 (play destinations) + Rengar's own text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const CURSED_SARCOPHAGUS = "unl-148-219";

/**
 * P1's turn with exactly [4][chaos]. Rengar #1 is in P1's TRASH; a second Rengar is in HAND (control: Ambush from hand).
 * P1 holds bf1 with a Holder (3); P2 holds bf2 with a Camper (2) and has a Raider (4) in base to attack with next turn.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Camper" }, "camper")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .trash(P1, RENGAR, "rengar")
    .hand(P1, CURSED_SARCOPHAGUS, "sarc")
    .hand(P1, RENGAR, "handRengar");
}

/** Play the Sarcophagus and let its play trigger banish the trash Rengar. */
async function sarcophagusDown(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("sarc");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarc", controller: P1, triggered: true })]);
  await game.settle();
  return game;
}

describe("Ruling 762273c612fd55bd — Cursed Sarcophagus can only replay Rengar on your own turn; Ambush doesn't change that", () => {
  test("setup: playing the Sarcophagus banishes Rengar from the trash 'with this' (linked to the gear)", async () => {
    const game = await sarcophagusDown();
    expect(game.zoneOf("sarc")).toBe("base");
    expect(game.zoneOf("rengar")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("sarc").meta.exiledByThis).toEqual(["rengar"]);
  });

  test("opponent's turn, Open State: even with [5][body] floating, the Sarcophagus's [Exhaust] ability is NOT available to P1", async () => {
    const game = await sarcophagusDown();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p1.do("addResources", { energy: 5, power: { body: 1 } });
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.can("activate", "sarc")).toBe(false);
    expect(game.p1.legal()).toEqual([]); // P1 has no action at all in P2's open main phase
    expect(game.zoneOf("rengar")).toBe("banishment");
  });

  test("opponent's turn, showdown at bf1 where P1 has units and P1 holds Focus: Rengar FROM HAND is Ambush-playable there, but the Sarcophagus still cannot be activated — the gear, not Rengar, is the source of that play", async () => {
    const game = await sarcophagusDown();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 5, power: { body: 1 } });
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Control: Ambush works from hand in exactly this window …
    expect(game.p1.can("play", "handRengar")).toBe(true);
    expect(game.p1.option("playUnit", "handRengar")?.fields.find((f) => f.name === "location")?.options.map(String)).toEqual(["battlefield-bf1"]);
    // … but the activated ability is off on the opponent's turn.
    expect(game.p1.can("activate", "sarc")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "sarc")).toBe(false);
    expect(game.zoneOf("rengar")).toBe("banishment");
  });

  test("P1's own next turn (Open State): the Sarcophagus's [Exhaust] ability IS available and goes on the chain as an activated ability", async () => {
    const game = await sarcophagusDown();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 5, power: { body: 1 } });
    expect(game.p1.can("activate", "sarc")).toBe(true);
    await game.p1.activate("sarc");
    expect(game.state("sarc").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarc", controller: P1, triggered: false })]);
  });

  // Ruling: the Sarcophagus plays "a unit banished with this" — Rengar, named as the ability is activated — with P1 paying
  // his full [5][body]; per Rengar's own text a battlefield with enemy units (bf2) is a legal destination.
  test("ruling 762273c612fd55bd — the Sarcophagus names Rengar (banished with it) at activation and plays him for [5][body]; bf2 (enemy units) is offered", async () => {
    const game = await sarcophagusDown();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 5, power: { body: 1 } });
    const before = game.p1.resources();
    await game.p1.activate("sarc");
    // The unit banished with the Sarcophagus is a TARGET named as the ability is activated (355.5 / 402.2).
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.card !== undefined)) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["rengar"]);
      await game.p1.pick("rengar");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Destination: bf2 (enemy units there) must be offered alongside base / bf1.
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key) : []).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("battlefield-bf2");
    // "You must pay its costs": exactly [5][body] left the pool.
    expect(game.p1.energy()).toBe(before.energy - 5);
    expect(game.p1.power("body")).toBe((before.power.body ?? 0) - 1);
    expect(game.violations()).toEqual([]);
  });
});
