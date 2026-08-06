/**
 * Compact, LLM-oriented renderings of harness observations and decisions.
 */

import type {
  ActionDecision,
  ActionOption,
  CardState,
  CardView,
  Decision,
  DecisionSummary,
  Observation,
  Seat,
  TranscriptStep,
} from "@tcg/riftbound/harness";
import { isHiddenView } from "@tcg/riftbound/harness";
import type { ManagedGame } from "./game-manager";

export type Detail = "summary" | "zones" | "full";

export interface CompactCard {
  id: string;
  name: string;
  type: string;
  cost?: string;
  might?: number;
  damage?: number;
  exhausted?: boolean;
  stunned?: boolean;
  hidden?: boolean;
  keywords?: string[];
  owner?: Seat;
  attachedTo?: string;
}

export function compactCard(c: CardState, opts: { owner?: boolean } = {}): CompactCard {
  const cost =
    c.energyCost || c.powerCost.length
      ? `${c.energyCost}${c.powerCost.map((p) => `[${p}]`).join("")}`
      : undefined;
  const out: CompactCard = { id: c.id, name: c.name, type: c.cardType };
  if (cost) {
    out.cost = cost;
  }
  if (c.cardType === "unit" || c.might > 0) {
    out.might = c.might;
  }
  if (c.damage > 0) {
    out.damage = c.damage;
  }
  if (c.isExhausted) {
    out.exhausted = true;
  }
  if (c.isStunned) {
    out.stunned = true;
  }
  if (c.isHidden) {
    out.hidden = true;
  }
  if (c.keywords.length > 0) {
    out.keywords = [...c.keywords];
  }
  if (c.attachedTo) {
    out.attachedTo = c.attachedTo;
  }
  if (opts.owner) {
    out.owner = c.owner;
  }
  return out;
}

function cardLine(c: CompactCard): string {
  const bits = [`${c.name} [${c.id}]`];
  const stats: string[] = [];
  if (c.cost) {
    stats.push(`cost ${c.cost}`);
  }
  if (c.might !== undefined) {
    stats.push(`might ${c.might}`);
  }
  if (c.damage) {
    stats.push(`dmg ${c.damage}`);
  }
  if (c.exhausted) {
    stats.push("exhausted");
  }
  if (c.stunned) {
    stats.push("stunned");
  }
  if (c.keywords?.length) {
    stats.push(c.keywords.join("/"));
  }
  if (c.type !== "unit") {
    stats.unshift(c.type);
  }
  return stats.length ? `${bits[0]} (${stats.join(", ")})` : (bits[0] as string);
}

function visible(views: readonly CardView[]): CardState[] {
  return views.filter((v): v is CardState => !isHiddenView(v));
}

function ownedBy(views: readonly CardView[], seat: Seat): CardView[] {
  return views.filter((v) => v.owner === seat);
}

export function decisionSummaryLine(d: Decision | DecisionSummary | null): string {
  if (!d) {
    return "none";
  }
  if ("options" in d && d.kind === "action") {
    const ad = d as ActionDecision;
    return `${ad.seat} action/${ad.context}: ${ad.options.length} options${ad.passKey ? " (can pass)" : ""}${ad.endTurnKey ? " (can end_turn)" : ""} — ${ad.prompt}`;
  }
  if ("options" in d && d.kind === "pick") {
    return `${d.seat} pick: "${d.prompt}" [${d.options
      .map((o) => o.key)
      .slice(0, 12)
      .join(
        " | ",
      )}${d.options.length > 12 ? " | …" : ""}]${d.allowDecline ? " (may decline)" : ""}`;
  }
  if (d.kind === "integer" && "min" in d) {
    return `${d.seat} integer ${d.min}..${d.max}: "${d.prompt}"`;
  }
  return `${d.seat} ${d.kind}: "${d.prompt}"`;
}

