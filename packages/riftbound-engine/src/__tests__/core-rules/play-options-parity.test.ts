/**
 * Core rules — the ONE play-options model (`moves/play/play-options.ts`).
 *
 * PROPERTY (rules 354–358 / 419.1.a / 811): for a permanent played from ANY
 * origin the hand-move family serves — hand (`playUnit`), Champion Zone
 * (`playFromChampionZone`), facedown (`revealHidden`) — the set of variants the
 * enumerator OFFERS equals the set of raw submissions the move ACCEPTS (355.16 /
 * 357.3 / 358.5: what is not offered is refused, state untouched), and executing
 * any offered variant CHARGES exactly its quote (357: Energy, per-Domain pips
 * first, any-Domain pips last, XP; an elected optional cost is paid, never
 * dropped). Candidate submissions are generated from a superset that knows
 * nothing about the model: every destination on the table × every optional-cost
 * combination × every subset of the board's friendly units / hand cards as
 * cost objects × a small grid of resource-cost shapes.
 *
 * Plus targeted rules:
 *   135.2.e.5.a  mixed-Domain payment is an ASSIGNMENT (specific pips first, [A] last) — pool order never matters
 *   357.3       an unaffordable [Accelerate] election is ABSENT (never accepted-then-dropped)
 *   054.1       Mageseeker Warden confines hand, Champion-Zone AND facedown unit plays alike
 *   356.2.b     "kill any number" subsets are offered at battlefield destinations too (822.3: an [Ambush]
 *               Reaction play never with a set that empties the destination)
 *   356.2.b.1   the XP-for-discount shape is offered from the Champion Zone and on an [Ambush] play
 */

