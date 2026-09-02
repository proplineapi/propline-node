import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";

import type {
  ClvBetInput,
  ClvGradeResponse,
  SgpLegInput,
  SgpQuoteResponse,
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
  PlayerGameLog,
  PlayerHistoryResponse,
  PlayerTrends,
  EventEvResponse,
  EventProjectionsResponse,
  EventEvCalcResponse,
  EventBestLineResponse,
  FuturesEvent,
  Webhook,
  WebhookDelivery,
  ReplayEvent,
  ReplayPage,
  DfsPayoutsResponse,
} from "./types.js";

/** Options for {@link PropLineClient.getDfsPayouts}. */
export interface GetDfsPayoutsOptions {
  /** DFS platform. Only "prizepicks" today. */
  platform?: string;
  /**
   * Assumed per-leg win probability in [0, 1]. When supplied, each play
   * also carries `expected_return` (per $1) and `is_plus_ev` at that rate.
   */
  legWinProb?: number;
}

/**
 * Structured error body returned by gated/throttled endpoints
 * (see https://prop-line.com/docs#errors). Branch on `error` — the
 * codes are stable — and follow the URLs instead of parsing prose.
 */
export interface PropLineErrorInfo {
  /** Stable machine-readable code, e.g. "upgrade_required", "daily_limit_exceeded". */
  error?: string;
  /** Human-readable sentence. */
  message?: string;
  /** Cheapest tier that unlocks a gated feature (403s). */
  required_tier?: string;
  /** Where to unlock it — pre-filled one-click URL on daily-cap 429s. */
  upgrade_url?: string;
  docs_url?: string;
  signup_url?: string;
  backfill_url?: string;
  /** Burst-limit backoff hint (429s). */
  retry_after_seconds?: number;
  /** Daily-cap 429s: recommended next plan incl. its own upgrade_url. */
  recommended?: { plan?: string; upgrade_url?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Base error for all PropLine API failures. */
export class PropLineError extends Error {
  readonly statusCode: number;
  /** Human-readable detail message. */
  readonly detail: string;
  /** Structured error body, when the API returned one. */
  readonly info?: PropLineErrorInfo;

  constructor(statusCode: number, detail: string, info?: PropLineErrorInfo) {
    super(`[${statusCode}] ${detail}`);
    this.name = "PropLineError";
    this.statusCode = statusCode;
    this.detail = detail;
    this.info = info;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Stable machine-readable code (e.g. "upgrade_required"), if present. */
  get errorCode(): string | undefined {
    return this.info?.error;
  }

  /** The URL that unlocks a gated feature or lifts a cap, if present. */
  get upgradeUrl(): string | undefined {
    return this.info?.upgrade_url ?? this.info?.recommended?.upgrade_url;
  }
}

/** Thrown when the API key is missing or invalid (HTTP 401). */
export class AuthError extends PropLineError {
  constructor(detail = "Invalid API key", info?: PropLineErrorInfo) {
    super(401, detail, info);
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the daily request limit is exceeded (HTTP 429). */
export class RateLimitError extends PropLineError {
  constructor(detail = "Rate limit exceeded", info?: PropLineErrorInfo) {
    super(429, detail, info);
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
  /**
   * Bookmaker key(s) to restrict the response to (e.g. `"draftkings"` or
   * `["draftkings", "fanduel"]`). Omitted = all books. Same parameter name
   * as the-odds-api.
   */
  bookmakers?: string | string[];
  /**
   * When true, each bookmaker block carries a `link` — that book's
   * public event-page URL (plain navigation, no affiliate tagging),
   * so your UI can click out from a line to the book. Links ship for
   * Bovada, DraftKings, FanDuel, BetMGM, Kalshi, Polymarket and
   * Smarkets; other books return null. Maps to the
   * the-odds-api-compatible `includeLinks=true` query param.
   */
  includeLinks?: boolean;
  /**
   * When true, each bookmaker block carries a `book_event_id` and each
   * outcome a `book_outcome_id` — that book's OWN identifiers for the
   * event and the priced selection. Use these to join PropLine rows onto
   * a book's native feed by id instead of matching on team names,
   * players and lines. Kalshi ships both (the event ticker and the
   * per-contract market ticker, e.g. `KXMLBGAME-26AUG08NYYBOS-NYY`);
   * most other books ship an event id. Books without a stable id return
   * null.
   *
   * NB a two-sided market can share ONE `book_outcome_id` across both
   * legs — a Kalshi contract is binary, so Over and Under are its YES
   * and NO sides. The id identifies the contract; the outcome's `name`
   * says which side.
   *
   * PropLine-specific (`includeBookIds=true`); the-odds-api has no
   * equivalent.
   */
  includeBookIds?: boolean;
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
  /** Bookmaker key(s) to restrict the response to. Omitted = all books. */
  bookmakers?: string | string[];
}

export interface GetOddsClosingOptions {
  markets?: string[];
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
  /** Bookmaker key(s) to restrict the response to. Omitted = all books. */
  bookmakers?: string | string[];
}

export interface GetMovementOptions {
  markets?: string[];
  /** Game-period filter — see `PeriodFilter`. */
  period?: PeriodFilter;
  /** Bookmaker key(s) to restrict the response to. Omitted = all books. */
  bookmakers?: string | string[];
}

function _periodParam(p: PeriodFilter | undefined): string | undefined {
  if (p === undefined) return undefined;
  return typeof p === "string" ? p : p.join(",");
}

function _bookmakersParam(b: string | string[] | undefined): string | undefined {
  if (b === undefined || b.length === 0) return undefined;
  return typeof b === "string" ? b : b.join(",");
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

export interface GetPlayerGamesOptions {
  /** Games to return, 1-100. Default 20. */
  limit?: number;
  /**
   * Head-to-head filter. Accepts a full name, nickname or abbreviation
   * ("Boston Red Sox", "Red Sox", "BOS"). The limit applies AFTER this
   * filter, so `{ opponent: "BOS", limit: 10 }` is the last 10 MEETINGS,
   * not the Boston games among the last 10 games. Not capped to the
   * current season.
   */
  opponent?: string;
  /**
   * Stat name(s) to return; omit for all. Vocabulary is per-sport —
   * see https://prop-line.com/docs#stats
   */
  statType?: string | string[];
}

export interface GetPlayerTrendsOptions {
  /** Market key (e.g. `"batter_total_bases"`). Omit for all markets. */
  market?: string;
  /**
   * PrizePicks pick-em flavor to compute trends against: `"standard"`
   * (default market line), `"goblin"`, or `"demon"`. When set, the trend is
   * computed against that flavor's PrizePicks line only. Omit for the default
   * cross-book behavior. Flavor tagging began 2026-06-16.
   */
  dfsOddsType?: "standard" | "goblin" | "demon";
}

export interface GetEventProjectionsOptions {
  /** Optional market-key filter (comma-separated string or array). */
  markets?: string | string[];
}

export interface GetEventEvOptions {
  /**
   * Optional market filter. Pass a single comma-separated string or an
   * array of market keys (e.g. `["pitcher_strikeouts", "batter_hits"]`).
   * Omit to evaluate every market on the event.
   */
  markets?: string | string[];
  /**
   * Optional bookmaker filter (the-odds-api-compatible). Pass a
   * comma-separated string or an array of book keys (e.g.
   * `["draftkings", "fanduel"]`) to price only the books you hold
   * accounts at. Omit for every book.
   *
   * This narrows the PRICES, never the fair-line anchor:
   * `bookmakers: ["draftkings"]` still returns DraftKings EV% measured
   * against Pinnacle. Lines where none of your books quote a price are
   * omitted.
   */
  bookmakers?: string | string[];
}

export interface GetEventBestLineOptions {
  /**
   * Optional market filter. Pass a single comma-separated string or an
   * array of market keys (e.g. `["pitcher_strikeouts", "h2h"]`). Omit
   * to include every market on the event.
   */
  markets?: string | string[];
  /**
   * Optional bookmaker filter (the-odds-api-compatible). Pass a
   * comma-separated string or an array of book keys (e.g.
   * `["draftkings", "fanduel"]`) to shop only the books you hold
   * accounts at. Omit for all comparable books.
   */
  bookmakers?: string | string[];
  /**
   * When true, every price row carries a `link` — that book's public
   * event-page URL, the click-out for "go bet this". Books without a
   * verified URL template return null. Links appear on free-tier
   * redacted responses too (navigation isn't the paid data).
   */
  includeLinks?: boolean;
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

/**
 * Webhook event types. `steam` = cross-book sharp-money alert.
 * `market_suspended` = a book took a market off the board pregame (one
 * delivery per (book, event, player) withdrawal, with `books_agreeing`).
 */
export type WebhookEventType = "line_movement" | "resolution" | "steam" | "market_suspended";

export interface CreateWebhookOptions {
  /** HTTPS endpoint to receive POSTed events. Required. */
  url: string;
  /** Event types to subscribe to. Default: all. */
  events?: WebhookEventType[];
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  /**
   * Comma-separated book keys, same vocabulary as the `?bookmakers=`
   * query param (e.g. "draftkings,fanduel"). Unset = all books; unknown
   * keys match nothing. Applies to line_movement, resolution and
   * market_suspended; steam is cross-book and unaffected.
   */
  filterBookmakerKey?: string;
  /** Minimum % change in American odds to fire a line_movement. Point-only shifts always pass. */
  minPriceChangePct?: number;
  /** Minimum 0-100 steam score to fire a `steam` event. Null = detector's global floor. */
  minSteamScore?: number;
  /**
   * `market_suspended` only: how many books must have pulled the same
   * player/market on the same event before you are told. Unset/1 = every
   * drop (right if you price off one book); 3+ = corroborated late
   * scratches only. Every payload carries `books_agreeing` regardless.
   */
  minBooksAgreeing?: number;
  /**
   * Batched delivery opt-in (1-500): up to N events per POST as a signed
   * envelope `{"batch": true, "event_type": ..., "count": N, "events":
   * [{"delivery_id": ..., "data": <per-event payload>}, ...]}` with an
   * `X-PropLine-Batch` header. Strongly recommended for high-volume
   * subscriptions — one POST per event caps your delivery rate at your
   * endpoint's response time. 0 reverts to per-event. JSON format only.
   */
  batchMax?: number;
}

export interface UpdateWebhookOptions {
  url?: string;
  events?: WebhookEventType[];
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  /**
   * Comma-separated book keys, same vocabulary as the `?bookmakers=`
   * query param (e.g. "draftkings,fanduel"). Unset = all books; unknown
   * keys match nothing. Applies to line_movement, resolution and
   * market_suspended; steam is cross-book and unaffected.
   */
  filterBookmakerKey?: string;
  minPriceChangePct?: number;
  minSteamScore?: number;
  minBooksAgreeing?: number;
  /** Batched delivery (see CreateWebhookOptions.batchMax). 0 = per-event. */
  batchMax?: number;
  active?: boolean;
}

export interface ListWebhookDeliveriesOptions {
  /** Max deliveries to return. Default 50, max 200. */
  limit?: number;
  /**
   * Page backwards: pass the smallest `id` from the previous page to get
   * the next-older page. Pages are newest-first; a page shorter than
   * `limit` is the last one.
   */
  beforeId?: number;
}

export interface ReplayWebhookEventsOptions {
  /**
   * Read events after this cursor — the highest `X-PropLine-Sequence` you
   * have processed. Defaults to 0 (from the oldest retained event).
   */
  sinceSeq?: number;
  /** Max events per page. Default 100, max 500. */
  limit?: number;
}

export interface StreamOptions {
  /** Subscription to stream. Must be transport="websocket". */
  webhookId: number;
  /** Resume point — the last `seq` you processed. Default 0. */
  sinceSeq?: number;
  /** Auto-reconnect and resume from the last seq. Default true. */
  reconnect?: boolean;
  /** Override the websocket origin (default: derived from baseUrl). */
  wsUrl?: string;
  /** Called on every successful handshake with the `ready` frame. */
  onReady?: (ready: ReplayPage) => void;
  /**
   * Called when the server reports events after your cursor have aged out of
   * retention. This is the one case the stream cannot make you whole —
   * resync from the REST endpoints.
   */
  onTruncated?: (ready: ReplayPage) => void;
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

/**
 * Live daily-quota state, parsed from the `X-Daily-*` headers the API
 * returns on every authenticated response.
 */
export interface QuotaStatus {
  /** Your tier's daily request cap. */
  limit: number;
  /** Requests used today (including the request that produced this). */
  used: number;
  /** Requests left before the cap. */
  remaining: number;
  /** Unix seconds when the quota resets (00:00 UTC — a hard reset, not a rolling window). */
  resetEpoch: number;
  /** Quota reset time as a `Date`. */
  resetAt: Date;
}

const DEFAULT_BASE_URL = "https://api.prop-line.com/v1";

// Streaming origin. Separate Fly app, separate machines — see stream().
const DEFAULT_WS_URL = "wss://ws.prop-line.com";
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
  /**
   * Daily-quota state from the most recent API response, or `null` before
   * the first request. Updated on every call (including 429s):
   *
   * ```ts
   * await client.getSports();
   * console.log(client.lastQuota?.remaining); // 999
   * ```
   */
  lastQuota: QuotaStatus | null = null;
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

  /**
   * Record the X-Daily-* quota headers when present (absent on
   * unauthenticated errors, e.g. an invalid key's 401).
   */
  private _captureQuota(resp: Response): void {
    const limit = Number(resp.headers.get("X-Daily-Limit"));
    const used = Number(resp.headers.get("X-Daily-Used"));
    const remaining = Number(resp.headers.get("X-Daily-Remaining"));
    const resetEpoch = Number(resp.headers.get("X-Daily-Reset"));
    if (
      resp.headers.has("X-Daily-Limit") &&
      Number.isFinite(limit) &&
      Number.isFinite(used) &&
      Number.isFinite(remaining) &&
      Number.isFinite(resetEpoch)
    ) {
      this.lastQuota = {
        limit,
        used,
        remaining,
        resetEpoch,
        resetAt: new Date(resetEpoch * 1000),
      };
    }
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
    this._captureQuota(resp);

    if (resp.status === 401) {
      const d = await readDetail(resp, "Invalid API key");
      throw new AuthError(d.message, d.info);
    }
    if (resp.status === 429) {
      const d = await readDetail(resp, "Rate limit exceeded");
      throw new RateLimitError(d.message, d.info);
    }
    if (resp.status >= 400) {
      const d = await readDetail(resp, resp.statusText);
      throw new PropLineError(resp.status, d.message, d.info);
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
    const bookmakersParam = _bookmakersParam(options.bookmakers);
    if (bookmakersParam !== undefined) params.bookmakers = bookmakersParam;
    if (options.includeLinks) params.includeLinks = "true";
    if (options.includeBookIds) params.includeBookIds = "true";
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
    const bookmakersParam2 = _bookmakersParam(options.bookmakers);
    if (bookmakersParam2 !== undefined) params.bookmakers = bookmakersParam2;
    return this._request<OddsHistoryResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/odds/history`,
      { params }
    );
  }

   /**
    * Get the opening AND closing line per `(book, market, outcome)` for an
    * event. Closing is the last snapshot at or before commence_time
    * (`price` / `point` / `closing_at`); opening is the first snapshot in
    * the same 14-day pre-kickoff window (`opening_price` / `opening_point`
    * / `opening_at`). Canonical CLV helper: replaces "fetch full history →
    * find the first and last pre-game rows" with one call.
    *
    * Compare the *points* as well as the prices — on spreads and totals
    * the number moves as much as the price, so a price-only comparison
    * mis-measures those markets.
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
    const bookmakersParam3 = _bookmakersParam(options.bookmakers);
    if (bookmakersParam3 !== undefined) params.bookmakers = bookmakersParam3;
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
   * PrizePicks Power/Flex entry payout schedule (2-6 legs) plus the per-leg
   * breakeven win probability for each play. Pass `legWinProb` to also get
   * `expected_return` (per $1) and `is_plus_ev` per play — turning a slip
   * into the hit rate it actually needs to clear.
   *
   * These are PrizePicks's *standard* published payouts; demon/goblin per-pick
   * modifiers aren't in PrizePicks's feed, so they're not reflected. Breakeven
   * assumes independent legs. See the `disclaimer` field on the response.
   */
  getDfsPayouts(
    options: GetDfsPayoutsOptions = {}
  ): Promise<DfsPayoutsResponse> {
    const params: Record<string, string | number> = {
      platform: options.platform ?? "prizepicks",
    };
    if (options.legWinProb !== undefined) params.leg_win_prob = options.legWinProb;
    return this._request<DfsPayoutsResponse>("GET", "/dfs/payouts", { params });
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
   *
   * Live during games for major US sports (MLB + WNBA now; NFL, NCAAF,
   * NBA, NHL at season start): while the event's status is "in_progress",
   * stats refresh roughly every 90 seconds with cumulative in-game values —
   * treat them as partial until status flips to "final". Other sports
   * populate stats at game completion.
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
   * For MLB: probable starting pitchers and their throwing hand
   * (`home_probable_pitcher_hand` / `away_probable_pitcher_hand`, "L"/"R"/"S"
   * — platoon-split context for every batter prop), a confirmed-lineup flag,
   * the home-plate umpire, and first-pitch weather (outdoor / open-roof
   * venues; indoor venues return `weather: null` with `is_indoor: true`).
   * For NFL & NCAAF: the venue and kickoff weather (pitcher/umpire/lineup
   * fields are null for football). The same block is embedded in
   * {@link getResults}, so every graded prop carries its conditions — unique
   * to PropLine. Free tier. Rejects with a 404 when no context is on file
   * for the event yet.
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
    params.bookmakers = _bookmakersParam(options.bookmakers);
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
   * A player's game log — recent games with every raw box-score stat.
   *
   * One call replaces one request per event, so L5/L10/L20, season splits,
   * charts and head-to-head can all be built from the raw rows. Free tier.
   *
   * Reads the RAW-STATS archive, not graded-prop history: it covers every
   * game with a box score on file, including games no sportsbook priced, so
   * a "last 10 games" window here really is the last 10 games — unlike one
   * built from {@link getPlayerHistory} or {@link getPlayerTrends}. Carries
   * no line, price or grade.
   *
   * @example
   * ```ts
   * const log = await client.getPlayerGames("baseball_mlb", "Aaron Judge", { limit: 10 });
   * const hits = log.games.reduce((n, g) => n + (g.stats.hits ?? 0), 0);
   *
   * // Last 5 meetings with Boston — not the Boston games among his last 5.
   * const h2h = await client.getPlayerGames("baseball_mlb", "Aaron Judge", {
   *   limit: 5,
   *   opponent: "BOS",
   * });
   * ```
   */
  getPlayerGames(
    sportKey: string,
    playerName: string,
    options: GetPlayerGamesOptions = {}
  ): Promise<PlayerGameLog> {
    const params: Record<string, string | number | undefined> = {
      limit: options.limit ?? 20,
    };
    if (options.opponent) {
      params.opponent = options.opponent;
    }
    if (options.statType) {
      params.stat_type = Array.isArray(options.statType)
        ? options.statType.join(",")
        : options.statType;
    }
    return this._request<PlayerGameLog>(
      "GET",
      `/sports/${encodeURIComponent(sportKey)}/players/${encodeURIComponent(playerName)}/games`,
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
    if (options.dfsOddsType) {
      params.dfs_odds_type = options.dfsOddsType;
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
   * division winner, season win totals, etc. Each row is one (futures
   * event, book, market) with every team or player priced. Free tier;
   * aggregated across each book's futures feed (Bovada, FanDuel,
   * DraftKings, and Pinnacle).
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
   *
   * @param options.bookmakers Optional book key(s) to restrict the per-book
   *   market rows (the-odds-api-compatible; omitted = all books, unknown keys
   *   match nothing). A futures event left with no matching market is dropped.
   */
  getFutures(
    sport: string,
    options: { bookmakers?: string | string[] } = {}
  ): Promise<FuturesEvent[]> {
    const params: Record<string, string | undefined> = {};
    const bookmakersParam = _bookmakersParam(options.bookmakers);
    if (bookmakersParam !== undefined) params.bookmakers = bookmakersParam;
    return this._request<FuturesEvent[]>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/futures`,
      { params }
    );
  }

  /**
   * Market-implied consensus projections for a single event.
   *
   * One row per (market, player): the statistical value the betting
   * market collectively implies — the line where the no-vig P(over)
   * crosses 50%, median across contributing sportsbooks. Built for
   * validating your own statistical/fantasy projections against the
   * live market. Market-implied arithmetic over sportsbook prices,
   * never a forecast. DFS pick'em pricing is excluded.
   *
   * Paid tier required (Hobby+); free tier receives the structure with
   * projected values nulled and `redacted: true`.
   *
   * @example
   * ```ts
   * const proj = await client.getEventProjections("football_nfl", 25070);
   * for (const row of proj.projections) {
   *   console.log(row.player, row.market_key, row.projected_value);
   * }
   * ```
   */
  getEventProjections(
    sport: string,
    eventId: number | string,
    options: GetEventProjectionsOptions = {}
  ): Promise<EventProjectionsResponse> {
    const params: Record<string, string | undefined> = {};
    if (options.markets) {
      params.markets = Array.isArray(options.markets)
        ? options.markets.join(",")
        : options.markets;
    }
    return this._request<EventProjectionsResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/projections`,
      { params }
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
    if (options.bookmakers) {
      params.bookmakers = Array.isArray(options.bookmakers)
        ? options.bookmakers.join(",")
        : options.bookmakers;
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
   * Hobby tier or higher sees prices. Free tier gets a redacted
   * teaser: the full structure — every line, side, book identity, and
   * the best-first ranking — with every price null, plus
   * `redacted: true` and an `upgrade_url`.
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
    if (options.bookmakers) {
      params.bookmakers = Array.isArray(options.bookmakers)
        ? options.bookmakers.join(",")
        : options.bookmakers;
    }
    if (options.includeLinks) params.includeLinks = "true";
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
    this._captureQuota(resp);

    if (resp.status === 401) {
      throw new AuthError();
    }
    if (resp.status === 403) {
      const d = await readDetail(resp, "Pro tier required");
      throw new PropLineError(403, d.message, d.info);
    }
    if (resp.status >= 400) {
      const d = await readDetail(resp, resp.statusText);
      throw new PropLineError(resp.status, d.message, d.info);
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
    this._captureQuota(resp);

    if (resp.status === 401) {
      throw new AuthError();
    }
    if (resp.status === 403) {
      const d = await readDetail(
        resp,
        "Historical Backfill pass or Enterprise required"
      );
      throw new PropLineError(403, d.message, d.info);
    }
    if (resp.status >= 400) {
      const d = await readDetail(resp, resp.statusText);
      throw new PropLineError(resp.status, d.message, d.info);
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
      { params: { limit: options.limit ?? 50, before_id: options.beforeId } }
    );
  }

  /**
   * Re-read this subscription's events in order, from a cursor.
   *
   * Answers "my endpoint was down — what did I miss?". Every delivery carries
   * an `X-PropLine-Sequence` header: a counter monotonic *within your
   * subscription*. Store the highest one you processed and pass it as
   * `sinceSeq`.
   *
   * Do NOT use `X-PropLine-Delivery` as the cursor — that id is global across
   * every subscription, so its gaps are other customers' traffic.
   *
   * Events come back oldest-first (the opposite of `listWebhookDeliveries`,
   * which is a newest-first debugging log). Page by passing `next_seq` back
   * as `sinceSeq` while `has_more` is true.
   *
   * **Check `truncated`.** True means events after your cursor have aged out
   * of retention (2 days, max 5,000 deliveries per subscription) and are gone
   * — resync from the REST endpoints instead of assuming you are current.
   *
   * Does not count against your daily request quota.
   */
  replayWebhookEvents(
    webhookId: number,
    options: ReplayWebhookEventsOptions = {}
  ): Promise<ReplayPage> {
    return this._request<ReplayPage>(
      "GET",
      `/webhooks/${webhookId}/replay`,
      { params: { since_seq: options.sinceSeq ?? 0, limit: options.limit ?? 100 } }
    );
  }

  /**
   * Stream a websocket subscription as an async iterable.
   *
   * ```ts
   * for await (const ev of client.stream({ webhookId: 12, sinceSeq: 4180 })) {
   *   console.log(ev.seq, ev.event_type, ev.data);
   * }
   * ```
   *
   * The subscription must have been created with `transport: "websocket"`.
   * Same events, same filters, same `seq` as an HTTP webhook — one
   * subscription, different transport.
   *
   * **Reconnects automatically and resumes from the last `seq` it saw**, which
   * is the whole point of the sequence: a dropped connection does not become a
   * gap in your data. Set `reconnect: false` to get a single connection that
   * ends when the socket closes.
   *
   * If the server reports `truncated` — events after your cursor aged out of
   * retention and are gone — `onTruncated` fires. Handle it: that is the one
   * case where the stream cannot make you whole and you should resync from the
   * REST endpoints.
   */
  async *stream(options: StreamOptions): AsyncGenerator<ReplayEvent, void, void> {
    // ⚠️ Streaming has its OWN origin and does NOT derive from baseUrl.
    // Deriving it (the first cut of this method did) sends the socket to
    // api.prop-line.com — which serves /v1/stream too, from the same ASGI
    // app, so it WORKS and nothing complains. It just parks a persistent
    // connection on the REST tier's event loop, which is precisely what the
    // separate websocket tier exists to prevent. Caught 2026-08-31 by reading
    // the machine id in ws_connections and finding an app-tier machine.
    // Override with `wsUrl` only for self-hosted or local development.
    const wsBase = (options.wsUrl ?? DEFAULT_WS_URL)
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:")
      .replace(/\/v1\/?$/, "")
      .replace(/\/$/, "");
    const url = `${wsBase}/v1/stream`;
    let cursor = options.sinceSeq ?? 0;
    let attempt = 0;

    for (;;) {
      const queue: ReplayEvent[] = [];
      let notify: (() => void) | null = null;
      let closed: Error | null = null;
      let opened = false;

      const ws = new WebSocket(url);
      const wake = () => { const n = notify; notify = null; n?.(); };

      ws.addEventListener("open", () => {
        opened = true;
        ws.send(JSON.stringify({
          type: "auth",
          api_key: this.apiKey,
          webhook_id: options.webhookId,
          since_seq: cursor,
        }));
      });
      ws.addEventListener("message", (e: MessageEvent) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(e.data)); } catch { return; }
        if (msg.type === "ready") {
          attempt = 0;                       // a successful handshake resets backoff
          if (msg.truncated) options.onTruncated?.(msg as unknown as ReplayPage);
          options.onReady?.(msg as unknown as ReplayPage);
        } else if (msg.type === "event") {
          queue.push(msg as unknown as ReplayEvent);
          wake();
        }
        // "ping" needs no reply — it exists to keep idle proxies from closing.
      });
      ws.addEventListener("close", (e: CloseEvent) => {
        // 4401/4403/4404/4400 are terminal: retrying cannot fix a bad key, a
        // tier without access, or a subscription that is not yours. Only
        // transport failures and 4429 are worth reconnecting for.
        const terminal = [4400, 4401, 4403, 4404].includes(e.code);
        closed = new PropLineError(
          e.code,
          `stream closed${e.reason ? `: ${e.reason}` : ""}`,
        );
        (closed as PropLineError & { terminal?: boolean }).terminal = terminal;
        wake();
      });
      ws.addEventListener("error", () => {
        if (!closed) closed = new PropLineError(0, "stream connection error");
        wake();
      });

      try {
        for (;;) {
          while (queue.length) {
            const ev = queue.shift()!;
            cursor = ev.seq;               // advance BEFORE yielding, so a
            yield ev;                     // consumer `break` still resumes right
          }
          if (closed) break;
          await new Promise<void>((r) => { notify = r; });
        }
      } finally {
        try { ws.close(); } catch { /* already closed */ }
      }

      const err = closed as (PropLineError & { terminal?: boolean }) | null;
      if (err?.terminal) throw err;
      if (options.reconnect === false) {
        if (err && !opened) throw err;
        return;
      }
      // Capped exponential backoff. Without the cap a long outage would have
      // clients reconnecting hours apart; without backoff they would stampede.
      const delayMs = Math.min(30_000, 500 * 2 ** attempt++);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  /**
   * Grade placed bets against their closing lines (CLV).
   *
   * Closing line value is the only durable proxy for whether a bettor has
   * edge: did the price you took beat the number the market settled on?
   * Send the bets you actually placed; each comes back with its closing
   * price, the de-vigged closing fair probability, CLV, and — once the
   * game settles — the graded result and actual stat value.
   *
   * Stateless: nothing is stored server-side.
   *
   * **Two CLV numbers are returned deliberately.** `clv_pct` is
   * price-vs-price — familiar and quotable, but vig-blind, so it flatters
   * a bet taken on the juicy side of a wide market. `ev_vs_close_pct`
   * scores your price against the DE-VIGGED close and is the honest one;
   * on a real bet the two came out +6.52% and +0.08%.
   *
   * The de-vig anchors to the **sharpest book quoting that line at close**
   * (`fair_source`), not the book you bet at — de-vigging your own book
   * always returns a negative number, because you paid its hold.
   *
   * Bets whose event has not started carry `closing_is_final: false`, land
   * in `summary.pending`, and are excluded from the summary averages:
   * before kickoff the "closing" price is just the latest price.
   *
   * Matching is fail-closed — a bet that cannot be pinned to exactly one
   * stored outcome returns `matched: false` with an `unmatched_reason`
   * rather than a confident wrong match. Max 500 bets per request.
   *
   * Hobby+ required; free tier receives the structure with numbers nulled.
   *
   * @example
   * const res = await client.gradeClv([{
   *   ref: "b1",
   *   sport_key: "baseball_mlb",
   *   event_id: 150791,
   *   market: "batter_hits_runs_rbis",
   *   bookmaker: "lowvig",
   *   selection: "Drake Baldwin",
   *   side: "Under",
   *   point: 0.5,
   *   price: 145,
   *   stake: 1,
   * }]);
   * console.log(res.summary.avg_ev_vs_close_pct);
   */
  gradeClv(bets: ClvBetInput[]): Promise<ClvGradeResponse> {
    return this._request<ClvGradeResponse>("POST", "/clv/grade", { body: bets });
  }

  /**
   * Price a same-game parlay at the book's own correlated odds.
   *
   * Send two to ten legs from ONE event and get back the book's own price
   * for that exact slip — what a FanDuel customer would be offered for it
   * at that moment, not a model of it — beside `independent_price` (the
   * product of the live single-leg prices) and `correlation_factor`
   * (their ratio: the correlation the book is charging, below 1, or
   * paying, above 1, for). Measured live: Cardinals ML +205 × Freddie
   * Freeman to record a hit -260 → SGP +592 against an independent +322.
   *
   * Book-native. FanDuel is the only book wired today; `bookmaker` is
   * additive and an unsupported value is a 422.
   *
   * Legs are named exactly as `/odds` names an outcome (market, name,
   * description, point, period), or by `book_outcome_id` from
   * `includeBookIds: true`. Matching is fail-closed — a leg that does not
   * pin to exactly one stored outcome is a 422 `leg_unmatched` naming the
   * leg. `quoted: false` means the book will not offer that combination as
   * a same-game parlay; refused legs carry the book's own `failure_code`.
   * Quotes for an identical slip are shared for 15 seconds.
   *
   * Hobby+ required; free tier receives the matched legs with every price
   * nulled and never triggers a book call.
   *
   * @example
   * const q = await client.priceSgp("baseball_mlb", 150791, [
   *   { market: "h2h", name: "St. Louis Cardinals" },
   *   { market: "batter_1plus_hits", name: "Freddie Freeman", description: "Freddie Freeman" },
   * ]);
   * console.log(q.sgp_price, q.independent_price, q.correlation_factor);
   */
  priceSgp(
    sportKey: string,
    eventId: number | string,
    legs: SgpLegInput[],
    bookmaker = "fanduel",
  ): Promise<SgpQuoteResponse> {
    return this._request<SgpQuoteResponse>(
      "POST",
      `/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(String(eventId))}/sgp`,
      { body: { bookmaker, legs } },
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
    ["filterBookmakerKey", "filter_bookmaker_key"],
    ["minPriceChangePct", "min_price_change_pct"],
    ["minSteamScore", "min_steam_score"],
    ["minBooksAgreeing", "min_books_agreeing"],
    ["batchMax", "batch_max"],
    ["active", "active"],
  ];
  for (const [src, dst] of map) {
    const v = (options as Record<string, unknown>)[src as string];
    if (v !== undefined) body[dst] = v;
  }
  return body;
}

interface ReadDetailResult {
  message: string;
  info?: PropLineErrorInfo;
}

async function readDetail(
  resp: Response,
  fallback: string,
): Promise<ReadDetailResult> {
  try {
    const text = await resp.text();
    if (!text) return { message: fallback };
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      if (typeof json.detail === "string") return { message: json.detail };
      if (json.detail && typeof json.detail === "object") {
        const info = json.detail as PropLineErrorInfo;
        return {
          message: typeof info.message === "string" ? info.message : text,
          info,
        };
      }
    } catch {
      // not JSON
    }
    return { message: text || fallback };
  } catch {
    return { message: fallback };
  }
}
