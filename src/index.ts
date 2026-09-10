/**
 * PropLine — Node/TypeScript SDK for the PropLine player props API.
 *
 * @example
 * ```ts
 * import { PropLine } from "propline";
 *
 * const client = new PropLine("your_api_key");
 * const events = await client.getEvents("basketball_nba");
 * const odds = await client.getOdds("basketball_nba", {
 *   eventId: events[0].id,
 *   markets: ["player_points", "player_rebounds"],
 * });
 * ```
 */

export { PropLine } from "./client.js";
export {
  PropLineError,
  AuthError,
  RateLimitError,
} from "./client.js";
export type {
  PropLineErrorInfo,
  PropLineOptions,
  QuotaStatus,
  GetOddsOptions,
  GetOddsHistoryOptions,
  GetOddsClosingOptions,
  PeriodFilter,
  GetScoresOptions,
  GetDfsPayoutsOptions,
  GetMlbGrandSalamiOptions,
  GetNhlDailyGoalsTotalOptions,
  GetStatsOptions,
  GetResultsOptions,
  GetPlayerHistoryOptions,
  GetPlayerGamesOptions,
  GetPlayerTrendsOptions,
  GetEventEvOptions,
  GetEventProjectionsOptions,
  GetEventBestLineOptions,
  CalcEventEvOptions,
  ExportResolvedPropsOptions,
  ExportOddsHistoryOptions,
  WebhookEventType,
  CreateWebhookOptions,
  UpdateWebhookOptions,
  ListWebhookDeliveriesOptions,
  ReplayWebhookEventsOptions,
  StreamOptions,
  VerifySignatureOptions,
} from "./client.js";

export type {
  ClvBetInput,
  ClvGradedBet,
  ClvSummary,
  ClvGradeResponse,
  SgpLegInput,
  SgpLegQuote,
  SgpQuoteResponse,
  SgpMultiQuoteResponse,
  SgpBookError,
  Sport,
  Event,
  Outcome,
  ResolvedOutcome,
  Market,
  Bookmaker,
  OddsResponse,
  MarketSummary,
  OutcomeSnapshot,
  OddsHistoryOutcome,
  OddsHistoryMarket,
  OddsHistoryBookmaker,
  OddsHistoryResponse,
  ClosingOutcome,
  ClosingMarket,
  ClosingBookmaker,
  OddsClosingResponse,
  ScoreEvent,
  MlbGrandSalamiBook,
  MlbGrandSalamiResponse,
  NhlDailyGoalsTotalBook,
  NhlDailyGoalsTotalResponse,
  ResolutionSummary,
  ResolutionSummarySport,
  ResolutionSummaryMarket,
  PlayerStat,
  StatsResponse,
  WeatherInfo,
  ContextResponse,
  MovementOutcome,
  MovementMarket,
  MovementBookmaker,
  SteamMove,
  MovementResponse,
  ResultsMarket,
  ResultsResponse,
  PlayerHistoryEntry,
  PlayerHistoryResponse,
  HitRateSplit,
  TrendStreak,
  TrendLastGame,
  PlayerMarketTrend,
  PlayerGame,
  PlayerGameLog,
  PlayerTrends,
  EvOutcome,
  EvLine,
  EventEvResponse,
  EventProjectionsResponse,
  ProjectionRow,
  EventEvCalcResponse,
  BestPrice,
  BestLineSide,
  BestLine,
  EventBestLineResponse,
  FuturesOutcome,
  FuturesMarket,
  FuturesEvent,
  Webhook,
  WebhookDelivery,
  ReplayEvent,
  ReplayPage,
  DfsPayoutTier,
  DfsPlayPayout,
  DfsPayoutsResponse,
} from "./types.js";

/** String constants for bookmaker keys in odds responses. */
export const Bookmakers = {
  BOVADA: "bovada",
  DRAFTKINGS: "draftkings",
  FANDUEL: "fanduel",
  PINNACLE: "pinnacle",
  UNIBET: "unibet",
  UNDERDOG: "underdog",
  KALSHI: "kalshi",
  POLYMARKET: "polymarket",
  PRIZEPICKS: "prizepicks",
} as const;

export type BookmakerKey = (typeof Bookmakers)[keyof typeof Bookmakers];

export const VERSION = "0.49.0";
