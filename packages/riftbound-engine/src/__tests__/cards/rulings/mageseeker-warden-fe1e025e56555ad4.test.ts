/**
 * Ruling fe1e025e56555ad4 — Mageseeker Warden (OGN-070 → ogn-070-298) · Calm · [6][calm] · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. While I'm at a battlefield, spells and abilities
 *      can't ready enemy units and gear."
 *   × Sprite Call (OGN-094 → ogn-094-298) · Action · [3] · "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *   × Sprite Mother (OGN-106 → ogn-106-298) · [4][mind] · "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × Sprite (OGN-274 → ogn-274-298) token · × an [Accelerate] unit (Thousand-Tailed Watcher ogn-116-298 stands in).
 *
 * Q: Does the Warden stop Accelerated units from entering ready, or Sprite Call / Sprite Mother tokens from entering ready?
 * A: No. Entering the board ready is not a spell/ability READYING an (exhausted) enemy permanent; anything that "enters ready" is
 *    unaffected by the Warden.
 * Rules: 140.2 (enter ready vs. become ready), 729 (Accelerate), Warden's static restriction (only the Ready action on enemies).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARDEN = "ogn-070-298";
const SPRITE_CALL = "ogn-094-298";
const SPRITE_MOTHER = "ogn-106-298";
const WATCHER = "ogn-116-298"; // [7][mind], [Accelerate] for [1][mind]
const RALLY = {
  // inline "[Action] Ready a friendly unit." — the thing the Warden DOES stop, as the contrast
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "ready" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Rally",
  timing: "action",
} as const;

/** P1's turn. P2's Mageseeker Warden stands AT A BATTLEFIELD (bf1). P1 holds bf2 with a Holder. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", WARDEN, "warden")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder");
}

const tokensOf = (game: Game) => game.p1.units().filter((id) => game.state(id).isToken);

/** Take "base" for any destination ask, pass anything on the chain, until P1's open main phase. */
async function toMain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
      await game.p1.pick(base ? base.key : d.options[0]!.key);
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  await game.settle();
}

describe("Ruling fe1e025e56555ad4 — Mageseeker Warden doesn't stop Accelerate or Sprite tokens from ENTERING ready", () => {
  test("premise — the Warden's readying clause is live: a spell that READIES P1's exhausted unit does nothing while the Warden is at a battlefield", async () => {
    const game = await board().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2, name: "Sleeper" }, "sleeper", { exhausted: true }).hand(P1, RALLY, "rally").build();
    await game.p1.cast("rally", { targets: "sleeper" });
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.state("sleeper").isExhausted).toBe(true);
  });

  test("premise — and its first clause too: P1 may only play Sprite Mother to base (bf2 refused)", async () => {
    const game = await board().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, SPRITE_MOTHER, "mother").build();
    expect((await game.p1.try((p) => p.play("mother", { to: "bf2" }))).ok).toBe(false);
    expect(game.p1.can("play", "mother")).toBe(true);
  });

  test("Accelerate: Thousand-Tailed Watcher played with the extra [1][mind] ENTERS READY opposite the Warden and stays ready", async () => {
    const game = await board().resources(P1, { energy: 8, power: { mind: 2 } }).hand(P1, WATCHER, "watcher").build();
    await game.p1.play("watcher", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("watcher")).toMatchObject({ isReady: true, zone: "base" });
    await toMain(game);
    expect(game.state("watcher")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("Sprite Call: the Sprite token is played READY (3 Might, Temporary) and stays ready", async () => {
    const game = await board().resources(P1, { energy: 3 }).hand(P1, SPRITE_CALL, "call").build();
    await game.p1.cast("call");
    await toMain(game);
    expect(game.zoneOf("call")).toBe("trash");
    const toks = tokensOf(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, might: 3, name: "Sprite" });
    expect(game.state(toks[0] as string).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("Sprite Mother (to base): the Mother herself enters exhausted as normal, but her Sprite token is played READY 'here' and stays ready", async () => {
    const game = await board().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, SPRITE_MOTHER, "mother").build();
    await game.p1.play("mother", { to: "base" });
    await toMain(game);
    expect(game.state("mother")).toMatchObject({ isExhausted: true, zone: "base" });
    const toks = tokensOf(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isReady: true, might: 3, name: "Sprite", zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
