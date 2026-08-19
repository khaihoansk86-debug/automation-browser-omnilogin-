const DEFAULTS = {
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key map google.txt',
  targetBusinessName: 'Nhà thuốc Khải Hoàn Skincare',
  targetLocationKeyword: 'Phan Thiết',
  targetAddressSnippet: '01 Vạn Thủy Tú',
  mapDwellMinSeconds: 90,   // 1.5 minutes
  mapDwellMaxSeconds: 180,  // 3 minutes
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\google-map-output.json',
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

function randomInt(min, max) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

async function wait(ms) {
  await page.waitForTimeout(Math.max(0, Math.floor(ms)));
}

async function safeMouseMove(x, y, options) {
  try {
    await page.mouse.move(x, y, options);
  } catch (error) {
    console.log('[mouse] move error:', error.message || String(error));
  }
}

async function safeMouseWheel(deltaX, deltaY) {
  try {
    await page.mouse.wheel(deltaX, deltaY);
  } catch (error) {
    console.log('[mouse] wheel error:', error.message || String(error));
  }
}

async function moveMouseNaturally() {
  const x = randomInt(150, 950);
  const y = randomInt(150, 600);
  await safeMouseMove(x, y, { steps: randomInt(8, 18) });
}

async function isVisibleSafe(locator) {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible());
  } catch {
    return false;
  }
}

async function waitWithinBudget(ms, deadline) {
  const budget = remainingMs(deadline);
  if (budget <= 0) return false;
  await wait(Math.min(ms, budget));
  return remainingMs(deadline) > 0;
}

async function loadKeyword(config) {
  const customKeyword = param('keyword');
  if (customKeyword && String(customKeyword).trim()) {
    return String(customKeyword).trim();
  }

  const filePath = String(param('keywordFilePath') || config.keywordFilePath);
  try {
    const raw = await omni.file.read(filePath);
    const lines = String(raw || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      const picked = lines[Math.floor(Math.random() * lines.length)];
      console.log(`[map] Picked random keyword: "${picked}" from ${lines.length} keywords.`);
      return picked;
    }
  } catch (err) {
    console.log(`[map] Failed to read keyword file (${filePath}):`, err.message || err);
  }

  return 'lấy nhân mụn Phan Thiết';
}

async function maybeAcceptGoogleConsent() {
  try {
    const consentSelectors = [
      'button:has-text("Tôi đồng ý")',
      'button:has-text("I agree")',
      'button:has-text("Accept all")',
      'button:has-text("Chấp nhận tất cả")',
    ];
    for (const selector of consentSelectors) {
      const btn = page.locator(selector).first();
      if (await isVisibleSafe(btn)) {
        console.log('[google] Accepting consent dialog...');
        await btn.click();
        await wait(1500);
        break;
      }
    }
  } catch {}
}

async function searchGoogle(keyword) {
  console.log('[map] Opening Google homepage...');
  reportStep('google_open', 'Đang mở Google...');
  await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await maybeAcceptGoogleConsent();
  await wait(1500);

  console.log(`[map] Searching keyword: "${keyword}"`);
  reportStep('search_keyword', keyword);
  
  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchInput.waitFor({ state: 'visible', timeout: 20000 });
  await searchInput.click();
  await wait(300 + randomInt(100, 300));

  // Natural human typing
  for (const char of keyword) {
    await page.keyboard.type(char, { delay: randomInt(40, 90) });
  }
  await wait(600 + randomInt(200, 600));
  await searchInput.press('Enter');

  await page.waitForLoadState('domcontentloaded');
  await wait(2500 + randomInt(500, 1500));

  // Check captcha
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (bodyText.includes('unusual traffic') || bodyText.includes('không phải người máy') || bodyText.includes('recaptcha')) {
    throw new Error('GOOGLE_CAPTCHA_DETECTED: Google yêu cầu xác minh CAPTCHA');
  }
}

