const DEFAULTS = {
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key map google.txt',
  targetBusinessName: 'Nhà thuốc Khải Hoàn Skincare',
  targetLocationKeyword: 'Phan Thiết',
  targetAddressSnippet: '01 Vạn Thủy Tú',
  mapDwellMinSeconds: 210,  // ~3.5 minutes
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
    const cards = Array.from(document.querySelectorAll('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb, div.dbg0pd, g-card, div.I6TXqe, div.g'));
    
    for (const card of cards) {
      const text = (card.innerText || '').toLowerCase();
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

// FULL 4-STAGE INTERACTION: Directions -> Photos -> Reviews -> Deep Website
async function interactWithMapProfile(config) {
  const dwellSeconds = randomInt(
    Number(param('mapDwellMinSeconds') || config.mapDwellMinSeconds),
    Number(param('mapDwellMaxSeconds') || config.mapDwellMaxSeconds)
  );
  const deadline = Date.now() + dwellSeconds * 1000;
  const startMs = Date.now();

  console.log(`[map] Starting comprehensive 4-Stage Profile interaction for ${dwellSeconds}s (~${Math.round(dwellSeconds/60)} mins)...`);

  // ==========================================
  // GIAI ĐOẠN 1: BẤM CHỈ ĐƯỜNG & XEM BẢN ĐỒ (35 - 50s)
  // ==========================================
  console.log('[map-stage1] Phase 1: Clicking "Chỉ đường" (Directions)...');
  reportStep('map_interacting', { action: 'Bấm nút "Chỉ đường" xem tuyến đường bản đồ', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  const dirButtons = page.locator('button:has-text("Chỉ đường"), a:has-text("Chỉ đường"), button:has-text("Directions"), a:has-text("Directions"), [aria-label*="Chỉ đường"], [data-value*="Directions"]').first();
  if (await isVisibleSafe(dirButtons)) {
    await dirButtons.scrollIntoViewIfNeeded().catch(() => {});
    await wait(600);
    await dirButtons.click({ force: true }).catch(() => {});
    await wait(3000);

    // Pan & view map route
    for (let ds = 0; ds < 4; ds++) {
      await moveMouseNaturally();
      await safeMouseWheel(0, randomInt(-150, 150));
      reportStep('map_interacting', { action: 'Xem bản đồ & tuyến đường đến 01 Vạn Thủy Tú', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await wait(4000 + randomInt(1500, 3000));
    }
    
    // Close directions / back to place profile
    const backBtn = page.locator('button[aria-label*="Quay lại"], button[aria-label*="Back"], button.hYBOP').first();
    if (await isVisibleSafe(backBtn)) {
      await backBtn.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await wait(2000);
  }

  // ==========================================
  // GIAI ĐOẠN 2: XEM ALBUM ẢNH & CƠ SỞ VẬT CHẤT (45 - 60s)
  // ==========================================
  console.log('[map-stage2] Phase 2: Viewing Photos Album & Facilities...');
  reportStep('map_interacting', { action: 'Mở Album ảnh cơ sở vật chất & liệu trình', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  const photoSelectors = [
    'button:has-text("Ảnh")',
    'button:has-text("Photos")',
    'div[role="tab"]:has-text("Ảnh")',
    'button[aria-label*="Ảnh"]',
    'button[aria-label*="Photos"]',
    'div.lA3jAc img',
    'button.aoRNLd img',
  ];
  
  let openedPhotos = false;
  for (const sel of photoSelectors) {
    const photoEl = page.locator(sel).first();
    if (await isVisibleSafe(photoEl)) {
      await photoEl.click({ force: true }).catch(() => {});
      openedPhotos = true;
      console.log(`[map-stage2] Clicked photos via: ${sel}`);
      break;
    }
  }

  await wait(3000);

  for (let p = 0; p < 4; p++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 300 + randomInt(100, 200));
    reportStep('map_interacting', { action: `Xem ảnh cơ sở & liệu trình trị mụn (${p+1}/4)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 3: ĐỌC ĐÁNH GIÁ 5 SAO & GIỜ MỞ CỬA (40 - 55s)
  // ==========================================
  console.log('[map-stage3] Phase 3: Reading 5-Star Reviews & Opening Hours...');
  reportStep('map_interacting', { action: 'Mở tab Bài đánh giá 5 sao', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  const reviewSelectors = [
    'button:has-text("Bài đánh giá")',
    'button:has-text("Reviews")',
    'div[role="tab"]:has-text("Bài đánh giá")',
    'button:has-text("More Google reviews")',
    'button:has-text("Các bài đánh giá khác trên Google")',
  ];
  for (const sel of reviewSelectors) {
    const revEl = page.locator(sel).first();
    if (await isVisibleSafe(revEl)) {
      await revEl.scrollIntoViewIfNeeded().catch(() => {});
      await revEl.click({ force: true }).catch(() => {});
      console.log(`[map-stage3] Clicked reviews tab via: ${sel}`);
      break;
    }
  }

  await wait(2500);

  for (let r = 0; r < 4; r++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 260 + randomInt(80, 180));
    reportStep('map_interacting', { action: `Đọc nhận xét đánh giá khách hàng (${r+1}/4)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 4: BẤM TRANG WEB & LƯỚT SÂU KHAIHOANDERMA.COM (60 - 120s)
  // ==========================================
  console.log('[map-stage4] Phase 4: Clicking "Trang web" (Website) & deep browsing...');
  reportStep('map_interacting', { action: 'Bấm nút "Trang web" vào website khaihoanderma.com', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  // Return to overview to find website button or click direct link
  const overviewTab = page.locator('button:has-text("Tổng quan"), button:has-text("Overview"), div[role="tab"]:has-text("Tổng quan")').first();
  if (await isVisibleSafe(overviewTab)) {
    await overviewTab.click({ force: true }).catch(() => {});
    await wait(1500);
  }

  const webBtn = page.locator('button:has-text("Trang web"), a:has-text("Trang web"), button:has-text("Website"), a:has-text("Website"), [aria-label*="Trang web"], a[href*="khaihoanderma.com"]').first();
  if (await isVisibleSafe(webBtn)) {
    await webBtn.click({ force: true }).catch(() => {});
    await wait(5000 + randomInt(1000, 2000));
  } else {
    // If popup or direct navigation needed
    await page.goto('https://khaihoanderma.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await wait(4000);
  }

  // Deep browsing on Khải Hoàn Derma website for remaining time budget
  console.log('[map-stage4] Browsing Khải Hoàn Derma website...');
  while (remainingMs(deadline) > 12000) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 320 + randomInt(100, 200));
    reportStep('map_interacting', { action: 'Lướt đọc bài viết & sản phẩm trên website Derma', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await waitWithinBudget(3500 + randomInt(1500, 3500), deadline);

    // If more than 35s remaining, click into product or blog link
    if (remainingMs(deadline) > 35000 && Math.random() < 0.35) {
      const links = page.locator('a[href*="/san-pham/"], a[href*="/dich-vu/"], a[href*="/bai-viet/"], .product-title a, article a, h3.entry-title a');
      const count = await links.count();
      if (count > 0) {
        const idx = Math.floor(Math.random() * Math.min(count, 8));
        console.log(`[map-stage4] Navigating to article/product #${idx}...`);
        await links.nth(idx).click({ force: true }).catch(() => {});
        await wait(3500);
      }
    }
  }

  await waitWithinBudget(remainingMs(deadline), deadline);
  console.log('[map] Full 4-Stage Profile Engagement finished successfully!');
  reportStep('map_done', 'Hoàn tất trọn vẹn 4 giai đoạn Google Map & Website');
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
