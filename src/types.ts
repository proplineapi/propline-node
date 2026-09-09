/**
 * Response shape definitions for PropLine API.
 *
 * These mirror the JSON returned by api.prop-line.com and are intentionally
 * loose — every interface allows extra fields so adding a column server-side
 * never breaks consumers. Use them as guides, not contracts.
 */

export interface Sport {
  key: string;
  title: string;
  active: boolean;
  [k: string]: unknown;
}

export interface Event {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /**
   * Stable per-team join key ("st_mirren", "chiefs"). Every bookmaker
   * spelling of a club resolves to the same key, and a published key is
   * never renamed — key stored per-team data on this, not on the display
   * name. `null` when the team cannot be identified with certainty
   * (individual sports like tennis/golf have no team; a small tail of
   * team sports lacks coverage) — fall back to the name there.
   */
  home_team_key?: string | null;
  /** Away-side counterpart of `home_team_key`. */
  away_team_key?: string | null;
  /**
   * The league's own permanent team id, namespaced by source ("mlb:147",
   * "espn.soccer:363", "espn.nfl:12"). Use `home_team_key` to key data
   * inside PropLine; use this to join PropLine rows against external
   * datasets keyed on the same league ids. Sourced from the stats feeds
   * PropLine grades against, never guessed — `null` where no confirmed id
   * exists.
   */
  home_team_id?: string | null;
  /** Away-side counterpart of `home_team_id`. */
  away_team_id?: string | null;
  /**
   * Event ids that were merged INTO this event when duplicate fixtures
   * from different bookmakers were folded into one. Always present (there
   * is no flag); `null`/absent for the large majority of events, which
   * have never been merged.
   *
   * Use it to reconcile a stored id from a response you were already
   * fetching. The alternative — re-requesting each saved id to see where
   * it now resolves — costs one request per stored event.
   */
  merged_from_event_ids?: string[] | null;
  [k: string]: unknown;
}

export interface Outcome {
  name: string;
  description?: string | null;
  price: number;
  point?: number | null;
  /**
   * DFS payout multiplier for boosted/discounted picks (Underdog Fantasy).
   * Populated on EVERY Underdog outcome; `null`/absent means the book is
   * not Underdog. `1.0` is a standard pick whose `price` carries the full
   * payout; e.g. `1.5` (boost) or `0.75` (discount) scales the effective
   * payout. Keep only `payout_multiplier === 1.0` when comparing DFS lines
   * to sportsbook consensus so a scaled payout doesn't read as a mispriced
   * edge — filtering on non-null would drop every Underdog line.
   */
  payout_multiplier?: number | null;
  /**
   * PrizePicks projection flavor: `"standard"` (the true market line),
   * `"goblin"` (easier line / lower payout) or `"demon"` (harder line /
   * higher payout). `null`/absent for every traditional sportsbook. Filter
   * to `"standard"` to get PrizePicks's market line — goblin/demon arrive as
   * their own per-line markets (e.g. `"Points (demon 27.5)"`) so they never
   * overwrite it. PrizePicks publishes no numeric multiplier for these.
   */
  dfs_odds_type?: "standard" | "goblin" | "demon" | null;
  /**
   * PropLine's observed timestamp (ISO datetime) of the last time this
   * outcome's price actually changed. Distinct from `book_updated_at` (the
   * book's own publish-time, which only Bovada exposes): `last_change_at` is
   * derived by PropLine and is populated for every book, including Pinnacle
   * and PrizePicks. Compare it across books in a single `getOdds` call to
   * detect repricing lag without a separate `getOddsHistory` call per event.
   */
  last_change_at?: string | null;
  /**
   * The last delivery this outcome appeared in (ISO datetime) — the book
   * still had it on the board at that poll, whether or not the price moved.
   * Equals the market's `last_update` when the outcome was in the market's
   * latest delivery; an older value means the book has stopped sending this
   * selection while still sending the market (a withdrawal in progress).
   * `last_change_at` = when the price moved; `last_seen_at` = when it was
   * last offered. `/odds` only; null on rows predating 2026-08-26.
   */
  last_seen_at?: string | null;
  /**
   * This book's OWN identifier for the priced selection / contract, for
   * joining onto its native feed. Kalshi ships the per-contract market
   * ticker (e.g. `"KXMLBGAME-26AUG08NYYBOS-NYY"`). Only set when the
   * request passed `includeBookIds: true`; null for books that don't
   * publish a stable per-selection id.
   *
   * NB a two-sided market can share ONE id across both legs — a Kalshi
   * contract is binary, so Over and Under are its YES and NO sides. The
   * id identifies the contract; `name` says which side.
   */
  book_outcome_id?: string | null;
  /**
   * PropLine's own stable id for this selection (`outcomes.id`), present when
   * `includeBookIds=true`. Shared with `/odds/history`, `/odds/closing`, the
   * resolved-props CSV and webhook payloads — the join key across all of them.
   */
  outcome_id?: number | null;
  /**
   * Dollars a bettor can actually stake at the quoted `price` — exchange
   * books that publish resting-offer size only (ProphetX today). `null`/
   * absent for every other book, and for an exchange quote whose size the
   * feed omitted (never coerced to 0). On a P2P exchange the best price is
   * often a thin dangling offer with only a few dollars behind it — filter
   * or discount small values before treating the price as bettable.
   * Refreshed every poll cycle independently of price movement; liquidity
   * changes never appear in `getOddsHistory` or fire `line_movement`
   * webhooks.
   */
  liquidity?: number | null;
  /**
   * Signed line-difficulty delta for a PrizePicks goblin/demon outcome:
   * `point - standard_point` for the same player+stat. Positive on a harder
   * (demon) line, negative on an easier (goblin) line. `null`/absent when the
   * outcome isn't a PrizePicks goblin/demon, or when no `standard` line exists
   * for that player+stat (PrizePicks often posts a player goblin/demon-only).
   * PrizePicks publishes no numeric per-pick multiplier — the flavor plus this
   * line gap are the modelable signals for fitting per-pick payout adjustments.
   * Returned on `getOdds`; only ever set on PrizePicks goblin/demon outcomes.
   */
  line_gap?: number | null;
  /**
   * Stable, cross-referenceable league player id for joining the SAME player
   * across books WITHOUT name matching — `"{source}:{league_id}"`:
   * `"mlb:592450"` (MLBAM person id), `"nba:"`/`"wnba:"` (CDN personId, separate
   * id spaces), `"nhl:"` (api-web playerId), `"espn:8439"` (ESPN athlete id, for
   * soccer/NFL/NCAAF). A real league id rather than a name-hash, so it
   * distinguishes two players with the same name, is stable across seasons, and
   * cross-references to the league's own API.
   *
   * Present on player-prop markets only (always `null` on game lines and
   * futures), unconditional (no query param), on `getOdds` and `getEventResults`.
   * `null`/absent whenever we lack a CONFIRMED, unambiguous id — and never
   * guessed, because a wrong join is worse than a missed one: a sport with no
   * stable-id stats feed (tennis/golf/UFC/… — null forever), a player who has
   * never graded, a book spelling that diverges from the league's (`"Elmer
   * Rodríguez"` gets the id, `"Elmer Rodriguez Cruz"` stays null), or a name two
   * players share. Coverage warms as games grade after launch.
   */
  player_id?: string | null;
  [k: string]: unknown;
}