async function findAndOpenMapProfile(config) {
  console.log('[map] Looking for Google Maps Local Pack or "Doanh nghiệp khác"...');
  reportStep('map_search', 'Đang tìm kiếm Profile Google Map...');

  // Matcher for target business
  const isTargetMatch = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      (lower.includes('khải hoàn') && (lower.includes('skincare') || lower.includes('spa') || lower.includes('nhà thuốc') || lower.includes('phan thiết'))) ||
      lower.includes('01 vạn thủy tú') ||
      lower.includes('nhà thuốc khải hoàn')
    );
  };

  // 1. Check if target business is directly in the initial 3-pack on the search page
  const directPackCandidate = await page.evaluate(() => {
    // Look inside local pack headers
    const elements = Array.from(document.querySelectorAll('div[data-async-context*="local_results"] [role="heading"], div[data-attrid*="local"] [role="heading"], g-card, div.rllt__details'));
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const text = el.innerText || '';
      if (text.toLowerCase().includes('khải hoàn')) {
        return { index: i, text: text.trim() };
      }
    }
    return null;
  });

  if (directPackCandidate) {
    console.log(`[map] Found target directly in initial 3-pack: "${directPackCandidate.text}"`);
    const packItems = page.locator('div[data-async-context*="local_results"] [role="heading"], div[data-attrid*="local"] [role="heading"], div.rllt__details');
    if (await packItems.count() > directPackCandidate.index) {
      await packItems.nth(directPackCandidate.index).click();
      await wait(3000);
      return true;
    }
  }

  // 2. Click "Doanh nghiệp khác >" (More places)
  console.log('[map] Clicking "Doanh nghiệp khác" / "More places" button...');
  const morePlacesSelectors = [
    'a:has-text("Doanh nghiệp khác")',
    'button:has-text("Doanh nghiệp khác")',
    'div[role="button"]:has-text("Doanh nghiệp khác")',
    'g-more-link a',
    'a[data-async-trigger*="local"]',
    'a:has-text("Xem thêm địa điểm")',
    'a:has-text("More businesses")',
    'a:has-text("More places")',
  ];

  let clickedMore = false;
  for (const selector of morePlacesSelectors) {
    const btn = page.locator(selector).first();
    if (await isVisibleSafe(btn)) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await wait(500);
      await btn.click({ force: true });
      clickedMore = true;
      console.log(`[map] Clicked more places via selector: ${selector}`);
      break;
    }
  }

  if (!clickedMore) {
    // Fallback: evaluate click
    clickedMore = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
      for (const el of allLinks) {
        const t = (el.innerText || '').toLowerCase();
        if (t.includes('doanh nghiệp khác') || t.includes('xem thêm địa điểm') || t.includes('more businesses') || t.includes('more places')) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return true;
        }
      }
      return false;
    });
  }

  await wait(3500 + randomInt(500, 1500));

  // 3. Search inside Local Finder / Places View
  const maxPages = 5;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    console.log(`[map] Scanning Places list (Page ${pageIndex}/${maxPages})...`);
    reportStep('map_scanning', `Đang tìm Map trang ${pageIndex}...`);

    // Natural scroll down the left places list
    for (let scrollStep = 0; scrollStep < 5; scrollStep++) {
      await moveMouseNaturally();
      await safeMouseWheel(0, 350 + randomInt(100, 300));
      await wait(800 + randomInt(300, 700));
    }

    // Check all listing items on current page
    const foundIndex = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb'));
      for (let i = 0; i < cards.length; i++) {
        const text = (cards[i].innerText || '').toLowerCase();
        if (text.includes('khải hoàn') && (text.includes('skincare') || text.includes('spa') || text.includes('nhà thuốc') || text.includes('vạn thủy tú') || text.includes('phan thiết'))) {
          return i;
        }
      }
      // Broader check for just "khải hoàn"
      for (let i = 0; i < cards.length; i++) {
        const text = (cards[i].innerText || '').toLowerCase();
        if (text.includes('khải hoàn')) {
          return i;
        }
      }
      return -1;
    });

    if (foundIndex >= 0) {
      console.log(`[map] TARGET FOUND at index ${foundIndex} on page ${pageIndex}!`);
      reportStep('map_found', 'Đã tìm thấy Profile Map! Đang mở chi tiết...');

      const cards = page.locator('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb');
      if (await cards.count() > foundIndex) {
        await cards.nth(foundIndex).scrollIntoViewIfNeeded().catch(() => {});
        await wait(600);
        await cards.nth(foundIndex).click({ force: true });
        await wait(3000 + randomInt(500, 1500));
        return true;
      }
    }

    // If not found, try clicking "Tiếp theo >" / Next Page button
    console.log(`[map] Target not found on page ${pageIndex}, checking Next Page button...`);
    const nextBtn = page.locator('a#pnnext, button#pnnext, td.d6cvqb a, a:has-text("Tiếp"), button[aria-label*="tiếp"]').first();
    if (await isVisibleSafe(nextBtn)) {
      await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await nextBtn.click({ force: true });
      await wait(3500 + randomInt(500, 1500));
    } else {
      console.log('[map] No Next Page button found. End of places list.');
      break;
    }
  }

  // Fallback: If still not found, try direct search with brand term on Google Maps
  console.log('[map] Fallback: Searching direct business name on Google...');
  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  if (await isVisibleSafe(searchInput)) {
    await searchInput.click();
    await wait(400);
    await searchInput.fill(config.targetBusinessName + ' ' + config.targetLocationKeyword);
    await searchInput.press('Enter');
    await wait(4000);

    const firstResult = page.locator('div[role="heading"]:has-text("Khải Hoàn"), div.rllt__details:has-text("Khải Hoàn")').first();
    if (await isVisibleSafe(firstResult)) {
      await firstResult.click();
      await wait(3000);
      return true;
    }
  }

  return false;
}

