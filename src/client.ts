import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";

import type {
  Sport,
  Event as PropLineEvent,
  OddsResponse,
  MarketSummary,
  OddsHistoryResponse,
  OddsClosingResponse,
  ScoreEvent,
  MlbGrandSalamiResponse,
  NhlDailyGoalsTotalResponse,
  ResolutionSummary,
  StatsResponse,
  ContextResponse,
  MovementResponse,
  ResultsResponse,
  PlayerHistoryResponse,
  PlayerTrends,
  EventEvResponse,
  EventEvCalcResponse,
  EventBestLineResponse,
  FuturesEvent,
  Webhook,
  WebhookDelivery,
} from "./types.js";

/** Base error for all PropLine API failures. */
export class PropLineError extends Error {
  readonly statusCode: number;
  readonly detail: string;

  constructor(statusCode: number, detail: string) {
    super(`[${statusCode}] ${detail}`);
    this.name = "PropLineError";
    this.statusCode = statusCode;
    this.detail = detail;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the API key is missing or invalid (HTTP 401). */
export class AuthError extends PropLineError {
  constructor(detail = "Invalid API key") {
    super(401, detail);
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the daily request limit is exceeded (HTTP 429). */
export class RateLimitError extends PropLineError {
  constructor(detail = "Rate limit exceeded") {
    super(429, detail);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PropLineOptions {
  /** API base URL. Default: `https://api.prop-line.com/v1`. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to global `fetch` (Node 18+). */
  fetch?: typeof fetch;
}

/**
 * Game-period filter. String of canonical codes, optionally
 * comma-separated, or the sentinel `"all"`. Omitted = full-game
 * markets only (backwards-compatible default).
 *
 *   "q1"            — 1st quarter
 *   "q1,q2"         — 1st and 2nd quarters
 *   ["q1","q2"]     — same, as an array
 *   "h1"            — 1st half
 *   "p1"|"p2"|"p3"  — hockey periods
 *   "i6"            — 6th inning
 *   "f3"|"f5"|"f7"  — first N innings
 *   "all"           — every period including full game
 */
export type PeriodFilter = string | string[];

export interface GetOddsOptions {
  /** Specific event ID to get odds (with player props) for. Omit for bulk odds. */
  eventId?: number | string;
  /**
   * Market keys to filter by. If omitted, the bulk `/odds` endpoint
   * defaults to `h2h` and the per-event `/odds` endpoint defaults to
   * `h2h,spreads,totals` — game-line markets every book carries across
   * every sport. Pass an explicit list to fetch player props (e.g.
   * `["pitcher_strikeouts", "batter_home_runs"]` for MLB,
   * `["player_points", "player_rebounds"]` for NBA).
   */
  markets?: string[];
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
}

export interface GetOddsHistoryOptions {
  markets?: string[];
  /** ISO timestamp; only include snapshots at or after this time. Mutually exclusive with `relativeFrom`. */
  from?: string;
  /** ISO timestamp; only include snapshots at or before this time. Mutually exclusive with `relativeTo`. */
  to?: string;
  /** Offset relative to commence_time, e.g. "-3h", "-30m", "-90s". Mutually exclusive with `from`. */
  relativeFrom?: string;
  /** Offset relative to commence_time, e.g. "-1m" or "0" for commence_time itself. Mutually exclusive with `to`. */
  relativeTo?: string;
  /** Downsample to one snapshot per bucket. Latest snapshot in each bucket wins. */
  interval?: "30s" | "1m" | "5m" | "15m" | "30m" | "1h";
  /** When true, drop snapshots whose (price, point) match the previous one. Opening line is always kept. */
  changesOnly?: boolean;
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
}

export interface GetOddsClosingOptions {
  markets?: string[];
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
}

export interface GetMovementOptions {
  markets?: string[];
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
}

function _periodParam(p: PeriodFilter | undefined): string | undefined {
  if (p === undefined) return undefined;
  return typeof p === "string" ? p : p.join(",");
}

export interface GetScoresOptions {
  /** Days back to include (default 3). */
  daysFrom?: number;
}

export interface GetMlbGrandSalamiOptions {
  /** YYYY-MM-DD UTC date. Defaults to today (UTC) when omitted. */
  date?: string;
}

export interface GetNhlDailyGoalsTotalOptions {
  /** YYYY-MM-DD UTC date. Defaults to today (UTC) when omitted. */
  date?: string;
}

export interface GetStatsOptions {
  /** Stat types to filter by (e.g. `["strikeouts", "hits"]`). */
  statType?: string[];
}

export interface GetResultsOptions {
  markets?: string[];
}

export interface GetPlayerHistoryOptions {
  /** Market key (e.g. `"pitcher_strikeouts"`). Required. */
  market: string;
  /** Restrict to a single bookmaker (e.g. `"draftkings"`). */
  bookmaker?: string;
  /** Max entries (1-100). Default 20. */
  limit?: number;
}

export interface GetPlayerTrendsOptions {
  /** Market key (e.g. `"batter_total_bases"`). Omit for all markets. */
  market?: string;
}

export interface GetEventEvOptions {
  /**
   * Optional market filter. Pass a single comma-separated string or an
   * array of market keys (e.g. `["pitcher_strikeouts", "batter_hits"]`).
   * Omit to evaluate every market on the event.
   */
  markets?: string | string[];
}

export interface GetEventBestLineOptions {
  /**
   * Optional market filter. Pass a single comma-separated string or an
   * array of market keys (e.g. `["pitcher_strikeouts", "h2h"]`). Omit
   * to include every market on the event.
   */
  markets?: string | string[];
}

export interface CalcEventEvOptions {
  /** Market key — h2h / spreads / totals / pitcher_strikeouts / etc. */
  market: string;
  /** Outcome name. Team for h2h/spreads; "Over" or "Under" for totals/props. */
  name: string;
  /** American odds at your book, e.g. -118 or 145. */
  price: number;
  /** Line/point for spreads, totals, player props. Sign matters for spreads (-1.5 favorite). Omit for h2h. */
  point?: number;
  /** Player name for player-prop markets. Omit for game-line markets. */
  description?: string;
}

export interface ExportResolvedPropsOptions {
  /** Sport key (e.g. `"baseball_mlb"`). Required. */
  sport: string;
  /** Optional market filter. */
  market?: string;
  /** Optional bookmaker filter. */
  bookmaker?: string;
  /** ISO datetime lower bound on `resolved_at`. */
  since?: string;
  /** ISO datetime upper bound on `resolved_at`. */
  until?: string;
  /** If set, stream the CSV to this path and resolve to the path. Otherwise resolve to the CSV bytes. */
  outPath?: string;
}

export interface ExportOddsHistoryOptions {
  /** Sport key (e.g. `"baseball_mlb"`). Required. */
  sport: string;
  /** Optional market filter. */
  market?: string;
  /** Optional bookmaker filter. */
  bookmaker?: string;
  /** ISO datetime lower bound on `recorded_at`. */
  since?: string;
  /** ISO datetime upper bound on `recorded_at`. */
  until?: string;
  /** If set, stream the CSV to this path and resolve to the path. Otherwise resolve to the CSV bytes. */
  outPath?: string;
}

/** Webhook event types. `steam` = cross-book sharp-money alert. */
export type WebhookEventType = "line_movement" | "resolution" | "steam";

export interface CreateWebhookOptions {
  /** HTTPS endpoint to receive POSTed events. Required. */
  url: string;
  /** Event types to subscribe to. Default: all. */
  events?: WebhookEventType[];
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  /** Minimum % change in American odds to fire a line_movement. Point-only shifts always pass. */
  minPriceChangePct?: number;
  /** Minimum 0-100 steam score to fire a `steam` event. Null = detector's global floor. */
  minSteamScore?: number;
}

export interface UpdateWebhookOptions {
  url?: string;
  events?: WebhookEventType[];
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  minPriceChangePct?: number;
  minSteamScore?: number;
  active?: boolean;
}

export interface ListWebhookDeliveriesOptions {
  /** Max deliveries to return. Default 50. */
  limit?: number;
}

export interface VerifySignatureOptions {
  /** Webhook signing secret (returned once from `createWebhook`). */
  secret: string;
  /** Value of the `X-PropLine-Timestamp` header. */
  timestamp: string;
  /** Raw request body. */
  body: Uint8Array | Buffer | string;
  /** Value of the `X-PropLine-Signature` header. */
  signature: string;
}

const DEFAULT_BASE_URL = "https://api.prop-line.com/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Client for the PropLine player props API.
 *
 * @example
 * ```ts
 * import { PropLine } from "propline";
 *
 * const client = new PropLine("your_api_key");
 * const sports = await client.getSports();
 * ```
 */
export class PropLine {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  private readonly _fetch: typeof fetch;

  constructor(apiKey: string, options: PropLineOptions = {}) {
    if (!apiKey) {
      throw new Error("PropLine: apiKey is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this._fetch = options.fetch ?? globalThis.fetch;
    if (!this._fetch) {
      throw new Error(
        "PropLine: global fetch is unavailable. Use Node 18+ or pass options.fetch."
      );
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private _buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }

  private async _request<T>(
    method: string,
    path: string,
    init: { params?: Record<string, string | number | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = this._buildUrl(path, init.params);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await this._fetch(url, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status === 401) {
      throw new AuthError(await readDetail(resp, "Invalid API key"));
    }
    if (resp.status === 429) {
      throw new RateLimitError(await readDetail(resp, "Rate limit exceeded"));
    }
    if (resp.status >= 400) {
      throw new PropLineError(resp.status, await readDetail(resp, resp.statusText));
    }

    if (resp.status === 204) {
      return undefined as T;
    }
    return (await resp.json()) as T;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** List all available sports. */
  getSports(): Promise<Sport[]> {
    return this._request<Sport[]>("GET", "/sports");
  }

  /** List upcoming events for a sport. */
  getEvents(sport: string): Promise<PropLineEvent[]> {
    return this._request<PropLineEvent[]>("GET", `/sports/${encodeURIComponent(sport)}/events`);
  }

  /**
   * Get current odds. With `eventId`, returns single-event odds (including
   * player props). Without, returns bulk odds for all upcoming events.
   *
   * Each response carries a `bookmakers` array — iterate it to compare
   * lines across Bovada, DraftKings, FanDuel, Pinnacle, Unibet, and
   * PrizePicks (coverage varies by sport).
   */
  getOdds(
    sport: string,
    options: GetOddsOptions & { eventId: number | string }
  ): Promise<OddsResponse>;
  getOdds(
    sport: string,
    options?: Omit<GetOddsOptions, "eventId"> & { eventId?: undefined }
  ): Promise<OddsResponse[]>;
  getOdds(
    sport: string,
    options: GetOddsOptions = {}
  ): Promise<OddsResponse | OddsResponse[]> {
    const params: Record<string, string | undefined> = {};
    if (options.markets?.length) {
      params.markets = options.markets.join(",");
    }
    const periodParam = _periodParam(options.period);
    if (periodParam !== undefined) params.period = periodParam;
    const sp = encodeURIComponent(sport);
    if (options.eventId !== undefined) {
      return this._request<OddsResponse>(
        "GET",
        `/sports/${sp}/events/${encodeURIComponent(String(options.eventId))}/odds`,
        { params }
      );
    }
    return this._request<OddsResponse[]>("GET", `/sports/${sp}/odds`, { params });
  }

  /** List the available market types for an event. */
  getMarkets(sport: string, eventId: number | string): Promise<MarketSummary[]> {
    return this._request<MarketSummary[]>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/markets`
    );
  }

  /**
   * Get historical odds movement for an event.
   *
   * Hobby+: full snapshots. Free tier: redacted (snapshot counts only).
   *
   * Supports period-historical filters:
   * - `from` / `to` — absolute ISO timestamps
   * - `relativeFrom` / `relativeTo` — offsets to commence_time ("-3h", "-30m", "0")
   * - `interval` — downsample to a fixed bucket size
   * - `changesOnly` — drop unchanged adjacent snapshots
   */
  getOddsHistory(
    sport: string,
    eventId: number | string,
    options: GetOddsHistoryOptions = {}
  ): Promise<OddsHistoryResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets?.length) {
      params.markets = options.markets.join(",");
    }
    if (options.from !== undefined) params.from = options.from;
    if (options.to !== undefined) params.to = options.to;
    if (options.relativeFrom !== undefined) params.relative_from = options.relativeFrom;
    if (options.relativeTo !== undefined) params.relative_to = options.relativeTo;
    if (options.interval !== undefined) params.interval = options.interval;
    if (options.changesOnly) params.changes_only = "true";
    const periodParam2 = _periodParam(options.period);
    if (periodParam2 !== undefined) params.period = periodParam2;
    return this._request<OddsHistoryResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/odds/history`,
      { params }
    );
  }

  /**
   * Get the closing line per `(book, market, outcome)` for an event —
   * the last snapshot at or before commence_time. Canonical CLV helper:
   * replaces "fetch full history → find latest pre-game row" with one
   * call. Each outcome carries a `closingAt` field with the snapshot's
   * recorded_at timestamp.
   *
   * Hobby+: full data. Free tier: redacted.
   */
  getOddsClosing(
    sport: string,
    eventId: number | string,
    options: GetOddsClosingOptions = {}
  ): Promise<OddsClosingResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets?.length) {
      params.markets = options.markets.join(",");
    }
    const periodParam3 = _periodParam(options.period);
    if (periodParam3 !== undefined) params.period = periodParam3;
    return this._request<OddsClosingResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/odds/closing`,
      { params }
    );
  }

  /** Get game scores and status (free tier). */
  getScores(sport: string, options: GetScoresOptions = {}): Promise<ScoreEvent[]> {
    return this._request<ScoreEvent[]>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/scores`,
      { params: { days_from: options.daysFrom ?? 3 } }
    );
  }

  /**
   * Synthetic MLB Grand Salami for a given UTC date — total runs scored
   * across every MLB game on the slate, plus each book's implied Grand
   * Salami line (median of per-game primary totals across our MLB books).
   *
   * No retail sportsbook quotes this as a single market, so historical
   * cross-book Grand Salami data isn't available elsewhere. Free tier;
   * defaults to today (UTC).
   */
  getMlbGrandSalami(
    options: GetMlbGrandSalamiOptions = {}
  ): Promise<MlbGrandSalamiResponse> {
    const params: Record<string, string> = {};
    if (options.date) params.date = options.date;
    return this._request<MlbGrandSalamiResponse>(
      "GET",
      "/sports/baseball_mlb/grand-salami",
      { params }
    );
  }

  /**
   * Synthetic NHL Daily Goals Total for a given UTC date — total goals
   * scored (incl. OT/SO) across every NHL game on the slate, plus each
   * book's implied Daily Goals Total line (median of per-game primary
   * totals across our NHL books).
   *
   * Hockey's equivalent of the MLB Grand Salami. No retail sportsbook
   * quotes this as a single market. Free tier; defaults to today (UTC).
   */
  getNhlDailyGoalsTotal(
    options: GetNhlDailyGoalsTotalOptions = {}
  ): Promise<NhlDailyGoalsTotalResponse> {
    const params: Record<string, string> = {};
    if (options.date) params.date = options.date;
    return this._request<NhlDailyGoalsTotalResponse>(
      "GET",
      "/sports/hockey_nhl/daily-goals-total",
      { params }
    );
  }

  /**
   * Factual volume of graded player props over the last N days (free tier).
   *
   * Aggregated counts only — a coverage proof (every outcome counted was
   * graded against the real box score), never a profitability claim.
   *
   * @param days Look-back window, 1-90 (default 30).
   */
  getResolutionSummary(days = 30): Promise<ResolutionSummary> {
    return this._request<ResolutionSummary>(
      "GET",
      "/markets/resolution-summary",
      { params: { days: String(days) } }
    );
  }

  /**
   * Get raw player/team box-score stats (book-agnostic, free tier).
   *
   * Returns actual stat values decoupled from any bookmaker's lines.
   */
  getStats(
    sport: string,
    eventId: number | string,
    options: GetStatsOptions = {}
  ): Promise<StatsResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.statType?.length) {
      params.stat_type = options.statType.join(",");
    }
    return this._request<StatsResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/stats`,
      { params }
    );
  }

  /**
   * Get game context — the conditions a prop settles under.
   *
   * Probable starting pitchers, a confirmed-lineup flag, the home-plate
   * umpire, and first-pitch weather (outdoor / open-roof venues; indoor
   * venues return `weather: null` with `is_indoor: true`). The same block
   * is embedded in {@link getResults}, so every graded prop carries its
   * conditions — unique to PropLine. Free tier. MLB today; weather extends
   * to other outdoor sports next. Rejects with a 404 when no context is on
   * file for the event yet.
   */
  getContext(
    sport: string,
    eventId: number | string
  ): Promise<ContextResponse> {
    return this._request<ContextResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/context`
    );
  }

  /**
   * Get line movement + steam detection from the snapshot tick history.
   *
   * Per (book, market, outcome): opening line, latest line, signed
   * implied-probability shift, point shift, direction. The `steam` array
   * flags outcomes multiple books moved the same direction — the
   * sharp-money signal across every book PropLine polls. When a book moves
   * the line itself, that outcome's `prob_shift` is null and `direction` is
   * `"line_moved"` (excluded from the steam signal). Unique to PropLine.
   * Hobby+ full; free tier redacted.
   */
  getMovement(
    sport: string,
    eventId: number | string,
    options: GetMovementOptions = {}
  ): Promise<MovementResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets?.length) {
      params.markets = options.markets.join(",");
    }
    params.period = _periodParam(options.period);
    return this._request<MovementResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/movement`,
      { params }
    );
  }

  /**
   * Get resolved prop outcomes with actual player stats.
   *
   * Pro tier: full data. Free tier: redacted (resolution + actual nulled).
   */
  getResults(
    sport: string,
    eventId: number | string,
    options: GetResultsOptions = {}
  ): Promise<ResultsResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets?.length) {
      params.markets = options.markets.join(",");
    }
    return this._request<ResultsResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/results`,
      { params }
    );
  }

  /**
   * Recent resolved prop history for a player on a market.
   *
   * One entry per (event, bookmaker) pair. Pro: full. Free: redacted.
   */
  getPlayerHistory(
    sport: string,
    playerName: string,
    options: GetPlayerHistoryOptions
  ): Promise<PlayerHistoryResponse> {
    const params: Record<string, string | number | undefined> = {
      market: options.market,
      limit: options.limit ?? 20,
    };
    if (options.bookmaker) {
      params.bookmaker = options.bookmaker;
    }
    return this._request<PlayerHistoryResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/players/${encodeURIComponent(playerName)}/history`,
      { params }
    );
  }

  /**
   * Rolling hit-rate trends for a player across one or all markets.
   *
   * Returns over/under/push splits over the last 5/10/20/50 graded games,
   * the current streak, and the most recent game per market. Pro: full.
   * Free: redacted.
   */
  getPlayerTrends(
    sportKey: string,
    playerName: string,
    options: GetPlayerTrendsOptions = {}
  ): Promise<PlayerTrends> {
    const params: Record<string, string | undefined> = {};
    if (options.market) {
      params.market = options.market;
    }
    return this._request<PlayerTrends>(
      "GET",
      `/sports/${encodeURIComponent(sportKey)}/players/${encodeURIComponent(playerName)}/trends`,
      { params }
    );
  }

  /**
   * Cross-book +EV analysis for a single event (Pro+ tier).
   *
   * Groups every outcome by (market, player, line) across the books we
   * carry, derives a no-vig fair line from a sharp anchor (Pinnacle
   * preferred, Bovada fallback), and returns EV% per book at the same
   * line. Outcomes are sorted with +EV plays floated to the top.
   *
   * PrizePicks is excluded — its synthetic +100/+100 prices aren't
   * payout odds. Lines without sharp-anchor coverage are dropped.
   *
   * @example
   * ```ts
   * const ev = await client.getEventEv("baseball_mlb", 12345);
   * for (const line of ev.lines) {
   *   const plus = line.outcomes.filter(o => o.is_plus_ev);
   *   if (plus.length) console.log(line.market_key, line.description, plus);
   * }
   * ```
   */
  /**
   * List futures markets for a sport — championship winner, MVP,
   * division winner, etc. Each row is one (futures event, book,
   * market) with every team or player priced. Free tier; pulled from
   * each book's futures feed (Bovada today).
   *
   * @example
   * ```ts
   * const futures = await client.getFutures("baseball_mlb");
   * for (const event of futures) {
   *   console.log(`${event.title} @ ${event.commence_time}`);
   *   for (const m of event.markets) {
   *     const top3 = [...m.outcomes].sort((a, b) => a.price - b.price).slice(0, 3);
   *     for (const o of top3) console.log(`  ${o.name}: ${o.price}`);
   *   }
   * }
   * ```
   */
  getFutures(sport: string): Promise<FuturesEvent[]> {
    return this._request<FuturesEvent[]>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/futures`
    );
  }

