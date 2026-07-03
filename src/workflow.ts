import { OmniLogin, type Page, type Profile } from '@omnilogin/sdk';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { appConfig } from './config.js';

type StateResult = Record<string, unknown> & { ok: boolean };

export interface SearchRunInput {
  keyword: string;
  profileId: number;
  useRandomKeyword?: boolean;
}

export interface BatchRunInput {
  keyword: string;
  profileIds: number[];
  useRandomKeyword?: boolean;
  delaySeconds: number;
}

export interface BatchRunResult {
  delaySeconds: number;
  totalProfiles: number;
  startedAt: string;
  finishedAt: string;
  results: Array<
    | { ok: true; profileId: number; result: SearchRunResult }
    | { ok: false; profileId: number; error: string }
  >;
}

export interface SearchRunResult {
  keyword: string;
  profileId: number;
  profileName?: string;
  targetDomain: string;
  googleRank: number | null;
  targetResult?: SearchResultItem;
  topResults: SearchResultItem[];
  siteAudit: SiteAuditResult;
  finalUrl: string;
  title: string;
}

export interface SearchResultItem {
  position: number;
  title: string;
  url: string;
  host: string;
  clickUrl?: string;
}

export interface SiteAuditPage {
  url: string;
  title: string;
  internalLinkCount: number;
  sampledInternalLinks: string[];
}

export interface SiteAuditResult {
  startUrl: string;
  maxDurationMs: number;
  elapsedMs: number;
  stoppedByBudget: boolean;
  visitedPages: SiteAuditPage[];
}

export function createOmniLogin() {
  return new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
}

export async function listProfiles(): Promise<Profile[]> {
  const omni = createOmniLogin();
  const firstPage = await omni.profiles.list({
    page: 1,
    pageSize: 100,
    sort: 'date_updated',
    sortType: 'desc',
  });

  return firstPage.docs;
}

