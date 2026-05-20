const DEFAULTS = {
  newsKeywordFilePath: 'C:\\Users\\Admin\\Desktop\\key_derma\\keybao.txt',
  newsReadMinSeconds: 30,
  newsReadMaxSeconds: 60,
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key_derma\\keyderma.txt',
  keyword: 'Omnilogin',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  siteQaMaxSeconds: 90,
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\khaihoan-derma-rank-qa-output.json',
};

function param(name) {
  return typeof __params !== 'undefined' && __params ? __params[name] : undefined;
}

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

function isTargetHost(host, targetDomain) {
  const normalizedHost = normalizeHost(host);
  const normalizedTarget = normalizeHost(targetDomain);
  return normalizedHost === normalizedTarget || normalizedHost.endsWith('.' + normalizedTarget);
}

function cleanUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

async function wait(ms) {
  await page.waitForTimeout(ms);
}

async function waitRandomSeconds(label, minSeconds, maxSeconds) {
  const minMs = Math.max(0, Number(minSeconds || 0)) * 1000;
  const maxMs = Math.max(minMs, Number(maxSeconds || minSeconds || 0) * 1000);
  const waitMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  console.log(label + ' wait ' + Math.round(waitMs / 1000) + 's');
  await wait(waitMs);
  return waitMs;
}

async function waitWithinBudget(ms, deadline) {
  const budget = remainingMs(deadline);
  if (budget <= 0) return false;
  await wait(Math.min(ms, budget));
  return remainingMs(deadline) > 0;
}

async function moveMouseNaturally() {
  const x = 120 + Math.floor(Math.random() * 980);
  const y = 120 + Math.floor(Math.random() * 520);
  await page.mouse.move(x, y, { steps: 8 + Math.floor(Math.random() * 18) });
}

async function scanGoogleResultsNaturally(label) {
  console.log((label || '[google]') + ' scan results');
  const downSteps = 2 + Math.floor(Math.random() * 3);
  for (let index = 0; index < downSteps; index++) {
    if (Math.random() < 0.7) await moveMouseNaturally();
    await page.mouse.wheel(0, 360 + Math.floor(Math.random() * 520));
    await wait(900 + Math.floor(Math.random() * 1400));
  }

  await wait(1200 + Math.floor(Math.random() * 2200));

  const upSteps = 1 + Math.floor(Math.random() * 3);
  for (let index = 0; index < upSteps; index++) {
    if (Math.random() < 0.7) await moveMouseNaturally();
    await page.mouse.wheel(0, -(220 + Math.floor(Math.random() * 420)));
    await wait(900 + Math.floor(Math.random() * 1600));
  }
}

async function isVisibleSafe(locator) {
  return (await locator.count()) > 0 && (await locator.first().isVisible());
}

async function waitUntilState(label, inspect, timeout) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeout) {
    lastState = await inspect();
    if (lastState.ok) return lastState;
    await wait(250);
  }
  throw new Error(label + ' timeout: ' + JSON.stringify(lastState));
}

async function getRandomLineFromFile(filePath, fallback, label) {
  try {
    const randomLine = await omni.file.readLines(filePath, {
      mode: 'random',
      trim: true,
    });
    if (typeof randomLine === 'string' && randomLine.trim()) return randomLine.trim();
  } catch (error) {
    console.log('Cannot read ' + label + ' file, fallback:', error.message || String(error));
  }

  return fallback;
}

async function getKeyword(config) {
  const manualKeyword = String(param('keyword') || '').trim();
  if (manualKeyword) return manualKeyword;
  return getRandomLineFromFile(config.keywordFilePath, config.keyword, 'derma keyword');
}

async function getNewsKeyword(config) {
  const manualKeyword = String(param('newsKeyword') || '').trim();
  if (manualKeyword) return manualKeyword;
  return getRandomLineFromFile(config.newsKeywordFilePath, 'VnExpress', 'news keyword');
}

async function maybeAcceptGoogleConsent() {
  const buttons = [
    page.locator('button').filter({ hasText: 'Accept all' }),
    page.locator('button').filter({ hasText: 'I agree' }),
    page.locator('button').filter({ hasText: 'Reject all' }),
  ];

  for (const button of buttons) {
    if ((await button.count()) > 0 && (await button.first().isVisible())) {
      await button.first().click();
      await page.waitForLoadState('domcontentloaded');
      return;
    }
  }
}