export interface ResolvedOutcome extends Outcome {
  resolution: "won" | "lost" | "push" | "void" | null;
  actual_value: number | null;
  resolved_at: string | null;
  redacted?: boolean;
}

export interface Market {
  key: string;
  /**
   * The book's OWN name for this market row, and the only thing that separates
   * a TEAM total from the game total — both ride the `totals` key (e.g.
   * `"Total"` at 2.5 alongside `"Team Total - Arsenal"` at 1.5). Wording is per
   * book, so prefer the `team` field below rather than parsing this string.
   * Present on odds, odds history, closing lines and movement.
   */
  description?: string;
  /** Game-period bucket (q1..q4, h1/h2, p1..p3, i1..i9, f3/f5/f7). Null for full-game markets. */
  period?: string | null;
  /**
   * Set when this book has taken the market off the board pregame (the
   * pull-side twin of the `market_suspended` webhook). Null = on the board.
   * The outcomes are then the last quoted legs, not a live price.
   */
  suspended_at?: string | null;
  /**
   * Canonical event team name when this market is scoped to ONE team — i.e.
   * a team total — and null for the game total. Both ride the `totals` key,
   * so this is the machine-readable form of `description`: it matches the
   * event's `home_team` / `away_team` exactly, so you never parse a book's
   * wording. Always null outside `totals`.
   */
  team?: string | null;
  outcomes: Outcome[];
  [k: string]: unknown;
}

export interface Bookmaker {
  key: string;
  title: string;
  /**
   * Public event-page URL at this book. Only set when the request
   * passed `includeLinks: true` and the book has a verified URL
   * template (Bovada / DraftKings / FanDuel / BetMGM / Kalshi /
   * Polymarket / Smarkets); null or absent otherwise.
   */
  link?: string | null;
  /**
   * This book's OWN event identifier (Kalshi event ticker, DraftKings /
   * BetMGM numeric event id, Pinnacle matchup id, ...). Only set when the
   * request passed `includeBookIds: true` and this book publishes a
   * stable id; null otherwise.
   */
  book_event_id?: string | null;
  /**
   * True when the event is LIVE and this book does not price it in play.
   * Its prices below are the last PREGAME quote and will not move again
   * until the game ends — they are not a live price.
   *
   * This is the one staleness class `Market.suspended_at` cannot show:
   * that flag is set when a book pulls a market from a poll, and a book
   * with no in-play feed is never polled for the fixture once it starts,
   * so nothing goes missing and nothing is flagged. Always false before
   * kickoff.
   *
   * The rows are still returned rather than withheld, because on the DFS
   * books the frozen pregame line is the number the bet settles against.
   * Filter these out yourself if you are pricing in play.
   */
  pregame_only?: boolean;
  markets: Market[];
  [k: string]: unknown;
}

