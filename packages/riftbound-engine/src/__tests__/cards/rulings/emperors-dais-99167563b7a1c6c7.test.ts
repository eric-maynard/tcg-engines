/**
 * Ruling 99167563b7a1c6c7 — Emperor's Dais (SFD-207 → sfd-207-221) · Battlefield "When you conquer here, you may pay [1] and return a unit
 *     you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here."
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) · [4] "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)"
 *   × Pridestalker (UNL-183 → unl-183-219, Rengar legend) "When you play a unit, give a unit +1 [Might] this turn." — the "when you
 *     play a unit" witness the ruling contrasts with.
 *
 * Q: Does playing a Sand Soldier off Emperor's Dais satisfy Legion for Noxus Hopeful?
 * A: No. Legion needs a CARD to have been played this turn; tokens are not cards. The Sand Soldier does count as playing a UNIT (so
 *    "when you play a unit" triggers like Rengar's fire), but Hopeful still costs [4] until an actual card is played.
 * Rules: 182 / 184.3 (tokens are not cards), 812.1.c (Legion), 419 (playing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DAIS = "sfd-207-221";
const NOXUS_HOPEFUL = "ogn-012-298";
const PRIDESTALKER = "unl-183-219";

/**
 * P1's turn with exactly [4]: [1] for the Dais + 3 left (enough for a Legion-priced Hopeful [2], not for a full [4]). Live, uncontrolled
 * Emperor's Dais; Runner (3) in P1's base; Pridestalker as P1's legend; Noxus Hopeful in hand.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4 })
    .legend(P1, PRIDESTALKER, "rengar")
    .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, NOXUS_HOPEFUL, "hopeful");
}

/** Runner walks onto the empty Dais, conquers it, P1 accepts the Dais (pay [1], return Runner) → Sand Soldier token there; drive Rengar's follow-up too. Returns the token id. */
async function sandSoldierFromDais(game: Game): Promise<string> {
  await game.p1.move("runner", "dais");
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "dais") {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "runner")) {
      await game.p1.pick("runner"); // the unit returned to hand
    } else if (d.kind === "pick" && d.seat === P1 && d.source?.cardId === "rengar") {
      // "When you play a unit" DID trigger for the token — hand its +1 to the Sand Soldier itself.
      token = d.options.map((o) => o.card ?? o.key).find((c) => c !== undefined && game.state(c).isToken);
      expect(token).toBeDefined();
      await game.p1.pick(token as string);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  const soldiers = game.cardsAt("dais").filter((id) => game.state(id).isToken);
  expect(soldiers).toHaveLength(1);
  return soldiers[0] as string;
}

describe("Ruling 99167563b7a1c6c7 — a Sand Soldier from Emperor's Dais is a unit played, but not a CARD played: no Legion", () => {
  test("premise: nothing played yet — Hopeful is [4] (affordable only at full price with the 4 energy; Legion is off)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("hopeful").energyCost).toBe(4);
  });

  test("conquering the Dais and taking its offer plays a 2-Might Sand Soldier TOKEN there (Runner back in hand, [1] paid, 1 point) — and Rengar's 'when you play a UNIT' does trigger for it (+1 ⇒ 3)", async () => {
    const game = await board().build();
    const token = await sandSoldierFromDais(game);
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.points()).toBe(1);
    expect(game.state(token)).toMatchObject({ baseMight: 2, isToken: true, might: 3, name: "Sand Soldier" });
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  });

  test("…but no CARD was played: the played-cards count is still 0 and Noxus Hopeful still costs [4] — NOT playable with the 3 energy left", async () => {
    const game = await board().build();
    await sandSoldierFromDais(game);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "hopeful")).toBe(false);
    const r = await game.p1.try((p) => p.play("hopeful", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("hopeful")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: play an actual card first (the returned Runner, [0] inline) and Legion turns on — Hopeful drops to [2] and is playable", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 4 })
      .legend(P1, PRIDESTALKER, "rengar")
      .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
      .unit(P1, "base", { cardType: "unit", energyCost: 1, might: 3, name: "Runner" }, "runner")
      .hand(P1, NOXUS_HOPEFUL, "hopeful")
      .build();
    await sandSoldierFromDais(game);
    expect(game.p1.can("play", "hopeful")).toBe(false);
    await game.p1.play("runner", { to: "base" }); // a real card: [1]
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick((d.options[0] as { key: string }).key); // Rengar again
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true); // [4] − 2 = [2]
  });
});