  getEventEv(
    sport: string,
    eventId: number | string,
    options: GetEventEvOptions = {}
  ): Promise<EventEvResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets) {
      params.markets = Array.isArray(options.markets)
        ? options.markets.join(",")
        : options.markets;
    }
    return this._request<EventEvResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/ev`,
      { params }
    );
  }

  /**
   * Cross-book best-line lookup for a single event.
   *
   * For each (market, player, line) tuple, returns the single best
   * American price across every book we carry, with the book name
   * attached. Companion to `getEventEv`: best-line tells you which
   * book has the highest payout right now; +EV tells you whether
   * that price beats a sharp no-vig fair line. Most line shoppers
   * want both.
   *
   * PrizePicks is excluded from the comparison — its DFS payout
   * structure (synthetic +100/+100 quotes) isn't directly comparable
   * to traditional sportsbook odds.
   *
   * Hobby tier or higher required (returns 403 on free).
   *
   * @example
   * ```ts
   * const bl = await client.getEventBestLine("baseball_mlb", 12345);
   * for (const line of bl.lines) {
   *   for (const [side, info] of Object.entries(line.sides)) {
   *     console.log(
   *       `${line.description} ${side} ${line.point}: ` +
   *       `${info.best.price} @ ${info.best.book_title}`
   *     );
   *   }
   * }
   * ```
   */
  getEventBestLine(
    sport: string,
    eventId: number | string,
    options: GetEventBestLineOptions = {}
  ): Promise<EventBestLineResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets) {
      params.markets = Array.isArray(options.markets)
        ? options.markets.join(",")
        : options.markets;
    }
    return this._request<EventBestLineResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/best-line`,
      { params }
    );
  }

  /**
   * Calculate EV% for a user-supplied price against the event's
   * no-vig fair anchor. Useful for books PropLine doesn't carry —
   * Caesars, BetMGM, Fanatics, BetUS, Hard Rock — where you have a
   * price in hand and want to know if it's +EV against the sharp
   * consensus we do carry.
   *
   * Same fair-line math as `getEventEv` (Pinnacle-preferred anchor,
   * no-vig devigging) but takes one user price as input. Pro tier.
   *
   * @example
   * ```ts
   * const r = await client.calcEventEv("baseball_mlb", 12614, {
   *   market: "h2h",
   *   name: "Pittsburgh Pirates",
   *   price: -118,
   * });
   * console.log(`EV ${r.ev_pct}% fair=${r.fair_prob}`);
   * ```
   */
  calcEventEv(
    sport: string,
    eventId: number | string,
    options: CalcEventEvOptions
  ): Promise<EventEvCalcResponse> {
    const params: Record<string, string | number | undefined> = {
      market: options.market,
      name: options.name,
      price: options.price,
    };
    if (options.point !== undefined) params.point = options.point;
    if (options.description) params.description = options.description;
    return this._request<EventEvCalcResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/ev/calc`,
      { params }
    );
  }

  /**
   * Bulk CSV export of resolved prop outcomes (Pro+ tier).
   *
   * If `outPath` is provided, streams the CSV to disk and resolves to the
   * path. Otherwise resolves to the full CSV bytes as a `Uint8Array`.
   *
   * @example
   * ```ts
   * await client.exportResolvedProps({
   *   sport: "baseball_mlb",
   *   market: "pitcher_strikeouts",
   *   since: "2026-04-01T00:00:00Z",
   *   outPath: "./mlb-strikeouts.csv",
   * });
   * ```
   */
  async exportResolvedProps(
    options: ExportResolvedPropsOptions & { outPath: string }
  ): Promise<string>;
  async exportResolvedProps(
    options: ExportResolvedPropsOptions & { outPath?: undefined }
  ): Promise<Uint8Array>;
  async exportResolvedProps(
    options: ExportResolvedPropsOptions
  ): Promise<string | Uint8Array> {
    const params: Record<string, string | undefined> = { sport: options.sport };
    if (options.market) params.market = options.market;
    if (options.bookmaker) params.bookmaker = options.bookmaker;
    if (options.since) params.since = options.since;
    if (options.until) params.until = options.until;

    const url = this._buildUrl("/exports/resolved-props", params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await this._fetch(url, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status === 401) {
      throw new AuthError();
    }
    if (resp.status === 403) {
      throw new PropLineError(403, await readDetail(resp, "Pro tier required"));
    }
    if (resp.status >= 400) {
      throw new PropLineError(resp.status, await readDetail(resp, resp.statusText));
    }

    const buf = new Uint8Array(await resp.arrayBuffer());
    if (options.outPath) {
      await writeFile(options.outPath, buf);
      return options.outPath;
    }
    return buf;
  }

  /**
   * Bulk CSV export of the full line-movement time-series.
   *
   * One row per (outcome, snapshot): every recorded odds snapshot (price +
   * line, per book, including period markets), not just the closing line.
   * This is the raw tick history no subscription tier can pull in bulk —
   * Pro/Streaming get per-event {@link getOddsHistory} only; this bulk
   * firehose is exclusive to the one-time Historical Backfill pass and
   * Enterprise.
   *
   * A full archive runs to gigabytes per sport — page month by month with
   * `since`/`until`. If `outPath` is provided, streams to disk and resolves
   * to the path; otherwise resolves to the CSV bytes as a `Uint8Array`.
   *
   * @example
   * ```ts
   * await client.exportOddsHistory({
   *   sport: "baseball_mlb",
   *   since: "2026-04-01T00:00:00Z",
   *   until: "2026-05-01T00:00:00Z",
   *   outPath: "./mlb-line-history-apr.csv",
   * });
   * ```
   */
  async exportOddsHistory(
    options: ExportOddsHistoryOptions & { outPath: string }
  ): Promise<string>;
  async exportOddsHistory(
    options: ExportOddsHistoryOptions & { outPath?: undefined }
  ): Promise<Uint8Array>;
  async exportOddsHistory(
    options: ExportOddsHistoryOptions
  ): Promise<string | Uint8Array> {
    const params: Record<string, string | undefined> = { sport: options.sport };
    if (options.market) params.market = options.market;
    if (options.bookmaker) params.bookmaker = options.bookmaker;
    if (options.since) params.since = options.since;
    if (options.until) params.until = options.until;

    const url = this._buildUrl("/exports/odds-history", params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await this._fetch(url, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status === 401) {
      throw new AuthError();
    }
    if (resp.status === 403) {
      throw new PropLineError(
        403,
        await readDetail(resp, "Historical Backfill pass or Enterprise required")
      );
    }
    if (resp.status >= 400) {
      throw new PropLineError(resp.status, await readDetail(resp, resp.statusText));
    }

    const buf = new Uint8Array(await resp.arrayBuffer());
    if (options.outPath) {
      await writeFile(options.outPath, buf);
      return options.outPath;
    }
    return buf;
  }

  // ------------------------------------------------------------------
  // Webhooks (Streaming tier)
  // ------------------------------------------------------------------

  /**
   * Register a webhook subscription. Streaming tier only.
   *
   * The returned object includes the full signing `secret` — this is the
   * ONLY time it's revealed. Store it securely.
   */
  createWebhook(options: CreateWebhookOptions): Promise<Webhook> {
    return this._request<Webhook>("POST", "/webhooks", {
      body: webhookBody(options),
    });
  }

  /** List your webhook subscriptions. Secrets are masked. */
  listWebhooks(): Promise<Webhook[]> {
    return this._request<Webhook[]>("GET", "/webhooks");
  }

  /** Get a single webhook subscription. Secret is masked. */
  getWebhook(webhookId: number): Promise<Webhook> {
    return this._request<Webhook>("GET", `/webhooks/${webhookId}`);
  }

  /** Update fields on a webhook. Only supplied fields are changed. */
  updateWebhook(webhookId: number, options: UpdateWebhookOptions): Promise<Webhook> {
    return this._request<Webhook>("PATCH", `/webhooks/${webhookId}`, {
      body: webhookBody(options),
    });
  }

  /** Delete a webhook (cascades its delivery history). */
  deleteWebhook(webhookId: number): Promise<{ ok: boolean } | unknown> {
    return this._request("DELETE", `/webhooks/${webhookId}`);
  }

  /** Queue a sample `test` payload to the webhook's URL. */
  testWebhook(webhookId: number): Promise<unknown> {
    return this._request("POST", `/webhooks/${webhookId}/test`);
  }

  /** Last 50 (default) delivery attempts for a webhook. */
  listWebhookDeliveries(
    webhookId: number,
    options: ListWebhookDeliveriesOptions = {}
  ): Promise<WebhookDelivery[]> {
    return this._request<WebhookDelivery[]>(
      "GET",
      `/webhooks/${webhookId}/deliveries`,
      { params: { limit: options.limit ?? 50 } }
    );
  }

  /**
   * Verify that an inbound webhook delivery was signed by PropLine.
   *
   * Compares HMAC-SHA256(secret, `${timestamp}.` + body) against the
   * `X-PropLine-Signature` header in constant time.
   *
   * @example
   * ```ts
   * import { PropLine } from "propline";
   *
   * app.post("/hooks/propline", express.raw({ type: "*\/*" }), (req, res) => {
   *   const ok = PropLine.verifySignature({
   *     secret: process.env.WEBHOOK_SECRET!,
   *     timestamp: req.header("X-PropLine-Timestamp")!,
   *     body: req.body, // raw Buffer
   *     signature: req.header("X-PropLine-Signature")!,
   *   });
   *   if (!ok) return res.status(401).end();
   *   // ...
   * });
   * ```
   */
  static verifySignature(options: VerifySignatureOptions): boolean {
    const { secret, timestamp, body, signature } = options;
    const bodyBuf =
      typeof body === "string"
        ? Buffer.from(body, "utf8")
        : body instanceof Buffer
          ? body
          : Buffer.from(body);
    const message = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), bodyBuf]);
    const expected = createHmac("sha256", secret).update(message).digest("hex");
    if (expected.length !== signature.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    } catch {
      return false;
    }
  }
}

function webhookBody(options: CreateWebhookOptions | UpdateWebhookOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const map: Array<[keyof (CreateWebhookOptions & UpdateWebhookOptions), string]> = [
    ["url", "url"],
    ["events", "events"],
    ["filterSportKey", "filter_sport_key"],
    ["filterEventId", "filter_event_id"],
    ["filterMarketKey", "filter_market_key"],
    ["filterPlayerName", "filter_player_name"],
    ["minPriceChangePct", "min_price_change_pct"],
    ["minSteamScore", "min_steam_score"],
    ["active", "active"],
  ];
  for (const [src, dst] of map) {
    const v = (options as Record<string, unknown>)[src as string];
    if (v !== undefined) body[dst] = v;
  }
  return body;
}

async function readDetail(resp: Response, fallback: string): Promise<string> {
  try {
    const text = await resp.text();
    if (!text) return fallback;
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      if (typeof json.detail === "string") return json.detail;
    } catch {
      // not JSON
    }
    return text || fallback;
  } catch {
    return fallback;
  }
}
