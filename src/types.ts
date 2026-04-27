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
  outcomes: OddsHistoryOutcome[];
  [k: string]: unknown;
}

export interface OddsHistoryResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  markets: OddsHistoryMarket[];
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

export interface ResultsResponse {
  id: number | string;
  sport_key: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  markets: ResultsMarket[];
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