export interface OddsResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /**
   * Stable per-team join key ("st_mirren", "chiefs"). Every bookmaker
   * spelling of a club resolves to the same key, and a published key is
   * never renamed — key stored per-team data on this, not on the display
   * name. `null` when the team cannot be identified with certainty
   * (individual sports like tennis/golf have no team; a small tail of
   * team sports lacks coverage) — fall back to the name there.
   */
  home_team_key?: string | null;
  /** Away-side counterpart of `home_team_key`. */
  away_team_key?: string | null;
  /**
   * The league's own permanent team id, namespaced by source ("mlb:147",
   * "espn.soccer:363", "espn.nfl:12"). Use `home_team_key` to key data
   * inside PropLine; use this to join PropLine rows against external
   * datasets keyed on the same league ids. Sourced from the stats feeds
   * PropLine grades against, never guessed — `null` where no confirmed id
   * exists.
   */
  home_team_id?: string | null;
  /** Away-side counterpart of `home_team_id`. */
  away_team_id?: string | null;
  /**
   * Event ids that were merged INTO this event when duplicate fixtures
   * from different bookmakers were folded into one. Always present (there
   * is no flag); `null`/absent for the large majority of events, which
   * have never been merged.
   *
   * Use it to reconcile a stored id from a response you were already
   * fetching. The alternative — re-requesting each saved id to see where
   * it now resolves — costs one request per stored event.
   */
  merged_from_event_ids?: string[] | null;
  bookmakers: Bookmaker[];
  [k: string]: unknown;
}

export interface MarketSummary {
  key: string;
  outcomes_count: number;
  [k: string]: unknown;
}

export interface OutcomeSnapshot {
  recorded_at: string;
  price: number;
  point?: number | null;
  [k: string]: unknown;
}

export interface OddsHistoryOutcome {
  name: string;
  description?: string | null;
  /** PropLine's stable id for this selection — shared with `/odds?includeBookIds=true`, `/odds/closing`, the resolved-props CSV and webhook payloads. */
  outcome_id?: number | null;
  snapshots: OutcomeSnapshot[];
  snapshots_available?: number;
  redacted?: boolean;
  [k: string]: unknown;
}

export interface OddsHistoryMarket {
  key: string;
  /** Game-period bucket. Null for full-game markets. */
  period?: string | null;
  /**
   * Canonical event team name when this market is scoped to ONE team — i.e.
   * a team total — and null for the game total. Both ride the `totals` key,
   * so this is the machine-readable form of `description`: it matches the
   * event's `home_team` / `away_team` exactly, so you never parse a book's
   * wording. Always null outside `totals`.
   */
  team?: string | null;
  outcomes: OddsHistoryOutcome[];
  [k: string]: unknown;
}

export interface OddsHistoryBookmaker {
  key: string;
  title: string;
  markets: OddsHistoryMarket[];
  [k: string]: unknown;
}

export interface OddsHistoryResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsHistoryBookmaker[];
  upgrade_url?: string;
  [k: string]: unknown;
}

export interface ClosingOutcome {
  name: string;
  description?: string | null;
  /** PropLine's stable id for this selection — shared with `/odds?includeBookIds=true`, `/odds/history`, the resolved-props CSV and webhook payloads. */
  outcome_id?: number | null;
  price: number | null;
  point: number | null;
  /** recorded_at of the snapshot we picked as "closing" (last at-or-before commence_time). */
  closing_at?: string | null;
  /** Seconds between `closing_at` and kickoff. Large = the book stopped quoting early. */
  closing_age_seconds?: number | null;
  /** True when `closing_age_seconds` > 600 — advisory, not a hard filter. */
  is_stale?: boolean;
  /** American price of the first snapshot in the 14 days before kickoff. */
  opening_price?: number | null;
  /**
   * Line that went with `opening_price`. On spreads and totals the point
   * moves as much as the price (-3 -110 -> -3.5 -105), so compare this to
   * `point` (the closing line), not just the two prices.
   */
  opening_point?: number | null;
  /** recorded_at of the chosen opening snapshot. */
  opening_at?: string | null;
  /**
   * Seconds between `opening_at` and kickoff. The archive starts 2026-04,
   * so for a book/sport PropLine began polling after the line was posted,
   * "opening" means first-observed-by-us rather than the book's true open —
   * a value in minutes rather than hours is the tell.
   */
  opening_age_seconds?: number | null;
  book_updated_at?: string | null;
  book_version?: number | null;
  redacted?: boolean;
  /** PrizePicks projection tier (standard/goblin/demon); null for sportsbooks. */
  dfs_odds_type?: string | null;
  [k: string]: unknown;
}

