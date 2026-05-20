const DEFAULTS = {
  sessionMinSeconds: 720,
  sessionMaxSeconds: 1080,
  taskMinSeconds: 90,
  taskMaxSeconds: 180,
  betweenTaskMinSeconds: 20,
  betweenTaskMaxSeconds: 55,
  taskCountMin: 3,
  taskCountMax: 4,
  maxTasks: 4,
  exportPath: 'C:\\Users\\Admin\\Desktop\\profile-warmup-random-output.json',
};

const KEYWORDS = [
  'tin cong nghe moi nhat',
  'meo cham soc suc khoe',
  'du lich da lat',
  'mon ngon moi ngay',
  'tin kinh te hom nay',
  'cach tiet kiem dien',
  'xe may dien moi',
  'thoi tiet hom nay',
  'phim hay gan day',
  'meo hoc tieng anh',
  'cay canh trong nha',
  'review dien thoai',
  'bai tap tai nha',
  'tin the thao hom nay',
  'cach nau an don gian',
  'ky nang van phong',
  'xu huong thoi trang',
  'am nhac thu gian',
  'lich thi dau bong da',
  'dia diem an uong sai gon',
];

const YOUTUBE_KEYWORDS = [
  'nhac thu gian khong loi',
  'du lich viet nam',
  'meo nau an ngon',
  'review cong nghe',
  'tin tuc 24h',
  'tap the duc tai nha',
  'podcast tieng viet',
  'hoc tieng anh giao tiep',
  'khong gian song dep',
  'video giai tri hom nay',
];

const YOUTUBE_FALLBACK_VIDEO_URLS = [
  'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  'https://www.youtube.com/watch?v=5qap5aO4i9A',
  'https://www.youtube.com/watch?v=DWcJFNfaw9c',
  'https://www.youtube.com/watch?v=21X5lGlDOfg',
  'https://www.youtube.com/watch?v=hHW1oY26kxQ',
];

const NEWS_SITES = [
  'https://vnexpress.net/',
  'https://tuoitre.vn/',
  'https://dantri.com.vn/',
  'https://vietnamnet.vn/',
  'https://thanhnien.vn/',
  'https://nld.com.vn/',
  'https://cafef.vn/',
  'https://baomoi.com/',
];

const DIRECT_SITES = [
  'https://www.wikipedia.org/',
  'https://www.accuweather.com/',
  'https://www.imdb.com/',
  'https://www.thegioididong.com/',
  'https://www.dienmayxanh.com/',
  'https://shopee.vn/',
];

function param(name) {
  return typeof __params !== 'undefined' && __params ? __params[name] : undefined;
}