async function waitUntilGoogleHomeReady() {
  return waitUntilState(
    'google home ready',
    async () => {
      const searchInput = page.locator('textarea[name="q"], input[name="q"]');
      return {
        ok: await isVisibleSafe(searchInput),
        url: await page.url(),
        title: await page.title(),
        searchInputVisible: await isVisibleSafe(searchInput),
      };
    },
    45000,
  );
}

async function waitUntilSearchResultsReady() {
  return waitUntilState(
    'google search results ready',
    async () => {
      const searchBox = page.locator('textarea[name="q"], input[name="q"]');
      const url = await page.url();
      const captcha = await getGoogleCaptchaState();
      return {
        ok: (url.includes('/search') && (await isVisibleSafe(searchBox))) || captcha.detected,
        url,
        title: await page.title(),
        searchBoxVisible: await isVisibleSafe(searchBox),
        captchaDetected: captcha.detected,
        captchaText: captcha.text,
      };
    },
    45000,
  );
}

async function getGoogleCaptchaState() {
  const url = await page.url();
  const title = await page.title();
  let text = '';
  try {
    text = (await page.locator('body').innerText()).slice(0, 1200);
  } catch {
    text = '';
  }

  const haystack = (url + '\n' + title + '\n' + text).toLowerCase();
  const detected =
    url.includes('/sorry/') ||
    haystack.includes('unusual traffic') ||
    haystack.includes('automated queries') ||
    haystack.includes('not a robot') ||
    haystack.includes('recaptcha') ||
    haystack.includes('captcha') ||
    haystack.includes('our systems have detected');

  return {
    detected,
    url,
    title,
    text,
  };
}

async function throwIfGoogleCaptcha(label) {
  const captcha = await getGoogleCaptchaState();
  if (!captcha.detected) return;

  const payload = {
    label: label || 'google',
    url: captcha.url,
    title: captcha.title,
    text: captcha.text.slice(0, 500),
  };
  console.log('GOOGLE_CAPTCHA_DETECTED ' + JSON.stringify(payload));
  throw new Error('GOOGLE_CAPTCHA_DETECTED: Google blocked this profile with CAPTCHA/unusual traffic');
}

async function searchGoogle(keyword, options = {}) {
  console.log('[step1] open google ' + new Date().toISOString());
  await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await maybeAcceptGoogleConsent();
  await waitUntilGoogleHomeReady();

  console.log('[step2] search keyword: ' + keyword);
  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchInput.fill(keyword);
  await wait(800 + Math.floor(Math.random() * 900));
  await searchInput.press('Enter');
  const searchState = await waitUntilSearchResultsReady();
  if (searchState.captchaDetected) {
    console.log(
      'GOOGLE_CAPTCHA_DETECTED ' +
        JSON.stringify({
          label: options.label || '[google]',
          url: searchState.url,
          title: searchState.title,
          text: String(searchState.captchaText || '').slice(0, 500),
        }),
    );
    throw new Error('GOOGLE_CAPTCHA_DETECTED: Google blocked this profile with CAPTCHA/unusual traffic');
  }

  const currentUrl = await page.url();
  await throwIfGoogleCaptcha(options.label || '[google]');

  if (options.afterResultsMinSeconds || options.afterResultsMaxSeconds) {
    await waitRandomSeconds(
      options.label || '[google]',
      options.afterResultsMinSeconds || 0,
      options.afterResultsMaxSeconds || options.afterResultsMinSeconds || 0,
    );
  }

  await scanGoogleResultsNaturally(options.label || '[google]');
}

