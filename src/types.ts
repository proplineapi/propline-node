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