function randomInt(min, max) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pickMany(items, count) {
  return shuffle(items).slice(0, Math.max(0, count));
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
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

function cssAttrValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function wait(ms) {
  await page.waitForTimeout(Math.max(0, Math.floor(ms)));
}

async function waitRandom(label, minSeconds, maxSeconds) {
  const seconds = randomInt(minSeconds, Math.max(minSeconds, maxSeconds));
  console.log(label + ' wait ' + seconds + 's');
  await wait(seconds * 1000);
  return seconds;
}

async function waitWithinBudget(ms, deadline) {
  const budget = remainingMs(deadline);
  if (budget <= 0) return false;
  await wait(Math.min(ms, budget));
  return remainingMs(deadline) > 0;
}

async function isVisibleSafe(locator) {
  return (await locator.count()) > 0 && (await locator.first().isVisible());
}

async function moveMouseNaturally() {
  const x = randomInt(90, 1180);
  const y = randomInt(90, 640);
  await page.mouse.move(x, y, { steps: randomInt(8, 24) }).catch(() => undefined);
}

async function maybeAcceptConsent() {
  const texts = [
    'Accept all',
    'I agree',
    'Reject all',
    'Agree',
    'Got it',
    'Dong y',
    'Chap nhan',
    'Toi dong y',
  ];
  for (const text of texts) {
    const button = page.locator('button, [role="button"]').filter({ hasText: text }).first();
    if ((await button.count()) > 0 && (await button.isVisible()).catch(() => false)) {
      await button.click().catch(() => undefined);
      await wait(800);
      return true;
    }
  }
  return false;
}

async function inspectPageHealth() {
  const url = await page.url().catch(() => '');
  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const dom = await page.evaluate(() => {
    const body = document.body;
    const root = document.documentElement;
    const bodyStyle = body ? getComputedStyle(body) : null;
    const rootStyle = root ? getComputedStyle(root) : null;
    const visibleElements = Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
    }).length;
    return {
      readyState: document.readyState,
      background: bodyStyle?.backgroundColor || rootStyle?.backgroundColor || '',
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
  const noUi = textLength < 80 && dom.visibleElements < 12 && dom.linkCount < 3 && dom.imageCount < 2;

  return {
    ok: !(blackBackground && noUi) && dom.readyState !== 'error',
    url,
    title,
    textLength,
    blackBackground,
    noUi,
    ...dom,
  };
}

async function ensurePageUsable(label, deadline) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    await wait(800 + randomInt(0, 700));
    const health = await inspectPageHealth();
    if (health.ok) return health;

    console.log(label + ' page not usable, reload ' + (attempt + 1) + ': ' + JSON.stringify({
      url: health.url,
      title: health.title,
      textLength: health.textLength,
      background: health.background,
      visibleElements: health.visibleElements,
      linkCount: health.linkCount,
      imageCount: health.imageCount,
    }));

    if (attempt >= 2 || (deadline && remainingMs(deadline) < 8000)) return health;
    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: Math.min(30000, deadline ? remainingMs(deadline) : 30000),
    }).catch((error) => console.log(label + ' reload failed:', error.message || String(error)));
  }
}

async function gotoUsable(url, label, deadline) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(45000, deadline ? Math.max(5000, remainingMs(deadline)) : 45000),
    });
  } catch (error) {
    console.log(label + ' navigation timeout/fail, checking page:', error.message || String(error));
  }
  await maybeAcceptConsent();
  return ensurePageUsable(label, deadline);
}

async function scrollRead(label, minSeconds, maxSeconds, deadline) {
  const targetMs = randomInt(minSeconds, maxSeconds) * 1000;
  const startedAt = Date.now();
  let scrolls = 0;
  let clicks = 0;

  while (Date.now() - startedAt < targetMs && remainingMs(deadline) > 5000) {
    if (Math.random() < 0.65) await moveMouseNaturally();
    const direction = Math.random() < 0.82 ? 1 : -1;
    await page.mouse.wheel(0, direction * randomInt(260, 720)).catch(() => undefined);
    scrolls++;
    await wait(randomInt(2600, 7600));

    if (Math.random() < 0.10 && Date.now() - startedAt > targetMs * 0.55) {
      const opened = await clickReadableLink(label, deadline, {
        allowExternal: false,
        minTextLength: 8,
      }).catch(() => false);
      if (opened) clicks++;
    }
  }

  return {
    elapsedMs: Date.now() - startedAt,
    scrolls,
    clicks,
    finalUrl: await page.url().catch(() => ''),
    title: await page.title().catch(() => ''),
  };
}

async function transitionRandomPage(label, deadline) {
  if (remainingMs(deadline) < 45000) return false;
  if (Math.random() < 0.45) return false;
  const opened = await clickReadableLink(label + ' transition', deadline, {
    force: true,
    allowExternal: Math.random() < 0.25,
    minTextLength: 6,
  }).catch(() => false);
  if (!opened) return false;

  await wait(randomInt(2500, 6500));
  await scrollRead(label + ' after transition', 25, 55, deadline);
  return true;
}

