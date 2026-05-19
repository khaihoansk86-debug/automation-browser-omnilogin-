import { OmniLogin } from '@omnilogin/sdk';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { appConfig } from './config.js';
export function createOmniLogin() {
    return new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
}
export async function listProfiles() {
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
async function isVisibleSafe(locator) {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
}
async function waitUntilState(label, inspect, timeout = 30_000) {
    const startedAt = Date.now();
    let lastState = null;
    while (Date.now() - startedAt < timeout) {
        lastState = await inspect();
        if (lastState.ok)
            return lastState;
        await delay(250);
    }
    throw new Error(`${label} timeout: ${JSON.stringify(lastState, null, 2)}`);
}
async function waitUntilGoogleHomeReady(page) {
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
async function waitUntilSearchResultsReady(page) {
    return waitUntilState('google search results ready', async () => {
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
    }, 45_000);
}
function normalizeHost(value) {
    return value.toLowerCase().replace(/^www\./, '');
}
function isTargetHost(host) {
    const normalizedHost = normalizeHost(host);
    const normalizedTarget = normalizeHost(appConfig.targetDomain);
    return normalizedHost === normalizedTarget || normalizedHost.endsWith(`.${normalizedTarget}`);
}
async function step1_openGoogle(page) {
    console.log(`[step1] start ${new Date().toISOString()}`);
    await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await maybeAcceptGoogleConsent(page);
    await waitUntilGoogleHomeReady(page);
    console.log(`[step1] done ${new Date().toISOString()}`);
}
async function step2_searchKeyword(page, keyword) {
    console.log(`[step2] start ${new Date().toISOString()}`);
    await waitUntilGoogleHomeReady(page);
    const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchInput.fill(keyword);
    await searchInput.press('Enter');
    await waitUntilSearchResultsReady(page);
    console.log(`[step2] done ${new Date().toISOString()}`);
}
async function step3_extractGoogleResults(page) {
    console.log(`[step3] start ${new Date().toISOString()}`);
    await waitUntilSearchResultsReady(page);
    const results = (await page.locator('a').evaluateAll(() => {
        const seen = new Set();
        const blockedHosts = [
            'google.',
            'gstatic.',
            'googleusercontent.',
            'youtube.',
            'schema.org',
            'webcache.googleusercontent.',
        ];
        return Array.from(document.querySelectorAll('a[href]'))
            .map((anchor) => {
            const url = new URL(anchor.href);
            const title = anchor.querySelector('h3')?.textContent?.trim() ||
                anchor.textContent?.trim() ||
                '';
            return {
                title: title.replace(/\s+/g, ' ').slice(0, 180),
                url: url.href,
                host: url.hostname,
            };
        })
            .filter((item) => item.title && item.url.startsWith('http'))
            .filter((item) => !blockedHosts.some((host) => item.host.includes(host)))
            .filter((item) => {
            const key = item.url.replace(/[#?].*$/, '');
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        })
            .slice(0, 20);
    }));
    const ranked = results.map((result, index) => ({
        position: index + 1,
        ...result,
    }));
    console.log(`[step3] done ${new Date().toISOString()}`);
    return ranked;
}
async function extractInternalLinks(page, baseHost) {
    return (await page.evaluate((hostArg) => {
        const baseHost = String(hostArg).toLowerCase().replace(/^www\./, '');
        const normalize = (value) => value.toLowerCase().replace(/^www\./, '');
        const seen = new Set();
        return Array.from(document.querySelectorAll('a[href]'))
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
            }
            catch {
                return null;
            }
        })
            .filter((item) => Boolean(item))
            .filter((item) => item.sameHost)
            .filter((item) => {
            const key = item.url.replace(/[#?].*$/, '');
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        })
            .map((item) => item.url);
    }, baseHost));
}
function pickAuditLinks(links, currentUrl) {
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
    const priority = candidates.filter((link) => productHints.some((hint) => link.toLowerCase().includes(hint)));
    return [...priority, ...candidates.filter((link) => !priority.includes(link))].slice(0, 8);
}
function cleanAuditUrl(url) {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
}
async function auditCurrentPage(page) {
    const links = await extractInternalLinks(page, normalizeHost(appConfig.targetDomain));
    return {
        url: await page.url(),
        title: await page.title(),
        internalLinkCount: links.length,
        sampledInternalLinks: links.slice(0, 10),
    };
}
function remainingMs(deadline) {
    return Math.max(0, deadline - Date.now());
}
async function delayWithinBudget(ms, deadline) {
    const budget = remainingMs(deadline);
    if (budget <= 0)
        return false;
    await delay(Math.min(ms, budget));
    return remainingMs(deadline) > 0;
}
async function scrollPageForQa(page, deadline) {
    const scrollSteps = [420, 520, 640, -220, 760];
    for (const deltaY of scrollSteps) {
        if (remainingMs(deadline) <= 0)
            return;
        await page.mouse.wheel(0, deltaY);
        await delayWithinBudget(900, deadline);
    }
}
async function step4_auditTargetSite(page, startUrl) {
    console.log(`[step4] start ${new Date().toISOString()}`);
    const startedAt = Date.now();
    const maxDurationMs = Math.max(10, Math.min(90, appConfig.siteQaMaxSeconds)) * 1000;
    const deadline = startedAt + maxDurationMs;
    const visitedPages = [];
    const cleanStartUrl = cleanAuditUrl(startUrl);
    try {
        await page.goto(cleanStartUrl, {
            waitUntil: 'domcontentloaded',
            timeout: Math.min(45_000, remainingMs(deadline)),
        });
    }
    catch (error) {
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
        if (remainingMs(deadline) <= 5_000 || visitedPages.length >= 6)
            break;
        await page.goto(cleanAuditUrl(link), {
            waitUntil: 'domcontentloaded',
            timeout: Math.min(30_000, remainingMs(deadline)),
        });
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
async function maybeAcceptGoogleConsent(page) {
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
async function pipeline(page, keyword) {
    await step1_openGoogle(page);
    await step2_searchKeyword(page, keyword);
    const topResults = await step3_extractGoogleResults(page);
    return { topResults };
}
export async function runGoogleSearchWorkflow(input) {
    const keyword = input.useRandomKeyword
        ? await pickRandomKeyword()
        : input.keyword.trim() || appConfig.defaultKeyword;
    const omni = createOmniLogin();
    let profileName;
    try {
        const profile = await omni.profiles.get(input.profileId);
        profileName = profile.name;
        const { session } = await omni.open(input.profileId, {
            headless: false,
        });
        const { topResults } = await pipeline(session.page, keyword);
        const targetResult = topResults.find((result) => isTargetHost(result.host));
        const siteAudit = await step4_auditTargetSite(session.page, targetResult?.url || appConfig.targetBaseUrl);
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
    }
    finally {
        if (appConfig.closeProfileAfterRun) {
            await omni.close(input.profileId).catch((error) => {
                console.error('Failed to close profile:', error);
            });
        }
    }
}
export async function runBatchGoogleSearchWorkflow(input) {
    const profileIds = [...new Set(input.profileIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (profileIds.length === 0) {
        throw new Error('Vui long chon it nhat 1 profile Omnilogin hop le.');
    }
    const delaySeconds = Math.max(0, Math.min(3600, Math.floor(input.delaySeconds || 0)));
    const startedAt = new Date().toISOString();
    const results = [];
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
        }
        catch (error) {
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
