/**
 * Ruling be6bb893a652ef83 — Red Brambleback (UNL-029 → unl-029-219) · 4 Might · "Your conquer effects for conquering here trigger an
 *     additional time. When I conquer, [Buff] a friendly unit."
 *   × Trinity Force (SFD-115 → sfd-115-221, Equipment +2) "When I hold, score 1 point."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221, Equipment +2) "My hold effects are also conquer effects, and vice versa."
 *   × Reckoner's Arena (OGN-286 → ogn-286-298, Battlefield) "When you hold here, activate the conquer effects of units here."
 *
 * Q: Red Brambleback wearing Trinity Force + Skyfall of Areion holds Reckoner's Arena — how many points?
 * A: 3. (1) the Hold itself scores 1; (2) Trinity Force's "When I hold" trigger scores 1; (3) Reckoner's Arena activates the unit's
 *    conquer effects — Skyfall makes TF's hold effect a conquer effect, so it is activated and scores 1 more. Red Brambleback's
 *    "trigger an additional time" does NOT apply: the Arena only simulates conquer triggers, no actual Conquer happened.
 * Rules: 450 (Hold scores 1), 383.4.g.1 (activating effects "as if" triggered — not a real conquer event), 718.3 (Equipment effect
 *        text belongs to the wearer), FAQ 2026-04-29 (Arena activation is not a conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RED_BRAMBLEBACK = "unl-029-219";
const TRINITY_FORCE = "sfd-115-221";
const SKYFALL = "sfd-030-221";
const RECKONERS_ARENA = "ogn-286-298";

/**
 * End of P2's turn 2 (Victory 8, P1 on 0). P1 controls the live Reckoner's Arena with Red Brambleback (4 +2 +2 = 8) wearing BOTH
 * Trinity Force and Skyfall of Areion → P1 HOLDS the Arena at the start of their turn.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "arena", RED_BRAMBLEBACK, "bramble", { equippedWith: ["sky", "tf"] } as Record<string, unknown>)
    .card("sky", { def: SKYFALL, meta: { attachedTo: "bramble" } as Record<string, unknown>, owner: P1, zone: "battlefield-arena" })
    .card("tf", { def: TRINITY_FORCE, meta: { attachedTo: "bramble" } as Record<string, unknown>, owner: P1, zone: "battlefield-arena" });
}

interface Trace {
  readonly game: Game;
  /** points right after the Hold, before any chain item resolved */
  readonly afterHold: number;
  /** chain length when the initial hold triggers were all on the chain */
  readonly initialItems: number;
  /** items the Arena's resolution added to the chain */
  readonly arenaAdded: number;
}

/** P2 ends the turn; P1 holds. Accept the listed trigger order, answer Buff picks with Brambleback itself, pass everything. */
async function holdArena(): Promise<Trace> {
  const game = await board().build();
  expect(game.state("bramble")).toMatchObject({ attachments: ["sky", "tf"], might: 8 });
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  const afterHold = game.p1.points();
  let initialItems = 0;
  let arenaAdded = 0;
  let lenBeforeArena = -1;
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    const ids = game.chain().map((c) => c.cardId);
    initialItems = Math.max(initialItems, lenBeforeArena === -1 ? ids.length : 0, initialItems);
    if (ids.at(-1) === "arena") {
      lenBeforeArena = ids.length;
    } else if (lenBeforeArena !== -1 && !ids.includes("arena") && arenaAdded === 0 && ids.length >= lenBeforeArena) {
      arenaAdded = ids.length - (lenBeforeArena - 1);
    }
    if (d.kind === "order") {
      expect(d.seat).toBe(P1);
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "bramble")?.key ?? d.options[0]!.key);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { afterHold, arenaAdded, game, initialItems };
}

describe("Ruling be6bb893a652ef83 — Brambleback + Trinity Force + Skyfall holding Reckoner's Arena = 3 points, no Brambleback doubling", () => {
  test("(1) the Hold itself scores 1 immediately, before anything on the chain resolves; the hold triggers (incl. the Arena's) are P1's to order", async () => {
    const { afterHold, initialItems } = await holdArena();
    expect(afterHold).toBe(1);
    expect(initialItems).toBeGreaterThanOrEqual(2); // at least Trinity Force's hold trigger + the Arena's trigger
  });

  test("(2) Trinity Force's own 'When I hold' trigger resolves for +1 — P1 is on at least 2 by the main phase", async () => {
    const { game } = await holdArena();
    expect(game.p1.points()).toBeGreaterThanOrEqual(2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(4) Red Brambleback's 'conquer effects … trigger an additional time' does NOT apply to the Arena's activation (no real Conquer): the Arena adds each conquer effect once, never doubled, and the total never exceeds 3", async () => {
    const { arenaAdded, game } = await holdArena();
    expect(arenaAdded).toBeLessThanOrEqual(2); // TF-as-conquer (+ Brambleback's own Buff) — once each, not twice
    expect(game.p1.points()).toBeLessThanOrEqual(3);
    expect(game.violations()).toEqual([]);
  });

  // rule 383.4.g.1 / 718.3 — (3) Reckoner's Arena activates the wearer's conquer effects; Skyfall makes Trinity Force's hold effect ALSO a conquer
  // effect, so the Arena activates it and it scores 1 more → 1 (hold) + 1 (TF hold) + 1 (TF via Arena) = 3.
  test("(3) Reckoner's Arena activates Trinity Force's effect (a conquer effect via Skyfall) — 3 points in total", async () => {
    const { game } = await holdArena();
    expect(game.p1.points()).toBe(3);
  });
});