async function clickReadableLink(label, deadline, options = {}) {
  if (remainingMs(deadline) < 15000) return false;
  const allowExternal = options.allowExternal === true;
  const force = options.force === true;
  const minTextLength = Number(options.minTextLength || 8);
  const links = await page.evaluate(() => {
    const blocked = ['javascript:', 'mailto:', 'tel:', '#', '/login', '/dang-nhap', '/sign-in', '/account', '/cart', '/gio-hang'];
    return Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return {
          href: anchor.href || '',
          rawHref: anchor.getAttribute('href') || '',
          text: (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          visible: rect.width > 20 && rect.height > 10 && rect.bottom > 0 && rect.top < window.innerHeight,
        };
      })
      .filter((item) => item.visible && item.href.startsWith('http'))
      .filter((item) => !blocked.some((prefix) => item.rawHref.startsWith(prefix)))
      .slice(0, 60);
  }).catch(() => []);

  const currentHost = await page.url().then((url) => normalizeHost(new URL(url).hostname)).catch(() => '');
  const candidates = shuffle(
    links
      .filter((item) => item.text.length >= minTextLength || force)
      .filter((item) => {
        if (allowExternal) return true;
        try {
          return normalizeHost(new URL(item.href).hostname) === currentHost;
        } catch {
          return false;
        }
      }),
  ).slice(0, force ? 12 : 5);

  for (const item of candidates) {
    try {
      const targetHost = normalizeHost(new URL(item.href).hostname);
      if (!allowExternal && currentHost !== targetHost) continue;

      const selector = item.rawHref ? 'a[href="' + cssAttrValue(item.rawHref) + '"]' : 'a[href="' + cssAttrValue(item.href) + '"]';
      const link = page.locator(selector).first();
      if ((await link.count()) === 0 || !(await link.isVisible())) continue;
      console.log(label + ' click readable link: ' + item.text);
      await link.scrollIntoViewIfNeeded();
      await wait(randomInt(400, 900));
      await link.click();
      await wait(randomInt(1200, 2400));
      await ensurePageUsable(label + ' after internal click', deadline);
      return true;
    } catch (error) {
      console.log(label + ' readable link failed:', error.message || String(error));
    }
  }

  if (force && candidates.length > 0) {
    const fallback = candidates[0];
    console.log(label + ' goto readable fallback: ' + fallback.href);
    await gotoUsable(fallback.href, label + ' readable fallback', deadline);
    return true;
  }

  return false;
}

async function openReadableContentFromCurrent(label, deadline) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const opened = await clickReadableLink(label, deadline, {
      force: true,
      allowExternal: false,
      minTextLength: 12,
    }).catch(() => false);
    if (opened) return true;

    await page.mouse.wheel(0, randomInt(420, 820)).catch(() => undefined);
    await wait(randomInt(900, 1600));
  }

  return false;
}

async function getGoogleCaptchaState() {
  const url = await page.url().catch(() => '');
  const title = await page.title().catch(() => '');
  const text = await page.locator('body').innerText().catch(() => '');
  const haystack = (url + '\n' + title + '\n' + text.slice(0, 1500)).toLowerCase();
  return {
    detected:
      url.includes('/sorry/') ||
      haystack.includes('unusual traffic') ||
      haystack.includes('automated queries') ||
      haystack.includes('not a robot') ||
      haystack.includes('recaptcha') ||
      haystack.includes('captcha') ||
      haystack.includes('our systems have detected'),
    url,
    title,
    text: text.slice(0, 500),
  };
}

async function throwIfGoogleCaptcha(label) {
  const captcha = await getGoogleCaptchaState();
  if (!captcha.detected) return;
  console.log('GOOGLE_CAPTCHA_DETECTED ' + JSON.stringify({ label, url: captcha.url, title: captcha.title, text: captcha.text }));
  throw new Error('GOOGLE_CAPTCHA_DETECTED: Google blocked this profile with CAPTCHA/unusual traffic');
}

async function searchGoogle(keyword, deadline) {
  await gotoUsable('https://www.google.com/', '[google] home', deadline);
  const input = page.locator('textarea[name="q"], input[name="q"]').first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await input.fill(keyword);
  await wait(randomInt(700, 1500));
  await input.press('Enter');
  await page.locator('textarea[name="q"], input[name="q"]').first().waitFor({ state: 'visible', timeout: 45000 });
  await throwIfGoogleCaptcha('[google] search');
  await wait(randomInt(1200, 3000));
}

