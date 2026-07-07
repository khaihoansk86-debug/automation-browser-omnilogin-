const DEFAULTS = {
  newsKeywordFilePath: 'C:\\Users\\Admin\\Desktop\\key_derma\\keybao.txt',
  newsReadMinSeconds: 90,
  newsReadMaxSeconds: 180,
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key_derma\\keyderma.txt',
  gscKeywordPoolPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\gsc-keywords.json',
  keyword: 'Omnilogin',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  siteQaMinSeconds: 240,
  siteQaMaxSeconds: 420,
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\khaihoan-derma-rank-qa-output.json',
};

function param(name) {
  return typeof __params !== 'undefined' && __params ? __params[name] : undefined;
}

function reportStep(step, detail) {
  const reporter = param('reporter');
  if (reporter) {
    try {
      reporter(step, detail);
    } catch (e) {
      console.log('[reporter-error]', e.message || String(e));
    }
  }
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

function decodeGoogleHref(rawHref) {
  try {
    const parsed = new URL(rawHref, 'https://www.google.com/');
    const host = normalizeHost(parsed.hostname);
    if (host === 'google.com' || host.endsWith('.google.com')) {
      const wrappedUrl =
        parsed.searchParams.get('q') ||
        parsed.searchParams.get('url') ||
        parsed.searchParams.get('adurl');
      if (wrappedUrl && wrappedUrl.startsWith('http')) return wrappedUrl;
    }
    return parsed.href;
  } catch {
    return rawHref;
  }
}

function resolveHref(href, baseUrl) {
  return new URL(href, baseUrl).href;
}

function sameCleanUrl(left, right) {
  try {
    return cleanUrl(left) === cleanUrl(right);
  } catch {
    return false;
  }
}

function cssAttrValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

async function scanGoogleResultsNaturally(label, options = {}) {
  console.log((label || '[google]') + ' scan results');
  const downSteps = Number.isInteger(options.downSteps)
    ? options.downSteps
    : 2 + Math.floor(Math.random() * 3);
  for (let index = 0; index < downSteps; index++) {
    if (Math.random() < 0.7) await moveMouseNaturally();
    await page.mouse.wheel(0, 360 + Math.floor(Math.random() * 520));
    await wait(900 + Math.floor(Math.random() * 1400));
  }

  await wait(Number.isInteger(options.middleWaitMs) ? options.middleWaitMs : 1200 + Math.floor(Math.random() * 2200));

  const upSteps = Number.isInteger(options.upSteps)
    ? options.upSteps
    : 1 + Math.floor(Math.random() * 3);
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

async function getKeywordFromGscPool(config) {
  const poolPath = String(config.gscKeywordPoolPath || '').trim();
  if (!poolPath) return null;

  try {
    const raw = await omni.file.read(poolPath);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const candidates = keywords
      .map((item) => ({
        keyword: String(item.keyword || '').trim(),
        score: Math.max(1, Number(item.score || 1)),
        impressions: Number(item.impressions || 0),
        clicks: Number(item.clicks || 0),
        ctr: Number(item.ctr || 0),
        position: Number(item.position || 0),
      }))
      .filter((item) => item.keyword);

    if (candidates.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selectedItem = candidates[randomIndex];
    console.log(
      '[gsc] selected keyword (uniform random): ' +
        JSON.stringify({
          keyword: selectedItem.keyword,
          impressions: selectedItem.impressions,
          clicks: selectedItem.clicks,
          ctr: selectedItem.ctr,
          position: selectedItem.position,
          score: selectedItem.score,
          poolPath,
        }),
    );
    return selectedItem.keyword;
  } catch (error) {
    console.log('[gsc] cannot read keyword pool, fallback file keyword:', error.message || String(error));
    return null;
  }
}

async function getKeyword(config) {
  const manualKeyword = String(param('keyword') || '').trim();
  if (manualKeyword) return manualKeyword;
  const gscKeyword = await getKeywordFromGscPool(config);
  if (gscKeyword) return gscKeyword;
  return getRandomLineFromFile(config.keywordFilePath, config.keyword, 'derma keyword');
}

const NEWS_KEYWORDS = [
  'tin tức mới nhất hôm nay',
  'thời sự vtv1 hôm nay',
  'tin nóng 24h qua',
  'vnexpress tin tức mới nhất',
  'báo dân trí ngày hôm nay',
  'tuổi trẻ online mới nhất',
  'báo thanh niên mới nhất',
  'tin thế giới nổi bật',
  'dự báo thời tiết hôm nay',
  'kết quả ngoại hạng anh mới nhất',
  'lịch thi đấu cúp c1 hôm nay',
  'tin thể thao bóng đá việt nam',
  'kết quả bóng đá đêm qua',
  'bảng xếp hạng ngoại hạng anh',
  'giá vàng hôm nay tăng hay giảm',
  'giá vàng sjc hôm nay',
  'thị trường chứng khoán hôm nay',
  'giá xăng dầu trong nước hôm nay',
  'lãi suất ngân hàng nào cao nhất',
  'tin công nghệ mới nhất',
  'đánh giá iphone mới nhất',
  'trí tuệ nhân tạo ai mới nhất',
  'xe ô tô điện hot nhất hiện nay',
  'thủ thuật máy tính hay',
  'phim chiếu rạp hot nhất tuần này',
  'tin tức showbiz việt mới nhất',
  'nhạc trẻ hot nhất hiện nay',
  'gameshow hot nhất hiện nay',
  'bí quyết sống khỏe mỗi ngày',
  'thực phẩm tăng sức đề kháng',
  'món ngon mỗi ngày dễ làm',
  'các bước dưỡng da ban đêm cơ bản',
  'bài tập yoga giảm mỡ bụng tại nhà',
  'địa điểm du lịch hè rẻ đẹp',
  'kinh nghiệm du lịch sapa tự túc',
  'món ăn đặc sản đà nẵng',
  'những quốc gia đáng đi du lịch nhất',
  'tin nhanh 24h',
  'vietnamnet tin tuc',
  'kênh 14 tin tức giải trí'
];

async function getNewsKeyword(config) {
  const manualKeyword = String(param('newsKeyword') || '').trim();
  if (manualKeyword) return manualKeyword;
  const randomIndex = Math.floor(Math.random() * NEWS_KEYWORDS.length);
  const keyword = NEWS_KEYWORDS[randomIndex];
  console.log('[news] self-generated keyword: ' + keyword);
  return keyword;
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

  if (!options.skipScan) {
    await scanGoogleResultsNaturally(options.label || '[google]', options.scanOptions || {});
  }
}

async function extractGoogleResults() {
  console.log('[step3] extract google results ' + new Date().toISOString());
  const rawResults = await page.evaluate(() => {
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
            clickUrl: url.href,
            url: url.href,
            host: url.hostname,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((item) => item.title && item.url.startsWith('http'))
      .filter((item) => {
        if (!blockedHosts.some((host) => item.host.includes(host))) return true;
        return item.host.includes('google.') && new URL(item.url).searchParams.has('q');
      })
      .slice(0, 40);
  });

  const seen = new Set();
  const results = rawResults
    .map((result) => {
      try {
        const decodedUrl = decodeGoogleHref(result.clickUrl || result.url);
        const parsed = new URL(decodedUrl);
        return {
          ...result,
          url: parsed.href,
          host: parsed.hostname,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => !normalizeHost(item.host).includes('google.'))
    .filter((item) => {
      const key = cleanUrl(item.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  return results.map((result, index) => ({
    position: index + 1,
    title: result.title,
    url: result.url,
    host: result.host,
    clickUrl: result.clickUrl,
  }));
}

function mergeResults(existing, nextResults) {
  const byUrl = new Map();
  for (const item of existing.concat(nextResults)) {
    const key = cleanUrl(item.url);
    if (!byUrl.has(key)) byUrl.set(key, item);
  }
  return Array.from(byUrl.values()).map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

async function goToNextGooglePage() {
  console.log('[derma] looking for next page button...');
  // Selector list including desktop/mobile, English/Vietnamese, standard/dynamic Next buttons
  const nextSelectors = [
    'a#pnnext',
    'a[aria-label="Next page"]',
    'a[aria-label="Trang sau"]',
    'a:has-text("Next")',
    'a:has-text("Tiếp")',
    'a:has-text("Tiếp theo")',
    'a:has-text("More results")',
    'a:has-text("Xem thêm")',
    'button:has-text("Xem thêm")',
    'button:has-text("More results")'
  ];

  // Try clicking via DOM evaluation first (highly reliable for Google Search pagination inside Omnilogin)
  try {
    const clicked = await page.evaluate((selectors) => {
      for (const sel of selectors) {
        let element;
        if (sel.startsWith('a:has-text(') || sel.startsWith('button:has-text(')) {
          const textToFind = sel.match(/"([^"]+)"/)?.[1] || sel.match(/'([^']+)'/)?.[1];
          if (textToFind) {
            const tag = sel.startsWith('a:') ? 'a' : 'button';
            const elements = Array.from(document.querySelectorAll(tag));
            element = elements.find(el => (el.textContent || '').trim().toLowerCase().includes(textToFind.toLowerCase()));
          }
        } else {
          element = document.querySelector(sel);
        }

        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            element.click();
            return { success: true, selector: sel };
          }
        }
      }
      return { success: false };
    }, nextSelectors);

    if (clicked && clicked.success) {
      console.log(`[derma] clicked next page button via page.evaluate using selector: ${clicked.selector}`);
      await page.waitForLoadState('domcontentloaded');
      await wait(2000 + Math.floor(Math.random() * 1500));
      return true;
    }
  } catch (err) {
    console.log('[derma] error clicking next page via page.evaluate:', err.message || String(err));
  }

  // Fallback to Playwright locator if evaluation did not work
  for (const selector of nextSelectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count() > 0 && await locator.isVisible()) {
        console.log(`[derma] found next page button using Playwright locator: ${selector}`);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await wait(500 + Math.floor(Math.random() * 500));
        await locator.click({ force: true });
        await page.waitForLoadState('domcontentloaded');
        await wait(2000 + Math.floor(Math.random() * 1500));
        return true;
      }
    } catch (e) {
      console.log(`[derma] error checking next page selector via Playwright ${selector}:`, e.message || String(e));
    }
  }

  console.log('[derma] next page button not found');
  return false;
}

async function findTargetResultWithScrolling(targetDomain, keyword) {
  let collected = [];
  const maxPages = Math.floor(Math.random() * 6) + 10; // Ngẫu nhiên từ 10 đến 15 trang để tìm kiếm sâu hơn
  console.log(`[derma] max pages to scan for this run: ${maxPages}`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`[derma] scanning google results page ${pageNum} of ${maxPages}...`);
    reportStep('derma_page', { pageNum, maxPages });
    await maybeAcceptGoogleConsent();
    await throwIfGoogleCaptcha(`[derma] page scan ${pageNum}`);

    const scrollAttempts = 6;
    for (let attempt = 0; attempt < scrollAttempts; attempt++) {
      const currentResults = await extractGoogleResults();
      collected = mergeResults(collected, currentResults);
      const targetResult = collected.find((result) => isTargetHost(result.host, targetDomain));
      
      if (targetResult) {
        console.log(
          `[derma] target found on page ${pageNum} during scan: ` +
            JSON.stringify({
              pageNum,
              attempt,
              rank: targetResult.position,
              url: cleanUrl(targetResult.url),
            }),
        );
        reportStep('derma_found', { keyword, pageNum, position: targetResult.position });
        return {
          targetResult,
          topResults: collected,
        };
      }

      if (attempt < scrollAttempts - 1) {
        if (Math.random() < 0.7) await moveMouseNaturally();
        await page.mouse.wheel(0, 600 + Math.floor(Math.random() * 400));
        await wait(800 + Math.floor(Math.random() * 800));
      }
    }

    if (pageNum === maxPages) {
      console.log(`[derma] reached max page limit (${maxPages}) without finding target`);
      break;
    }

    const hasNext = await goToNextGooglePage();
    if (!hasNext) {
      console.log('[derma] no more pages available, stopping search');
      break;
    }
  }

  reportStep('derma_not_found', { keyword });

  return {
    targetResult: null,
    topResults: collected,
  };
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

async function scrollToRelatedProducts() {
  const found = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,section,div'));
    const target = headings.find((element) => {
      const text = (element.textContent || '').trim().toLowerCase();
      return text.includes('sản phẩm tương tự') || text.includes('san pham tuong tu') || text.includes('related products');
    });
    if (!target) return false;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    return true;
  });

  if (found) {
    await wait(700 + Math.floor(Math.random() * 500));
    return true;
  }

  return false;
}

async function maybeInspectProductImages(label, deadline) {
  if (remainingMs(deadline) <= 12000) return { inspected: false, reason: 'budget' };
  if (Math.random() > 0.55) {
    console.log(label + ' skip product image inspect by random');
    return { inspected: false, reason: 'random' };
  }

  const candidates = await page.evaluate(() => {
    const selectors = [
      '.woocommerce-product-gallery img',
      '.product-gallery img',
      '.product-images img',
      '.product img',
      'main img',
      'img',
    ];
    const out = [];
    for (const selector of selectors) {
      for (const img of Array.from(document.querySelectorAll(selector))) {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        const alt = img.alt || '';
        if (!src || src.startsWith('data:') || rect.width < 90 || rect.height < 90) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight * 1.6) continue;
        out.push({
          src,
          alt,
          width: rect.width,
          height: rect.height,
        });
      }
      if (out.length >= 8) break;
    }
    return out;
  });

  if (candidates.length === 0) {
    console.log(label + ' no product image candidate');
    return { inspected: false, reason: 'no-image' };
  }

  const selected = candidates[Math.floor(Math.random() * Math.min(candidates.length, 4))];
  const image = page.locator('img[src="' + cssAttrValue(selected.src) + '"], img[srcset*="' + cssAttrValue(selected.src.split('/').pop() || selected.src) + '"]').first();
  if ((await image.count()) === 0 || !(await image.isVisible())) {
    console.log(label + ' image locator not visible');
    return { inspected: false, reason: 'not-visible' };
  }

  try {
    console.log(label + ' click product image: ' + selected.src);
    await image.scrollIntoViewIfNeeded();
    await wait(500 + Math.floor(Math.random() * 600));
    await image.click();
    await wait(1200 + Math.floor(Math.random() * 1600));

    const openedOverlay = await page.evaluate(() => {
      const selectors = [
        '.pswp',
        '.photoswipe',
        '.mfp-wrap',
        '.fancybox-container',
        '.woocommerce-product-gallery__trigger',
        '[role="dialog"]',
        '.modal',
      ];
      return selectors.some((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 20;
      });
    }).catch(() => false);

    if (openedOverlay) {
      if (Math.random() < 0.45) {
        await page.keyboard.press('ArrowRight');
        await wait(800 + Math.floor(Math.random() * 900));
      }
      if (Math.random() < 0.35) {
        await page.keyboard.press('ArrowLeft');
        await wait(700 + Math.floor(Math.random() * 800));
      }
      await page.keyboard.press('Escape');
      await wait(700 + Math.floor(Math.random() * 800));
      return { inspected: true, openedOverlay: true };
    }

    await page.goBack({ timeout: 8000 }).catch(() => undefined);
    await wait(800 + Math.floor(Math.random() * 700));
    await ensurePageUsable(label + ' after image back', deadline);
    return { inspected: true, openedOverlay: false };
  } catch (error) {
    console.log(label + ' product image inspect failed:', error.message || String(error));
    await page.keyboard.press('Escape').catch(() => undefined);
    return { inspected: false, reason: error.message || String(error) };
  }
}

async function extractRelatedProductLinks(targetDomain, currentUrl, visitedSet) {
  const links = await page.evaluate((domain) => {
    const baseHost = String(domain).toLowerCase().replace(/^www\./, '');
    const normalize = (value) => String(value || '').toLowerCase().replace(/^www\./, '');
    const selectors = [
      '.related a[href*="/product/"]',
      '.related.products a[href*="/product/"]',
      '.products a[href*="/product/"]',
      '.product a[href*="/product/"]',
      'a[href*="/product/"]',
    ];
    const out = [];
    for (const selector of selectors) {
      for (const anchor of Array.from(document.querySelectorAll(selector))) {
        try {
          const url = new URL(anchor.href);
          const host = normalize(url.hostname);
          const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
          if (host === baseHost || host.endsWith('.' + baseHost)) {
            out.push({ url: url.href, text });
          }
        } catch {
          // ignore invalid hrefs
        }
      }
      if (out.length >= 8) break;
    }
    return out;
  }, targetDomain);

  const currentClean = cleanUrl(currentUrl);
  const seen = new Set();
  return links
    .map((item) => cleanUrl(item.url))
    .filter((link) => link !== currentClean)
    .filter((link) => !visitedSet.has(link))
    .filter((link) => {
      if (seen.has(link)) return false;
      seen.add(link);
      return true;
    })
    .slice(0, 6);
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

async function clickOrGotoInternalLink(link, deadline) {
  const targetUrl = cleanUrl(link);
  const currentUrl = await page.url();
  const anchors = await page.locator('a[href]').all();

  for (const anchor of anchors.slice(0, 180)) {
    try {
      const href = await anchor.getAttribute('href');
      if (!href) continue;

      let anchorUrl = '';
      try {
        anchorUrl = cleanUrl(resolveHref(href, currentUrl));
      } catch {
        continue;
      }

      if (anchorUrl !== targetUrl || !(await anchor.isVisible())) continue;

      try {
        console.log('[audit] click internal link: ' + targetUrl);
        await anchor.scrollIntoViewIfNeeded();
        await wait(300 + Math.floor(Math.random() * 500));
        await anchor.click();
        await waitUntilState(
          'internal link opened',
          async () => {
            const url = await page.url();
            return {
              ok: sameCleanUrl(url, targetUrl),
              url,
              title: await page.title(),
            };
          },
          Math.min(12000, remainingMs(deadline)),
        );
        await ensurePageUsable('[audit] after internal click', deadline);
        return { openedBy: 'click' };
      } catch (error) {
        console.log('[audit] click internal failed, fallback goto:', error.message || String(error));
        break;
      }
    } catch (staleErr) {
      console.log('[audit] stale link elements skipped: ' + (staleErr.message || String(staleErr)));
    }
  }

  await gotoWithUsableFallback(
    targetUrl,
    {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(30000, remainingMs(deadline)),
    },
    '[audit] after internal goto',
    deadline,
  );
  return { openedBy: 'goto' };
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

async function readPageWithinBudget(minSeconds, maxSeconds, deadline, stepType = 'news') {
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
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const totalSeconds = Math.floor(targetDurationMs / 1000);
    if (stepType === 'audit') {
      const currentUrl = await page.url().catch(() => '');
      reportStep('audit_reading', { elapsed: elapsedSeconds, total: totalSeconds, url: currentUrl });
    } else {
      reportStep('news_reading', { elapsed: elapsedSeconds, total: totalSeconds });
    }

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

function shuffleArray(items) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = out[index];
    out[index] = out[swapIndex];
    out[swapIndex] = current;
  }
  return out;
}

async function openUrlFallback(url, label) {
  const cleanTarget = cleanUrl(url);
  console.log(label + ' fallback open URL: ' + cleanTarget);
  try {
    if (page.browser && page.browser.newPage) {
      const created = await page.browser.newPage(cleanTarget, { active: true });
      if (created && created.targetId && page.browser.bringToFront) {
        await page.browser.bringToFront(created.targetId);
      }
      await page.waitForLoadState('domcontentloaded');
      await ensurePageUsable(label + ' after new tab fallback');
      return;
    }
  } catch (error) {
    console.log(label + ' new tab fallback failed:', error.message || String(error));
  }

  await gotoWithUsableFallback(
    cleanTarget,
    { waitUntil: 'domcontentloaded', timeout: 30000 },
    label + ' after goto fallback',
  );
}

async function tryClickGoogleResult(result, label, options = {}) {
  const expectedUrl = cleanUrl(result.url);
  const searchUrl = options.searchUrl || '';
  if (searchUrl) {
    const currentUrl = await page.url();
    if (!currentUrl.includes('/search')) {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(600 + Math.floor(Math.random() * 700));
    }
  }

  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).slice(0, 220).map((anchor) => ({
      rawHref: anchor.getAttribute('href') || '',
      href: anchor.href || '',
      text: (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    })),
  );

  for (const item of anchors) {
    const decodedHref = decodeGoogleHref(item.href || item.rawHref);
    if (!sameCleanUrl(decodedHref, expectedUrl) && !sameCleanUrl(item.href, result.clickUrl || expectedUrl)) {
      continue;
    }

    try {
      console.log(label + ' click Google result: ' + expectedUrl);
      const selectors = [
        item.rawHref ? 'a[href="' + cssAttrValue(item.rawHref) + '"]' : '',
        item.href ? 'a[href="' + cssAttrValue(item.href) + '"]' : '',
      ].filter(Boolean);
      let anchor = null;
      for (const selector of selectors) {
        const candidate = page.locator(selector).first();
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          anchor = candidate;
          break;
        }
      }
      if (!anchor) continue;

      await anchor.scrollIntoViewIfNeeded();
      await wait(350 + Math.floor(Math.random() * 500));
      await anchor.click();
      await waitUntilState(
        label + ' opened after click',
        async () => {
          const url = await page.url();
          let host = '';
          try {
            host = normalizeHost(new URL(url).hostname);
          } catch {
            host = '';
          }
          return {
            ok: !host.includes('google.') && !url.includes('/search'),
            url,
            title: await page.title(),
          };
        },
        25000,
      );
      await ensurePageUsable(label + ' after Google click');
      return { clicked: true, openedBy: 'click' };
    } catch (error) {
      console.log(label + ' click failed:', error.message || String(error));
      break;
    }
  }

  if (options.allowFallback !== false) {
    await openUrlFallback(expectedUrl, label);
    return { clicked: false, openedBy: 'fallback' };
  }

  return { clicked: false, openedBy: 'none' };
}

async function getReadablePageState() {
  const currentUrl = await page.url();
  const currentTitle = await page.title();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const stillGoogle = normalizeHost(new URL(currentUrl).hostname).includes('google.');
  const readable = bodyText.trim().length > 250;
  return {
    currentUrl,
    currentTitle,
    readable,
    stillGoogle,
    bodyLength: bodyText.trim().length,
  };
}

async function inspectPageHealth() {
  const url = await page.url();
  const title = await page.title();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const dom = await page.evaluate(() => {
    const body = document.body;
    const root = document.documentElement;
    const bodyStyle = body ? getComputedStyle(body) : null;
    const rootStyle = root ? getComputedStyle(root) : null;
    const background = bodyStyle?.backgroundColor || rootStyle?.backgroundColor || '';
    const foreground = bodyStyle?.color || '';
    const visibleElements = Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
    }).length;
    return {
      readyState: document.readyState,
      background,
      foreground,
      childCount: body ? body.children.length : 0,
      visibleElements,
      linkCount: document.querySelectorAll('a[href]').length,
      imageCount: document.querySelectorAll('img').length,
      formCount: document.querySelectorAll('input,button,select,textarea').length,
      scrollHeight: Math.max(body?.scrollHeight || 0, root?.scrollHeight || 0),
    };
  }).catch((error) => ({
    readyState: 'error',
    background: '',
    foreground: '',
    childCount: 0,
    visibleElements: 0,
    linkCount: 0,
    imageCount: 0,
    formCount: 0,
    scrollHeight: 0,
    error: error.message || String(error),
  }));

  const textLength = bodyText.trim().length;
  const blackBackground = /rgba?\(\s*0\s*,\s*0\s*,\s*0(?:\s*,\s*(?:1|0?\.\d+))?\s*\)/i.test(dom.background);
  const noUi =
    textLength < 80 &&
    dom.visibleElements < 12 &&
    dom.linkCount < 3 &&
    dom.imageCount < 2 &&
    dom.formCount < 2;
  let currentHost = '';
  try {
    currentHost = normalizeHost(new URL(url).hostname);
  } catch {
    currentHost = '';
  }
  const tooShortForSite =
    !currentHost.includes('google.') &&
    textLength < 120 &&
    dom.linkCount < 5 &&
    dom.scrollHeight < 900;

  return {
    ok: !(blackBackground && noUi) && !tooShortForSite && dom.readyState !== 'error',
    url,
    title,
    textLength,
    blackBackground,
    noUi,
    tooShortForSite,
    ...dom,
  };
}

