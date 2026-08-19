const DEFAULTS = {
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key map google.txt',
  targetBusinessName: 'Nhà thuốc Khải Hoàn Skincare',
  targetLocationKeyword: 'Phan Thiết',
  targetAddressSnippet: '01 Vạn Thủy Tú',
  mapDwellMinSeconds: 200,  // ~3.5 minutes
  mapDwellMaxSeconds: 360,  // ~6 minutes
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
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
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
  console.log('[map] Opening Google homepage in Vietnamese...');
  reportStep('google_open', 'Đang mở Google (Tiếng Việt)...');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  }).catch(() => {});
  await page.goto('https://www.google.com/?hl=vi&gl=vn', { waitUntil: 'domcontentloaded', timeout: 45000 });
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

// Find and click strictly on Khải Hoàn Skincare card to OPEN the Profile Details
async function clickTargetPlaceCardStrictly() {
  return await page.evaluate(() => {
    // 1. Scan all place cards and headings on page
    const cards = Array.from(document.querySelectorAll('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb, div.dbg0pd, g-card, div.I6TXqe, div.g'));
    
    for (const card of cards) {
      const text = (card.innerText || '').toLowerCase();
      // Must contain 'khải hoàn'
      if (text.includes('khải hoàn') && (text.includes('skincare') || text.includes('spa') || text.includes('nhà thuốc') || text.includes('vạn thủy tú') || text.includes('phan thiết'))) {
        const clickable = card.querySelector('[role="heading"], a, div.dbg0pd, span') || card;
        clickable.scrollIntoView({ block: 'center', behavior: 'smooth' });
        clickable.click();
        return { success: true, name: card.innerText.split('\n')[0].trim() };
      }
    }
    return { success: false };
  });
}

