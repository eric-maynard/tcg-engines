/**
 * Ruling f2b8ae06f691b552 — Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · [5][body] · 6 Might · [Ambush], "I can be played to a battlefield
 *   where there are enemy units."
 *
 * Q: The opponent Charms my unit; I react by Ambushing Rengar, who enters play immediately. Does my opponent then still
 *    get a window to react to their own Charm before it resolves?
 * A: Yes. Rengar is a permanent: once finalized he leaves the chain and enters the board; then the controller of the
 *    next chain item (the Charm's caster) gets priority and may add a Reaction or pass; only after both players pass in
 *    succession does Charm resolve.
 * Rules: 359.1/359.2(.c) (permanents leave the chain and enter play), 340 (priority after an item is dealt with),
 *        822.1.b (Ambush = Reaction timing to a battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RENGAR = "unl-120-219";
/** A cheap [Reaction] spell for P2 so "P2 may still react to its own Charm" is observable. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Ping",
  rulesText: "[Reaction]\nDeal 1 to a unit.",
  timing: "reaction",
} as const;

/** P2's turn. P1 controls bf1 with a 2-Might Scout; bf2 empty. P1 holds Rengar with [5][body]; P2 holds Charm + Ping. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar")
    .hand(P2, CHARM, "charm")
    .hand(P2, PING, "ping");
}

/** P2 Charms the Scout toward bf2 and passes; P1 holds priority with Charm alone on the chain. */
async function charmTheScout(game: Game): Promise<void> {
  await game.p2.cast("charm", { targets: "scout" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { pendingChoiceType: "choose-destination" } });
    await game.p2.pick("battlefield-bf2");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling f2b8ae06f691b552 — after an Ambushed Rengar enters in response to Charm, Charm's caster gets priority again", () => {
  test("P1 may Ambush Rengar to bf1 in the Closed state; he is finalized, leaves the chain and is ON THE BOARD (exhausted) while Charm is still waiting", async () => {
    const game = await board().build();
    await charmTheScout(game);
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.state("rengar").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]); // Rengar is not a chain item; Charm unresolved
    expect(game.locationOf("scout")).toBe("bf1");
  });

  test("then the controller of the next chain item — P2, Charm's caster — holds priority and may add a Reaction to the chain on top of its own Charm", async () => {
    const game = await board().build();
    await charmTheScout(game);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ping")).toBe(true);
    expect(game.p2.can("passPriority")).toBe(true);
    await game.p2.cast("ping", { targets: "rengar" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "ping"]);
    await game.settle();
    expect(game.state("rengar")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("if P2 passes instead, P1 receives priority next; only after both pass in succession does Charm resolve and move the Scout", async () => {
    const game = await board().build();
    await charmTheScout(game);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.zoneOf("charm")).toBe("chain"); // one pass is not enough
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.p1.units("bf1")).toEqual(["rengar"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The Scout's arrival at empty bf2 stages a non-combat showdown (P1 has Focus); pass it through.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    await game.settle();
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