async function interactWithMapProfile(config) {
  const dwellSeconds = randomInt(
    Number(param('mapDwellMinSeconds') || config.mapDwellMinSeconds),
    Number(param('mapDwellMaxSeconds') || config.mapDwellMaxSeconds)
  );
  const deadline = Date.now() + dwellSeconds * 1000;

  console.log(`[map] Starting Map Profile interaction for ${dwellSeconds} seconds...`);
  reportStep('map_interacting', `Đang tương tác Profile Map (${dwellSeconds}s)...`);

  // 1. Overview (Tổng quan) scrolling & reading
  console.log('[map-interaction] 1. Reading overview info (Address, hours, phone)...');
  for (let i = 0; i < 4; i++) {
    if (remainingMs(deadline) <= 15000) break;
    await moveMouseNaturally();
    await safeMouseWheel(0, 250 + randomInt(50, 200));
    await waitWithinBudget(2000 + randomInt(1000, 2500), deadline);
  }

  // 2. View Photos tab / carousel
  if (remainingMs(deadline) > 20000) {
    console.log('[map-interaction] 2. Checking Photos tab / gallery...');
    const photoTabSelectors = [
      'button:has-text("Ảnh")',
      'div[role="tab"]:has-text("Ảnh")',
      'a:has-text("Ảnh")',
      'button[aria-label*="Ảnh"]',
      'div[data-tab-index="2"]',
    ];
    let photoTabClicked = false;
    for (const selector of photoTabSelectors) {
      const tab = page.locator(selector).first();
      if (await isVisibleSafe(tab)) {
        await tab.click({ force: true });
        photoTabClicked = true;
        console.log(`[map-interaction] Clicked Photos tab via: ${selector}`);
        break;
      }
    }

    await waitWithinBudget(3000 + randomInt(1000, 2000), deadline);

    // Scroll through photos
    for (let p = 0; p < 3; p++) {
      if (remainingMs(deadline) <= 15000) break;
      await moveMouseNaturally();
      await safeMouseWheel(0, 300 + randomInt(100, 250));
      await waitWithinBudget(2000 + randomInt(1000, 2000), deadline);
    }
  }

  // 3. View Reviews tab
  if (remainingMs(deadline) > 20000) {
    console.log('[map-interaction] 3. Checking Reviews tab...');
    const reviewTabSelectors = [
      'button:has-text("Bài đánh giá")',
      'div[role="tab"]:has-text("Bài đánh giá")',
      'a:has-text("Bài đánh giá")',
      'button[aria-label*="đánh giá"]',
      'div:has-text("Các bài đánh giá khác trên Google")',
    ];
    for (const selector of reviewTabSelectors) {
      const tab = page.locator(selector).first();
      if (await isVisibleSafe(tab)) {
        await tab.scrollIntoViewIfNeeded().catch(() => {});
        await tab.click({ force: true });
        console.log(`[map-interaction] Clicked Reviews tab via: ${selector}`);
        break;
      }
    }

    await waitWithinBudget(2500 + randomInt(500, 1500), deadline);

    // Scroll through reviews reading them naturally
    for (let r = 0; r < 4; r++) {
      if (remainingMs(deadline) <= 15000) break;
      await moveMouseNaturally();
      await safeMouseWheel(0, 280 + randomInt(80, 200));
      await waitWithinBudget(3000 + randomInt(1500, 3000), deadline);
    }
  }

  // 4. Return to Overview (Tổng quan) and check popular times
  if (remainingMs(deadline) > 10000) {
    console.log('[map-interaction] 4. Returning to Overview tab...');
    const overviewTab = page.locator('button:has-text("Tổng quan"), div[role="tab"]:has-text("Tổng quan"), a:has-text("Tổng quan")').first();
    if (await isVisibleSafe(overviewTab)) {
      await overviewTab.click({ force: true });
      await waitWithinBudget(2000, deadline);
    }

    // Scroll up and down naturally
    await safeMouseWheel(0, -500);
    await waitWithinBudget(2000 + randomInt(1000, 2000), deadline);
    await safeMouseWheel(0, 300);
    await waitWithinBudget(remainingMs(deadline), deadline);
  }

  console.log('[map-interaction] Finished Map Profile engagement successfully!');
  reportStep('map_done', 'Hoàn tất tương tác Google Map');
}