export interface ClosingMarket {
  key: string;
  description?: string;
  /** Game-period bucket. Null for full-game markets. */
  period?: string | null;
  /**
   * Canonical event team name when this market is scoped to ONE team — i.e.
   * a team total — and null for the game total. Both ride the `totals` key,
   * so this is the machine-readable form of `description`: it matches the
   * event's `home_team` / `away_team` exactly, so you never parse a book's
   * wording. Always null outside `totals`.
   */
  team?: string | null;
  outcomes: ClosingOutcome[];
  [k: string]: unknown;
}

export interface ClosingBookmaker {
  key: string;
  title: string;
  markets: ClosingMarket[];
  [k: string]: unknown;
}

export interface OddsClosingResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: ClosingBookmaker[];
  upgrade_url?: string;
  [k: string]: unknown;
}

export interface ScoreEvent {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /**
   * Stable per-team join key ("st_mirren", "chiefs"). Every bookmaker
   * spelling of a club resolves to the same key, and a published key is
   * never renamed — key stored per-team data on this, not on the display
   * name. `null` when the team cannot be identified with certainty
   * (individual sports like tennis/golf have no team; a small tail of
   * team sports lacks coverage) — fall back to the name there.
   */
  home_team_key?: string | null;
  /** Away-side counterpart of `home_team_key`. */
  away_team_key?: string | null;
  /**
   * The league's own permanent team id, namespaced by source ("mlb:147",
   * "espn.soccer:363", "espn.nfl:12"). Use `home_team_key` to key data
   * inside PropLine; use this to join PropLine rows against external
   * datasets keyed on the same league ids. Sourced from the stats feeds
   * PropLine grades against, never guessed — `null` where no confirmed id
   * exists.
   */
  home_team_id?: string | null;
  /** Away-side counterpart of `home_team_id`. */
  away_team_id?: string | null;
  status: "upcoming" | "in_progress" | "final" | string;
  home_score: number | null;
  away_score: number | null;
  [k: string]: unknown;
}

export interface MlbGrandSalamiBook {
  key: string;
  title: string;
  /** Number of games on the slate for which this book quoted a primary game total. */
  games_priced: number;
  /** Sum of each priced game's primary O/U line. */
  line: number;
  /** "over" / "under" / "push" once the slate is final; null until then. */
  result: "over" | "under" | "push" | null;
}

export interface MlbGrandSalamiResponse {
  sport_key: "baseball_mlb";
  /** YYYY-MM-DD (UTC). */
  date: string;
  games_total: number;
  games_completed: number;
  games_in_progress: number;
  games_upcoming: number;
  /** Sum of (home_score + away_score) across completed games. Null until at least one completes. */
  actual_total_runs: number | null;
  bookmakers: MlbGrandSalamiBook[];
}

export interface NhlDailyGoalsTotalBook {
  key: string;
  title: string;
  /** Number of NHL games on the slate for which this book quoted a primary game total. */
  games_priced: number;
  /** Sum of each priced game's primary O/U line — the implied Daily Goals Total. */
  line: number;
  /** "over" / "under" / "push" once the slate is final; null until then. */
  result: "over" | "under" | "push" | null;
}

export interface NhlDailyGoalsTotalResponse {
  sport_key: "hockey_nhl";
  /** YYYY-MM-DD (UTC). */
  date: string;
  games_total: number;
  games_completed: number;
  games_in_progress: number;
  games_upcoming: number;
  /** Sum of (home_score + away_score) across completed games (incl. OT/SO). Null until at least one completes. */
  actual_total_goals: number | null;
  bookmakers: NhlDailyGoalsTotalBook[];
}

export interface ResolutionSummarySport {
  sport_key: string;
  title: string;
  graded: number;
  events: number;
}

export interface ResolutionSummaryMarket {
  market_key: string;
  graded: number;
}

export interface ResolutionSummary {
  days: number;
  /** Resolution set incl. void. */
  total_graded: number;
  /** won/lost/push only (excl. void). */
  total_settled: number;
  events_graded: number;
  sports_covered: number;
  by_sport: ResolutionSummarySport[];
  /** Top 12 markets by graded volume. */
  top_markets: ResolutionSummaryMarket[];
  [k: string]: unknown;
}

export interface PlayerStat {
  player_name: string;
  team_abbr: string;
  stat_type: string;
  stat_value: number;
  [k: string]: unknown;
}

export interface StatsResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  stats: PlayerStat[];
  [k: string]: unknown;
}

export interface ResultsMarket {
  key: string;
  outcomes: ResolvedOutcome[];
  [k: string]: unknown;
}

export interface WeatherInfo {
  temperature_f: number | null;
  humidity_pct: number | null;
  precip_probability_pct: number | null;
  precip_in: number | null;
  wind_speed_mph: number | null;
  wind_gust_mph: number | null;
  wind_direction_deg: number | null;
  wind_direction: string | null;
  conditions: string | null;
  observed_for: string | null;
  [k: string]: unknown;
}