async function ensurePageUsable(label, deadline) {
  const maxReloads = 2;
  for (let attempt = 0; attempt <= maxReloads; attempt++) {
    await wait(900 + Math.floor(Math.random() * 700));
    const health = await inspectPageHealth();
    if (health.ok) {
      if (attempt > 0) {
        console.log(label + ' recovered after reload: ' + JSON.stringify({
          attempt,
          url: health.url,
          title: health.title,
          textLength: health.textLength,
          visibleElements: health.visibleElements,
          linkCount: health.linkCount,
          imageCount: health.imageCount,
        }));
      }
      return health;
    }

    console.log(label + ' page not usable, reload ' + (attempt + 1) + ': ' + JSON.stringify({
      url: health.url,
      title: health.title,
      textLength: health.textLength,
      background: health.background,
      blackBackground: health.blackBackground,
      visibleElements: health.visibleElements,
      linkCount: health.linkCount,
      imageCount: health.imageCount,
      scrollHeight: health.scrollHeight,
    }));

    if (attempt >= maxReloads || (deadline && remainingMs(deadline) <= 8000)) {
      return health;
    }

    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: Math.min(30000, deadline ? remainingMs(deadline) : 30000),
    }).catch((error) => {
      console.log(label + ' reload failed:', error.message || String(error));
    });
  }
}

