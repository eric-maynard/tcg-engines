/**
 * Ruling 08bd68c0be5ed209 — Zenith Blade (OGN-262 → ogn-262-298) · Action · Calm/Order · [3][rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Shen, Kinkou (ogn-241-298) · [3][order] · "[Reaction] (Play any time … including to a battlefield you control.) [Shield 2] [Tank]"
 *   × Rune Prison (ogn-050-298) · "[Action] Stun a unit." as the opponent's stun.
 *
 * Q: The opponent moves onto an UNCONTROLLED battlefield; during that showdown I Zenith Blade my unit there. (1) Can I also play Shen
 *    onto that battlefield during the showdown? (2) If the opponent stuns my unit, who retreats when it resolves?
 * A: (1) No — nobody controls the battlefield yet, so it isn't "a battlefield you control". (2) Only the opponent's unit: they contested
 *    it on their turn, so they are the ATTACKER and surviving attackers are recalled; your stunned unit stays, takes the spot and
 *    establishes control at the end of the showdown.
 * Rules: 459.2.b.1 (who applied Contested attacks), 466 (stunned units deal no damage; attackers recalled if defenders remain),
 *        466.5 / 467 (remaining side takes control = conquer), Shen's "battlefield you control", 190.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const SHEN = "ogn-241-298";
const RUNE_PRISON = "ogn-050-298";

/**
 * Turn 3, P2's turn. bf1 open. P2: Scout (3) in base, Rune Prison + [2][calm]. P1: Brawler (3) in base, Zenith Blade and Shen in hand,
 * [6] + 2 rainbow + [order] (Zenith Blade AND Shen both affordable). P1 also holds bf2 with a Holder.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 6, power: { order: 1, rainbow: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, ZENITH_BLADE, "zenith")
    .hand(P1, SHEN, "shen")
    .hand(P2, RUNE_PRISON, "prison");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? d.options[0]!.key);
      continue;
    }
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** P2's Scout walks onto open bf1 (non-combat showdown, P2 attacks); P2 passes Focus; P1 Zenith Blades: stun Scout, Brawler → bf1. */
async function zenithIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "zenith")).toBe(true);
  await game.p1.cast("zenith", { targets: ["scout", "brawler"] });
  await resolveChain(game);
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.zoneOf("zenith")).toBe("trash");
  expect(game.state("scout")).toMatchObject({ isStunned: true, location: "bf1" });
  expect(game.locationOf("brawler")).toBe("bf1");
  return game;
}

describe("Ruling 08bd68c0be5ed209 — Zenith Blade into the opponent's showdown at an open battlefield: no Shen there; only the attacker retreats", () => {
  test("setup facts: P2 applied Contested and is the ATTACKER; after Zenith Blade the Brawler has joined at bf1 as the defender and NOBODY controls bf1 yet", async () => {
    const game = await zenithIn();
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("brawler").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)?.active).toBe(true);
  });

  test("(1) during the showdown P1 can NOT play Shen to bf1 — it isn't a battlefield P1 controls (uncontrolled mid-showdown); base (and P1's own bf2) remain legal", async () => {
    const game = await zenithIn();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.p1.can("play", "shen")).toBe(true); // Reaction unit: playable now…
    const to = (game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options ?? ["base"]) as string[];
    expect(to).not.toContain("battlefield-bf1");
    expect(to).toContain("base");
    expect((await game.p1.try((p) => p.play("shen", { to: "bf1" }))).ok).toBe(false);
    expect(game.zoneOf("shen")).toBe("hand");
  });

  test("(2) P2 Rune Prisons the Brawler; everyone passes → combat with no damage either way: the ATTACKER's Scout is recalled to P2's base, P1's stunned Brawler stays", async () => {
    const game = await zenithIn();
    for (let i = 0; i < 3 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "prison")).toBe(true);
    await game.p2.cast("prison", { targets: "brawler" });
    await resolveChain(game);
    expect(game.state("brawler")).toMatchObject({ isStunned: true, location: "bf1" });
    await game.settle();
    await game.settle();
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("brawler")).toMatchObject({ damage: 0, location: "bf1" });
  });

  test("(2) …and the stunned Brawler takes the spot: P1 establishes control of bf1 (a conquer, +1) at the end of the showdown; P2 scores nothing", async () => {
    const game = await zenithIn();
    for (let i = 0; i < 3 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    await game.p2.cast("prison", { targets: "brawler" });
    await resolveChain(game);
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
