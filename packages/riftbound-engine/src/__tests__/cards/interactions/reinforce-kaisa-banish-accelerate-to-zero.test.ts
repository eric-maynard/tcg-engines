/**
 * Interaction: Reinforce (ogn-062-298) × Kai'Sa, Survivor (ogn-039-298) × Rek'Sai, Breacher (sfd-029-221)
 *
 *   Reinforce — Spell · Calm · 5      "Look at the top 5 cards of your Main Deck. You may banish a unit from among
 *                                      them, then play it, reducing its cost by [5]. Recycle the remaining cards."
 *   Kai'Sa, Survivor — Champion Unit · Fury · 4 · 4 Might   "[Accelerate] (You may pay [1][fury] as an additional
 *                                      cost to have me enter ready.) When I conquer, draw 1."
 *   Rek'Sai, Breacher — Champion Unit · Fury · 3 · 3        "[Accelerate] [Assault] Friendly units played from
 *                                      anywhere other than a player's hand have [Accelerate]."   — control (e) only
 *
 * Rules: 805.2 / 355.1.a / 419.3.b (Accelerate is an optional additional cost chosen "as you play" — in ANY play,
 * from any zone, by any effect), 805.2.b / 805.6 (paid → delayed replacement → enters READY), 805.4 (multiple
 * Accelerates are redundant), 356.1 → 356.2.b.1 → 356.4.b/.d (base cost, THEN additional costs are added, THEN
 * discounts hit the total), 356.4.f (a discount may reduce an additional cost to 0), 356.4.f.1 (an optional cost
 * reduced to nothing still counts as "paid"), 358.2 (an unpayable optional cost may not be elected), 143.4
 * (units otherwise enter exhausted).
 *
 * Question: P1 casts Reinforce; Kai'Sa is in the top 5. (a) Is Accelerate offered on this banishment play? (b) P1
 * has exactly 0 energy + 1 fury after Reinforce and elects Accelerate: 4 + [1][fury] − [5] → does the discount eat
 * the Accelerate energy so P1 pays only [fury] and she enters READY — or must P1 find a real extra [1]? (c) Decline
 * → 0, exhausted, fury kept. (d) 0 fury → Accelerate not electable; still playable for 0, exhausted. (e) Rek'Sai's
 * second Accelerate instance — any second prompt or doubled cost?
 *
 * Expected: (a) yes. (b) rules-correct: −[5] applies after the +[1] was added (356.4.f) → 0 energy + 1 fury, and it
 * counts as paid (356.4.f.1) → READY. (c) exhausted, fury 1 left. (d) no offer, exhausted, 0/0. (e) one election,
 * one [fury], ready once.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const KAISA_SURVIVOR = "ogn-039-298";
const REKSAI_BREACHER = "sfd-029-221";
const SHIPYARD_SKULKER = "ogn-175-298";

type YesNo = Extract<Decision, { kind: "yes-no" }>;

/**
 * P1's turn. P1 controls bf1 (empty), holds Reinforce and `energy` + `fury`. Deck top → bottom: Skulker, KAI'SA,
 * Skulker ×3 (= the 5 looked at), then "sixth", then filler. `reksai` adds Rek'Sai, Breacher to P1's base.
 */
function board(opts: { energy: number; fury: number; reksai?: boolean }) {
  const b = scenario()
    .resources(P1, { energy: opts.energy, power: opts.fury > 0 ? { fury: opts.fury } : {} })
    .battlefield("bf1", { controller: P1 })
    .deck(P1, [SHIPYARD_SKULKER, KAISA_SURVIVOR, SHIPYARD_SKULKER, SHIPYARD_SKULKER, SHIPYARD_SKULKER, SHIPYARD_SKULKER], ["s1", "kaisa", "s2", "s3", "s4", "sixth"])
    .hand(P1, REINFORCE, "rf");
  if (opts.reksai) {
    b.unit(P1, "base", REKSAI_BREACHER, "reksai");
  }
  return b;
}

/** Cast Reinforce (5), let it resolve to the look-and-pick, banish Kai'Sa and send her to base. Stops at the next prompt. */
async function banishKaisaToBase(game: Game): Promise<void> {
  await game.p1.cast("rf");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("kaisa");
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    expect(game.zoneOf("kaisa")).toBe("banishment"); // banished first, then played FROM banishment
    await game.p1.pick("base");
  }
}

/** All Accelerate opt-in prompts seen from here until the open main phase, answering each with `answer`. */
async function drainAccelerate(game: Game, answer: "yes" | "no"): Promise<YesNo[]> {
  const seen: YesNo[] = [];
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      seen.push(d);
      await (answer === "yes" && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "action" && d.passKey) {
      await game.acting().pass();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.length > 0) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  return seen;
}

