/**
 * Ruling 46cec7e8bdf2a0fb — Plundering Poro (SFD-069 → sfd-069-221) at Star Spring (UNL-215 → unl-215-219, "The first
 *   time a player plays a non-token unit here each turn, they may move another unit they control here to its base.")
 *   × Evelynn, Entrancing (UNL-141 → unl-141-219) [Hidden] "When you play me from face down on your turn, you may move an
 *     enemy unit at a different location to my battlefield."   × Charm (OGN-043 → ogn-043-298) Action "Move an enemy unit."
 *
 * Q: Poro + hidden Evelynn at Star Spring; I reveal-play Evelynn there. Her play trigger and Star Spring's trigger both go
 *    on the chain. Can I half-resolve one (target my Poro with Star Spring), then do Evelynn's pull / a Charm, then finish?
 * A: No interleaving. Both triggers are separate chain items (you order them as they are added); the chain resolves LIFO
 *    and each item resolves COMPLETELY before the next. Charm is a spell — as a response it would sit on top and resolve
 *    before both, but (being Action-speed) it cannot be slipped in mid-chain, and nothing lets you split a trigger.
 * Rules: 383.3.d (controller orders simultaneous triggers), 336/340 (LIFO, one item at a time), 359.3 (full resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const PLUNDERING_PORO = "sfd-069-221";
const EVELYNN = "unl-141-219";
const CHARM = "ogn-043-298";

/**
 * P1's turn 3. P1 holds Star Spring (live text) with a Plundering Poro and has Evelynn face down there (hidden on an
 * earlier turn). P2: Victim (2) at bf2, Homebody (4) in base. P1 also holds Charm with [1][calm] to pay for it.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "spring", PLUNDERING_PORO, "poro")
    .facedown(P1, "spring", EVELYNN, "eve")
    .unit(P2, "bf2", { might: 2, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "homebody")
    .hand(P1, CHARM, "charm");
}

const ids = (game: Game) => game.chain().map((c) => c.cardId);

/** Reveal-play Evelynn at Star Spring and answer both triggers' finalization prompts (opt in; Star Spring → Poro, Evelynn → Victim). */
async function revealEvelynn(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("reveal", "eve")).toBe(true);
  await game.p1.reveal("eve");
  expect(game.zoneOf("eve")).toBe("battlefield-spring");
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.seat).toBe(P1); // every choice here is the Evelynn player's
    if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const want = d.source?.cardId === "spring" ? "poro" : "victim";
      const opt = d.options.find((o) => (o.card ?? o.key) === want);
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 46cec7e8bdf2a0fb — Evelynn's play trigger and Star Spring's trigger are two chain items, resolved one at a time (LIFO)", () => {
  test("playing Evelynn from face down at Star Spring puts BOTH triggered abilities on the chain as separate items, each with its own locked choice", async () => {
    const game = await revealEvelynn();
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(ids(game).toSorted()).toEqual(["eve", "spring"]);
    const byId = Object.fromEntries(game.chain().map((c) => [c.cardId, c.targets]));
    expect(byId.spring).toEqual(["poro"]);
    expect(byId.eve).toEqual(["victim"]);
    // Nothing has happened yet — a priority window is open over the two items.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("poro")).toBe("spring");
    expect(game.locationOf("victim")).toBe("bf2");
  });

  // Expected: both abilities trigger off the same event and are controlled by P1, so P1 is asked to ORDER them as they
  // are added (383.3.d) — an `order` decision for P1 listing eve + spring. Actual: the engine stacks them in a fixed
  // order (Star Spring first, Evelynn on top) without offering the choice.
  test("ruling 46cec7e8bdf2a0fb — P1 should be offered to order the two simultaneous triggers; engine stacks them in a fixed order", async () => {
    const game = await board().build();
    await game.p1.reveal("eve");
    let sawOrder = false;
    for (let i = 0; i < 8; i++) {
      const d: Decision | null = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      if (d.kind === "order") {
        expect(d.seat).toBe(P1);
        expect(d.items.map((it) => it.card).toSorted()).toEqual(["eve", "spring"]);
        sawOrder = true;
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      }
    }
    expect(sawOrder).toBe(true);
  });

  test("Charm cannot be wedged between them: with the triggers on the chain (Closed state) the Action-speed Charm is not playable", async () => {
    const game = await revealEvelynn();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "charm")).toBe(false);
    const r = await game.p1.try((p) => p.cast("charm", { targets: "homebody" }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toHaveLength(2);
  });

  test("the TOP item resolves completely first: its move happens in full while the bottom item is still waiting untouched on the chain — no partial/alternating execution", async () => {
    const game = await revealEvelynn();
    const [bottom, top] = game.chain();
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item resolves
    expect(ids(game)).toEqual([bottom!.cardId]);
    if (top!.cardId === "eve") {
      expect(game.locationOf("victim")).toBe("spring"); // Evelynn's pull done…
      expect(game.locationOf("poro")).toBe("spring"); // …Star Spring's send-home not started
    } else {
      expect(game.locationOf("poro")).toBe("base");
      expect(game.locationOf("victim")).toBe("bf2");
    }
    // Then the bottom item resolves completely.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("victim")).toBe("spring");
    expect(game.locationOf("poro")).toBe("base");
    expect(game.locationOf("eve")).toBe("spring");
    expect(game.violations()).toEqual([]);
  });
});
