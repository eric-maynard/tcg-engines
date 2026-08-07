/**
 * Shared evaluator for `{ type: "score-within" }` conditions.
 *
 * rule 383.2.a.1 — "if an opponent's score is within N points of the Victory
 * Score" is part of a triggered ability's Condition, so the same predicate must
 * answer for cost gates, effect-time conditionals and trigger gating alike.
 * The parser emits `points`; older hand-authored shapes used `range`.
 */

interface ScoreWithinShape {
  readonly points?: number;
  readonly range?: number;
  readonly whose?: string;
}

interface ScoreWithinState {
  readonly victoryScore?: number;
  readonly players: Record<
    string,
    { readonly victoryPoints?: number; readonly victoryScoreModifier?: number } | undefined
  >;
}

export function scoreWithinConditionMet(
  condition: ScoreWithinShape,
  state: ScoreWithinState,
  playerId: string,
): boolean {
  const range = condition.points ?? condition.range ?? 0;
  const whose = condition.whose ?? "opponent";
  const pids = Object.keys(state.players).filter((pid) =>
    whose === "your" ? pid === playerId : whose === "any" ? true : pid !== playerId,
  );
  return pids.some((pid) => {
    const player = state.players[pid];
    const threshold = (state.victoryScore ?? 0) + (player?.victoryScoreModifier ?? 0);
    return threshold - (player?.victoryPoints ?? 0) <= range;
  });
}