async function gotoWithUsableFallback(url, options = {}, label = '[goto]', deadline) {
  const timeout = options.timeout || (deadline ? Math.min(30000, remainingMs(deadline)) : 30000);
  try {
    await page.goto(url, {
      waitUntil: options.waitUntil || 'domcontentloaded',
      timeout,
    });
  } catch (error) {
    const message = error.message || String(error);
    console.log(label + ' navigation failed, checking current page:', message);
    const health = await ensurePageUsable(label + ' after navigation error', deadline);
    const currentUrl = await page.url().catch(() => '');
    if (!health || !health.ok || !sameCleanUrl(currentUrl, url)) {
      throw error;
    }
  }

  return ensurePageUsable(label, deadline);
}

async function openRandomReadableNewsResult(topResults, config) {
  const candidates = topResults
    .filter((result) => !isTargetHost(result.host, config.targetDomain))
    .filter((result) => /^https?:\/\//i.test(result.url))
    .slice(0, 6);

  const shuffledCandidates = shuffleArray(candidates);
  const attempts = [];
  const googleSearchUrl = await page.url();
  console.log('[news] top 6 candidates: ' + JSON.stringify(candidates.map((result) => ({
    position: result.position,
    host: result.host,
    title: result.title,
    url: cleanUrl(result.url),
  }))));

  for (const result of shuffledCandidates) {
    const url = cleanUrl(result.url);
    attempts.push({
      title: result.title,
      host: result.host,
      url,
    });

    try {
      await tryClickGoogleResult(result, '[news]', {
        searchUrl: googleSearchUrl,
        allowFallback: true,
      });
      await wait(1200 + Math.floor(Math.random() * 1400));

      const pageState = await getReadablePageState();

      if (!pageState.stillGoogle && pageState.readable) {
        return {
          result,
          attempts,
          currentUrl: pageState.currentUrl,
          currentTitle: pageState.currentTitle,
        };
      }

      attempts[attempts.length - 1].skippedReason =
        'Opened page was not readable or still on Google: ' + JSON.stringify(pageState);
    } catch (error) {
      attempts[attempts.length - 1].skippedReason = error.message || String(error);
      console.log('[news] candidate failed:', error.message || String(error));
    }
  }

  return {
    result: null,
    attempts,
    currentUrl: await page.url(),
    currentTitle: await page.title(),
  };
}

function fallbackNewsCandidates(keyword) {
  const normalized = String(keyword || '').toLowerCase();
  const all = [
    {
      title: 'VnExpress',
      host: 'vnexpress.net',
      url: 'https://vnexpress.net/',
    },
    {
      title: 'VietnamNet',
      host: 'vietnamnet.vn',
      url: 'https://vietnamnet.vn/',
    },
    {
      title: 'Tuổi Trẻ Online',
      host: 'tuoitre.vn',
      url: 'https://tuoitre.vn/',
    },
    {
      title: 'Dân Trí',
      host: 'dantri.com.vn',
      url: 'https://dantri.com.vn/',
    },
    {
      title: 'Thanh Niên',
      host: 'thanhnien.vn',
      url: 'https://thanhnien.vn/',
    },
    {
      title: 'Người Lao Động',
      host: 'nld.com.vn',
      url: 'https://nld.com.vn/',
    },
    {
      title: 'CafeF',
      host: 'cafef.vn',
      url: 'https://cafef.vn/',
    },
    {
      title: 'Báo Mới',
      host: 'baomoi.com',
      url: 'https://baomoi.com/',
    },
  ];

  if (normalized.includes('kinh') || normalized.includes('tài chính') || normalized.includes('chứng khoán')) {
    return shuffleArray([
      all.find((item) => item.host === 'cafef.vn'),
      all.find((item) => item.host === 'vietnamnet.vn'),
      all.find((item) => item.host === 'vnexpress.net'),
      all.find((item) => item.host === 'tuoitre.vn'),
    ].filter(Boolean));
  }

  return shuffleArray(all);
}

async function forceOpenFallbackNews(keyword, existingAttempts) {
  const attempts = existingAttempts.slice();
  const candidates = fallbackNewsCandidates(keyword).slice(0, 4);
  for (const result of candidates) {
    const url = cleanUrl(result.url);
    attempts.push({
      title: result.title,
      host: result.host,
      url,
      fallback: true,
    });

    try {
      await openUrlFallback(url, '[news]');
      await wait(1500 + Math.floor(Math.random() * 1300));
      const pageState = await getReadablePageState();
      if (!pageState.stillGoogle && pageState.readable) {
        return {
          result,
          attempts,
          currentUrl: pageState.currentUrl,
          currentTitle: pageState.currentTitle,
        };
      }
      attempts[attempts.length - 1].skippedReason =
        'Fallback page was not readable: ' + JSON.stringify(pageState);
    } catch (error) {
      attempts[attempts.length - 1].skippedReason = error.message || String(error);
      console.log('[news] fallback failed:', error.message || String(error));
    }
  }

  return {
    result: null,
    attempts,
    currentUrl: await page.url(),
    currentTitle: await page.title(),
  };
}

async function warmupNewsRead(config) {
  console.log('[news] start ' + new Date().toISOString());
  const keyword = await getNewsKeyword(config);
  reportStep('news_start', keyword);
  const startedAt = Date.now();
  try {
    await searchGoogle(keyword, {
      label: '[news] after search',
      afterResultsMinSeconds: 2,
      afterResultsMaxSeconds: 5,
      scanOptions: {
        downSteps: 1,
        middleWaitMs: 700,
        upSteps: 0,
      },
    });
    const topResults = await extractGoogleResults();
    let openResult = await openRandomReadableNewsResult(topResults, config);
    if (!openResult.result) {
      console.log('[news] google candidates failed, forcing fallback news open');
      openResult = await forceOpenFallbackNews(keyword, openResult.attempts);
    }
    const newsResult = openResult.result;

    if (!newsResult) {
      return {
        keyword,
        skipped: true,
        reason: 'No readable news URL could be opened even after fallback',
        topResults,
        openAttempts: openResult.attempts,
      };
    }

    const maxNewsDeadline = Date.now() + Math.min(220000, Math.max(90000, Number(config.newsReadMaxSeconds || 180) * 1000));
    const readStats = await readPageWithinBudget(
      config.newsReadMinSeconds,
      config.newsReadMaxSeconds,
      maxNewsDeadline,
      'news',
    );

    reportStep('news_done');

    return {
      keyword,
      skipped: false,
      selectedResult: newsResult,
      topResults,
      openAttempts: openResult.attempts,
      readStats,
      elapsedMs: Date.now() - startedAt,
      finalUrl: await page.url(),
      title: await page.title(),
    };
  } catch (error) {
    console.log('[news] skipped by error:', error.message || String(error));
    return {
      keyword,
      skipped: true,
      reason: error.message || String(error),
      elapsedMs: Date.now() - startedAt,
      finalUrl: await page.url(),
      title: await page.title(),
    };
  }
}

async function auditTargetSite(config, startUrl) {
  console.log('[step4] audit target site ' + new Date().toISOString());
  reportStep('audit_start');
  const startedAt = Date.now();
  const minDurationMs = Math.max(120, Number(config.siteQaMinSeconds || 240)) * 1000;
  const maxDurationLimitMs = Math.max(minDurationMs, Math.min(600, Number(config.siteQaMaxSeconds || 420)) * 1000);
  const targetDurationMs = minDurationMs + Math.floor(Math.random() * (maxDurationLimitMs - minDurationMs + 1));
  const deadline = startedAt + targetDurationMs;
  const visitedPages = [];
  const visitedSet = new Set();

  try {
    const firstUrl = cleanUrl(startUrl);
    visitedSet.add(firstUrl);
    await gotoWithUsableFallback(
      firstUrl,
      {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(45000, remainingMs(deadline)),
      },
      '[audit] first product page',
      deadline,
    );
  } catch (error) {
    console.log('Start URL failed, fallback to target base URL:', error.message || String(error));
    const fallbackUrl = cleanUrl(config.targetBaseUrl);
    visitedSet.add(fallbackUrl);
    await gotoWithUsableFallback(
      fallbackUrl,
      {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(45000, remainingMs(deadline)),
      },
      '[audit] fallback base page',
      deadline,
    );
  }

  await waitWithinBudget(2500 + Math.floor(Math.random() * 2500), deadline);
  await maybeInspectProductImages('[audit] first product image', deadline);
  await scrollToRelatedProducts();
  const firstReadStats = await readPageWithinBudget(35, 70, deadline, 'audit');
  visitedPages.push({
    ...(await auditCurrentPage(config.targetDomain)),
    readStats: firstReadStats,
  });

  const relatedLinks = await extractRelatedProductLinks(config.targetDomain, await page.url(), visitedSet);
  const links = await extractInternalLinks(config.targetDomain);
  const auditLinks = relatedLinks
    .concat(pickAuditLinks(links, await page.url(), visitedSet))
    .filter((link, index, arr) => arr.indexOf(link) === index);
  for (const link of auditLinks) {
    if (remainingMs(deadline) <= 20000 || visitedPages.length >= 6) break;
    const cleanLink = cleanUrl(link);
    if (visitedSet.has(cleanLink)) continue;
    visitedSet.add(cleanLink);
    await clickOrGotoInternalLink(cleanLink, deadline);
    await waitWithinBudget(2500 + Math.floor(Math.random() * 2500), deadline);
    await maybeInspectProductImages('[audit] related product image', deadline);
    const readStats = await readPageWithinBudget(35, 75, deadline, 'audit');
    visitedPages.push({
      ...(await auditCurrentPage(config.targetDomain)),
      readStats,
    });
  }

  reportStep('audit_done');

  return {
    startUrl: cleanUrl(startUrl),
    targetDurationMs,
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
    gscKeywordPoolPath: String(param('gscKeywordPoolPath') || DEFAULTS.gscKeywordPoolPath),
    keyword: String(param('defaultKeyword') || DEFAULTS.keyword),
    targetDomain: String(param('targetDomain') || DEFAULTS.targetDomain),
    targetBaseUrl: String(param('targetBaseUrl') || DEFAULTS.targetBaseUrl),
    siteQaMinSeconds: Number(param('siteQaMinSeconds') || DEFAULTS.siteQaMinSeconds),
    siteQaMaxSeconds: Number(param('siteQaMaxSeconds') || DEFAULTS.siteQaMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  const newsWarmup = await warmupNewsRead(config);
  await waitRandomSeconds('[phase] before derma', 12, 25);
  const keyword = await getKeyword(config);
  reportStep('derma_start', keyword);
  await searchGoogle(keyword, {
    label: '[derma] after search',
    afterResultsMinSeconds: 1,
    afterResultsMaxSeconds: 2,
    skipScan: true,
  });
  const targetScan = await findTargetResultWithScrolling(config.targetDomain, keyword);
  const topResults = targetScan.topResults;
  const targetResult = targetScan.targetResult;
  const targetStartUrl = targetResult ? cleanUrl(targetResult.url) : cleanUrl(config.targetBaseUrl);
  console.log(
    '[derma] open target from Google: ' +
      JSON.stringify({
        foundInGoogle: Boolean(targetResult),
        rank: targetResult ? targetResult.position : null,
        url: targetStartUrl,
      }),
  );
  if (targetResult) {
    await tryClickGoogleResult(targetResult, '[derma]', {
      searchUrl: await page.url(),
      allowFallback: true,
    });
    await wait(3000 + Math.floor(Math.random() * 2500));
  }
  const siteAudit = await auditTargetSite(config, targetResult ? await page.url() : targetStartUrl);

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
