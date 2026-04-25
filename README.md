# PropLine Node.js / TypeScript SDK

Official Node and TypeScript client for the [PropLine](https://prop-line.com) player props API — real-time betting odds from Bovada, DraftKings, FanDuel, Pinnacle, Unibet, and PrizePicks across MLB, NBA, NHL, soccer, UFC, and more.

Zero runtime dependencies — uses the built-in `fetch`. Requires Node 18+.

## Installation

```bash
npm install propline
# or
pnpm add propline
# or
yarn add propline
```

## Quick start

```ts
import { PropLine } from "propline";

const client = new PropLine("your_api_key");

// List available sports
const sports = await client.getSports();
// [{ key: "baseball_mlb", title: "MLB", active: true }, ...]

// Get today's NBA games
const events = await client.getEvents("basketball_nba");
for (const event of events) {
  console.log(`${event.away_team} @ ${event.home_team}`);
}

// Get player props for a game
const odds = await client.getOdds("basketball_nba", {
  eventId: events[0].id,
  markets: ["player_points", "player_rebounds", "player_assists"],
});

for (const bookmaker of odds.bookmakers) {
  for (const market of bookmaker.markets) {
    for (const outcome of market.outcomes) {
      console.log(
        `${outcome.description} ${outcome.name} ${outcome.point} @ ${outcome.price}`
      );
    }
  }
}
```

CommonJS works too:

```js
const { PropLine } = require("propline");
```

## Get your API key

1. Go to [prop-line.com](https://prop-line.com)
2. Enter your email
3. Get your API key instantly — **500 requests/day, no credit card required**

## Available sports

| Key | Sport |
|-----|-------|
| `baseball_mlb` | MLB |
| `basketball_nba` | NBA |
| `basketball_ncaab` | College Basketball |
| `football_ncaaf` | College Football |
| `golf` | Golf |
| `tennis` | Tennis |
| `hockey_nhl` | NHL |
| `football_nfl` | NFL |
| `soccer_epl` | EPL |
| `soccer_la_liga` | La Liga |
| `soccer_serie_a` | Serie A |
| `soccer_bundesliga` | Bundesliga |
| `soccer_ligue_1` | Ligue 1 |
| `soccer_mls` | MLS |
| `mma_ufc` | UFC |
| `boxing` | Boxing |

## Bookmakers

Every odds response returns a `bookmakers` array so you can compare lines across books in a single request — iterate the array to line-shop.

| Key | Book | Coverage |
|-----|------|----------|
| `bovada` | Bovada | All 19 sports — game lines + full player props |
| `draftkings` | DraftKings | MLB, NBA, NHL, 6 soccer leagues — game lines + player props |
| `fanduel` | FanDuel | MLB, NBA, NHL, 6 soccer leagues — game lines + player props |
| `pinnacle` | Pinnacle | MLB (game lines + props), NBA/NHL/soccer (game lines, goalie saves) |
| `unibet` | Unibet | MLB/NBA/NHL + 6 soccer leagues — game lines; player props on NBA, NHL, soccer |
| `prizepicks` | PrizePicks (DFS) | MLB, NBA, NHL, 9 soccer leagues — player props only; synthetic +100/+100 even-money pricing since DFS payouts scale with parlay correct-count, not per-pick odds |

```ts
import { PropLine, Bookmakers } from "propline";

const client = new PropLine("your_api_key");

const odds = await client.getOdds("baseball_mlb", {
  eventId: 51,
  markets: ["pitcher_strikeouts"],
});

// Filter to a specific book
for (const bk of odds.bookmakers) {
  if (bk.key === Bookmakers.DRAFTKINGS) {
    // ...
  }
}

// Or iterate all books
for (const bk of odds.bookmakers) {
  console.log(`\n${bk.title}`);
  for (const market of bk.markets) {
    for (const o of market.outcomes) {
      console.log(`  ${o.description} ${o.name} ${o.point}: ${o.price}`);
    }
  }
}
// Bovada
//   Zack Wheeler Over 6.5: -130
// DraftKings
//   Zack Wheeler Over 6.5: -125
// FanDuel
//   Zack Wheeler Over 6.5: -135
```

## Available markets

### MLB
`pitcher_strikeouts`, `pitcher_outs`, `pitcher_earned_runs`, `pitcher_hits_allowed`, `batter_hits`, `batter_home_runs`, `batter_rbis`, `batter_total_bases`, `batter_stolen_bases`, `batter_walks`, `batter_singles`, `batter_doubles`, `batter_runs`, `batter_2plus_hits`, `batter_2plus_home_runs`, `batter_2plus_rbis`, `batter_3plus_rbis`

### NBA
`player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_steals`, `player_blocks`, `player_turnovers`, `player_points_rebounds`, `player_points_assists`, `player_rebounds_assists`, `player_points_rebounds_assists`, `player_double_double`, `player_triple_double`

### NHL
`player_goals`, `player_first_goal`, `player_goals_2plus`, `player_goals_3plus`, `player_shots_on_goal`, `player_points_1plus`, `player_points_2plus`, `player_points_3plus`, `goalie_saves`, `player_blocked_shots`

### Soccer (EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS)
`anytime_goal_scorer`, `first_goal_scorer`, `2plus_goals`, `goal_or_assist`, `player_assists`, `player_2plus_assists`, `player_cards`, `both_teams_to_score`, `double_chance`, `draw_no_bet`, `correct_score`, `total_corners`, `total_cards`

### UFC / Boxing
`h2h`, `total_rounds`, `fight_distance`, `round_betting`

### Game lines (all sports)
`h2h`, `spreads`, `totals` (alt lines and team totals included automatically)

## Examples

### Get MLB pitcher strikeout props

```ts
import { PropLine } from "propline";

const client = new PropLine("your_api_key");

const events = await client.getEvents("baseball_mlb");
for (const event of events) {
  const odds = await client.getOdds("baseball_mlb", {
    eventId: event.id,
    markets: ["pitcher_strikeouts"],
  });
  console.log(`\n${event.away_team} @ ${event.home_team}`);
  for (const bk of odds.bookmakers) {
    for (const mkt of bk.markets) {
      for (const o of mkt.outcomes) {
        if (o.point != null) {
          console.log(`  ${o.description} ${o.name} ${o.point}: ${o.price}`);
        }
      }
    }
  }
}
```

### Get game scores

```ts
const scores = await client.getScores("baseball_mlb");
for (const game of scores) {
  if (game.status === "final") {
    console.log(
      `${game.away_team} ${game.away_score}, ${game.home_team} ${game.home_score}`
    );
  }
}
```

### Get resolved prop outcomes (Pro only)

```ts
const results = await client.getResults("baseball_mlb", 16, {
  markets: ["pitcher_strikeouts", "batter_hits"],
});

console.log(
  `${results.away_team} ${results.away_score}, ${results.home_team} ${results.home_score}`
);

for (const market of results.markets) {
  for (const outcome of market.outcomes) {
    console.log(
      `${outcome.description} ${outcome.name} ${outcome.point}: ${outcome.resolution} (actual: ${outcome.actual_value})`
    );
  }
}
// Output: "Tarik Skubal (DET) Over 6.5: won (actual: 7.0)"
```

### Get historical line movement (Pro only)

```ts
const history = await client.getOddsHistory("baseball_mlb", 16, {
  markets: ["pitcher_strikeouts"],
});

for (const market of history.markets) {
  for (const outcome of market.outcomes) {
    console.log(`\n${outcome.description}:`);
    for (const snap of outcome.snapshots) {
      console.log(`  ${snap.recorded_at}: ${snap.price} @ ${snap.point}`);
    }
  }
}
```

### Get player prop history (Pro full, Free redacted)

```ts
// "Did Bryan Woo go over/under his last 10 strikeout props?"
const hist = await client.getPlayerHistory("baseball_mlb", "Bryan Woo", {
  market: "pitcher_strikeouts",
  limit: 10,
});

for (const e of hist.entries) {
  console.log(
    `${e.commence_time.slice(0, 10)} ${e.bookmaker_title}: ` +
      `line ${e.line}, actual ${e.actual_value} ` +
      `-> Over ${e.over_result}, Under ${e.under_result}`
  );
}
// Output: "2026-04-19 DraftKings: line 6.5, actual 6.0 -> Over lost, Under won"
```

### Cross-book +EV (Pro)

```ts
// Find +EV plays on a single event. Pinnacle anchors the no-vig fair
// line; every other book's price gets an EV%, with +EV plays floated
// to the top of each line group.
const ev = await client.getEventEv("baseball_mlb", 12345, {
  markets: ["pitcher_strikeouts", "batter_hits"],
});

for (const line of ev.lines) {
  const plus = line.outcomes.filter((o) => o.is_plus_ev);
  if (plus.length === 0) continue;
  console.log(
    `\n${line.market_key} ${line.description} ` +
      `line=${line.point} fair=${line.fair_source}`
  );
  for (const o of plus) {
    console.log(
      `  ${o.book_title.padEnd(11)} ${o.name.padEnd(6)} ` +
        `${o.price >= 0 ? "+" : ""}${o.price}  ev=+${o.ev_pct}%`
    );
  }
}
```

### Bulk CSV export of resolved props (Pro)

```ts
// Save every resolved MLB strikeout prop since April 1st to disk.
await client.exportResolvedProps({
  sport: "baseball_mlb",
  market: "pitcher_strikeouts",
  since: "2026-04-01T00:00:00Z",
  outPath: "./mlb-strikeouts.csv",
});

// Or load into memory.
const csv = await client.exportResolvedProps({ sport: "baseball_mlb" });
console.log(`got ${csv.byteLength} bytes of CSV`);
```

## Webhooks (Streaming tier)

The Streaming tier ($149/mo) pushes `line_movement` and `resolution` events to your URL in real time, with HMAC-SHA256 signing and automatic retries.

### Register a subscription

```ts
const wh = await client.createWebhook({
  url: "https://example.com/hooks/propline",
  filterSportKey: "baseball_mlb",
  filterMarketKey: "pitcher_strikeouts",
  minPriceChangePct: 2.0, // only fire on shifts of 2%+ (or any point change)
});

// Store wh.secret — this is the ONLY time it's returned.
const SECRET = wh.secret;
console.log(`webhook id: ${wh.id}`);
```

### Verify incoming deliveries

Each POST carries these headers:

| Header | Purpose |
|--------|---------|
| `X-PropLine-Event` | `line_movement`, `resolution`, or `test` |
| `X-PropLine-Timestamp` | Unix seconds |
| `X-PropLine-Signature` | HMAC-SHA256 over `${timestamp}.` + body |
| `X-PropLine-Delivery` | Stable delivery id (use for idempotency) |

```ts
import express from "express";
import { PropLine } from "propline";

const app = express();
app.post(
  "/hooks/propline",
  express.raw({ type: "*/*" }),
  (req, res) => {
    const ok = PropLine.verifySignature({
      secret: process.env.WEBHOOK_SECRET!,
      timestamp: req.header("X-PropLine-Timestamp")!,
      body: req.body, // raw Buffer — make sure to use express.raw, not express.json
      signature: req.header("X-PropLine-Signature")!,
    });
    if (!ok) return res.status(401).end();
    // process payload (parse JSON yourself after verification)
    res.status(200).end();
  }
);
```

### Line-movement payload

```json
{
  "event_type": "line_movement",
  "sport_key": "baseball_mlb",
  "event": { "id": 5070, "home_team": "Seattle Mariners", "away_team": "Texas Rangers" },
  "market_key": "totals",
  "player_name": null,
  "outcome_name": "Over",
  "previous": { "price_american": -750, "point": 7.0 },
  "current":  { "price_american": -300, "point": 7.5 },
  "price_change_pct": 60.0,
  "timestamp": "2026-04-18T03:49:00Z"
}
```

### Resolution payload

```json
{
  "event_type": "resolution",
  "sport_key": "baseball_mlb",
  "event": { "id": 16, "home_score": 4, "away_score": 2, "status": "final" },
  "market_key": "pitcher_strikeouts",
  "player_name": "Tarik Skubal (DET)",
  "outcome_name": "Over",
  "point": 6.5,
  "resolution": "won",
  "actual_value": 9.0,
  "resolved_at": "2026-04-18T06:14:22Z"
}
```

### Manage subscriptions

```ts
for (const wh of await client.listWebhooks()) {
  console.log(wh.id, wh.url, wh.active ? "active" : "paused");
}

await client.updateWebhook(whId, { minPriceChangePct: 5.0 });
await client.testWebhook(whId);
await client.listWebhookDeliveries(whId, { limit: 50 });
await client.deleteWebhook(whId);
```

## Error handling

```ts
import { PropLine, AuthError, RateLimitError, PropLineError } from "propline";

const client = new PropLine("your_api_key");

try {
  const odds = await client.getOdds("baseball_mlb", { eventId: 1 });
} catch (e) {
  if (e instanceof AuthError) {
    console.error("Invalid API key");
  } else if (e instanceof RateLimitError) {
    console.error("Daily limit exceeded — upgrade at prop-line.com/#pricing");
  } else if (e instanceof PropLineError) {
    console.error(`API error: ${e.statusCode} — ${e.detail}`);
  } else {
    throw e;
  }
}
```

## Links

- **Website**: [prop-line.com](https://prop-line.com)
- **API Docs**: [prop-line.com/docs](https://prop-line.com/docs)
- **Dashboard**: [prop-line.com/dashboard](https://prop-line.com/dashboard)
- **API Reference**: [api.prop-line.com/docs](https://api.prop-line.com/docs)
- **Python SDK**: [`pip install propline`](https://pypi.org/project/propline/)

## License

MIT