export function nextHint(m: ManagedGame): string {
  const g = m.game;
  if (g.isOver()) {
    return `game over — winner: ${g.winner() ?? "none"}`;
  }
  const d = g.decision();
  if (!d) {
    return "no decision pending";
  }
  let s = decisionSummaryLine(d);
  if (d.synthetic) {
    s +=
      ' [follow-up of your last action: answer it via `act` (option key) or {kind:"decline"} to cancel]';
  }
  if (m.bots.has(d.seat)) {
    s += ` [bot seat is stuck: ${m.lastAutoplay?.stuck ?? "call settle"}]`;
  }
  return s;
}

export function stepLine(step: TranscriptStep): string {
  const moves = step.executed
    .map((e) => {
      const { playerId: _p, ...rest } = e.params as Record<string, unknown>;
      let ps = Object.keys(rest).length ? JSON.stringify(rest) : "";
      if (ps.length > 140) {
        ps = `${ps.slice(0, 137)}…`;
      }
      return `${e.moveId}${ps ? ` ${ps}` : ""}${e.auto ? " [auto]" : ""}${e.seat !== step.seat ? ` (as ${e.seat})` : ""}`;
    })
    .join("; ");
  return `#${step.n} ${step.seat}: ${moves || "(nothing executed)"}`;
}

export function recentLog(m: ManagedGame, count = 8, sinceSeq?: number): string[] {
  const steps = m.game.backend.transcript().steps;
  const sel = sinceSeq !== undefined ? steps.filter((s) => s.n > sinceSeq) : steps.slice(-count);
  return sel.map(stepLine);
}

/** Strip the (potentially huge) flat variants from action options. */
export function slimOption(o: ActionOption, maxFieldOptions = 40): Record<string, unknown> {
  return {
    card: o.card,
    fields: o.fields.map((f) => ({
      arg: f.arg,
      kind: f.kind,
      max: f.max,
      min: f.min,
      name: f.name,
      options:
        f.options && f.options.length > maxFieldOptions
          ? [
              ...f.options.slice(0, maxFieldOptions),
              `… +${f.options.length - maxFieldOptions} more`,
            ]
          : f.options,
      required: f.required,
    })),
    key: o.key,
    label: o.label,
    moveId: o.moveId,
    variantCount: o.variantCount,
    verb: o.verb,
  };
}

export function slimDecision(d: Decision | DecisionSummary | null): Record<string, unknown> | null {
  if (!d) {
    return null;
  }
  if (d.kind === "action" && "options" in d) {
    const ad = d as ActionDecision;
    return { ...ad, options: ad.options.map((o) => slimOption(o)) };
  }
  if (d.kind === "name" && "vocabulary" in d && d.vocabulary.length > 60) {
    return {
      ...d,
      vocabulary: [...d.vocabulary.slice(0, 60), `… +${d.vocabulary.length - 60} more`],
      vocabularySize: d.vocabulary.length,
    };
  }
  return { ...d };
}

export interface DescribeOutput {
  text: string;
  json: Record<string, unknown>;
}

