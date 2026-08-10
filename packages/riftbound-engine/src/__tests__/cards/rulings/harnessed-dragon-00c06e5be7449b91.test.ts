/**
 * Ruling 00c06e5be7449b91 — Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · Order · [8][order][order] · 6 Might
 *   "When you play me, kill an enemy unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear "[Hidden] If a friendly unit would die, kill this instead.
 *     Heal that unit, exhaust it, and recall it."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *   × The Boss (OGN-269 → ogn-269-298) · Legend · Sett "If a buffed unit you control would die, you may pay
 *     [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: What are the ways to save my unit from an enemy Harnessed Dragon?
 * A: Zhonya's Hourglass (whether hidden — revealed in response — or already active), Gust (only if the unit
 *    is at a battlefield with 3 or less Might), or the Sett legend (only if the unit is buffed).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const ZHONYAS = "ogn-077-298";
const GUST = "ogn-169-298";
const THE_BOSS = "ogn-269-298";

/** P2's turn with the Dragon in hand and exactly [8][order][order]. P1's Victim (3 Might, 1 damage) stands at P1's bf1. */
function base(victimMeta: Record<string, unknown> = {}) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim", { damage: 1, ...victimMeta })
    .hand(P2, HARNESSED_DRAGON, "dragon")
    .resources(P2, { energy: 8, power: { order: 2 } });
}

/** P2 plays the Dragon and names Victim for "kill an enemy unit"; returns with the trigger on the chain and P1 holding priority. */
async function dragonTargetsVictim(game: Game): Promise<void> {
  await game.p2.play("dragon");
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P2) {
      const opt = d.options.find((o) => (o.card ?? o.key) === "victim");
      expect(opt).toBeDefined();
      await game.p2.answer({ keys: [opt!.key], kind: "pick" });
      continue;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && d.seat === P2 && d.passKey) {
      await game.p2.passPriority();
      continue;
    }
    break;
  }
  expect(game.zoneOf("dragon")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

/** Pass priority around until the chain is empty, answering nothing else. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 00c06e5be7449b91 — saving a unit from Harnessed Dragon's 'kill an enemy unit'", () => {
  test("baseline: with no answer, the Dragon's play trigger kills Victim", async () => {
    const game = await base().build();
    await dragonTargetsVictim(game);
    await drainChain(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("Zhonya's Hourglass already ACTIVE (face up in base): it is killed instead; Victim is healed, exhausted and recalled to base", async () => {
    const game = await base().gear(P1, ZHONYAS, "zhonyas").build();
    await dragonTargetsVictim(game);
    await drainChain(game);
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("Zhonya's Hourglass HIDDEN at Victim's battlefield: P1 reveals it for [0] in response, then it saves Victim the same way", async () => {
    const game = await base().facedown(P1, "bf1", ZHONYAS, "zhonyas").build();
    await dragonTargetsVictim(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "zhonyas")).toBe(true);
    await game.p1.reveal("zhonyas");
    expect(game.state("zhonyas").isHidden).toBe(false);
    await drainChain(game);
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("Gust: Victim (3 Might, at a battlefield) is returned to hand in response; the Dragon's kill then has no target and does nothing", async () => {
    const game = await base().hand(P1, GUST, "gust").resources(P1, { energy: 1 }).build();
    await dragonTargetsVictim(game);
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "gust"]);
    await drainChain(game);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash()).not.toContain("victim");
  });

  test("Gust nuance: a 4-Might unit is NOT a legal Gust target (3 or less only), so Gust cannot save it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Big Victim" }, "victim")
      .hand(P1, GUST, "gust")
      .resources(P1, { energy: 1 })
      .hand(P2, HARNESSED_DRAGON, "dragon")
      .resources(P2, { energy: 8, power: { order: 2 } })
      .build();
    await dragonTargetsVictim(game);
    const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("victim");
    await drainChain(game);
    expect(game.zoneOf("victim")).toBe("trash");
  });

  test("Gust nuance: a unit in BASE is not 'at a battlefield', so Gust cannot target it either", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Home Victim" }, "victim")
      .hand(P1, GUST, "gust")
      .resources(P1, { energy: 1 })
      .hand(P2, HARNESSED_DRAGON, "dragon")
      .resources(P2, { energy: 8, power: { order: 2 } })
      .build();
    await dragonTargetsVictim(game);
    const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("victim");
  });

  test("The Boss (Sett legend) with a BUFFED Victim: when the kill resolves P1 is asked, pays [rainbow] + exhausts the legend + spends the buff → Victim healed, exhausted, recalled", async () => {
    const game = await base({ buffed: true }).legend(P1, THE_BOSS, "boss").resources(P1, { power: { rainbow: 1 } }).build();
    expect(game.state("victim")).toMatchObject({ isBuffed: true, might: 4 });
    await dragonTargetsVictim(game);
    await drainChain(game);
    // The optional, costed replacement is P1's decision.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((game.decision() as { canAccept?: boolean }).canAccept).not.toBe(false);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("The Boss nuance: an UNBUFFED Victim gets no offer — it simply dies", async () => {
    const game = await base().legend(P1, THE_BOSS, "boss").resources(P1, { power: { rainbow: 1 } }).build();
    expect(game.state("victim").isBuffed).toBe(false);
    await dragonTargetsVictim(game);
    await drainChain(game);
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1).toBe(false);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
