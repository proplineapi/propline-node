import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";

import type {
  Sport,
  Event as PropLineEvent,
  OddsResponse,
  MarketSummary,
  OddsHistoryResponse,
  ScoreEvent,
  StatsResponse,
  ResultsResponse,
  PlayerHistoryResponse,
  EventEvResponse,
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

export interface GetOddsOptions {
  /** Specific event ID to get odds (with player props) for. Omit for bulk odds. */
  eventId?: number | string;
  /** Market keys to filter by. */
  markets?: string[];
}

export interface GetOddsHistoryOptions {
  markets?: string[];
}

export interface GetScoresOptions {
  /** Days back to include (default 3). */
  daysFrom?: number;
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

export interface GetEventEvOptions {
  /**
   * Optional market filter. Pass a single comma-separated string or an
   * array of market keys (e.g. `["pitcher_strikeouts", "batter_hits"]`).
   * Omit to evaluate every market on the event.
   */
  markets?: string | string[];
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

export interface CreateWebhookOptions {
  /** HTTPS endpoint to receive POSTed events. Required. */
  url: string;
  /** Event types to subscribe to. Default: all. */
  events?: Array<"line_movement" | "resolution">;
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  /** Minimum % change in American odds to fire a line_movement. Point-only shifts always pass. */
  minPriceChangePct?: number;
}

export interface UpdateWebhookOptions {
  url?: string;
  events?: Array<"line_movement" | "resolution">;
  filterSportKey?: string;
  filterEventId?: number;
  filterMarketKey?: string;
  filterPlayerName?: string;
  minPriceChangePct?: number;
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
   * Pro tier: full snapshots. Free tier: redacted (snapshot counts only).
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
    return this._request<OddsHistoryResponse>(
      "GET",
      `/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(String(eventId))}/odds/history`,
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
