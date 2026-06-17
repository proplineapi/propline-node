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
  [k: string]: unknown;
}

export interface Outcome {
  name: string;
  description?: string | null;
  price: number;
  point?: number | null;
  /**
   * DFS payout multiplier for boosted/discounted picks (Underdog Fantasy).
   * `null`/absent = standard 1.0 pick whose `price` carries the full payout;
   * e.g. `1.5` (boost) or `0.75` (discount) scales the effective payout.
   * Skip outcomes with a non-null multiplier when comparing DFS lines to
   * sportsbook consensus so a scaled payout doesn't read as a mispriced edge.
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
  /** Game-period bucket (q1..q4, h1/h2, p1..p3, i1..i9, f3/f5/f7). Null for full-game markets. */
  period?: string | null;
  outcomes: Outcome[];
  [k: string]: unknown;
}

export interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
  [k: string]: unknown;
}

export interface OddsResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
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
  snapshots: OutcomeSnapshot[];
  snapshots_available?: number;
  redacted?: boolean;
  [k: string]: unknown;
}

export interface OddsHistoryMarket {
  key: string;
  /** Game-period bucket. Null for full-game markets. */
  period?: string | null;
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
  price: number | null;
  point: number | null;
  /** recorded_at of the snapshot we picked as "closing" (last at-or-before commence_time). */
  closing_at?: string | null;
  book_updated_at?: string | null;
  book_version?: number | null;
  redacted?: boolean;
  [k: string]: unknown;
}

export interface ClosingMarket {
  key: string;
  description?: string;
  /** Game-period bucket. Null for full-game markets. */
  period?: string | null;
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
  markets: PlayerMarketTrend[];
  upgrade_url?: string | null;
  [k: string]: unknown;
}

export interface BestPrice {
  book: string;
  book_title: string;
  /** American odds at this book. */
  price: number;
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
   * Books that quoted at least one line on this event. PrizePicks is
   * always excluded from best-line responses — its synthetic DFS
   * pricing isn't directly comparable to traditional sportsbook odds.
   */
  books_considered: string[];
  lines: BestLine[];
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
  min_price_change_pct: number | null;
  min_steam_score: number | null;
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
  [k: string]: unknown;
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