async function extractGoogleResults() {
  const raw = await page.evaluate(() => {
    const blockedHosts = ['google.', 'gstatic.', 'googleusercontent.', 'youtube.', 'schema.org'];
    return Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => {
        try {
          const url = new URL(anchor.href);
          const title =
            (anchor.querySelector('h3') && anchor.querySelector('h3').textContent.trim()) ||
            (anchor.textContent || '').trim();
          return {
            title: title.replace(/\s+/g, ' ').slice(0, 160),
            href: url.href,
            rawHref: anchor.getAttribute('href') || '',
            host: url.hostname,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((item) => item.title && item.href.startsWith('http'))
      .filter((item) => !blockedHosts.some((host) => item.host.includes(host)) || item.href.includes('/url?'))
      .slice(0, 50);
  });

  const seen = new Set();
  return raw
    .map((item) => {
      try {
        const decoded = decodeGoogleHref(item.href);
        const parsed = new URL(decoded);
        return {
          title: item.title,
          url: parsed.href,
          host: parsed.hostname,
          rawHref: item.rawHref,
          href: item.href,
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
    .slice(0, 12);
}

async function openGoogleResult(result, deadline) {
  const selectors = [
    result.rawHref ? 'a[href="' + cssAttrValue(result.rawHref) + '"]' : '',
    result.href ? 'a[href="' + cssAttrValue(result.href) + '"]' : '',
  ].filter(Boolean);

  for (const selector of selectors) {
    const link = page.locator(selector).first();
    if ((await link.count()) === 0 || !(await link.isVisible()).catch(() => false)) continue;
    try {
      console.log('[google] open result: ' + result.title + ' | ' + result.url);
      await link.scrollIntoViewIfNeeded();
      await wait(randomInt(500, 1000));
      await link.click();
      await wait(randomInt(1500, 2800));
      await ensurePageUsable('[google] opened result', deadline);
      return 'click';
    } catch (error) {
      console.log('[google] click result failed:', error.message || String(error));
    }
  }

  await gotoUsable(result.url, '[google] fallback result', deadline);
  return 'goto';
}

async function taskGoogleBrowse(config, deadline) {
  const keyword = pick(KEYWORDS);
  console.log('[task] google browse: ' + keyword);
  await searchGoogle(keyword, deadline);

  for (let index = 0; index < randomInt(1, 3); index++) {
    await page.mouse.wheel(0, randomInt(360, 760)).catch(() => undefined);
    await wait(randomInt(900, 1800));
  }

  const results = await extractGoogleResults();
  const selected = pick(results.length ? results.slice(0, 6) : NEWS_SITES.map((url) => ({ title: url, url, host: new URL(url).hostname })));
  const openedBy = await openGoogleResult(selected, deadline);
  const readStats = await scrollRead('[google]', config.taskMinSeconds, config.taskMaxSeconds, deadline);
  return { type: 'googleBrowse', keyword, selected, openedBy, readStats };
}

async function taskNewsBrowse(config, deadline) {
  const site = pick(NEWS_SITES);
  console.log('[task] news browse: ' + site);
  await gotoUsable(site, '[news] site', deadline);
  await wait(randomInt(1200, 2600));
  const openedArticle = await openReadableContentFromCurrent('[news]', deadline);
  const readStats = await scrollRead('[news]', config.taskMinSeconds, config.taskMaxSeconds, deadline);
  const transitioned = await transitionRandomPage('[news]', deadline);
  return { type: 'newsBrowse', site, openedArticle, transitioned, readStats };
}

async function taskDirectBrowse(config, deadline) {
  const url = pick(DIRECT_SITES);
  console.log('[task] direct browse: ' + url);
  await gotoUsable(url, '[direct] site', deadline);
  await wait(randomInt(1200, 2800));
  const openedPage = await openReadableContentFromCurrent('[direct]', deadline).catch(() => false);
  const readStats = await scrollRead('[direct]', Math.max(25, config.taskMinSeconds - 10), config.taskMaxSeconds, deadline);
  const transitioned = await transitionRandomPage('[direct]', deadline);
  return { type: 'directBrowse', url, openedPage, transitioned, readStats };
}

async function searchYoutube(keyword, deadline) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(keyword);
  await gotoUsable(url, '[youtube] search', deadline);
  await maybeAcceptConsent();
  await page.locator('a[href*="/watch?v="], ytd-video-renderer').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  await wait(randomInt(1800, 3500));
}

async function openYoutubeVideo(deadline) {
  const openDirectFallback = async (reason) => {
    const directVideo = pick(YOUTUBE_FALLBACK_VIDEO_URLS);
    console.log('[youtube] direct video fallback (' + reason + '): ' + directVideo);
    await gotoUsable(directVideo, '[youtube] direct fallback video', deadline);
    for (let waitIndex = 0; waitIndex < 10; waitIndex++) {
      const url = await page.url().catch(() => '');
      if (url.includes('/watch')) {
        await wait(randomInt(2500, 4500));
        return { title: 'direct fallback video', url, openedBy: 'directFallback' };
      }
      await wait(700);
    }
    return { title: 'direct fallback attempted', url: await page.url().catch(() => directVideo), openedBy: 'directFallback' };
  };

  for (let scroll = 0; scroll < 3; scroll++) {
    const candidates = await page.evaluate(() => {
      const seen = new Set();
      return Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
        .map((anchor) => {
          const rect = anchor.getBoundingClientRect();
          const href = anchor.href || '';
          const rawHref = anchor.getAttribute('href') || '';
          const title =
            anchor.getAttribute('title') ||
            (anchor.textContent || '').trim().replace(/\s+/g, ' ') ||
            anchor.closest('ytd-video-renderer')?.textContent?.trim().replace(/\s+/g, ' ') ||
            '';
          return {
            href,
            rawHref,
            title: title.slice(0, 160),
            visible: rect.width > 40 && rect.height > 10 && rect.bottom > 0 && rect.top < window.innerHeight,
          };
        })
        .filter((item) => item.href.includes('/watch?v=') && item.visible)
        .filter((item) => {
          const key = item.href.replace(/[&#?]list=.*/, '').replace(/&pp=.*/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 16);
    }).catch(() => []);

    for (const item of shuffle(candidates).slice(0, 8)) {
      try {
        const selectors = [
          item.rawHref ? 'a[href="' + cssAttrValue(item.rawHref) + '"]' : '',
          item.href ? 'a[href="' + cssAttrValue(item.href) + '"]' : '',
        ].filter(Boolean);
        let video = null;
        for (const selector of selectors) {
          const candidate = page.locator(selector).first();
          if ((await candidate.count()) > 0 && (await candidate.isVisible()).catch(() => false)) {
            video = candidate;
            break;
          }
        }
        if (!video) continue;
        console.log('[youtube] click video: ' + (item.title || item.href));
        await video.scrollIntoViewIfNeeded();
        await wait(randomInt(600, 1200));
        await video.click();
        let openedUrl = await page.url().catch(() => '');
        for (let waitIndex = 0; waitIndex < 12 && !openedUrl.includes('/watch'); waitIndex++) {
          await wait(700);
          openedUrl = await page.url().catch(() => '');
        }
        if (openedUrl.includes('/watch')) {
          await ensurePageUsable('[youtube] video after click', deadline);
          return { title: item.title, url: openedUrl, openedBy: 'click' };
        }
      } catch (error) {
        console.log('[youtube] video click failed:', error.message || String(error));
      }
    }

    await page.mouse.wheel(0, randomInt(620, 980)).catch(() => undefined);
    await wait(randomInt(1200, 2200));
  }

  const selectors = [
    'a#video-title',
    'ytd-video-renderer a[href*="/watch"]',
    'a[href*="/watch?v="]',
  ];

  for (const selector of selectors) {
    const videos = page.locator(selector);
    const count = Math.min(await videos.count().catch(() => 0), 12);
    if (count === 0) continue;

    const order = shuffle(Array.from({ length: count }, (_, index) => index)).slice(0, 6);
    for (const index of order) {
      const video = videos.nth(index);
      if (!(await video.isVisible()).catch(() => false)) continue;
      const title = (await video.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 140);
      console.log('[youtube] open video: ' + title);
      await video.scrollIntoViewIfNeeded();
      await wait(randomInt(500, 1100));
      await video.click();
      await wait(randomInt(3500, 6000));
      await ensurePageUsable('[youtube] video', deadline);
      return { title, index };
    }
  }

  const fallbackVideos = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
      .map((anchor) => ({
        href: anchor.href || '',
        title: anchor.getAttribute('title') || (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      }))
      .filter((item) => item.href.includes('/watch?v='))
      .slice(0, 8),
  ).catch(() => []);
  const fallback = pick(fallbackVideos);
  if (fallback?.href) {
    console.log('[youtube] goto video fallback: ' + (fallback.title || fallback.href));
    await gotoUsable(fallback.href, '[youtube] fallback video', deadline);
    await wait(randomInt(3500, 6000));
    const url = await page.url().catch(() => fallback.href);
    if (url.includes('/watch')) return { title: fallback.title, url, openedBy: 'goto' };
  }

  return openDirectFallback('no-result-video-opened');
}

async function watchYoutubeVideo(config, deadline) {
  const targetMs = randomInt(Math.max(90, config.taskMinSeconds), Math.max(130, config.taskMaxSeconds + 70)) * 1000;
  const startedAt = Date.now();
  let actions = 0;
  let scrolls = 0;
  let currentUrl = await page.url().catch(() => '');
  if (!currentUrl.includes('/watch')) {
    const directVideo = pick(YOUTUBE_FALLBACK_VIDEO_URLS);
    console.log('[youtube] watch page missing, force goto: ' + directVideo);
    await gotoUsable(directVideo, '[youtube] forced watch page', deadline);
    await wait(randomInt(2500, 4500));
    currentUrl = await page.url().catch(() => '');
  }

  await page.locator('video, .html5-video-player, #movie_player').first().click().catch(() => undefined);
  await wait(randomInt(900, 1700));

  while (Date.now() - startedAt < targetMs && remainingMs(deadline) > 8000) {
    if (Math.random() < 0.25) await moveMouseNaturally();
    if (Math.random() < 0.50) {
      const direction = Math.random() < 0.82 ? 1 : -1;
      await page.mouse.wheel(0, direction * randomInt(260, 760)).catch(() => undefined);
      scrolls++;
      actions++;
    } else if (Math.random() < 0.10) {
      await page.keyboard.press('k').catch(() => undefined);
      await wait(randomInt(500, 1200));
      await page.keyboard.press('k').catch(() => undefined);
      actions++;
    }
    await wait(randomInt(8000, 18000));
  }

  return {
    elapsedMs: Date.now() - startedAt,
    actions,
    scrolls,
    finalUrl: await page.url().catch(() => ''),
    title: await page.title().catch(() => ''),
  };
}

async function taskYoutubeWatch(config, deadline) {
  const keyword = pick(YOUTUBE_KEYWORDS);
  console.log('[task] youtube watch: ' + keyword);
  await searchYoutube(keyword, deadline);
  let video = await openYoutubeVideo(deadline);
  const currentUrl = await page.url().catch(() => '');
  if (!currentUrl.includes('/watch')) {
    const fallback = pick(YOUTUBE_FALLBACK_VIDEO_URLS);
    console.log('[youtube] final force watch fallback: ' + fallback);
    await gotoUsable(fallback, '[youtube] final force fallback', deadline);
    video = { title: 'final force fallback', url: await page.url().catch(() => fallback), openedBy: 'finalForceFallback' };
  }
  const watchStats = await watchYoutubeVideo(config, deadline);
  return { type: 'youtubeWatch', keyword, video, watchStats };
}

function createTaskPlan(config) {
  const countMin = Math.max(3, Number(config.taskCountMin || 3));
  const countMax = Math.max(countMin, Number(config.taskCountMax || config.maxTasks || countMin));
  const plannedCount = Math.min(Number(config.maxTasks || countMax), randomInt(countMin, countMax));
  const required = ['youtubeWatch', 'newsBrowse', Math.random() < 0.5 ? 'googleBrowse' : 'directBrowse'];
  const optionalPool = ['googleBrowse', 'newsBrowse', 'youtubeWatch', 'directBrowse'];
  const plan = required.slice();
  while (plan.length < plannedCount) {
    plan.push(pick(optionalPool));
  }
  return shuffle(plan);
}

async function runTaskByName(taskName, config, deadline) {
  if (taskName === 'youtubeWatch') return taskYoutubeWatch(config, deadline);
  if (taskName === 'newsBrowse') return taskNewsBrowse(config, deadline);
  if (taskName === 'googleBrowse') return taskGoogleBrowse(config, deadline);
  if (taskName === 'directBrowse') return taskDirectBrowse(config, deadline);
  throw new Error('UNKNOWN_TASK: ' + taskName);
}

async function main() {
  const config = {
    sessionMinSeconds: Number(param('sessionMinSeconds') || DEFAULTS.sessionMinSeconds),
    sessionMaxSeconds: Number(param('sessionMaxSeconds') || DEFAULTS.sessionMaxSeconds),
    taskMinSeconds: Number(param('taskMinSeconds') || DEFAULTS.taskMinSeconds),
    taskMaxSeconds: Number(param('taskMaxSeconds') || DEFAULTS.taskMaxSeconds),
    betweenTaskMinSeconds: Number(param('betweenTaskMinSeconds') || DEFAULTS.betweenTaskMinSeconds),
    betweenTaskMaxSeconds: Number(param('betweenTaskMaxSeconds') || DEFAULTS.betweenTaskMaxSeconds),
    taskCountMin: Number(param('taskCountMin') || DEFAULTS.taskCountMin),
    taskCountMax: Number(param('taskCountMax') || DEFAULTS.taskCountMax),
    maxTasks: Number(param('maxTasks') || DEFAULTS.maxTasks),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  const sessionSeconds = randomInt(
    Math.max(60, config.sessionMinSeconds),
    Math.max(config.sessionMinSeconds, config.sessionMaxSeconds),
  );
  const deadline = Date.now() + sessionSeconds * 1000;
  const actions = [];
  const taskPlan = createTaskPlan(config);

  console.log('[warmup] start ' + JSON.stringify({ sessionSeconds, taskPlan, config }));

  for (let index = 0; index < taskPlan.length; index++) {
    const taskName = taskPlan[index];
    if (remainingMs(deadline) <= 20000) {
      actions.push({
        ok: false,
        skipped: true,
        taskName,
        error: 'SESSION_BUDGET_ENDED_BEFORE_TASK',
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      console.log('[warmup] run planned task ' + (index + 1) + '/' + taskPlan.length + ': ' + taskName);
      const result = await runTaskByName(taskName, config, deadline);
      actions.push({
        ok: true,
        taskName,
        order: index + 1,
        elapsedMs: Date.now() - startedAt,
        result,
      });
    } catch (error) {
      const message = error.message || String(error);
      console.log('[warmup] task failed:', message);
      actions.push({
        ok: false,
        taskName,
        order: index + 1,
        elapsedMs: Date.now() - startedAt,
        error: message,
        url: await page.url().catch(() => ''),
        title: await page.title().catch(() => ''),
      });
      if (message.includes('GOOGLE_CAPTCHA_DETECTED')) break;
    }

    if (remainingMs(deadline) > 65000 && index < taskPlan.length - 1) {
      await waitWithinBudget(
        randomInt(config.betweenTaskMinSeconds, config.betweenTaskMaxSeconds) * 1000,
        deadline,
      );
    }
  }

  const output = {
    app: 'profile-warmup-random',
    sessionSeconds,
    taskPlan,
    actions,
    finalUrl: await page.url().catch(() => ''),
    title: await page.title().catch(() => ''),
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
