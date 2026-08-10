/**
 * Ruling e3cc602c604cf520 — Charm (OGN-043 → ogn-043-298) · Action · [1][calm] · "Move an enemy unit."
 *   × Nine-Tailed Fox (OGN-255 → ogn-255-298, Ahri legend) · "When an enemy unit attacks a battlefield you control, give it
 *     -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: I Charm an enemy Assault unit onto my (Ahri's) battlefield. Is that enemy the attacker (Assault live)? And where does the
 *    Nine-Tailed Fox trigger go on the chain relative to "When I attack" / "When I defend" triggers?
 * A: Yes — the attacker is whoever's unit applied Contested, i.e. the moved enemy unit's controller; it attacks with Assault.
 *    Nine-Tailed Fox counts as an ATTACK trigger. Case A (attacker is turn player): attacker's attack triggers → NTF → defend
 *    triggers. Case B (defender is turn player, e.g. via Charm): NTF → attacker's attack triggers → defend triggers.
 * Rules: 464.2.c.1 (attacker = who applied Contested), 807 (Assault while attacking), 464.2.e (combat triggers onto the chain),
 *        383.3 (ordering simultaneous triggers by turn order).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const NINE_TAILED_FOX = "ogn-255-298";

/** P2's 2-Might [Assault 2] unit with a "When I attack" trigger (draw 1). */
const RAIDER = {
  abilities: [
    { keyword: "Assault", type: "keyword", value: 2 },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  keywords: ["Assault"],
  might: 2,
  name: "Raider",
};
/** P1's 3-Might defender with a "When I defend" trigger (draw 1). */
const SENTRY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Sentry",
};

/** Pass chain priority (accepting any soft trigger-order offer as listed) until the chain is empty or something else is asked. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.seat(d.seat).passPriority(); // keep the listed order
      continue;
    }
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling e3cc602c604cf520 — a Charmed-in enemy is the attacker (with Assault); Nine-Tailed Fox orders as an attack trigger", () => {
  /**
   * Case B board — P1's turn. P1 (Ahri legend) holds bf1 with Sentry; P2 holds bf2 with the Raider (+ an Anchor so bf2 stays P2's).
   * P1 has Charm and exactly [1]+[calm].
   */
  function caseB() {
    return scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .legend(P1, NINE_TAILED_FOX, "ahri")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", SENTRY, "sentry")
      .unit(P2, "bf2", RAIDER, "raider")
      .unit(P2, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, CHARM, "charm");
  }

  /** P1 Charms the Raider to bf1 (P1 CHOOSES the destination), Charm resolves; stops as the combat's triggers hit the chain. */
  async function charmRaiderIn(): Promise<Game> {
    const game = await caseB().build();
    await game.p1.cast("charm", { targets: "raider" });
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    // Charm alone on the chain; both pass → it resolves, the Raider arrives, combat is staged and begins.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "charm"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    return game;
  }

  test("Case B (via Charm on P1's turn): the Raider's controller P2 applied Contested → P2 attacks, P1 defends; the Raider IS the attacker and its Assault 2 is live (2 → 4)", async () => {
    const game = await charmRaiderIn();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", controller: P2, might: 4 });
    expect(game.state("sentry").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1); // the DEFENDER is the turn player here
  });

  test("Case B chain order: Nine-Tailed Fox (bottom) → Raider's 'When I attack' → Sentry's 'When I defend' (top)", async () => {
    const game = await charmRaiderIn();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["ahri", P1, true],
      ["raider", P2, true],
      ["sentry", P1, true],
    ]);
    // DESIGN (383.3.d soft prompt): P1 is merely OFFERED to reorder its own two triggers; the listed default is the ruling's order.
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d).toMatchObject({ defaultable: true, seat: P1 });
      expect(d.items.map((i) => i.card)).toEqual(["ahri", "sentry"]);
    }
  });

  test("Case B resolution: all three triggers resolve (each side drew 1), NTF shrinks the attacking Raider 4 → 3; then combat: 3 vs Sentry 3 → both die, bf1 stays P1's", async () => {
    const game = await charmRaiderIn();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // Sentry's defend trigger
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // Raider's attack trigger
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 3, mightModifier: -1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Case A (ordinary attack on the attacker's own turn): chain order is Raider's 'When I attack' (bottom) → Nine-Tailed Fox → Sentry's 'When I defend' (top); Raider attacks at 4", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, NINE_TAILED_FOX, "ahri")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SENTRY, "sentry")
      .unit(P2, "base", RAIDER, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["raider", P2],
      ["ahri", P1],
      ["sentry", P1],
    ]);
    await drainChain(game);
    expect(game.state("raider").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