describe("(a) Accelerate is part of ANY play — including Reinforce's 'banish it, then play it' from banishment (805.2, 419.3.b)", () => {
  test("Reinforce costs 5 (5e+1f → 0e+1f), looks at exactly the top 5 and offers the units among them; Kai'Sa is there", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await game.p1.cast("rf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["kaisa", "s1", "s2", "s3", "s4"]);
  });

  test("after banishing Kai'Sa and choosing base, P1 IS asked the Accelerate 'pay [1][fury]?' question before she lands", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await banishKaisaToBase(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toMatch(/Kai'Sa/);
    expect(game.zoneOf("kaisa")).toBe("banishment"); // still mid-play
  });
});

describe("(b) electing Accelerate with exactly 0 energy + 1 fury left: 4 + [1][fury] − [5] = 0 energy + [fury]", () => {
  // Expected (356.2.b → 356.4.f/.f.1): the −[5] is applied to the total AFTER the optional [1] was added, zeroing
  // it; only the [fury] pip is really owed, so "yes" is legal at {0e, 1f}, takes the fury, and she enters READY.
  // The opt-in gate therefore prices the INCREMENTAL Energy the election adds to the discounted total, not the
  // printed [1] the payment path never deducts anyway (see the 6-energy control below).
  test("The Accelerate opt-in should be acceptable at {0 energy, 1 fury} — Reinforce's leftover discount covers the [1] (356.4.f)", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await banishKaisaToBase(game);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("…and saying yes there pays exactly the [fury] (→ 0e/0f) and Kai'Sa enters the base READY (356.4.f.1, 805.2.b)", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await banishKaisaToBase(game);
    await game.p1.yes();
    await drainAccelerate(game, "yes");
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("kaisa").isReady).toBe(true);
  });

  test("control with one spare energy (6e+1f → 1e+1f after Reinforce): 'yes' is accepted, ONLY the fury is taken — the spare energy is NOT spent (the discount did eat the [1]) — and she enters READY", async () => {
    const game = await board({ energy: 6, fury: 1 }).build();
    await banishKaisaToBase(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    const seen = await drainAccelerate(game, "yes");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.canAccept).not.toBe(false);
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa")).toMatchObject({ isReady: true, might: 4, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // 4+1−5 = 0 energy; 1 fury paid
    expect(game.violations()).toEqual([]);
  });

  test("either way the rest of Reinforce completes: the other four looked-at cards are recycled to the bottom, 'sixth' is the new top, Reinforce is in the trash, nothing on the chain", async () => {
    const game = await board({ energy: 6, fury: 1 }).build();
    await banishKaisaToBase(game);
    await drainAccelerate(game, "yes");
    expect(game.p1.deck()[0]).toBe("sixth");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(game.zoneOf("rf")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});

describe("(c) declining Accelerate: 4 − 5 → 0, nothing extra paid, enters EXHAUSTED, the fury stays", () => {
  test("'no' → Kai'Sa in base exhausted at 4 Might; pool still 0 energy + 1 fury (143.4)", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await banishKaisaToBase(game);
    const seen = await drainAccelerate(game, "no");
    expect(seen).toHaveLength(1);
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("she may instead be sent to a battlefield P1 controls (bf1) — same free, exhausted arrival", async () => {
    const game = await board({ energy: 5, fury: 1 }).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("kaisa");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", semantics: "destination" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await drainAccelerate(game, "no");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });
});

describe("(d) no fury at all: the optional cost cannot be paid so it may not be elected (358.2) — the play itself is still legal at 0", () => {
  test("with 5e+0f Kai'Sa is still an eligible pick (4 − 5 = 0 is affordable) and no acceptable Accelerate offer appears; she enters exhausted, pool 0/0", async () => {
    const game = await board({ energy: 5, fury: 0 }).build();
    await game.p1.cast("rf");
    await game.settle();
    const pick = game.decision();
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : []).toContain("kaisa");
    await game.p1.pick("kaisa");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
    }
    const seen = await drainAccelerate(game, "yes"); // would accept if it (wrongly) could
    expect(seen.every((d) => d.canAccept === false)).toBe(true); // either not asked, or asked as unpayable
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});

describe("(e) Rek'Sai, Breacher also grants Accelerate to this non-hand play — redundant with the printed one (805.4)", () => {
  test("exactly ONE Accelerate election is asked, ONE [fury] is paid (7e+2f → 2e+2f after Reinforce → 2e+1f), and she enters ready once", async () => {
    const game = await board({ energy: 7, fury: 2, reksai: true }).build();
    await banishKaisaToBase(game);
    const seen = await drainAccelerate(game, "yes");
    expect(seen).toHaveLength(1);
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.state("kaisa").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // not [2][fury][fury]
    expect(game.state("reksai").zone).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("declining that single election with Rek'Sai out still yields one prompt and an exhausted Kai'Sa", async () => {
    const game = await board({ energy: 6, fury: 1, reksai: true }).build();
    await banishKaisaToBase(game);
    const seen = await drainAccelerate(game, "no");
    expect(seen).toHaveLength(1);
    expect(game.state("kaisa")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });
});