export interface ContextResponse {
  event_id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  venue: string | null;
  roof_type: string | null;
  is_indoor: boolean;
  home_probable_pitcher: string | null;
  away_probable_pitcher: string | null;
  /** Throwing hand of the probable starter: "L", "R", or "S" (switch). MLB only. */
  home_probable_pitcher_hand: string | null;
  away_probable_pitcher_hand: string | null;
  lineup_confirmed: boolean;
  home_plate_umpire: string | null;
  weather: WeatherInfo | null;
  updated_at: string | null;
  [k: string]: unknown;
}

export interface MovementOutcome {
  name: string;
  description: string | null;
  open_price: number | null;
  open_point: number | null;
  open_at: string | null;
  latest_price: number | null;
  latest_point: number | null;
  latest_at: string | null;
  prob_shift: number | null;
  point_shift: number | null;
  direction: string | null;
  num_snapshots: number;
  redacted: boolean;
  [k: string]: unknown;
}

export interface MovementMarket {
  key: string;
  period: string | null;
  /**
   * Canonical event team name when this market is scoped to ONE team — i.e.
   * a team total — and null for the game total. Both ride the `totals` key,
   * so this is the machine-readable form of `description`: it matches the
   * event's `home_team` / `away_team` exactly, so you never parse a book's
   * wording. Always null outside `totals`.
   */
  team?: string | null;
  outcomes: MovementOutcome[];
  [k: string]: unknown;
}

export interface MovementBookmaker {
  key: string;
  title: string;
  markets: MovementMarket[];
  [k: string]: unknown;
}

export interface SteamMove {
  market: string;
  period: string | null;
  name: string;
  description: string | null;
  books_quoting: number;
  books_moved: number;
  consensus_direction: string;
  avg_prob_shift: number;
  consensus_point_shift: number | null;
  steam_score: number;
  [k: string]: unknown;
}

export interface MovementResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: MovementBookmaker[];
  steam: SteamMove[];
  redacted?: boolean;
  upgrade_url?: string;
  [k: string]: unknown;
}

export interface ResultsResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  markets: ResultsMarket[];
  context?: ContextResponse | null;
  upgrade_url?: string;
  [k: string]: unknown;
}

export interface PlayerHistoryEntry {
  event_id: number | string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker: string;
  bookmaker_title: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
  actual_value: number | null;
  over_result: "won" | "lost" | "push" | "void" | null;
  under_result: "won" | "lost" | "push" | "void" | null;
  resolved_at: string | null;
  redacted?: boolean;
  [k: string]: unknown;
}

export interface PlayerHistoryResponse {
  player_name: string;
  sport_key: string;
  market: string;
  entries: PlayerHistoryEntry[];
  upgrade_url?: string;
  [k: string]: unknown;
}

/** Over/under/push tally over a rolling window of recent graded games. */
export interface HitRateSplit {
  window: number;
  games: number;
  over: number;
  under: number;
  push: number;
  over_pct: number | null;
  [k: string]: unknown;
}

/** Current run of consecutive identical results. */
export interface TrendStreak {
  result: "over" | "under" | "push" | string;
  length: number;
  [k: string]: unknown;
}

/** The most recent graded game for a player on a market. */
export interface TrendLastGame {
  event_id: number | string;
  commence_time: string;
  line: number | null;
  actual_value: number | null;
  result: "over" | "under" | "push" | string;
  [k: string]: unknown;
}

/** Trend summary for a single market. */
export interface PlayerMarketTrend {
  market: string;
  games_graded: number;
  reference_bookmaker: string | null;
  reference_bookmaker_title: string | null;
  recent_line: number | null;
  avg_actual: number | null;
  last_5: HitRateSplit | null;
  last_10: HitRateSplit | null;
  last_20: HitRateSplit | null;
  last_50: HitRateSplit | null;
  current_streak: TrendStreak | null;
  last_game: TrendLastGame | null;
  redacted?: boolean;
  [k: string]: unknown;
}

export interface PlayerTrends {
  player_name: string;
  sport_key: string;
  /**
   * Echo of the `dfs_odds_type` filter that scoped these trends (PrizePicks
   * flavor: `"standard"`/`"goblin"`/`"demon"`). `null` = cross-book,
   * flavor-agnostic.
   */
  dfs_odds_type?: string | null;
  markets: PlayerMarketTrend[];
  upgrade_url?: string | null;
  [k: string]: unknown;
}

export interface PlayerGame {
  event_id: string;
  commence_time: string;
  status: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  /** The box score's own team abbreviation for this player. */
  team_abbr: string | null;
  /**
   * Null when the player's side can't be identified from `team_abbr`, and
   * always for individual sports (tennis, golf, UFC) which have no home side.
   * Left null rather than guessed — a wrong home/away flag would corrupt
   * every split built on it.
   */
  player_team: string | null;
  opponent: string | null;
  is_home: boolean | null;
  /** Flat map of stat name to value. Vocabulary is per-sport. */
  stats: Record<string, number>;
  [k: string]: unknown;
}

export interface PlayerGameLog {
  player_name: string;
  sport_key: string;
  /** Echo of the `opponent` filter, or null. */
  opponent: string | null;
  games: PlayerGame[];
  [k: string]: unknown;
}

