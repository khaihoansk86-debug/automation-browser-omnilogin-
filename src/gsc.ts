import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type GscKeywordStrategy = 'opportunity' | 'low_clicks' | 'bottom';

export type GscConfig = {
  enabled: boolean;
  siteUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  keywordPoolPath: string;
  days: number;
  rowLimit: number;
  minImpressions: number;
  maxClicks: number;
  maxCtr: number;
  maxPosition: number;
  syncMaxAgeHours: number;
  strategy: GscKeywordStrategy;
};

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type KeywordPoolItem = {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  score: number;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStrategy(value: string | undefined): GscKeywordStrategy {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'low_clicks' || normalized === 'bottom') return normalized;
  return 'opportunity';
}

function isoDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function isUsefulKeyword(keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 120) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (/^[\d\s.,:/\\-]+$/.test(normalized)) return false;
  if (['facebook', 'shopee', 'lazada', 'tiktok', 'youtube'].some((item) => normalized === item)) {
    return false;
  }
  return true;
}

function scoreRow(row: Required<Pick<SearchAnalyticsRow, 'clicks' | 'impressions' | 'ctr' | 'position'>>) {
  const ctrGap = Math.max(0.01, 0.12 - row.ctr);
  const clickGap = Math.max(1, row.impressions - row.clicks * 8);
  const positionWeight = row.position <= 10 ? 1 : 1 / (1 + (row.position - 10) / 12);
  return Number((clickGap * ctrGap * positionWeight).toFixed(4));
}

export function loadGscConfig(): GscConfig {
  return {
    enabled: parseBoolean(process.env.GSC_ENABLED, false),
    siteUrl: process.env.GSC_SITE_URL?.trim() || 'https://khaihoanderma.com/',
    clientId: process.env.GSC_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GSC_CLIENT_SECRET?.trim() || '',
    refreshToken: process.env.GSC_REFRESH_TOKEN?.trim() || '',
    accessToken: process.env.GSC_ACCESS_TOKEN?.trim() || '',
    keywordPoolPath:
      process.env.GSC_KEYWORD_POOL_PATH?.trim() ||
      'C:\\Users\\Admin\\Desktop\\key_derma\\gsc-keywords.json',
    days: Math.floor(parsePositiveNumber(process.env.GSC_DAYS, 90)),
    rowLimit: Math.min(25_000, Math.floor(parsePositiveNumber(process.env.GSC_ROW_LIMIT, 25_000))),
    minImpressions: parsePositiveNumber(process.env.GSC_MIN_IMPRESSIONS, 3),
    maxClicks: parsePositiveNumber(process.env.GSC_MAX_CLICKS, 2),
    maxCtr: parsePositiveNumber(process.env.GSC_MAX_CTR, 0.08),
    maxPosition: parsePositiveNumber(process.env.GSC_MAX_POSITION, 30),
    syncMaxAgeHours: parsePositiveNumber(process.env.GSC_SYNC_MAX_AGE_HOURS, 168),
    strategy: normalizeStrategy(process.env.GSC_KEYWORD_STRATEGY),
  };
}

export async function getGscAccessToken(config = loadGscConfig()) {
  if (config.accessToken) return config.accessToken;
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error('Thieu GSC_CLIENT_ID, GSC_CLIENT_SECRET hoac GSC_REFRESH_TOKEN.');
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`Khong lay duoc GSC access token: ${payload.error_description || payload.error || response.status}`);
  }
  return payload.access_token;
}

export async function fetchGscQueryRows(config = loadGscConfig()) {
  const accessToken = await getGscAccessToken(config);
  const endDate = isoDateDaysAgo(3);
  const startDate = isoDateDaysAgo(config.days + 3);
  const body = {
    startDate,
    endDate,
    dimensions: ['query'],
    searchType: 'web',
    rowLimit: config.rowLimit,
    startRow: 0,
  };

  const site = encodeURIComponent(config.siteUrl);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { rows?: SearchAnalyticsRow[]; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`GSC query loi: ${payload.error?.message || response.status}`);
  }
  return payload.rows || [];
}

export function buildKeywordPool(rows: SearchAnalyticsRow[], config = loadGscConfig()) {
  const candidates: KeywordPoolItem[] = rows
    .map((row) => {
      const keyword = String(row.keys?.[0] || '').trim();
      const clicks = Number(row.clicks || 0);
      const impressions = Number(row.impressions || 0);
      const ctr = Number(row.ctr || 0);
      const position = Number(row.position || 0);
      return { keyword, clicks, impressions, ctr, position, score: scoreRow({ clicks, impressions, ctr, position }) };
    })
    .filter((item) => isUsefulKeyword(item.keyword))
    .filter((item) => item.impressions >= config.minImpressions)
    .filter((item) => item.clicks <= config.maxClicks)
    .filter((item) => item.ctr <= config.maxCtr)
    .filter((item) => item.position > 0 && item.position <= config.maxPosition);

  if (config.strategy === 'bottom') {
    candidates.sort((a, b) => a.clicks - b.clicks || b.impressions - a.impressions || a.position - b.position);
  } else if (config.strategy === 'low_clicks') {
    candidates.sort((a, b) => a.clicks - b.clicks || b.score - a.score);
  } else {
    candidates.sort((a, b) => b.score - a.score || b.impressions - a.impressions);
  }

  return candidates.slice(0, 300);
}

async function readExistingPoolMeta(path: string) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { generatedAt?: string; count?: number };
    const generatedAt = parsed.generatedAt ? new Date(parsed.generatedAt) : null;
    if (!generatedAt || Number.isNaN(generatedAt.getTime())) return null;
    return {
      generatedAt,
      count: Number(parsed.count || 0),
      ageHours: (Date.now() - generatedAt.getTime()) / 3_600_000,
    };
  } catch {
    return null;
  }
}

export async function syncGscKeywordPool(config = loadGscConfig()) {
  if (!config.enabled) {
    return { skipped: true as const, reason: 'GSC_ENABLED=false', path: config.keywordPoolPath };
  }

  const existing = await readExistingPoolMeta(config.keywordPoolPath);
  if (existing && existing.ageHours < config.syncMaxAgeHours) {
    return {
      skipped: true as const,
      reason: `Keyword pool is fresh (${existing.ageHours.toFixed(1)}h < ${config.syncMaxAgeHours}h)`,
      path: config.keywordPoolPath,
      count: existing.count,
      generatedAt: existing.generatedAt.toISOString(),
    };
  }

  const rows = await fetchGscQueryRows(config);
  const keywords = buildKeywordPool(rows, config);
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'google-search-console',
    siteUrl: config.siteUrl,
    strategy: config.strategy,
    filters: {
      days: config.days,
      minImpressions: config.minImpressions,
      maxClicks: config.maxClicks,
      maxCtr: config.maxCtr,
      maxPosition: config.maxPosition,
      syncMaxAgeHours: config.syncMaxAgeHours,
    },
    count: keywords.length,
    keywords,
  };

  await mkdir(dirname(config.keywordPoolPath), { recursive: true });
  await writeFile(config.keywordPoolPath, JSON.stringify(output, null, 2), 'utf8');

  return {
    skipped: false as const,
    path: config.keywordPoolPath,
    count: keywords.length,
    preview: keywords.slice(0, 10).map((item) => item.keyword),
  };
}