export async function readKeywords() {
  const raw = await readFile(appConfig.keywordFilePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export async function pickRandomKeyword() {
  const keywords = await readKeywords();
  if (keywords.length === 0) {
    throw new Error(`Keyword file is empty: ${appConfig.keywordFilePath}`);
  }
  return keywords[Math.floor(Math.random() * keywords.length)];
}

async function isVisibleSafe(locator: ReturnType<Page['locator']>): Promise<boolean> {
  return (await locator.count()) > 0 && (await locator.first().isVisible());
}

async function waitUntilState(
  label: string,
  inspect: () => Promise<StateResult>,
  timeout = 30_000,
) {
  const startedAt = Date.now();
  let lastState: StateResult | null = null;

  while (Date.now() - startedAt < timeout) {
    lastState = await inspect();
    if (lastState.ok) return lastState;
    await delay(250);
  }

  throw new Error(`${label} timeout: ${JSON.stringify(lastState, null, 2)}`);
}

async function waitUntilGoogleHomeReady(page: Page) {
  return waitUntilState('google home ready', async () => {
    const searchInput = page.locator('textarea[name="q"], input[name="q"]');
    return {
      ok: await isVisibleSafe(searchInput),
      url: await page.url(),
      title: await page.title(),
      searchInputVisible: await isVisibleSafe(searchInput),
    };
  });
}

async function waitUntilSearchResultsReady(page: Page) {
  return waitUntilState(
    'google search results ready',
    async () => {
      const resultStats = page.locator('#result-stats');
      const searchBox = page.locator('textarea[name="q"], input[name="q"]');
      const url = await page.url();
      return {
        ok: url.includes('/search') && (await isVisibleSafe(searchBox)),
        url,
        title: await page.title(),
        resultStatsVisible: await isVisibleSafe(resultStats),
        searchBoxVisible: await isVisibleSafe(searchBox),
      };
    },
    45_000,
  );
}

function normalizeHost(value: string) {
  return value.toLowerCase().replace(/^www\./, '');
}

function isTargetHost(host: string) {
  const normalizedHost = normalizeHost(host);
  const normalizedTarget = normalizeHost(appConfig.targetDomain);
  return normalizedHost === normalizedTarget || normalizedHost.endsWith(`.${normalizedTarget}`);
}

function decodeGoogleHref(rawHref: string) {
  try {
    const parsed = new URL(rawHref, 'https://www.google.com/');
    const host = normalizeHost(parsed.hostname);
    if (host === 'google.com' || host.endsWith('.google.com')) {
      const wrappedUrl =
        parsed.searchParams.get('q') ||
        parsed.searchParams.get('url') ||
        parsed.searchParams.get('adurl');
      if (wrappedUrl?.startsWith('http')) {
        return wrappedUrl;
      }
    }
    return parsed.href;
  } catch {
    return rawHref;
  }
}

async function step1_openGoogle(page: Page) {
  console.log(`[step1] start ${new Date().toISOString()}`);
  await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await maybeAcceptGoogleConsent(page);
  await waitUntilGoogleHomeReady(page);
  console.log(`[step1] done ${new Date().toISOString()}`);
}

async function step2_searchKeyword(page: Page, keyword: string) {
  console.log(`[step2] start ${new Date().toISOString()}`);
  await waitUntilGoogleHomeReady(page);

  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchInput.fill(keyword);
  await searchInput.press('Enter');
  await waitUntilSearchResultsReady(page);
  console.log(`[step2] done ${new Date().toISOString()}`);
}

async function step3_extractGoogleResults(page: Page): Promise<SearchResultItem[]> {
  console.log(`[step3] start ${new Date().toISOString()}`);
  await waitUntilSearchResultsReady(page);

  const rawResults = (await page.locator('a').evaluateAll(() => {
    const blockedHosts = [
      'google.',
      'gstatic.',
      'googleusercontent.',
      'youtube.',
      'schema.org',
      'webcache.googleusercontent.',
    ];

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => {
        const url = new URL(anchor.href);
        const title =
          anchor.querySelector('h3')?.textContent?.trim() ||
          anchor.textContent?.trim() ||
          '';
        return {
          title: title.replace(/\s+/g, ' ').slice(0, 180),
          clickUrl: url.href,
          url: url.href,
          host: url.hostname,
        };
      })
      .filter((item) => item.title && item.url.startsWith('http'))
      .filter((item) => {
        if (!blockedHosts.some((host) => item.host.includes(host))) return true;
        return item.host.includes('google.') && new URL(item.url).searchParams.has('q');
      })
      .slice(0, 20);
  })) as Array<Omit<SearchResultItem, 'position'>>;

  const seen = new Set<string>();
  const results = rawResults
    .map((result) => {
      const decodedUrl = decodeGoogleHref(result.clickUrl || result.url);
      const parsed = new URL(decodedUrl);
      return {
        ...result,
        url: parsed.href,
        host: parsed.hostname,
      };
    })
    .filter((item) => !item.host.includes('google.'))
    .filter((item) => {
      const key = item.url.replace(/[#?].*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const ranked = results.map((result, index) => ({
    position: index + 1,
    ...result,
  }));
  console.log(`[step3] done ${new Date().toISOString()}`);
  return ranked;
}

async function step4_clickTargetGoogleResult(page: Page, targetResult: SearchResultItem) {
  console.log(`[step4-click] start ${new Date().toISOString()}`);
  await waitUntilSearchResultsReady(page);

  const anchors = await page.locator('a[href]').all();
  for (const anchor of anchors.slice(0, 80)) {
    try {
      const href = await anchor.getAttribute('href');
      if (!href) continue;

      const decodedHref = decodeGoogleHref(href);
      if (decodedHref !== targetResult.url && href !== targetResult.clickUrl) continue;
      if (!(await anchor.isVisible())) continue;

      await anchor.scrollIntoViewIfNeeded();
      await anchor.click();
      await waitUntilState(
        'target result opened',
        async () => {
          const url = await page.url();
          let host = '';
          try {
            host = new URL(url).hostname;
          } catch {
            host = '';
          }
          return {
            ok: isTargetHost(host),
            url,
            title: await page.title(),
          };
        },
        45_000,
      );
      console.log(`[step4-click] done ${new Date().toISOString()}`);
      return;
    } catch (staleErr: any) {
      console.log(`[step4-click] stale link elements skipped: ${staleErr.message}`);
    }
  }

  throw new Error(`Khong tim thay link Google de bam cho ket qua: ${targetResult.url}`);
}

async function extractInternalLinks(page: Page, baseHost: string) {
  return (await page.evaluate((hostArg) => {
    const baseHost = String(hostArg).toLowerCase().replace(/^www\./, '');
    const normalize = (value: string) => value.toLowerCase().replace(/^www\./, '');
    const seen = new Set<string>();

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => {
        try {
          const url = new URL(anchor.href);
          const host = normalize(url.hostname);
          const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
          return {
            url: url.href,
            text,
            sameHost: host === baseHost || host.endsWith(`.${baseHost}`),
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is { url: string; text: string; sameHost: boolean } => Boolean(item))
      .filter((item) => item.sameHost)
      .filter((item) => {
        const key = item.url.replace(/[#?].*$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => item.url);
  }, baseHost)) as string[];
}

function pickAuditLinks(links: string[], currentUrl: string) {
  const productHints = [
    '/san-pham',
    '/product',
    '/shop',
    '/collections',
    '/p/',
    '/products',
    'treamax',
    'serum',
    'kem-',
  ];
  const currentCleanUrl = cleanAuditUrl(currentUrl);
  const blockedPatterns = [
    '/wp-content/',
    '/tai-khoan',
    '/gio-hang',
    '/checkout',
    '/cart',
    '/my-account',
  ];
  const mediaPattern = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf)(?:$|[?#])/i;
  const candidates = links
    .map(cleanAuditUrl)
    .filter((link) => link !== currentCleanUrl)
    .filter((link) => !blockedPatterns.some((pattern) => link.toLowerCase().includes(pattern)))
    .filter((link) => !mediaPattern.test(link));
  const priority = candidates.filter((link) =>
    productHints.some((hint) => link.toLowerCase().includes(hint)),
  );
  return [...priority, ...candidates.filter((link) => !priority.includes(link))].slice(0, 8);
}

function cleanAuditUrl(url: string) {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

function resolveHref(href: string, baseUrl: string) {
  return new URL(href, baseUrl).href;
}

async function clickOrGotoInternalLink(page: Page, link: string, deadline: number) {
  const targetUrl = cleanAuditUrl(link);
  const currentUrl = await page.url();
  const anchors = await page.locator('a[href]').all();

  for (const anchor of anchors.slice(0, 160)) {
    try {
      const href = await anchor.getAttribute('href');
      if (!href) continue;

      let anchorUrl = '';
      try {
        anchorUrl = cleanAuditUrl(resolveHref(href, currentUrl));
      } catch {
        continue;
      }

      if (anchorUrl !== targetUrl || !(await anchor.isVisible())) continue;

      await anchor.scrollIntoViewIfNeeded();
      await anchor.click();
      await waitUntilState(
        'internal link opened',
        async () => {
          const url = await page.url();
          return {
            ok: cleanAuditUrl(url) === targetUrl,
            url,
            title: await page.title(),
          };
        },
        Math.min(20_000, remainingMs(deadline)),
      );
      return;
    } catch (staleErr: any) {
      console.log(`[audit] stale link elements skipped: ${staleErr.message}`);
    }
  }

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: Math.min(30_000, remainingMs(deadline)),
  });
}

async function auditCurrentPage(page: Page): Promise<SiteAuditPage> {
  const links = await extractInternalLinks(page, normalizeHost(appConfig.targetDomain));
  return {
    url: await page.url(),
    title: await page.title(),
    internalLinkCount: links.length,
    sampledInternalLinks: links.slice(0, 10),
  };
}

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

async function delayWithinBudget(ms: number, deadline: number) {
  const budget = remainingMs(deadline);
  if (budget <= 0) return false;
  await delay(Math.min(ms, budget));
  return remainingMs(deadline) > 0;
}

async function scrollPageForQa(page: Page, deadline: number) {
  const scrollSteps = [420, 520, 640, -220, 760];
  for (const deltaY of scrollSteps) {
    if (remainingMs(deadline) <= 0) return;
    await page.mouse.wheel(0, deltaY);
    await delayWithinBudget(900, deadline);
  }
}

async function step4_auditTargetSite(page: Page, startUrl: string): Promise<SiteAuditResult> {
  console.log(`[step4] start ${new Date().toISOString()}`);
  const startedAt = Date.now();
  const maxDurationMs = Math.max(10, Math.min(90, appConfig.siteQaMaxSeconds)) * 1000;
  const deadline = startedAt + maxDurationMs;
  const visitedPages: SiteAuditPage[] = [];
  const cleanStartUrl = cleanAuditUrl(startUrl);
  try {
    await page.goto(cleanStartUrl, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(45_000, remainingMs(deadline)),
    });
  } catch (error) {
    console.error(`Audit start URL failed, falling back to base URL: ${String(error)}`);
    await page.goto(appConfig.targetBaseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(45_000, remainingMs(deadline)),
    });
  }
  await delayWithinBudget(2_000, deadline);
  await scrollPageForQa(page, deadline);
  visitedPages.push(await auditCurrentPage(page));

  const links = await extractInternalLinks(page, normalizeHost(appConfig.targetDomain));
  for (const link of pickAuditLinks(links, await page.url())) {
    if (remainingMs(deadline) <= 5_000 || visitedPages.length >= 6) break;
    await clickOrGotoInternalLink(page, link, deadline);
    await delayWithinBudget(1_500, deadline);
    await scrollPageForQa(page, deadline);
    visitedPages.push(await auditCurrentPage(page));
  }

  console.log(`[step4] done ${new Date().toISOString()}`);
  return {
    startUrl: cleanStartUrl,
    maxDurationMs,
    elapsedMs: Date.now() - startedAt,
    stoppedByBudget: remainingMs(deadline) <= 5_000,
    visitedPages,
  };
}

async function maybeAcceptGoogleConsent(page: Page) {
  const consentButtons = [
    page.locator('button').filter({ hasText: 'Accept all' }),
    page.locator('button').filter({ hasText: 'I agree' }),
    page.locator('button').filter({ hasText: 'Tôi đồng ý' }),
    page.locator('button').filter({ hasText: 'Chấp nhận tất cả' }),
  ];

  for (const button of consentButtons) {
    if ((await button.count()) > 0 && (await button.first().isVisible())) {
      await button.first().click();
      await page.waitForLoadState('domcontentloaded');
      return;
    }
  }
}

async function pipeline(page: any, keyword: string) {
  await step1_openGoogle(page);
  await step2_searchKeyword(page, keyword);
  const topResults = await step3_extractGoogleResults(page);
  return { topResults };
}

export async function runGoogleSearchWorkflow(input: SearchRunInput): Promise<SearchRunResult> {
  const keyword = input.useRandomKeyword
    ? await pickRandomKeyword()
    : input.keyword.trim() || appConfig.defaultKeyword;
  const omni = createOmniLogin();
  let profileName: string | undefined;

  try {
    const profile = await omni.profiles.get(input.profileId);
    profileName = profile.name;

    const { session } = await omni.open(input.profileId, {
      headless: false,
    });

    const { topResults } = await pipeline(session.page, keyword);
    const targetResult = topResults.find((result) => isTargetHost(result.host));
    if (targetResult) {
      await step4_clickTargetGoogleResult(session.page, targetResult);
    }
    const siteAudit = await step4_auditTargetSite(
      session.page,
      targetResult ? await session.page.url() : appConfig.targetBaseUrl,
    );

    return {
      keyword,
      profileId: input.profileId,
      profileName,
      targetDomain: appConfig.targetDomain,
      googleRank: targetResult?.position ?? null,
      targetResult,
      topResults,
      siteAudit,
      finalUrl: await session.page.url(),
      title: await session.page.title(),
    };
  } finally {
    if (appConfig.closeProfileAfterRun) {
      await omni.close(input.profileId).catch((error: unknown) => {
        console.error('Failed to close profile:', error);
      });
    }
  }
}

export async function runBatchGoogleSearchWorkflow(input: BatchRunInput): Promise<BatchRunResult> {
  const profileIds = [...new Set(input.profileIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (profileIds.length === 0) {
    throw new Error('Vui long chon it nhat 1 profile Omnilogin hop le.');
  }

  const delaySeconds = Math.max(0, Math.min(3600, Math.floor(input.delaySeconds || 0)));
  const startedAt = new Date().toISOString();
  const results: BatchRunResult['results'] = [];

  for (let index = 0; index < profileIds.length; index++) {
    const profileId = profileIds[index];
    console.log(`[batch] profile ${profileId} start ${new Date().toISOString()}`);
    try {
      const result = await runGoogleSearchWorkflow({
        keyword: input.keyword,
        profileId,
        useRandomKeyword: input.useRandomKeyword,
      });
      results.push({ ok: true, profileId, result });
      console.log(`[batch] profile ${profileId} done ${new Date().toISOString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ ok: false, profileId, error: message });
      console.error(`[batch] profile ${profileId} failed: ${message}`);
    }

    if (index < profileIds.length - 1 && delaySeconds > 0) {
      console.log(`[batch] waiting ${delaySeconds}s before next profile`);
      await delay(delaySeconds * 1000);
    }
  }

  return {
    delaySeconds,
    totalProfiles: profileIds.length,
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
  };
}
