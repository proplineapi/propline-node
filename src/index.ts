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
  PropLineOptions,
  GetOddsOptions,
  GetOddsHistoryOptions,
  GetScoresOptions,
  GetStatsOptions,
  GetResultsOptions,
  GetPlayerHistoryOptions,
  GetEventEvOptions,
  CalcEventEvOptions,
  ExportResolvedPropsOptions,
  CreateWebhookOptions,
  UpdateWebhookOptions,
  ListWebhookDeliveriesOptions,
  VerifySignatureOptions,
} from "./client.js";

export type {
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
  OddsHistoryResponse,
  ScoreEvent,
  PlayerStat,
  StatsResponse,
  ResultsMarket,
  ResultsResponse,
  PlayerHistoryEntry,
  PlayerHistoryResponse,
  EvOutcome,
  EvLine,
  EventEvResponse,
  EventEvCalcResponse,
  FuturesOutcome,
  FuturesMarket,
  FuturesEvent,
  Webhook,
  WebhookDelivery,
} from "./types.js";

/** String constants for bookmaker keys in odds responses. */
export const Bookmakers = {
  BOVADA: "bovada",
  DRAFTKINGS: "draftkings",
  FANDUEL: "fanduel",
  PINNACLE: "pinnacle",
  PRIZEPICKS: "prizepicks",
  UNIBET: "unibet",
} as const;

export type BookmakerKey = (typeof Bookmakers)[keyof typeof Bookmakers];

export const VERSION = "0.4.0";