export interface BestPrice {
  book: string;
  book_title: string;
  /**
   * American odds at this book. Null only on free-tier redacted
   * responses — book identity and ranking stay visible, the price
   * is paid.
   */
  price: number | null;
  /**
   * When this book last refreshed the market carrying this price —
   * use it to discount stale quotes. ISO timestamp; null when the
   * book has no update signal.
   */
  last_update?: string | null;
  /**
   * Public event-page URL at this book — the click-out for "go bet
   * this". Only set when the request passed `includeLinks: true` and
   * the book has a verified URL template; null or absent otherwise.
   * Present on free-tier redacted rows too.
   */
  link?: string | null;
  /**
   * Dollars bettable at this price — exchange books publishing resting
   * size only (ProphetX today), null elsewhere. A thin exchange quote
   * often wins the "best" slot on price alone, so discount rows whose
   * liquidity is a few dollars. Nulled on free-tier redacted responses.
   */
  liquidity?: number | null;
  [k: string]: unknown;
}

export interface BestLineSide {
  /** Highest American price across all books for this side. */
  best: BestPrice;
  /** Every book's price, sorted best-first (descending price). */
  all_prices: BestPrice[];
  [k: string]: unknown;
}

export interface BestLine {
  market_key: string;
  /** Player name (props) or empty string (game lines). */
  description: string;
  /** The line — null for moneyline / 1X2. */
  point: number | null;
  /**
   * Map of side name → best price + alternatives. Sides are
   * typically `"Over"`/`"Under"` for player props and totals;
   * team names for moneylines and spreads.
   */
  sides: Record<string, BestLineSide>;
  [k: string]: unknown;
}

export interface EventBestLineResponse {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /**
   * Books that quoted at least one line on this event. DFS pick'em
   * books (PrizePicks, Sleeper, Dabble) are always excluded from
   * best-line responses — their quotes aren't independently bettable
   * payouts; Underdog is included only at its clean two-way lines
   * (payout_multiplier == 1.0).
   */
  books_considered: string[];
  lines: BestLine[];
  /**
   * True on free-tier responses: structure, book identities, and the
   * best-first ranking are visible but every price is null.
   */
  redacted?: boolean;
  /** Set on redacted responses — where to upgrade for full prices. */
  upgrade_url?: string | null;
  [k: string]: unknown;
}

export interface EvOutcome {
  book: string;
  book_title: string;
  /** Outcome label — e.g. `"Over"`, `"Under"`, team name. */
  name: string;
  /** American odds. */
  price: number;
  /** Expected value as a percent on a unit stake. Positive = +EV. */
  ev_pct: number;
  is_plus_ev: boolean;
  [k: string]: unknown;
}

export interface EvLine {
  market_key: string;
  /** Player name (props) or empty string (game lines). */
  description: string;
  /** The line — null for moneyline / 1X2. */
  point: number | null;
  /** Which book anchored the no-vig fair calc (typically `"pinnacle"`). */
  fair_source: string;
  /** Map of outcome name → normalized fair probability. */
  fair_probs: Record<string, number>;
  outcomes: EvOutcome[];
  [k: string]: unknown;
}

export interface EventEvResponse {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /** Documents the priority order used for the fair anchor. */
  fair_source_default: string;
  lines: EvLine[];
  [k: string]: unknown;
}

export interface ProjectionRow {
  market_key: string;
  player: string;
  /**
   * Stable cross-book player id from the graded-name registry
   * ("mlb:592450" / "espn:8439" style); null until the player has graded
   * at least once, or on an ambiguous name. Same semantics as the
   * per-outcome player_id on /odds.
   */
  player_id: string | null;
  /**
   * The market-implied statistical value — the line where the no-vig
   * P(over) crosses 50%, median across contributing books. Null on the
   * free tier (redacted teaser).
   */
  projected_value: number | null;
  consensus_over_prob: number | null;
  books_contributing: number;
  last_update: string | null;
  [k: string]: unknown;
}

export interface EventProjectionsResponse {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /** Describes the market-implied method; never a forecast. */
  method: string;
  projections: ProjectionRow[];
  redacted: boolean;
  upgrade_url: string | null;
  [k: string]: unknown;
}

export interface EventEvCalcResponse {
  market: string;
  name: string;
  point: number | null;
  description: string;
  price: number;
  /** Which book the no-vig fair anchor came from (pinnacle, bovada, ...). */
  fair_source: string;
  /** No-vig fair win probability for `name` at `point`. */
  fair_prob: number;
  /** Win probability implied by the user's `price`. */
  implied_prob: number;
  ev_pct: number;
  is_plus_ev: boolean;
  [k: string]: unknown;
}