export function describeState(m: ManagedGame, seat: Seat, detail: Detail): DescribeOutput {
  const g = m.game;
  const obs: Observation = g.backend.view(seat);
  const seats = g.seats();
  const others = seats.filter((s) => s !== seat);
  const st = obs.state;
  const showdownStack = st.interaction?.showdownStack ?? [];
  const showdown = showdownStack[showdownStack.length - 1];
  const you = obs.resources[seat] ?? { energy: 0, power: {} };

  const handViews = ownedBy(obs.zones.hand ?? [], seat);
  const hand = visible(handViews).map((c) => compactCard(c));
  const base = visible(ownedBy(obs.zones.base ?? [], seat)).map((c) => compactCard(c));
  const runes = visible(ownedBy(obs.zones.runePool ?? [], seat));
  const legend = visible(ownedBy(obs.zones.legendZone ?? [], seat))[0];
  const champion = visible(ownedBy(obs.zones.championZone ?? [], seat))[0];

  const opponents = others.map((o) => {
    const oRunes = visible(ownedBy(obs.zones.runePool ?? [], o));
    return {
      base: visible(ownedBy(obs.zones.base ?? [], o)).map((c) => compactCard(c)),
      champion: visible(ownedBy(obs.zones.championZone ?? [], o))[0]?.name,
      deckCount: ownedBy(obs.zones.mainDeck ?? [], o).length,
      handCount: ownedBy(obs.zones.hand ?? [], o).length,
      legend: visible(ownedBy(obs.zones.legendZone ?? [], o))[0]?.name,
      points: obs.points[o] ?? 0,
      resources: obs.resources[o] ?? { energy: 0, power: {} },
      runes: { ready: oRunes.filter((r) => r.isReady).length, total: oRunes.length },
      seat: o,
      trashCount: ownedBy(obs.zones.trash ?? [], o).length,
    };
  });

  const battlefields = obs.battlefields.map((bf) => ({
    contested: bf.contested,
    contestedBy: bf.contestedBy,
    controller: bf.controller,
    facedown: bf.facedownCount,
    id: bf.id,
    name: bf.name,
    units: visible(bf.units).map((c) => compactCard(c, { owner: true })),
  }));

  const chain = obs.chain.map((it) => ({
    card: `${it.name} [${it.cardId}]`,
    controller: it.controller,
    countered: it.countered,
    triggered: it.triggered,
    type: it.type,
  }));
  const pending = st.pendingChoice
    ? {
        chooser:
          (st.pendingChoice as { playerId?: string; prompter?: string }).playerId ??
          (st.pendingChoice as { prompter?: string }).prompter,
        source: (st.pendingChoice as { sourceCardId?: string }).sourceCardId,
        type: st.pendingChoice.type,
      }
    : null;
  const log = recentLog(m, 6);
  const myDecision = g.backend.decisionFor(seat);

  const lines: string[] = [];
  lines.push(
    `Game ${m.id} (${m.mode}) seq ${obs.seq} — turn ${obs.turn.number}, ${obs.turn.activePlayer}'s ${obs.turn.phase} phase — status ${obs.status}${obs.winner ? ` (winner ${obs.winner})` : ""}. You are ${seat}.`,
  );
  lines.push(
    `Points (to ${st.victoryScore}): ${seats.map((s) => `${s} ${obs.points[s] ?? 0}`).join(", ")}`,
  );
  lines.push(
    `Your pool: energy ${you.energy}, power ${fmtPower(you.power)} | runes ${runes.filter((r) => r.isReady).length}/${runes.length} ready (${summarizeRunes(runes)})`,
  );
  for (const o of opponents) {
    lines.push(
      `${o.seat}: energy ${o.resources.energy}, power ${fmtPower(o.resources.power)} | runes ${o.runes.ready}/${o.runes.total} ready | hand ${o.handCount} | deck ${o.deckCount}${o.legend ? ` | legend ${o.legend}` : ""}`,
    );
  }
  if (legend || champion) {
    lines.push(
      `Your legend: ${legend ? legend.name : "-"}${champion ? ` | champion zone: ${champion.name} [${champion.id}]` : ""}`,
    );
  }
  lines.push(`Battlefields:`);
  for (const bf of battlefields) {
    const mine = bf.units.filter((u) => u.owner === seat).map(cardLine);
    const theirs = bf.units.filter((u) => u.owner !== seat).map(cardLine);
    lines.push(
      `  ${bf.name} [${bf.id}] ctrl=${bf.controller ?? "none"}${bf.contested ? ` CONTESTED by ${bf.contestedBy}` : ""}${bf.facedown ? ` facedown=${bf.facedown}` : ""} — yours: ${mine.join("; ") || "-"} | theirs: ${theirs.join("; ") || "-"}`,
    );
  }
  lines.push(`Your base: ${base.map(cardLine).join("; ") || "-"}`);
  for (const o of opponents) {
    lines.push(`${o.seat} base: ${o.base.map(cardLine).join("; ") || "-"}`);
  }
  lines.push(`Your hand (${handViews.length}): ${hand.map(cardLine).join("; ") || "-"}`);
  lines.push(
    `Chain: ${chain.length ? chain.map((c) => `${c.card} (${c.type}${c.triggered ? ", triggered" : ""}, ${c.controller})`).join(" → ") : "empty"}${st.interaction?.chain?.active ? ` — priority ${st.interaction.chain.activePlayer}` : ""}`,
  );
  if (showdown?.active) {
    lines.push(
      `Showdown at ${showdown.battlefieldId}: focus ${showdown.focusPlayer}${showdown.isCombatShowdown ? ` (combat: ${showdown.attackingPlayer} attacking ${showdown.defendingPlayer})` : ""}`,
    );
  }
  if (pending) {
    lines.push(
      `Pending choice: ${pending.type} for ${pending.chooser}${pending.source ? ` (source ${pending.source})` : ""}`,
    );
  }
  lines.push(`Decision: ${decisionSummaryLine(obs.decision)}`);
  if (myDecision && obs.decision && myDecision.id !== obs.decision.id) {
    lines.push(`Your free actions: ${decisionSummaryLine(myDecision)}`);
  }
  if (log.length) {
    lines.push(`Recent: ${log.slice(-4).join(" | ")}`);
  }

  const json: Record<string, unknown> = {
    battlefields,
    chain,
    decision: slimDecisionSummary(obs.decision),
    log,
    opponents,
    pendingChoice: pending,
    points: obs.points,
    showdown: showdown?.active
      ? {
          attacker: showdown.attackingPlayer,
          battlefield: showdown.battlefieldId,
          combat: showdown.isCombatShowdown,
          defender: showdown.defendingPlayer,
          focus: showdown.focusPlayer,
        }
      : null,
    status: obs.status,
    turn: obs.turn,
    victoryScore: st.victoryScore,
    winner: obs.winner,
    you: {
      base,
      champion: champion ? compactCard(champion) : null,
      deckCount: ownedBy(obs.zones.mainDeck ?? [], seat).length,
      hand,
      legend: legend ? { id: legend.id, name: legend.name } : null,
      points: obs.points[seat] ?? 0,
      resources: you,
      runes: runes.map((r) => ({ domain: r.domains[0], id: r.id, ready: r.isReady })),
      seat,
      trash: visible(ownedBy(obs.zones.trash ?? [], seat)).map((c) => `${c.name} [${c.id}]`),
    },
  };
  if (detail === "zones" || detail === "full") {
    const zones: Record<string, unknown[]> = {};
    for (const [zone, views] of Object.entries(obs.zones)) {
      zones[zone] = views.map((v) =>
        isHiddenView(v) ? { hidden: true, owner: v.owner } : compactCard(v, { owner: true }),
      );
    }
    json.zones = zones;
  }
  if (detail === "full") {
    json.observation = obs;
  }
  return { json, text: lines.join("\n") };
}