async function findAndOpenMapProfile(config) {
  console.log('[map] Looking for Google Maps Local Pack or "Doanh nghiệp khác"...');
  reportStep('map_search', 'Đang tìm kiếm Profile Google Map...');

  // 1. Check if Khải Hoàn Skincare is directly visible on the search page
  const directClick = await clickTargetPlaceCardStrictly();
  if (directClick && directClick.success) {
    console.log(`[map] Clicked directly on search page: "${directClick.name}"`);
    reportStep('map_found', `Đã tìm thấy: ${directClick.name}! Đang mở Profile...`);
    await wait(3500 + randomInt(500, 1500));
    return true;
  }

  // 2. Click "Doanh nghiệp khác >" (More places) to open full list
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

  // 3. Search inside Local Finder / Places View (Scan pages 1 -> 5)
  const maxPages = 5;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    console.log(`[map] Scanning Places list strictly (Page ${pageIndex}/${maxPages})...`);
    reportStep('map_scanning', `Đang tìm Map trang ${pageIndex}...`);

    // Smoothly scroll down the places list on left side
    const leftPanel = page.locator('div[role="region"], div.m6QErb, div.section-layout, div#pane, div.VkpGBb').first();
    for (let scrollStep = 0; scrollStep < 5; scrollStep++) {
      await moveMouseNaturally();
      await safeMouseWheel(0, 300 + randomInt(100, 200));
      await wait(800 + randomInt(300, 700));
    }

    // STRICT Search & Click on Khải Hoàn Skincare
    const cardClickResult = await clickTargetPlaceCardStrictly();
    if (cardClickResult && cardClickResult.success) {
      console.log(`[map] STRICT TARGET FOUND & CLICKED: "${cardClickResult.name}" on page ${pageIndex}!`);
      reportStep('map_found', `Đã mở Profile Map: ${cardClickResult.name}!`);
      await wait(4000 + randomInt(1000, 2000));
      return true;
    }

    console.log(`[map] Khải Hoàn not found on page ${pageIndex}, checking Next Page button...`);
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

  // 4. Fallback: Search directly for brand on Google Maps
  console.log('[map] Fallback: Searching exact brand name "Nhà thuốc Khải Hoàn Skincare Phan Thiết"...');
  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  if (await isVisibleSafe(searchInput)) {
    await searchInput.click();
    await wait(400);
    await searchInput.fill(config.targetBusinessName + ' ' + config.targetLocationKeyword);
    await searchInput.press('Enter');
    await wait(4000);

    const directResult = await clickTargetPlaceCardStrictly();
    if (directResult && directResult.success) {
      console.log(`[map] Fallback clicked target: "${directResult.name}"`);
      await wait(3500);
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
  const startMs = Date.now();

  console.log(`[map] Starting Map Profile interaction for ${dwellSeconds} seconds (~${Math.round(dwellSeconds/60)} minutes)...`);
  reportStep('map_interacting', { action: 'Bắt đầu tương tác Profile Map', elapsed: 0, total: dwellSeconds });

  // 1. Overview (Tổng quan) scrolling & reading (45 - 60s)
  console.log('[map-interaction] 1. Reading overview info (Address, hours, phone)...');
  for (let i = 0; i < 5; i++) {
    if (remainingMs(deadline) <= 20000) break;
    await moveMouseNaturally();
    await safeMouseWheel(0, 250 + randomInt(50, 200));
    reportStep('map_interacting', { action: 'Xem địa chỉ 01 Vạn Thủy Tú, giờ mở cửa & hotline', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await waitWithinBudget(3500 + randomInt(1500, 3000), deadline);
  }

  // 2. Check Services section (Dịch vụ) (30 - 45s)
  if (remainingMs(deadline) > 50000) {
    console.log('[map-interaction] 2. Checking Services (Dịch vụ) section...');
    reportStep('map_interacting', { action: 'Xem bảng Dịch vụ chăm sóc da & lấy mụn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    const servicesRow = page.locator('div:has-text("Services:"), div:has-text("Dịch vụ:"), [aria-label*="Dịch vụ"]').first();
    if (await isVisibleSafe(servicesRow)) {
      await servicesRow.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await servicesRow.click({ force: true }).catch(() => {});
      await waitWithinBudget(5000 + randomInt(2000, 4000), deadline);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // 3. View Photos tab / gallery (Ảnh) (60 - 80s)
  if (remainingMs(deadline) > 45000) {
    console.log('[map-interaction] 3. Checking Photos tab / gallery...');
    reportStep('map_interacting', { action: 'Xem Album ảnh cơ sở vật chất & liệu trình', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    
    const photoTabSelectors = [
      'button:has-text("Photos")',
      'button:has-text("Ảnh")',
      'div[role="tab"]:has-text("Ảnh")',
      'a:has-text("Ảnh")',
      'button[aria-label*="Ảnh"]',
      'div[data-tab-index="2"]',
    ];
    for (const selector of photoTabSelectors) {
      const tab = page.locator(selector).first();
      if (await isVisibleSafe(tab)) {
        await tab.click({ force: true }).catch(() => {});
        console.log(`[map-interaction] Clicked Photos tab via: ${selector}`);
        break;
      }
    }

    await waitWithinBudget(3000 + randomInt(1000, 2000), deadline);

    for (let p = 0; p < 5; p++) {
      if (remainingMs(deadline) <= 30000) break;
      await moveMouseNaturally();
      await safeMouseWheel(0, 300 + randomInt(100, 250));
      reportStep('map_interacting', { action: `Xem ảnh cơ sở (${p+1}/5)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await waitWithinBudget(3500 + randomInt(1500, 3500), deadline);
    }
  }

  // 4. View Reviews tab / More Google reviews (Bài đánh giá) (60 - 80s)
  if (remainingMs(deadline) > 30000) {
    console.log('[map-interaction] 4. Checking Reviews tab & customer reviews...');
    reportStep('map_interacting', { action: 'Đọc nhận xét & đánh giá 5 sao của khách hàng', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    
    const reviewTabSelectors = [
      'button:has-text("Reviews")',
      'button:has-text("Bài đánh giá")',
      'div[role="tab"]:has-text("Bài đánh giá")',
      'button:has-text("More Google reviews")',
      'button:has-text("Các bài đánh giá khác trên Google")',
      'div:has-text("More Google reviews")',
    ];
    for (const selector of reviewTabSelectors) {
      const tab = page.locator(selector).first();
      if (await isVisibleSafe(tab)) {
        await tab.scrollIntoViewIfNeeded().catch(() => {});
        await tab.click({ force: true }).catch(() => {});
        console.log(`[map-interaction] Clicked Reviews tab via: ${selector}`);
        break;
      }
    }

    await waitWithinBudget(2500 + randomInt(500, 1500), deadline);

    for (let r = 0; r < 5; r++) {
      if (remainingMs(deadline) <= 15000) break;
      await moveMouseNaturally();
      await safeMouseWheel(0, 280 + randomInt(80, 200));
      reportStep('map_interacting', { action: `Đọc nhận xét khách hàng (${r+1}/5)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await waitWithinBudget(4000 + randomInt(2000, 4000), deadline);
    }
  }

  // 5. Interacting with Profile Action Buttons (Website, Directions, Share, Save) (45 - 60s)
  if (remainingMs(deadline) > 30000) {
    console.log('[map-interaction] 5. Interacting with profile action buttons...');
    const actionChoices = ['website', 'directions', 'share', 'save'];
    const chosen = actionChoices[Math.floor(Math.random() * actionChoices.length)];

    if (chosen === 'website') {
      const webBtn = page.locator('button:has-text("Website"), button:has-text("Trang web"), a:has-text("Website"), a:has-text("Trang web"), [aria-label*="Trang web"]').first();
      if (await isVisibleSafe(webBtn)) {
        reportStep('map_interacting', { action: 'Bấm nút "Trang web" vào khaihoanderma.com', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await webBtn.click({ force: true }).catch(() => {});
        await waitWithinBudget(6000 + randomInt(2000, 4000), deadline);
      }
    } else if (chosen === 'directions') {
      const dirBtn = page.locator('button:has-text("Directions"), button:has-text("Đường đi"), a:has-text("Directions"), a:has-text("Đường đi"), [data-value*="Directions"], [aria-label*="Đường đi"]').first();
      if (await isVisibleSafe(dirBtn)) {
        reportStep('map_interacting', { action: 'Bấm nút "Đường đi" xem tuyến đường', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await dirBtn.click({ force: true }).catch(() => {});
        await waitWithinBudget(5000 + randomInt(2000, 4000), deadline);
        await page.keyboard.press('Escape').catch(() => {});
      }
    } else if (chosen === 'share') {
      const shareBtn = page.locator('button:has-text("Share"), button:has-text("Chia sẻ"), [aria-label*="Chia sẻ"]').first();
      if (await isVisibleSafe(shareBtn)) {
        reportStep('map_interacting', { action: 'Mở popup Chia sẻ địa điểm', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await shareBtn.click({ force: true }).catch(() => {});
        await waitWithinBudget(4000, deadline);
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  }

  // 6. Return to Overview and check popular times / opening hours
  if (remainingMs(deadline) > 5000) {
    console.log('[map-interaction] 6. Returning to Overview tab...');
    const overviewTab = page.locator('button:has-text("Overview"), button:has-text("Tổng quan"), div[role="tab"]:has-text("Tổng quan")').first();
    if (await isVisibleSafe(overviewTab)) {
      await overviewTab.click({ force: true }).catch(() => {});
      await waitWithinBudget(2000, deadline);
    }
    await safeMouseWheel(0, -600);
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

  console.log(`[map] Initializing Google Map Traffic Automation (Dwell budget: ${config.mapDwellMinSeconds}-${config.mapDwellMaxSeconds}s)...`);
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
    found: Boolean(found),
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