export interface FuturesOutcome {
  /** Team or player name. */
  name: string;
  /** American odds. */
  price: number | null;
  price_decimal: number | null;
  /**
   * Settlement, for the season-long team futures a final regular-season
   * table decides — win totals, division winners and the conference #1
   * seed on NFL / NBA / MLB. Null on everything else: a championship, a
   * pennant or a conference title is not in any standings table, and
   * awards (MVP, Coach of the Year) are published by no free feed, so
   * those stay honestly unsettled rather than guessed.
   */
  resolution?: "won" | "lost" | "push" | "void" | null;
  /**
   * The figure settled against — a team's season wins for a win total,
   * 1/0 for a yes-style outright. Null until settled.
   */
  actual_value?: number | null;
  settled_at?: string | null;
  [k: string]: unknown;
}

export interface FuturesMarket {
  /** Slugified description, e.g. "world_series_winner". */
  key: string;
  /** Original book label, e.g. "World Series Winner". */
  description: string;
  bookmaker: string;
  bookmaker_title: string;
  last_update: string;
  /** When the book itself reports this market was last updated; null when the book doesn't expose a publish-time signal. */
  book_updated_at: string | null;
  outcomes: FuturesOutcome[];
  [k: string]: unknown;
}

export interface FuturesEvent {
  id: string;
  sport_key: string;
  /** The futures title from the book, e.g. "World Series 2026". */
  title: string;
  /** Season-end / target resolution time. */
  commence_time: string;
  markets: FuturesMarket[];
  [k: string]: unknown;
}

export interface Webhook {
  id: number;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
  filter_sport_key: string | null;
  filter_event_id: number | null;
  filter_market_key: string | null;
  filter_player_name: string | null;
  filter_bookmaker_key: string | null;
  min_price_change_pct: number | null;
  min_steam_score: number | null;
  min_books_agreeing: number | null;
  /** Batched delivery: up to N events per POST (null = per-event). */
  batch_max: number | null;
  created_at: string;
  [k: string]: unknown;
}

export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  status: "pending" | "success" | "failed" | string;
  response_code: number | null;
  attempts: number;
  delivered_at: string | null;
  payload: Record<string, unknown>;
  /**
   * This subscription's own event counter — the value sent as the
   * `X-PropLine-Sequence` header. Null on deliveries enqueued before the
   * sequence shipped; those cannot be replayed.
   */
  seq: number | null;
  [k: string]: unknown;
}

/** One event from `replayWebhookEvents`. */
export interface ReplayEvent {
  /** Cursor position. Monotonic within this subscription. */
  seq: number;
  delivery_id: number;
  event_type: string;
  created_at: string;
  /** The canonical payload that was (or would have been) POSTed. */
  data: Record<string, unknown>;
}

export interface ReplayPage {
  webhook_id: number;
  since_seq: number;
  /** Oldest first, so you can replay them forward. */
  events: ReplayEvent[];
  /**
   * Cursor for the next call. Equals the `since_seq` you sent when the page
   * is empty, so a paging loop needs no special case.
   */
  next_seq: number;
  has_more: boolean;
  /** Bounds of what is still retained. Null when nothing is. */
  oldest_available_seq: number | null;
  newest_available_seq: number | null;
  /**
   * The most recent sequence ever issued to this subscription. NOT subject to
   * retention, so `latest_seq - next_seq` is an honest "how far behind am I"
   * even after the rows themselves are pruned.
   */
  latest_seq: number;
  /**
   * TRUE when events after your cursor have already aged out and are gone.
   * Check this: without it a short `events` array is indistinguishable from
   * "nothing to catch up on".
   */
  truncated: boolean;
  retention_note: string | null;
}

export interface DfsPayoutTier {
  correct: number;
  multiplier: number;
}

export interface DfsPlayPayout {
  play_type: "power" | "flex" | string;
  legs: number;
  all_correct_multiplier: number;
  payouts: DfsPayoutTier[];
  /** Per-leg win probability needed to break even (independent legs). */
  breakeven_leg_win_prob: number;
  /** Only present when leg_win_prob was supplied in the request. */
  expected_return?: number | null;
  is_plus_ev?: boolean | null;
  [k: string]: unknown;
}

export interface DfsPayoutsResponse {
  platform: string;
  leg_win_prob: number | null;
  disclaimer: string;
  plays: DfsPlayPayout[];
  [k: string]: unknown;
}

/**
 * One placed bet submitted to `gradeClv`.
 *
 * `selection` is the subject: player name for a prop, team name for a
 * game line. Set `side` ("Over" / "Under") for two-way markets; omit it
 * for YES-only props where the player IS the outcome.
 */
export interface ClvBetInput {
  /** Echoed back untouched, so rows can be aligned without relying on order. */
  ref?: string | null;
  sport_key: string;
  event_id: number;
  market: string;
  bookmaker: string;
  selection: string;
  side?: string | null;
  point?: number | null;
  /** Canonical period code (q1, h1, p1, f5). Omit for full-game markets. */
  period?: string | null;
  /** American odds you took. */
  price: number;
  /** Defaults to 1 unit when computing `profit_units`. */
  stake?: number | null;
}