import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import { type Game, P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const LEDROS = "ogn-231-298"; // 6 + [order]×4 · kill any number of friendly units, −[order] each · Deflect Ganking
const KRAKEN_HUNTER = "ogn-150-298"; // [Accelerate] + spend any number of buffs, −[body] each
const CRUEL_PATRON = "ogn-208-298"; // 4 · MANDATORY kill a friendly unit
const HOUSE_DISCARD = "ogn-002-298"; // you may discard 1 → cost [2] less
const POPPY = "unl-178-219"; // 6+[order] · spend 3 XP → [3] less · Ambush Tank
const ECLIPSE_DRAGON = "ven-016-166"; // 8 · Dragon · [Accelerate]
const DRAGON_ROOST = "ven-157-166"; // bf: any player may pay [A][A] to play a Dragon here
const HERALD = "ogn-140-298"; // your Dragons' Energy costs are reduced by [2], to a minimum of [1]
const PYKE = "unl-028-219"; // 3 · [Hidden] [Ganking] you may pay [fury]
const EZREAL = "sfd-149-221"; // optional additional costs cost [1] or [A] less
const MYSTIC_VORTEX = "ven-160-166"; // bf: during showdowns here cards with [Reaction] cost [A] more
const WARDEN = "ogn-070-298"; // opponents can only play units to their base
const REKSAI = "sfd-029-221"; // friendly units played from anywhere other than hand have [Accelerate]
const STALKING_WOLF = "unl-166-219"; // Ambush · MANDATORY kill a friendly Pet
const PORO = "ogn-013-298"; // Pet (Poro) 2 Might [Deflect]


/** Action spell: "Banish a friendly unit. You may play it from your banishment this turn." (permission → effect-play pipeline). */
const EXILE = {
  abilities: [
    {
      effect: {
        effects: [
          { target: { controller: "friendly", type: "unit" }, type: "banish" },
          { duration: "turn", target: { type: "pending-value" }, type: "grant-play-permission" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Exile (test)",
  powerCost: [],
  timing: "action",
};

const PLAY_MOVES = ["playUnit", "playFromChampionZone", "revealHidden"] as const;
type PlayMove = (typeof PLAY_MOVES)[number];

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BoardSpec {
  readonly seed: number;
  readonly energy: number;
  readonly power: Record<string, number>;
  readonly xp: number;
  readonly bf1Controller: typeof P1 | typeof P2;
  readonly bf2Def?: string;
  readonly unitsBf1: number;
  readonly unitsBase: number;
  readonly buffedBase: boolean;
  readonly poroAtBf1: boolean;
  readonly ezreal: boolean;
  readonly reksai: boolean;
  readonly warden: boolean;
  readonly hand: readonly string[];
  readonly champion?: string;
  readonly facedown?: string;
}

function boardSpec(seed: number): BoardSpec {
  const rnd = mulberry32(seed * 7919 + 13);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const power: Record<string, number> = {};
  for (const d of ["fury", "order", "body", "calm", "rainbow"]) {
    const n = Math.floor(rnd() * 3);
    if (n > 0) {
      power[d] = n;
    }
  }
  const handPool = [LEDROS, KRAKEN_HUNTER, CRUEL_PATRON, HOUSE_DISCARD, POPPY, ECLIPSE_DRAGON, STALKING_WOLF];
  const hand = handPool.filter(() => rnd() < 0.45);
  return {
    bf1Controller: rnd() < 0.7 ? P1 : P2,
    bf2Def: pick([undefined, DRAGON_ROOST, MYSTIC_VORTEX]),
    buffedBase: rnd() < 0.5,
    champion: rnd() < 0.6 ? pick([POPPY, KRAKEN_HUNTER, ECLIPSE_DRAGON]) : undefined,
    energy: Math.floor(rnd() * 10),
    ezreal: rnd() < 0.4,
    facedown: rnd() < 0.6 ? PYKE : undefined,
    hand: hand.length > 0 ? hand : [pick(handPool)],
    poroAtBf1: rnd() < 0.5,
    power,
    reksai: rnd() < 0.3,
    seed,
    unitsBase: Math.floor(rnd() * 3),
    unitsBf1: Math.floor(rnd() * 3),
    warden: rnd() < 0.2,
    xp: Math.floor(rnd() * 6),
  };
}

function boardOf(spec: BoardSpec) {
  let s = scenario()
    .turn(3)
    .active(P1)
    .xp(P1, spec.xp)
    .resources(P1, { energy: spec.energy, power: spec.power })
    .battlefield("bf1", { controller: spec.bf1Controller })
    .battlefield("bf2", spec.bf2Def ? { controller: P2, def: spec.bf2Def, inert: false, owner: P2 } : { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Enemy Holder" }, "eh")
    .legend(P1, { cardType: "legend", name: "Test Legend" }, "leg");
  for (let i = 0; i < spec.unitsBf1; i++) {
    s = s.unit(spec.bf1Controller === P1 ? P1 : P2, "bf1", { might: 2, name: `Bf1 Unit ${i}` }, `b${i}`);
  }
  for (let i = 0; i < spec.unitsBase; i++) {
    s = s.unit(P1, "base", { might: 1, name: `Base Unit ${i}` }, `u${i}`, spec.buffedBase && i === 0 ? { buffed: true } : undefined);
  }
  if (spec.poroAtBf1 && spec.bf1Controller === P1) {
    s = s.unit(P1, "bf1", PORO, "poro");
  }
  if (spec.ezreal) {
    s = s.unit(P1, "base", EZREAL, "ezreal");
  }
  if (spec.reksai) {
    s = s.unit(P1, "base", REKSAI, "reksai");
  }
  if (spec.warden) {
    s = s.unit(P2, "bf2", WARDEN, "warden");
  }
  spec.hand.forEach((id, i) => {
    s = s.hand(P1, id, `h${i}`);
  });
  s = s.hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" }, "fodder");
  if (spec.champion) {
    s = s.champion(P1, spec.champion, "champ");
  }
  if (spec.facedown && spec.bf1Controller === P1) {
    s = s.facedown(P1, "bf1", spec.facedown, "fd");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Keys / candidate generation
// ---------------------------------------------------------------------------

type Params = Record<string, unknown>;
type Costs = { alternativeId?: string; paid?: Record<string, true | { objects?: readonly string[]; spec?: unknown }> };

/** Identity of a play: move + card + destination + alternative + paid ids with their objects (spec shape excluded). */
function keyOf(moveId: string, params: Params): string {
  const costs = (params.costs ?? {}) as Costs;
  const paid = Object.entries(costs.paid ?? {})
    .map(([id, v]) => `${id}:${v === true ? "" : [...(v.objects ?? [])].sort().join("+")}`)
    .sort()
    .join("|");
  // A facedown flip always plays under the "hidden" alternative (811.1.b) — implied when unnamed.
  const alt = moveId === "revealHidden" ? "hidden" : (costs.alternativeId ?? (params.altCost === true ? "alt" : ""));
  return `${moveId}/${String(params.cardId ?? "-")}/${String(params.location ?? "-")}/${alt}/${paid}`;
}

function subsets<T>(xs: readonly T[], max = 7): T[][] {
  const capped = xs.slice(0, max);
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << capped.length; mask++) {
    out.push(capped.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

/** Model-blind superset of submissions for one card / move. */
function candidates(game: Game, moveId: PlayMove, cardId: string | undefined): Params[] {
  const gs = game.gameState;
  const destinations = ["base", ...Object.keys(gs.battlefields ?? {}).map((b) => `battlefield-${b}`)];
  const friendly = [...game.p1.units("base"), ...Object.keys(gs.battlefields ?? {}).flatMap((b) => [...game.p1.units(b)])];
  const handOthers = game.p1.hand().filter((c) => c !== cardId);
  const unitSets = subsets(friendly, 7);
  const resourceShapes: (true | { spec: { energy: number; power: string[]; xp?: number } })[] = [
    true,
    { spec: { energy: 1, power: ["fury"] } },
    { spec: { energy: 0, power: ["fury"] } },
    { spec: { energy: 1, power: [] } },
    { spec: { energy: 0, power: [] } },
    { spec: { energy: 1, power: ["body"] } },
    { spec: { energy: 0, power: [], xp: 3 } },
    { spec: { energy: -3, power: [], xp: 3 } },
  ];
  const paidCombos: Costs["paid"][] = [undefined];
  for (const id of ["accelerate", "accelerate-granted", "pay"]) {
    for (const shape of resourceShapes) {
      paidCombos.push({ [id]: shape });
    }
  }
  for (const set of unitSets) {
    if (set.length === 0) {
      continue;
    }
    paidCombos.push({ "kill-any": { objects: set } });
    paidCombos.push({ "spend-buff-any": { objects: set } });
    paidCombos.push({ accelerate: true, "spend-buff-any": { objects: set } });
    if (set.length === 1) {
      paidCombos.push({ kill: { objects: set } });
      paidCombos.push({ "spend-buff": { objects: set } });
    }
  }
  for (const c of handOthers.slice(0, 3)) {
    paidCombos.push({ discard: { objects: [c] } });
  }
  paidCombos.push({ redirect: true }, { accelerate: true, redirect: true }, { exhaust: true });
  const alternatives = moveId === "revealHidden" ? [undefined, "hidden"] : [undefined, "alt"];
  const out: Params[] = [];
  for (const location of moveId === "revealHidden" ? [undefined] : destinations) {
    for (const alternativeId of alternatives) {
      for (const paid of paidCombos) {
        const costs: Costs = { ...(alternativeId ? { alternativeId } : {}), ...(paid ? { paid } : {}) };
        out.push({
          ...(cardId !== undefined && moveId !== "playFromChampionZone" ? { cardId } : {}),
          ...(location !== undefined ? { location } : {}),
          costs,
          playerId: P1,
        });
      }
    }
    // A few legacy-shaped probes.
    out.push(
      { ...(moveId !== "playFromChampionZone" ? { cardId } : {}), ...(location ? { location } : {}), paidAdditionalCost: true, playerId: P1 },
      { ...(moveId !== "playFromChampionZone" ? { cardId } : {}), ...(location ? { location } : {}), playerId: P1 },
    );
  }
  return out;
}

/** Normalise a legacy-shaped accepted probe onto the canonical key of the variant it stands for. */
function acceptedKey(game: Game, moveId: string, params: Params, offered: Map<string, Params>): string {
  if (params.costs !== undefined) {
    return keyOf(moveId, params);
  }
  // A legacy probe is accepted only when it names an offered option; find the offered variant with the same
  // visible legacy params (location + paid flag) — the enumerator lists the canonical `costs` for it.
  for (const [key, v] of offered) {
    if (
      String(v.location ?? "-") === String(params.location ?? "-") &&
      (v.paidAdditionalCost === true) === (params.paidAdditionalCost === true) &&
      String(v.cardId ?? "-") === String(params.cardId ?? "-")
    ) {
      return key;
    }
  }
  return keyOf(moveId, params);
}

interface Quote {
  energy: number;
  power: Record<string, number>;
  any: number;
  xp: number;
  free: boolean;
}

const SEEDS = Array.from({ length: 14 }, (_, i) => i + 1);

describe("play-options parity — enumerated ≡ accepted ≡ charged, for hand / Champion-Zone / facedown plays", () => {
  for (const seed of SEEDS) {
    const spec = boardSpec(seed);
    test(`seed ${seed}: every accepted raw submission is an offered variant and vice versa (${spec.hand.length} hand, cz=${spec.champion ? "y" : "n"}, fd=${spec.facedown && spec.bf1Controller === P1 ? "y" : "n"}, pool ${spec.energy}/${JSON.stringify(spec.power)}, xp ${spec.xp}${spec.warden ? ", WARDEN" : ""}${spec.ezreal ? ", Ezreal" : ""}${spec.reksai ? ", Rek'Sai" : ""})`, async () => {
      const game = await boardOf(spec).build();
      const engine = game.engine;
      for (const moveId of PLAY_MOVES) {
        const rows = engine.enumerateMoves(P1 as PlayerId, { moveIds: [moveId], validOnly: true });
        const cardIds =
          moveId === "playFromChampionZone"
            ? [undefined]
            : [...new Set(rows.map((r) => (r.params as Params).cardId as string)), ...(moveId === "playUnit" ? game.p1.hand() : []), ...(moveId === "revealHidden" && game.has("fd") ? ["fd"] : [])];
        for (const cardId of new Set(cardIds)) {
          const offered = new Map<string, Params>();
          for (const r of rows) {
            const p = r.params as Params;
            if (cardId === undefined || p.cardId === cardId) {
              offered.set(keyOf(moveId, p), p);
            }
          }
          // Every offered variant is accepted as-is (validOnly already re-checked the condition; assert it anyway).
          for (const [key, p] of offered) {
            expect({ accepted: engine.canExecuteMove(moveId, { params: p, playerId: P1 as PlayerId }), key }).toEqual({ accepted: true, key });
          }
          // Every accepted candidate from the model-blind superset is an offered variant.
          const accepted = new Set<string>();
          for (const c of candidates(game, moveId, cardId)) {
            if (engine.canExecuteMove(moveId, { params: c, playerId: P1 as PlayerId })) {
              accepted.add(acceptedKey(game, moveId, c, offered));
            }
          }
          const stray = [...accepted].filter((k) => !offered.has(k));
          expect({ card: cardId ?? "champion", moveId, stray }).toEqual({ card: cardId ?? "champion", moveId, stray: [] });
        }
      }
    });
  }

  for (const seed of SEEDS.slice(0, 8)) {
    const spec = boardSpec(seed);
    test(`seed ${seed}: executing each offered variant charges exactly its quote (energy, pips, xp) and never leaves the card behind`, async () => {
      const probe = await boardOf(spec).build();
      const variants: { moveId: PlayMove; params: Params }[] = [];
      for (const moveId of PLAY_MOVES) {
        for (const r of probe.engine.enumerateMoves(P1 as PlayerId, { moveIds: [moveId], validOnly: true })) {
          variants.push({ moveId, params: r.params as Params });
        }
      }
      // Bound the work per seed: a spread of at most 24 variants.
      const step = Math.max(1, Math.ceil(variants.length / 24));
      for (let i = 0; i < variants.length; i += step) {
        const { moveId, params } = variants[i] as (typeof variants)[number];
        const quote = params.quote as Quote | undefined;
        expect(quote).toBeDefined();
        const game = await boardOf(spec).build();
        const before = { power: { ...game.gameState.runePools[P1]!.power } as Record<string, number>, energy: game.p1.energy(), xp: game.p1.xp() };
        const cardId = (params.cardId as string | undefined) ?? "champ";
        await game.p1.do(moveId, params);
        const afterPool = game.gameState.runePools[P1]!;
        const spentEnergy = before.energy - afterPool.energy;
        const spentByDomain: Record<string, number> = {};
        let spentPower = 0;
        for (const d of new Set([...Object.keys(before.power), ...Object.keys(afterPool.power)])) {
          const delta = (before.power[d] ?? 0) - ((afterPool.power as Record<string, number>)[d] ?? 0);
          if (delta !== 0) {
            spentByDomain[d] = delta;
          }
          spentPower += delta;
        }
        const q = quote as Quote;
        const namedTotal = Object.values(q.power).reduce((a, b) => a + b, 0);
        const ctx = { key: keyOf(moveId, params), quote: q, spentByDomain };
        expect({ ...ctx, spentEnergy }).toEqual({ ...ctx, spentEnergy: q.free ? 0 : q.energy });
        expect({ ...ctx, spentPower }).toEqual({ ...ctx, spentPower: q.free ? 0 : namedTotal + q.any });
        expect({ ...ctx, xp: before.xp - game.p1.xp() }).toEqual({ ...ctx, xp: q.xp });
        // Specific pips come out of their own Domain (or pooled [A]) — never fewer than quoted.
        for (const [d, n] of Object.entries(q.power)) {
          expect({ ...ctx, domain: d, ok: (spentByDomain[d] ?? 0) + (spentByDomain.rainbow ?? 0) >= n }).toEqual({ ...ctx, domain: d, ok: true });
        }
        // The card left its origin (a permanent resolves at once — 337.2).
        expect(["base", "battlefield-bf1", "battlefield-bf2"]).toContain(game.zoneOf(cardId));
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Targeted
// ---------------------------------------------------------------------------

describe("play-options — targeted rules", () => {
  const variantsOf = (game: Game, verb: string, card?: string) => game.p1.option(verb, card)?.variants.map((v) => v.params as Params) ?? [];

  test("135.2.e.5.a — mixed-Domain payment is an assignment: Pyke's +[fury] flip at the Vortex with {fury:1, calm:1} in EITHER pool order pays fury→[fury], calm→[A] and empties the pool", async () => {
    for (const power of [{ fury: 1, calm: 1 }, { calm: 1, fury: 1 }] as Record<string, number>[]) {
      const game = await scenario()
        .turn(3)
        .active(P2)
        .resources(P1, { energy: 0, power })
        .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
        .battlefield("bf2", { controller: P2 })
        .unit(P1, "mv", { might: 3, name: "Defender" }, "d")
        .unit(P2, "bf2", { might: 1, name: "Holder" }, "h")
        .unit(P2, "base", { might: 5, name: "Attacker" }, "a")
        .facedown(P1, "mv", PYKE, "pyke")
        .build();
      await game.p2.move("a", "mv");
      await game.p2.passFocus();
      expect(variantsOf(game, "revealHidden", "pyke").map((p) => p.paidAdditionalCost === true).sort()).toEqual([false, true]);
      await game.p1.reveal("pyke", { payOptional: true });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    }
  });

  test("357.3 — an [Accelerate] election the pool cannot cover TOGETHER with the rest is absent and refused, never accepted-then-dropped (Eclipse Dragon + Dragon Roost, {7, fury:1, calm:1})", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { calm: 1, fury: 1 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "roost", { might: 3, name: "Keeper" }, "k")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", HERALD, "herald")
      .hand(P1, ECLIPSE_DRAGON, "dragon")
      .build();
    const both = variantsOf(game, "play", "dragon").filter((p) => p.location === "battlefield-roost" && p.paidAdditionalCost === true);
    expect(both).toEqual([]);
    const r = await game.p1.try((p) => p.do("playUnit", { cardId: "dragon", location: "battlefield-roost", paidAdditionalCost: true, playerId: P1 }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 7, power: { calm: 1, fury: 1 } });
    expect(game.zoneOf("dragon")).toBe("hand");
    // …and with {7, fury:1, calm:2} the only assignment (fury→Accelerate, calm×2→Roost) is found: READY at the Roost, pool empty.
    const ok = await scenario()
      .resources(P1, { energy: 7, power: { calm: 2, fury: 1 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "roost", { might: 3, name: "Keeper" }, "k")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", HERALD, "herald")
      .hand(P1, ECLIPSE_DRAGON, "dragon")
      .build();
    await ok.p1.play("dragon", { accelerate: true, to: "roost" });
    expect(ok.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(ok.state("dragon")).toMatchObject({ isReady: true, zone: "battlefield-roost" });
  });

  test("054.1 — Mageseeker Warden confines hand, Champion-Zone and facedown unit plays alike: no battlefield destination anywhere, the facedown unit cannot be flipped", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 9, power: { order: 1, fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "sq")
      .unit(P2, "bf2", WARDEN, "warden")
      .hand(P1, POPPY, "poppyHand")
      .champion(P1, POPPY, "poppyCz")
      .facedown(P1, "bf1", PYKE, "pyke")
      .build();
    const dests = (verb: string, card?: string) => [...new Set(variantsOf(game, verb, card).map((p) => String(p.location)))].sort();
    expect(dests("play", "poppyHand")).toEqual(["base"]);
    expect(dests("playFromChampionZone")).toEqual(["base"]);
    expect(game.p1.can("reveal", "pyke")).toBe(false);
    expect((await game.p1.try((p) => p.do("playFromChampionZone", { location: "battlefield-bf1", playerId: P1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("revealHidden", { cardId: "pyke", playerId: P1 }))).ok).toBe(false);
    expect(game.zoneOf("poppyCz")).toBe("championZone");
    expect(game.zoneOf("pyke")).toBe("facedown-bf1");
  });

  test("356.2.b — 'kill any number' subsets are offered at a controlled battlefield destination exactly as at base; an [Ambush] REACTION play never lists a set that empties its destination (822.3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 4 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Enemy" }, "e")
      .unit(P1, "bf1", { might: 2, name: "S1" }, "s1")
      .unit(P1, "base", { might: 1, name: "R" }, "r")
      .hand(P1, LEDROS, "ledros")
      .build();
    const setsAt = (loc: string) =>
      variantsOf(game, "play", "ledros")
        .filter((p) => p.location === loc)
        .map((p) => [...((p.sacrificeIds as string[] | undefined) ?? [])].sort().join("+") || "∅")
        .sort();
    expect(setsAt("battlefield-bf1")).toEqual(setsAt("base"));
    expect(setsAt("base")).toEqual(["r", "r+s1", "s1", "∅"]);

    // Stalking Wolf (Ambush, mandatory kill a Pet) in P2's showdown at bf1: the lone Poro there is the only Pet —
    // killing it voids the Ambush Reaction (822.3), so with Focus the Wolf is not playable to bf1 at all.
    const wolf = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 4, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", PORO, "poro")
      .unit(P2, "bf2", { might: 1, name: "Holder" }, "h")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "a")
      .hand(P1, STALKING_WOLF, "wolf")
      .build();
    await wolf.p2.move("a", "bf1");
    await wolf.p2.passFocus();
    expect(variantsOf(wolf, "play", "wolf").filter((p) => p.location === "battlefield-bf1")).toEqual([]);
    expect((await wolf.p1.try((p) => p.do("playUnit", { cardId: "wolf", location: "battlefield-bf1", paidAdditionalCost: true, playerId: P1, sacrificeId: "poro" }))).ok).toBe(false);
    expect(wolf.zoneOf("poro")).toBe("battlefield-bf1");
  });

  test("356.2.b.1 — the XP-for-discount shape is offered from the Champion Zone and on an [Ambush] play from hand, priced identically (Poppy: 3 XP → 3+[order])", async () => {
    const closed = async (inHand: boolean) => {
      const s = scenario()
        .turn(3)
        .active(P2)
        .xp(P1, 4)
        .resources(P1, { energy: 3, power: { order: 1 } })
        .resources(P2, { energy: 1, power: { fury: 1 } })
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: P2 })
        .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
        .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
        .hand(P2, "ogn-009-298", "ray");
      const game = await (inHand ? s.hand(P1, POPPY, "poppy") : s.champion(P1, POPPY, "poppy")).build();
      await game.p2.cast("ray", { targets: "squire" });
      await game.p2.passPriority();
      return game;
    };
    for (const inHand of [true, false]) {
      const game = await closed(inHand);
      const vs = variantsOf(game, inHand ? "play" : "playFromChampionZone", inHand ? "poppy" : undefined);
      // Only 3 energy: the full 6+[order] line is unaffordable → exactly the XP line, to bf1 (Ambush; base has no Reaction).
      expect(vs.map((p) => [p.location, p.paidAdditionalCost === true])).toEqual([["battlefield-bf1", true]]);
      expect((vs[0]?.quote as Quote | undefined)).toMatchObject({ energy: 3, power: { order: 1 }, xp: 3 });
      if (inHand) {
        await game.p1.play("poppy", { payOptional: true, to: "bf1" });
      } else {
        await game.p1.choose("playFromChampionZone", { payOptional: true, to: "bf1" });
      }
      expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
      expect(game.p1.xp()).toBe(1);
      expect(game.zoneOf("poppy")).toBe("battlefield-bf1");
      // 337.2 / 340.4 — resolved at once; P2 (the Ray's controller) holds priority.
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    }
  });

  test("805.2 (sfd-029-221) — Accelerate GRANTED to non-hand plays is offered on the Champion-Zone play and on a facedown flip, never on the hand play", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 9, power: { fury: 2, body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "sq")
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "g")
      .unit(P1, "base", REKSAI, "reksai")
      .hand(P1, { cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Grunt" }, "grunt")
      .champion(P1, { cardType: "unit", domain: "body", energyCost: 3, might: 3, name: "Champ", tags: ["Champion"] }, "champ")
      .facedown(P1, "bf1", { cardType: "unit", domain: "fury", energyCost: 3, keywords: ["Hidden"], might: 2, name: "Sneak" }, "sneak")
      .build();
    const paidIds = (verb: string, card?: string) =>
      [...new Set(variantsOf(game, verb, card).flatMap((p) => Object.keys(((p.costs as Costs | undefined)?.paid ?? {}))))].sort();
    expect(paidIds("play", "grunt")).toEqual([]);
    expect(paidIds("playFromChampionZone")).toEqual(["accelerate-granted"]);
    expect(paidIds("revealHidden", "sneak")).toEqual(["accelerate-granted"]);
    await game.p1.reveal("sneak", { payOptional: true });
    expect(game.state("sneak")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 8, power: { body: 2, fury: 1 } });
  });
  test("419.3 / 366.1 — a play an EFFECT (permission) performs walks the SAME options as a dialog: destinations = the model's (own bf, base, and the enemy Dragon Roost that sells itself), the granted [Accelerate] is offered as a yes/no, and the pool is charged the option's own total (Rek'Sai + Eclipse Dragon from banishment)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { calm: 2, fury: 1 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "roost", { might: 3, name: "Keeper" }, "k")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", REKSAI, "reksai")
      .unit(P1, "base", ECLIPSE_DRAGON, "dragon")
      .hand(P1, EXILE, "exile")
      .build();
    await game.p1.cast("exile", { targets: "dragon" });
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("banishment");
    expect(game.p1.can("playFrom", "dragon")).toBe(true);
    await game.p1.playFrom("dragon");
    // 355.2 — the destinations of the model: base, own bf1, and the Roost (2 any-Domain pips buy it).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((d?.kind === "pick" ? d.options.map((o) => String(o.key)) : []).sort()).toEqual(["base", "battlefield-bf1", "battlefield-roost"]);
    await game.p1.pick("battlefield-roost");
    // 805.2 — played from banishment (not the hand): Rek'Sai's Accelerate is offered; with {9, calm 2, fury 1} the only
    // assignment is fury→Accelerate, calm×2→Roost — accept: 8 + 1 energy, all three pips, READY at the Roost.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    expect(game.zoneOf("dragon")).toBe("battlefield-roost");
    expect(game.state("dragon")).toMatchObject({ isReady: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    // With one calm fewer the Accelerate election is not even asked at the Roost (357.3) — the play just costs 8 + 2 pips.
    const tight = await scenario()
      .resources(P1, { energy: 9, power: { calm: 1, fury: 1 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "roost", { might: 3, name: "Keeper" }, "k")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", REKSAI, "reksai")
      .unit(P1, "base", ECLIPSE_DRAGON, "dragon")
      .hand(P1, EXILE, "exile")
      .build();
    await tight.p1.cast("exile", { targets: "dragon" });
    await tight.settle();
    await tight.p1.playFrom("dragon");
    await tight.p1.pick("battlefield-roost");
    expect(tight.decision()?.kind).not.toBe("yes-no");
    expect(tight.zoneOf("dragon")).toBe("battlefield-roost");
    expect(tight.state("dragon")).toMatchObject({ isExhausted: true });
    expect(tight.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 0 } });
  });
});