async function main() {
  const config = {
    keywordFilePath: String(param('keywordFilePath') || DEFAULTS.keywordFilePath),
    targetBusinessName: String(param('targetBusinessName') || DEFAULTS.targetBusinessName),
    targetLocationKeyword: String(param('targetLocationKeyword') || DEFAULTS.targetLocationKeyword),
    targetAddressSnippet: String(param('targetAddressSnippet') || DEFAULTS.targetAddressSnippet),
    mapDwellMinSeconds: Number(param('mapDwellMinSeconds') || DEFAULTS.mapDwellMinSeconds),
    mapDwellMaxSeconds: Number(param('mapDwellMaxSeconds') || DEFAULTS.mapDwellMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  console.log('[map] Initializing Google Map Traffic Automation for Khải Hoàn Skincare...');
  const keyword = await loadKeyword(config);
  
  await searchGoogle(keyword);
  const found = await findAndOpenMapProfile(config);
  
  if (found) {
    await interactWithMapProfile(config);
  } else {
    console.warn('[map] Warning: Target Map Profile was not found in search results.');
    reportStep('map_not_found', 'Không tìm thấy Profile Map trong kết quả');
    await wait(10000);
  }

  const output = {
    keyword,
    targetBusinessName: config.targetBusinessName,
    found,
    url: await page.url(),
    title: await page.title(),
    finishedAt: new Date().toISOString(),
  };

  console.log('[map] Execution Output:', JSON.stringify(output, null, 2));
  try {
    await omni.file.export(output, {
      path: config.exportPath,
      format: 'json',
      onConflict: 'overwrite',
    });
  } catch {}
}

await main();
