/**
 * Ruling d1146cb8c8d5f801 — Charm (ogn-043-298) / Gust (ogn-169-298) × an [Ambush] unit
 *   Charm — [1][calm]: "Move an enemy unit."   Gust — [Reaction] · [1]: "Return a unit at a battlefield with 3 [Might] or
 *   less to its owner's hand."   Ambush unit used: Nidalee, Cat Form (unl-114-219) · [3][body] · 4 Might · [Ambush].
 *
 * Q: While my unit is being moved off a battlefield by Charm/Gust (spell on the chain), can I Ambush a unit onto that
 *    same battlefield?
 * A: Yes. While the spell is on the chain your units are still there, so the battlefield is a legal Ambush destination
 *    and Ambush gives Reaction timing in the Closed state. LIFO: the Ambush unit lands first, then the spell moves its
 *    original target if still legal. Even if that was your only unit there, the Ambusher keeps you in control.
 * Rules: 822.1.b (Ambush: Reaction, to a battlefield where you control units), 332/333 (Closed state, LIFO), 187.4.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const GUST = "ogn-169-298";
const NIDALEE = "unl-114-219";

/**
 * P2's turn 3. P1 controls bf1 with a 2-Might Scout (and, unless `alone`, a 2-Might Guard); Nidalee in P1's hand with
 * exactly [3][body]. P2 holds Gust ([1]) and Charm ([1][calm]) with [2] + calm; bf2 is empty (a Charm destination).
 */
function board(alone = false) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, NIDALEE, "nidalee")
    .hand(P2, GUST, "gust")
    .hand(P2, CHARM, "charm");
  return alone ? s : s.unit(P1, "bf1", { might: 2, name: "Guard" }, "guard");
}

/** P2 Gusts the Scout and passes; P1 now holds priority with Gust on the chain. */
async function gustOnScout(game: Game): Promise<void> {
  await game.p2.cast("gust", { targets: "scout" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2, targets: ["scout"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling d1146cb8c8d5f801 — you may Ambush onto the battlefield your unit is being Charmed/Gusted away from", () => {
  test("with Gust (on the Scout) on the chain, bf1 — where P1 still has units — is a legal Ambush destination for Nidalee at Reaction speed, and ONLY bf1 (not base)", async () => {
    const game = await board().build();
    await gustOnScout(game);
    expect(game.locationOf("scout")).toBe("bf1"); // still there while the spell waits
    expect(game.p1.can("play", "nidalee")).toBe(true);
    const to = game.p1.option("playUnit", "nidalee")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toEqual(["battlefield-bf1"]);
    await game.p1.play("nidalee", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("LIFO: Nidalee lands at bf1 first; then Gust resolves and bounces its ORIGINAL target (the Scout) — Guard and Nidalee remain, P1 keeps bf1", async () => {
    const game = await board().build();
    await gustOnScout(game);
    await game.p1.play("nidalee", { to: "bf1" });
    // Let Nidalee through but stop before Gust resolves, if the engine gives a window in between.
    for (let i = 0; i < 4 && game.locationOf("nidalee") !== "bf1"; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("nidalee")).toBe("bf1");
    if (game.zoneOf("gust") === "chain") {
      expect(game.locationOf("scout")).toBe("bf1"); // Gust has not resolved yet
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand"); // Gust still moved its own target
    expect(game.p1.units("bf1").toSorted()).toEqual(["guard", "nidalee"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("same with Charm (an Action on P2's turn) moving the Scout to bf2: P1 Ambushes Nidalee into bf1 in response; Nidalee lands, then the Scout is Charmed away", async () => {
    const game = await board().build();
    await game.p2.cast("charm", { targets: "scout" });
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { pendingChoiceType: "choose-destination" } });
      await game.p2.pick("battlefield-bf2");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    await game.p2.passPriority();
    expect(game.p1.can("play", "nidalee")).toBe(true);
    await game.p1.play("nidalee", { to: "bf1" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options.find((o) => o.key === "battlefield-bf2")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("nidalee")).toBe("bf1");
    expect(game.locationOf("scout")).toBe("bf2");
    expect(game.p1.units("bf1").toSorted()).toEqual(["guard", "nidalee"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("important note — the Scout was P1's ONLY unit at bf1: Ambush is still legal while it stands there; Nidalee lands before Gust resolves, so after the Scout is bounced P1 STILL controls bf1 through Nidalee", async () => {
    const game = await board(true).build();
    await gustOnScout(game);
    expect(game.p1.units("bf1")).toEqual(["scout"]);
    expect(game.p1.can("play", "nidalee")).toBe(true);
    await game.p1.play("nidalee", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.units("bf1")).toEqual(["nidalee"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with NO P1 unit at bf1 (Scout already gone), Ambush offers no destination there — Nidalee can't be played in response", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { body: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 3, name: "Squatter" }, "squatter")
      .hand(P1, NIDALEE, "nidalee")
      .hand(P2, GUST, "gust")
      .build();
    await game.p2.cast("gust", { targets: "squatter" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "nidalee")).toBe(false);
  });
});
