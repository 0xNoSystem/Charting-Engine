export type TimeFrame =
    | "min1"
    | "min3"
    | "min5"
    | "min15"
    | "min30"
    | "hour1"
    | "hour2"
    | "hour4"
    | "hour12"
    | "day1"
    | "day3"
    | "week"
    | "month";

export type MarketType = "spot" | "futures";

export type ExchangeId =
    | "binance"
    | "bybit"
    | "okx"
    | "coinbase"
    | "kraken"
    | "kucoin"
    | "bitget"
    | "gateio"
    | "htx"
    | "mexc";

export type DataSource = {
    exchange: ExchangeId;
    market: MarketType;
};

export const DEFAULT_DATA_SOURCE: DataSource = {
    exchange: "binance",
    market: "futures",
};

export const DEFAULT_QUOTE_ASSET = "USDT";

export interface CandleData {
    open: number;
    high: number;
    low: number;
    close: number;
    start: number;
    end: number;
    volume: number;
    trades: number;
    asset: string;
    interval: string;
}

export interface HyperliquidCandle {
    T: number;
    c: string;
    h: string;
    i: string;
    l: string;
    n: number;
    o: string;
    s: string;
    t: number;
    v: string;
}

export const TIMEFRAME_CAMELCASE: Record<string, TimeFrame> = {
    "1m": "min1",
    "3m": "min3",
    "5m": "min5",
    "15m": "min15",
    "30m": "min30",
    "1h": "hour1",
    "2h": "hour2",
    "4h": "hour4",
    "12h": "hour12",
    "1d": "day1",
    "3d": "day3",
    "1w": "week",
    "1M": "month",
};

const TIMEFRAME_SHORT: Record<TimeFrame, string> = Object.entries(
    TIMEFRAME_CAMELCASE
).reduce(
    (acc, [short, tf]) => {
        acc[tf] = short;
        return acc;
    },
    {} as Record<TimeFrame, string>
);

export function fromTimeFrame(tf: TimeFrame): string {
    return TIMEFRAME_SHORT[tf];
}

export function into(tf: string): TimeFrame {
    return TIMEFRAME_CAMELCASE[tf];
}



export const TF_TO_MS: Record<TimeFrame, number> = {
    min1: 60_000,
    min3: 3 * 60_000,
    min5: 5 * 60_000,
    min15: 15 * 60_000,
    min30: 30 * 60_000,
    hour1: 60 * 60_000,
    hour2: 2 * 60 * 60_000,
    hour4: 4 * 60 * 60_000,
    hour12: 12 * 60 * 60_000,
    day1: 24 * 60 * 60_000,
    day3: 3 * 24 * 60 * 60_000,
    week: 7 * 24 * 60 * 60_000,
    month: 30 * 24 * 60 * 60_000,
};
