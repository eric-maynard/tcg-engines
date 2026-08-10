/**
 * Ruling ea26392d62abd009 — Lonely Poro (SFD-036 → sfd-036-221) · 2 Might · "[Deathknell] — If I died alone, draw 1."
 *   × Vilemaw (UNL-060 → unl-060-219) · 8+[calm][calm] · 8 Might · "[Ambush] (You may play me as a [Reaction] to a
 *     battlefield where you have units.) …"
 *   (+ an inline 1-cost "deal 3" spell as the thing that kills the Poro.)
 *
 * Q: Can I react to my Lonely Poro's Deathknell trigger by playing Vilemaw?
 * A: Yes. The Deathknell trigger on the chain makes a Closed State in which Reactions — including an [Ambush] unit —
 *    may be played. Vilemaw enters first; the Deathknell then resolves and, because "alone" was checked at the moment
 *    of death, you still draw 1 — Vilemaw's later arrival doesn't undo it.
 * Rules: 808.1.d.2 (Deathknell), 336–338 (Closed State: Reactions), Ambush (play as a Reaction to a battlefield where
 *        you have units), 359.3.e.13 (look-back: "died alone" is evaluated at the death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const VILEMAW = "unl-060-219";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline: deal 3 to a unit)",
  timing: "action",
} as const;

/**
 * P2's turn. P1: Lonely Poro ALONE at bf1, a Sentry at bf2 (a battlefield where P1 "has units" for Ambush), Vilemaw in
 * hand with exactly 8+[calm][calm], known deck top. P2: Bolt + [1].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 8, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .unit(P1, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["top1", "top2"])
    .hand(P1, VILEMAW, "vilemaw")
    .hand(P2, BOLT, "bolt");
}

/** P2 Bolts the lone Poro; it dies and its Deathknell is on the chain; P1 holds priority. */
async function poroDiesAlone(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("play", "vilemaw")).toBe(false); // opponent's turn, Open State: no Ambush window yet
  await game.p2.cast("bolt", { targets: "poro" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling ea26392d62abd009 — Vilemaw can be Ambushed in response to Lonely Poro's Deathknell; the draw still happens", () => {
  test("1. the Deathknell trigger is on the chain (Closed State) and P1 may now play Vilemaw as a Reaction via [Ambush] — only to bf2, the battlefield where P1 has units", async () => {
    const game = await poroDiesAlone();
    expect(game.p1.can("play", "vilemaw")).toBe(true);
    const to = game.p1.option("playUnit", "vilemaw")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toEqual(["battlefield-bf2"]); // not base, not the now-empty bf1
  });

  test("2. P1 plays Vilemaw (8+[calm][calm]) to bf2: it is on the battlefield BEFORE the Deathknell resolves — the Poro's trigger is still waiting on the chain", async () => {
    const game = await poroDiesAlone();
    await game.p1.play("vilemaw", { to: "bf2" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("vilemaw")).toBe("battlefield-bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn yet
  });

  test("3. the Deathknell then resolves: 'died alone' was fixed at the moment of death, so P1 draws exactly 1 despite Vilemaw's arrival", async () => {
    const game = await poroDiesAlone();
    await game.p1.play("vilemaw", { to: "bf2" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["top1"]);
    expect(game.p1.deck()[0]).toBe("top2");
    expect(game.zoneOf("vilemaw")).toBe("battlefield-bf2");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
