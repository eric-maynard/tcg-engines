/**
 * Ruling e2efe1789c525971 — Zenith Blade (OGN-262 → ogn-262-298) · Spell · Calm/Order · 3+[rainbow][rainbow] · Action
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · 1 · "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: Zenith Blade targets a unit and the opponent Retreats it in response — does Zenith Blade still resolve?
 * A: The bounced unit is no longer a legal target: every instruction that references it (the stun AND "that enemy
 *    unit's battlefield" for the move) does not execute. If instead you Retreat your OWN chosen mover, the stun on the
 *    enemy still happens — it never depended on the friendly unit.
 * Rules: 359.3.e.5 / 359.3.e.9 (illegal or missing targets ⇒ those instructions are skipped, the rest resolves), 336–339 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const RETREAT = "ogn-104-298";

/** P1's turn. P2 holds bf1 with Foe (3) and has Retreat + [1]. P1: Pal (2) in base, Zenith Blade (3 + 2 rainbow) and its own Retreat (+1). */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor") // keeps bf1 P2's whatever happens to Foe
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, ZENITH_BLADE, "zenith")
    .hand(P1, RETREAT, "retreat1")
    .hand(P2, RETREAT, "retreat2");
}

/** Pass priority around until the chain is empty, answering P1's optional move / destination toward bf1 if asked. */
async function resolveAll(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1" || o.card === "pal") ?? d.options[0];
      await game.p1.pick(want!.key);
    } else {
      break;
    }
  }
}

/** P1 casts Zenith Blade: Foe to stun, Pal as the friendly mover. */
async function castZenith(game: Game): Promise<void> {
  await game.p1.cast("zenith", { targets: ["foe", "pal"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick(game.decision()!.kind === "pick" ? "battlefield-bf1" : "bf1");
  }
  expect(game.chain()[0]).toMatchObject({ cardId: "zenith", controller: P1 });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
}

describe("Ruling e2efe1789c525971 — Zenith Blade vs Retreat", () => {
  test("control: unanswered, Zenith Blade stuns Foe and Pal moves to Foe's battlefield", async () => {
    const game = await board().build();
    await castZenith(game);
    await resolveAll(game);
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.locationOf("pal")).toBe("bf1");
  });

  test("opponent Retreats the TARGET in response: Retreat resolves first (Foe → P2's hand, P2 channels 1 rune exhausted); Zenith Blade then finds no legal target — nothing is stunned and Pal does NOT move ('that enemy unit's battlefield' is undefined)", async () => {
    const game = await board().build();
    const p2Runes = game.p2.runes().length;
    await castZenith(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("retreat2", { targets: "foe" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zenith", "retreat2"]);
    await resolveAll(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: false }).length).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("zenith")).toBe("trash"); // it resolved (was not countered) — it just did nothing
    expect(game.state("anchor").isStunned).toBe(false); // no re-targeting onto another enemy
    expect(game.locationOf("pal")).toBe("base");
    expect(game.state("pal").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("caster Retreats its OWN mover in response: Pal → P1's hand first; Zenith Blade still STUNS Foe (the stun never needed Pal), and there is simply nothing to move", async () => {
    const game = await board().build();
    await castZenith(game);
    // P1 holds priority right after its own play and answers itself.
    if (game.decision()?.seat !== P1) {
      await game.p2.passPriority();
    }
    expect(game.p1.can("cast", "retreat1")).toBe(true);
    await game.p1.cast("retreat1", { targets: "pal" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zenith", "retreat1"]);
    await resolveAll(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.state("foe")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