async function extractGoogleResults() {
  console.log('[step3] extract google results ' + new Date().toISOString());
  const results = await page.locator('a').evaluateAll(() => {
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
        try {
          const url = new URL(anchor.href);
          const title =
            (anchor.querySelector('h3') && anchor.querySelector('h3').textContent.trim()) ||
            (anchor.textContent || '').trim();
          return {
            title: title.replace(/\s+/g, ' ').slice(0, 180),
            url: url.href,
            host: url.hostname,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((item) => item.title && item.url.startsWith('http'))
      .filter((item) => !blockedHosts.some((host) => item.host.includes(host)))
      .filter((item) => {
        const key = item.url.replace(/[#?].*$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  });

  return results.map((result, index) => ({
    position: index + 1,
    title: result.title,
    url: result.url,
    host: result.host,
  }));
}

async function extractInternalLinks(targetDomain) {
  return await page.evaluate((domain) => {
    const baseHost = String(domain).toLowerCase().replace(/^www\./, '');
    const normalize = (value) => String(value || '').toLowerCase().replace(/^www\./, '');
    const seen = new Set();

    return Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => {
        try {
          const url = new URL(anchor.href);
          const host = normalize(url.hostname);
          return {
            url: url.href,
            sameHost: host === baseHost || host.endsWith('.' + baseHost),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((item) => item.sameHost)
      .filter((item) => {
        const key = item.url.replace(/[#?].*$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => item.url);
  }, targetDomain);
}

function pickAuditLinks(links, currentUrl, visitedSet) {
  const hints = ['/san-pham', '/product', '/shop', '/collections', '/products', 'treamax', 'serum', 'kem-'];
  const blocked = ['/wp-content/', '/tai-khoan', '/gio-hang', '/checkout', '/cart', '/my-account'];
  const media = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf)(?:$|[?#])/i;
  const currentClean = cleanUrl(currentUrl);
  const candidates = links
    .map(cleanUrl)
    .filter((link) => link !== currentClean)
    .filter((link) => !visitedSet.has(link))
    .filter((link) => !blocked.some((pattern) => link.toLowerCase().includes(pattern)))
    .filter((link) => !media.test(link));
  const priority = candidates.filter((link) => hints.some((hint) => link.toLowerCase().includes(hint)));
  return priority.concat(candidates.filter((link) => !priority.includes(link))).slice(0, 8);
}

async function auditCurrentPage(targetDomain) {
  const links = await extractInternalLinks(targetDomain);
  return {
    url: await page.url(),
    title: await page.title(),
    internalLinkCount: links.length,
    sampledInternalLinks: links.slice(0, 10),
  };
}

async function scrollPageForQa(deadline) {
  const steps = [420, 520, 640, -220, 760];
  for (const deltaY of steps) {
    if (remainingMs(deadline) <= 0) return;
    if (Math.random() < 0.45) await moveMouseNaturally();
    await page.mouse.wheel(0, deltaY);
    await waitWithinBudget(900 + Math.floor(Math.random() * 700), deadline);
  }
}

async function readPageWithinBudget(minSeconds, maxSeconds, deadline) {
  const budget = remainingMs(deadline);
  if (budget <= 0) {
    return {
      elapsedMs: 0,
      targetDurationMs: 0,
      stoppedByBudget: true,
    };
  }

  const minMs = Math.max(5, Number(minSeconds || 15)) * 1000;
  const maxMs = Math.max(minMs, Number(maxSeconds || 30) * 1000);
  const targetDurationMs = Math.min(
    minMs + Math.floor(Math.random() * (maxMs - minMs + 1)),
    budget,
  );
  const startedAt = Date.now();
  const localDeadline = startedAt + targetDurationMs;

  while (remainingMs(localDeadline) > 0 && remainingMs(deadline) > 0) {
    const direction = Math.random() < 0.86 ? 1 : -1;
    const deltaY = direction * (320 + Math.floor(Math.random() * 760));
    if (Math.random() < 0.55) await moveMouseNaturally();
    await page.mouse.wheel(0, deltaY);
    await waitWithinBudget(1100 + Math.floor(Math.random() * 2400), Math.min(localDeadline, deadline));
  }

  return {
    elapsedMs: Date.now() - startedAt,
    targetDurationMs,
    stoppedByBudget: remainingMs(deadline) <= 0,
  };
}

async function readPageForDuration(minSeconds, maxSeconds) {
  const minMs = Math.max(5, Number(minSeconds || 30)) * 1000;
  const maxMs = Math.max(minMs, Number(maxSeconds || 60) * 1000);
  const durationMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;

  while (remainingMs(deadline) > 0) {
    const direction = Math.random() < 0.82 ? 1 : -1;
    const deltaY = direction * (260 + Math.floor(Math.random() * 620));
    if (Math.random() < 0.55) await moveMouseNaturally();
    await page.mouse.wheel(0, deltaY);
    await waitWithinBudget(1100 + Math.floor(Math.random() * 2600), deadline);
  }

  return {
    elapsedMs: Date.now() - startedAt,
    targetDurationMs: durationMs,
  };
}

async function warmupNewsRead(config) {
  console.log('[news] start ' + new Date().toISOString());
  const keyword = await getNewsKeyword(config);
  await searchGoogle(keyword, {
    label: '[news] after search',
    afterResultsMinSeconds: 5,
    afterResultsMaxSeconds: 10,
  });
  const topResults = await extractGoogleResults();
  const newsResult = topResults.find((result) => !isTargetHost(result.host, config.targetDomain));

  if (!newsResult) {
    return {
      keyword,
      skipped: true,
      reason: 'No non-target news/search result found',
      topResults,
    };
  }

  console.log('[news] open directly: ' + newsResult.url);
  await page.goto(cleanUrl(newsResult.url), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await wait(1800 + Math.floor(Math.random() * 1600));
  const readStats = await readPageForDuration(config.newsReadMinSeconds, config.newsReadMaxSeconds);

  return {
    keyword,
    skipped: false,
    selectedResult: newsResult,
    topResults,
    readStats,
    finalUrl: await page.url(),
    title: await page.title(),
  };
}

async function auditTargetSite(config, startUrl) {
  console.log('[step4] audit target site ' + new Date().toISOString());
  const startedAt = Date.now();
  const maxDurationMs = Math.max(10, Math.min(90, Number(config.siteQaMaxSeconds || 90))) * 1000;
  const deadline = startedAt + maxDurationMs;
  const visitedPages = [];
  const visitedSet = new Set();

  try {
    const firstUrl = cleanUrl(startUrl);
    visitedSet.add(firstUrl);
    await page.goto(firstUrl, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(45000, remainingMs(deadline)),
    });
  } catch (error) {
    console.log('Start URL failed, fallback to target base URL:', error.message || String(error));
    const fallbackUrl = cleanUrl(config.targetBaseUrl);
    visitedSet.add(fallbackUrl);
    await page.goto(fallbackUrl, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(45000, remainingMs(deadline)),
    });
  }

  await waitWithinBudget(1200 + Math.floor(Math.random() * 1200), deadline);
  const firstReadStats = await readPageWithinBudget(15, 30, deadline);
  visitedPages.push({
    ...(await auditCurrentPage(config.targetDomain)),
    readStats: firstReadStats,
  });

  const links = await extractInternalLinks(config.targetDomain);
  const auditLinks = pickAuditLinks(links, await page.url(), visitedSet);
  for (const link of auditLinks) {
    if (remainingMs(deadline) <= 5000 || visitedPages.length >= 6) break;
    const cleanLink = cleanUrl(link);
    if (visitedSet.has(cleanLink)) continue;
    visitedSet.add(cleanLink);
    await page.goto(cleanLink, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(30000, remainingMs(deadline)),
    });
    await waitWithinBudget(1000 + Math.floor(Math.random() * 1200), deadline);
    const readStats = await readPageWithinBudget(15, 30, deadline);
    visitedPages.push({
      ...(await auditCurrentPage(config.targetDomain)),
      readStats,
    });
  }

  return {
    startUrl: cleanUrl(startUrl),
    maxDurationMs,
    elapsedMs: Date.now() - startedAt,
    stoppedByBudget: remainingMs(deadline) <= 5000,
    visitedPages,
  };
}

async function main() {
  const config = {
    newsKeywordFilePath: String(param('newsKeywordFilePath') || DEFAULTS.newsKeywordFilePath),
    newsReadMinSeconds: Number(param('newsReadMinSeconds') || DEFAULTS.newsReadMinSeconds),
    newsReadMaxSeconds: Number(param('newsReadMaxSeconds') || DEFAULTS.newsReadMaxSeconds),
    keywordFilePath: String(param('keywordFilePath') || DEFAULTS.keywordFilePath),
    keyword: String(param('defaultKeyword') || DEFAULTS.keyword),
    targetDomain: String(param('targetDomain') || DEFAULTS.targetDomain),
    targetBaseUrl: String(param('targetBaseUrl') || DEFAULTS.targetBaseUrl),
    siteQaMaxSeconds: Number(param('siteQaMaxSeconds') || DEFAULTS.siteQaMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  const newsWarmup = await warmupNewsRead(config);
  await waitRandomSeconds('[phase] before derma', 3, 8);
  const keyword = await getKeyword(config);
  await searchGoogle(keyword, {
    label: '[derma] after search',
    afterResultsMinSeconds: 5,
    afterResultsMaxSeconds: 12,
  });
  const topResults = await extractGoogleResults();
  const targetResult = topResults.find((result) => isTargetHost(result.host, config.targetDomain));
  const siteAudit = await auditTargetSite(config, targetResult ? targetResult.url : config.targetBaseUrl);

  const output = {
    newsWarmup,
    keyword,
    targetDomain: config.targetDomain,
    googleRank: targetResult ? targetResult.position : null,
    targetResult,
    topResults,
    siteAudit,
    finalUrl: await page.url(),
    title: await page.title(),
    finishedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(output, null, 2));
  await omni.file.export(output, {
    path: config.exportPath,
    format: 'json',
    onConflict: 'overwrite',
  });
}

await main();
