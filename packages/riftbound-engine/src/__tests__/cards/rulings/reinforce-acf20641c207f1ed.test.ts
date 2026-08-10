/**
 * Ruling acf20641c207f1ed — Reinforce (OGN-062 → ogn-062-298) · [5] · "Look at the top 5 cards of your Main Deck. You may banish a unit
 *     from among them, then play it, reducing its cost by [5]. Recycle the remaining cards."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · [5][calm] · 5 Might · [Tank] · "When you play me to a battlefield, you may move an
 *     enemy unit to here. …"
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might · "As you look at or reveal me from the top of your deck, you may banish
 *     me. If you do, you may play me for [rainbow]."
 *
 * Q: Reinforce finds both Blitzcrank and Nocturne — is Nocturne played before Blitzcrank's pull, so that Nocturne is in the combat?
 * A: Yes. Nocturne is banished and becomes a pending play as he is looked at; then Blitzcrank is chosen (pending); the rest is
 *    recycled and Reinforce finishes; pending items finalize oldest-first — Nocturne resolves to the battlefield, then Blitzcrank,
 *    whose play trigger goes on the chain (reaction window) and pulls the enemy: combat with Nocturne AND Blitzcrank there.
 * Rules: 337.1 / 359.3.b (pending items finalized in order added), 356.1.a (Nocturne's [rainbow] alternative cost),
 *        356.4 (cost reduction), 383 (play trigger), 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const BLITZCRANK = "ogn-067-298";
const NOCTURNE = "ogn-194-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn with exactly [5] + two Power (one for Nocturne's [rainbow], one for Blitzcrank's [calm]; his [5] is reduced away). P1 controls bf1 via a
 * Holder (2); P2's Foe (3) sits at P2's bf2. Deck top→: Nocturne, Blitzcrank, three fillers.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .deck(P1, [NOCTURNE, BLITZCRANK, FILLER, FILLER, FILLER], ["noc", "blitz", "f1", "f2", "f3"])
    .hand(P1, REINFORCE, "reinforce");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** Cast Reinforce, let it start resolving, say yes to Nocturne (banish, then play); stop at the "pick a revealed card to play" offer. */
async function reinforceToPick(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("reinforce");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 4 && game.decision()?.kind === "yes-no"; i++) {
    expect(game.decision()).toMatchObject({ seat: P1, source: { cardId: "noc" } });
    await game.p1.yes();
  }
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

/** …pick Blitzcrank, send Nocturne then Blitzcrank to bf1, accept Blitzcrank's pull; stop with the pull trigger on the chain. */
async function bothToBf1PullPending(): Promise<Game> {
  const game = await reinforceToPick();
  await game.p1.pick("blitz");
  // Oldest pending item first: NOCTURNE's destination is asked before Blitzcrank's.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "noc" } });
  await game.p1.pick("battlefield-bf1");
  expect(game.zoneOf("noc")).toBe("battlefield-bf1"); // Nocturne has resolved to the battlefield …
  expect(game.zoneOf("blitz")).not.toBe("battlefield-bf1"); // … before Blitzcrank is even placed
  expect(game.p1.power()).toBe(1); // Nocturne's [rainbow] paid at his finalization
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "blitz" } });
  await game.p1.pick("battlefield-bf1");
  expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
  expect(game.p1.energy()).toBe(0); // 5 − 5 = 0 energy …
  expect(game.p1.power()).toBe(0); // … but Blitzcrank's [calm] pip is still paid
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "blitz" } });
  await game.p1.yes(); // "you may move an enemy unit to here" — the lone Foe
  return game;
}

describe("Ruling acf20641c207f1ed — Reinforce: Nocturne lands before Blitzcrank, so he is in the fight Blitzcrank's pull starts", () => {
  test("as Reinforce resolves, Nocturne is handled FIRST (banished → a pending play on the chain) and only then is P1 offered the remaining cards — Blitzcrank among them, Nocturne not", async () => {
    const game = await reinforceToPick();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("blitz");
    expect(offered).not.toContain("noc");
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.chain().map((c) => c.cardId)).toEqual(["noc"]); // pending, not yet finalized/paid
    expect(game.p1.power()).toBe(2);
  });

  test("choosing Blitzcrank: both plays are pending [Nocturne, Blitzcrank]; the fillers are recycled and Reinforce is done; Nocturne finalizes and resolves to bf1 first, then Blitzcrank, whose play trigger goes on the chain with a reaction window for both players", async () => {
    const game = await reinforceToPick();
    await game.p1.pick("blitz");
    expect(game.chain().map((c) => c.cardId)).toEqual(["noc", "blitz"]);
    expect(game.zoneOf("reinforce")).toBe("trash");
    expect(game.p1.deck().slice(-3).sort()).toEqual(["f1", "f2", "f3"]);
    await game.p1.pick("battlefield-bf1"); // Nocturne
    await game.p1.pick("battlefield-bf1"); // Blitzcrank
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
    expect(game.locationOf("foe")).toBe("bf2"); // not pulled yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may react before the pull resolves
  });

  test("the pull resolves: Foe is moved to bf1 and a COMBAT showdown opens there with Foe attacking and Nocturne, Blitzcrank and the Holder all defending", async () => {
    const game = await bothToBf1PullPending();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("foe")).toBe("bf1");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("foe").combatRole).toBe("attacker");
    expect(game.state("noc").combatRole).toBe("defender"); // Nocturne participates
    expect(game.state("blitz").combatRole).toBe("defender");
    expect(game.state("holder").combatRole).toBe("defender");
  });

  test("outcome: the 3-Might Foe dies into 2 + 4 + 5; its 3 goes to the [Tank] Blitzcrank first (survives); P1 keeps bf1 with all three units", async () => {
    const game = await bothToBf1PullPending();
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["blitz", "holder", "noc"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