function slimDecisionSummary(d: Decision | DecisionSummary | null): Record<string, unknown> | null {
  if (!d) {
    return null;
  }
  const base: Record<string, unknown> = { id: d.id, kind: d.kind, prompt: d.prompt, seat: d.seat };
  if ("context" in d) {
    base.context = d.context;
  }
  if (d.kind === "action" && "options" in d) {
    base.optionCount = (d as ActionDecision).options.length;
    base.passKey = (d as ActionDecision).passKey;
    base.endTurnKey = (d as ActionDecision).endTurnKey;
  } else if ("options" in d) {
    base.options = (d.options as { key: string; label: string }[]).map((o) => ({
      key: o.key,
      label: o.label,
    }));
  }
  if ("synthetic" in d && d.synthetic) {
    base.followUp = true;
  }
  return base;
}

function fmtPower(p: Readonly<Record<string, number>>): string {
  const entries = Object.entries(p).filter(([, n]) => n > 0);
  return entries.length ? entries.map(([k, n]) => `${k}:${n}`).join(",") : "-";
}

function summarizeRunes(runes: CardState[]): string {
  if (runes.length === 0) {
    return "none";
  }
  const by = new Map<string, { ready: number; total: number }>();
  for (const r of runes) {
    const d = r.domains[0] ?? "?";
    const e = by.get(d) ?? { ready: 0, total: 0 };
    e.total += 1;
    if (r.isReady) {
      e.ready += 1;
    }
    by.set(d, e);
  }
  return [...by.entries()].map(([d, e]) => `${d} ${e.ready}/${e.total}`).join(", ");
}