/** One graded bet returned by `gradeClv`. */
export interface ClvGradedBet extends ClvBetInput {
  /**
   * False whenever the bet could not be pinned to EXACTLY one stored
   * outcome. Matching is fail-closed: a confident wrong match would report
   * a real-looking CLV for a different bet, so ambiguity is refused.
   */
  matched: boolean;
  unmatched_reason?:
    | "event_not_found"
    | "no_market_for_key"
    | "no_outcome_for_selection"
    | "ambiguous_selection"
    | "no_closing_snapshot"
    | null;

  closing_price?: number | null;
  closing_point?: number | null;
  closing_at?: string | null;
  /** Book stopped quoting well before kickoff — advisory, not a hard filter. */
  closing_is_stale: boolean;
  /**
   * False when the event had not started, i.e. the "closing" snapshot is
   * just the latest price. These rows are excluded from summary averages.
   */
  closing_is_final: boolean;

  /** Which book's closing pair the de-vig came from — NOT necessarily yours. */
  fair_source?: string | null;
  closing_fair_prob?: number | null;

  /** Price-vs-price. Familiar and quotable, but vig-blind. */
  clv_pct?: number | null;
  /** Price vs the DE-VIGGED close. The honest number. */
  ev_vs_close_pct?: number | null;
  beat_close?: boolean | null;

  resolution?: "won" | "lost" | "push" | "void" | null;
  actual_value?: number | null;
}

export interface ClvSummary {
  bets: number;
  matched: number;
  unmatched: number;
  graded: number;
  /** Matched bets whose event has not started; excluded from the averages. */
  pending: number;
  avg_clv_pct?: number | null;
  avg_ev_vs_close_pct?: number | null;
  beat_close_pct?: number | null;
  profit_units?: number | null;
}

export interface ClvGradeResponse {
  summary: ClvSummary;
  bets: ClvGradedBet[];
  redacted?: boolean;
  upgrade_url?: string | null;
}

/**
 * One leg of a same-game parlay submitted to `priceSgp`, named exactly as
 * `/odds` names an outcome. Or pass `book_outcome_id` (from
 * `includeBookIds: true`), which overrides the other fields.
 */
export interface SgpLegInput {
  /** Market key as served by /odds, e.g. "h2h", "totals", "batter_1plus_hits". */
  market?: string | null;
  /** Outcome name: team name, "Over"/"Under", or the player for YES-only props. */
  name?: string | null;
  /** Outcome description (the player on a two-way prop); "" for game lines. */
  description?: string;
  /** Line exactly as served by /odds. Omit for h2h and YES-only props. */
  point?: number | null;
  /** Canonical period code (q1, h1, f5). Omit for full game. */
  period?: string | null;
  /**
   * For a TEAM total: the team, as /odds serves it in the market's `team`
   * field. Omit for the game total — a totals leg with no team matches the
   * team-less market only.
   */
  team?: string | null;
  /**
   * The book's own id from includeBookIds. Overrides the other fields. On
   * betonlineag / lowvig this is Sportcast's settlement id (MatchWinner_Home).
   */
  book_outcome_id?: string | null;
}

/** One leg as the book saw it, returned by `priceSgp`. */
export interface SgpLegQuote {
  index: number;
  market: string;
  name: string;
  description: string;
  point: number | null;
  period: string | null;
  /** The team a team total is scoped to, as /odds serves it; null for the game total. */
  team: string | null;
  book_outcome_id: string | null;
  /** The last price PropLine stored for this leg (American). */
  price: number | null;
  /** The single-leg price the book quoted in the same call — the live number. */
  book_price: number | null;
  accepted: boolean | null;
  /** The book's own refusal code when it would not take this leg in the slip. */
  failure_code?: string | null;
}

export interface SgpQuoteResponse {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmaker: string;
  bookmaker_title: string;
  legs: SgpLegQuote[];
  /** True when the book priced the FULL combination; null on the free tier. */
  quoted: boolean | null;
  /** The book's correlated parlay price (American). */
  sgp_price: number | null;
  sgp_price_decimal: number | null;
  /** Product of the live single-leg prices, as American odds. */
  independent_price: number | null;
  independent_price_decimal: number | null;
  /** sgp_price_decimal / independent_price_decimal. */
  correlation_factor: number | null;
  priced_at: string | null;
  redacted?: boolean;
  upgrade_url?: string | null;
}

/** One book that could not quote the slip under `bookmaker: "all"`. */
export interface SgpBookError {
  bookmaker: string;
  bookmaker_title: string;
  /** The HTTP status the single-book call would have returned. */
  status: number;
  /** The error code from that call's body (e.g. "event_not_at_book"), if any. */
  error: string | null;
  detail: unknown;
}

/**
 * `priceSgp(..., "all")`: every supported book quoted on the same legs.
 * `best_bookmaker` is the quoted book paying the most — on identical legs,
 * the one charging the smallest correlation reduction.
 */
export interface SgpMultiQuoteResponse {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmaker: "all";
  quotes: SgpQuoteResponse[];
  errors: SgpBookError[];
  best_bookmaker: string | null;
  redacted?: boolean;
  upgrade_url?: string | null;
}
