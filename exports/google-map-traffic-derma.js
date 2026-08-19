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

// STRICT Matcher: find button/card belonging exclusively to "Khải Hoàn Skincare"
async function findAndClickTargetCardScoped(actionType) {
  return await page.evaluate((type) => {
    // Collect all place cards, knowledge panels, search cards
    const cards = Array.from(document.querySelectorAll('div.VkpGBb, div.rllt__details, div[data-cid], g-card, div.I6TXqe, div.g, div[data-attrid]'));
    
    let targetCard = null;
    for (const card of cards) {
      const text = (card.innerText || '').toLowerCase();
      // Must contain 'khải hoàn' AND relevant business cues
      if (text.includes('khải hoàn') && (text.includes('skincare') || text.includes('spa') || text.includes('nhà thuốc') || text.includes('01 vạn thủy tú') || text.includes('vạn thủy tú') || text.includes('phan thiết'))) {
        targetCard = card;
        break;
      }
    }

    if (!targetCard) {
      // Check for standalone knowledge panel
      const kp = document.querySelector('div[data-attrid*="title"], div.kp-wholepage');
      if (kp && (kp.innerText || '').toLowerCase().includes('khải hoàn')) {
        targetCard = kp;
      }
    }

    if (!targetCard) return { success: false, reason: 'not_found' };

    const cardName = targetCard.innerText.split('\n')[0].trim();

    if (type === 'directions') {
      // Look for Directions button ONLY inside this matched target card
      const btn = targetCard.querySelector('a[href*="maps/dir"], a:has-text("Chỉ đường"), button:has-text("Chỉ đường"), [data-value*="Directions"], [aria-label*="Chỉ đường"]') ||
                  targetCard.parentElement?.querySelector('a:has-text("Chỉ đường"), button:has-text("Chỉ đường")');
      if (btn) {
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return { success: true, clicked: 'directions', name: cardName };
      }
    } else if (type === 'website') {
      // Look for Website button ONLY inside this matched target card
      const btn = targetCard.querySelector('a[href*="khaihoanderma.com"], a:has-text("Trang web"), button:has-text("Trang web"), [data-value*="Website"], [aria-label*="Trang web"]') ||
                  targetCard.parentElement?.querySelector('a:has-text("Trang web"), button:has-text("Trang web")');
      if (btn) {
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return { success: true, clicked: 'website', name: cardName };
      }
    } else {
      // Click the card title itself
      const clickable = targetCard.querySelector('[role="heading"], a, div.dbg0pd') || targetCard;
      clickable.scrollIntoView({ block: 'center' });
      clickable.click();
      return { success: true, clicked: 'card', name: cardName };
    }

    return { success: false, reason: 'button_not_found', name: cardName };
  }, actionType);
}

async function checkAndHandleSingleCardDirectly(config) {
  // Check if Khải Hoàn Skincare card exists directly on search page
  const testCheck = await findAndClickTargetCardScoped('check');
  if (!testCheck || !testCheck.name || !testCheck.name.toLowerCase().includes('khải hoàn')) {
    return false;
  }

  console.log(`[map] STRICT MATCH: Found target card on search page: "${testCheck.name}"`);
  reportStep('map_found', `Đã tìm thấy: ${testCheck.name}`);

  const dwellSeconds = randomInt(
    Number(param('mapDwellMinSeconds') || config.mapDwellMinSeconds),
    Number(param('mapDwellMaxSeconds') || config.mapDwellMaxSeconds)
  );
  const deadline = Date.now() + dwellSeconds * 1000;
  const startMs = Date.now();

  console.log(`[map-single] Starting single-card interaction for ${dwellSeconds} seconds (~${Math.round(dwellSeconds/60)} minutes)...`);

  // --- PHASE 1: Directions & Map Navigation (60 - 90s) ---
  if (remainingMs(deadline) > 60000) {
    console.log('[map-single] Phase 1: Clicking scoped "Chỉ đường" for Khải Hoàn Skincare...');
    const dirResult = await findAndClickTargetCardScoped('directions');
    
    if (dirResult && dirResult.success) {
      reportStep('map_interacting', { action: 'Xem bản đồ & tuyến đường Chỉ đường', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await wait(3000);

      // Pan & Zoom map around Phan Thiết
      for (let s = 0; s < 8; s++) {
        if (remainingMs(deadline) <= 90000) break;
        await moveMouseNaturally();
        await safeMouseWheel(0, randomInt(-250, 250));
        reportStep('map_interacting', { action: 'Lướt xem bản đồ Phan Thiết', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await waitWithinBudget(4000 + randomInt(2000, 4000), deadline);
      }
    }
  }

  // --- PHASE 2: Return & Explore Place Details / Reviews (45 - 60s) ---
  if (remainingMs(deadline) > 60000) {
    console.log('[map-single] Phase 2: Exploring Place details, photos, and reviews...');
    reportStep('map_interacting', { action: 'Xem chi tiết đánh giá & ảnh Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    
    await page.goBack().catch(() => {});
    await wait(2500);

    for (let s = 0; s < 5; s++) {
      if (remainingMs(deadline) <= 60000) break;
      await moveMouseNaturally();
      await safeMouseWheel(0, 300 + randomInt(100, 250));
      reportStep('map_interacting', { action: 'Đọc đánh giá 5 sao của khách hàng', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await waitWithinBudget(3500 + randomInt(1500, 3000), deadline);
    }
  }

  // --- PHASE 3: Website Deep Browsing (khaihoanderma.com) (90 - 150s) ---
  if (remainingMs(deadline) > 30000) {
    console.log('[map-single] Phase 3: Clicking scoped "Trang web" for Khải Hoàn Skincare...');
    reportStep('map_interacting', { action: 'Bấm nút "Trang web" vào khaihoanderma.com', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    
    const webResult = await findAndClickTargetCardScoped('website');
    if (!webResult || !webResult.success) {
      await page.goto('https://khaihoanderma.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    await wait(4000 + randomInt(1000, 3000));

    // Deep dwell on website: scroll home, visit products
    while (remainingMs(deadline) > 15000) {
      await moveMouseNaturally();
      await safeMouseWheel(0, 350 + randomInt(100, 250));
      reportStep('map_interacting', { action: 'Đọc bài viết & xem sản phẩm trên web', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await waitWithinBudget(4000 + randomInt(2000, 4000), deadline);

      if (remainingMs(deadline) > 45000 && Math.random() < 0.3) {
        const productLinks = page.locator('a[href*="/san-pham/"], a[href*="/dich-vu/"], a[href*="/bai-viet/"], .product-title a, article a');
        const count = await productLinks.count();
        if (count > 0) {
          const pickIndex = Math.floor(Math.random() * Math.min(count, 8));
          console.log(`[map-single-web] Navigating to product link #${pickIndex}...`);
          await productLinks.nth(pickIndex).click({ force: true }).catch(() => {});
          await wait(4000);
        }
      }
    }
  }

  await waitWithinBudget(remainingMs(deadline), deadline);
  console.log('[map-single] Finished single-card interaction successfully!');
  reportStep('map_done', 'Hoàn tất tương tác Google Map & Trang web');
  return { found: true, directCard: true };
}

async function findAndOpenMapProfile(config) {
  console.log('[map] Looking for Google Maps Local Pack or "Doanh nghiệp khác"...');
  reportStep('map_search', 'Đang tìm kiếm Profile Google Map...');

  // 0. Strict check: Single local card / Knowledge Panel on search page
  const singleCardResult = await checkAndHandleSingleCardDirectly(config);
  if (singleCardResult && singleCardResult.directCard) {
    return singleCardResult;
  }

  // 1. Click "Doanh nghiệp khác >" (More places) to open full list
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

  // 2. Search inside Local Finder / Places View (Scan pages 1 -> 5)
  const maxPages = 5;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    console.log(`[map] Scanning Places list strictly (Page ${pageIndex}/${maxPages})...`);
    reportStep('map_scanning', `Đang tìm Map trang ${pageIndex}...`);

    for (let scrollStep = 0; scrollStep < 5; scrollStep++) {
      await moveMouseNaturally();
      await safeMouseWheel(0, 350 + randomInt(100, 300));
      await wait(800 + randomInt(300, 700));
    }

    const foundTarget = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb'));
      for (let i = 0; i < cards.length; i++) {
        const text = (cards[i].innerText || '').toLowerCase();
        // STRICT check: MUST contain "khải hoàn"
        if (text.includes('khải hoàn') && (text.includes('skincare') || text.includes('spa') || text.includes('nhà thuốc') || text.includes('vạn thủy tú') || text.includes('phan thiết'))) {
          cards[i].scrollIntoView({ block: 'center' });
          cards[i].click();
          return { found: true, index: i, name: cards[i].innerText.split('\n')[0] };
        }
      }
      return { found: false };
    });

    if (foundTarget && foundTarget.found) {
      console.log(`[map] STRICT TARGET FOUND & CLICKED: "${foundTarget.name}" on page ${pageIndex}!`);
      reportStep('map_found', `Đã tìm thấy Map: ${foundTarget.name}! Đang mở chi tiết...`);
      await wait(3500 + randomInt(500, 1500));
      return { found: true, directCard: false };
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

  // 3. Fallback: Search directly for brand on Google Maps
  console.log('[map] Fallback: Searching exact brand name "Nhà thuốc Khải Hoàn Skincare Phan Thiết"...');
  const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
  if (await isVisibleSafe(searchInput)) {
    await searchInput.click();
    await wait(400);
    await searchInput.fill(config.targetBusinessName + ' ' + config.targetLocationKeyword);
    await searchInput.press('Enter');
    await wait(4000);

    const directResult = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('div[role="heading"], div.rllt__details, div.VkpGBb, g-card'));
      for (const el of candidates) {
        const text = (el.innerText || '').toLowerCase();
        if (text.includes('khải hoàn')) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return true;
        }
      }
      return false;
    });

    if (directResult) {
      await wait(3500);
      return { found: true, directCard: false };
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
    reportStep('map_interacting', { action: 'Xem địa chỉ, giờ mở cửa & hotline', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await waitWithinBudget(3000 + randomInt(1500, 3000), deadline);
  }

  // 2. Interacting with Top Action Buttons (Website, Directions, Save, Share, Call) (45 - 60s)
  if (remainingMs(deadline) > 60000) {
    const actionChoices = ['directions', 'share', 'save', 'website_hover', 'call_hover'];
    const chosenAction = actionChoices[Math.floor(Math.random() * actionChoices.length)];
    console.log(`[map-interaction] 2. Performing top action button: ${chosenAction}...`);

    if (chosenAction === 'directions') {
      const dirBtn = page.locator('button:has-text("Directions"), button:has-text("Đường đi"), a:has-text("Directions"), a:has-text("Đường đi"), [data-value*="Directions"], [aria-label*="Đường đi"]').first();
      if (await isVisibleSafe(dirBtn)) {
        await dirBtn.scrollIntoViewIfNeeded().catch(() => {});
        await wait(500);
        await dirBtn.click({ force: true }).catch(() => {});
        console.log('[map-interaction] Clicked "Directions" / "Đường đi" button!');
        reportStep('map_interacting', { action: 'Xem chỉ đường trên bản đồ', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        
        for (let ds = 0; ds < 4; ds++) {
          if (remainingMs(deadline) <= 40000) break;
          await moveMouseNaturally();
          await safeMouseWheel(0, randomInt(-200, 200));
          await waitWithinBudget(4000 + randomInt(1500, 3000), deadline);
        }
        await page.keyboard.press('Escape').catch(() => {});
        await waitWithinBudget(2000, deadline);
      }
    } else if (chosenAction === 'share') {
      const shareBtn = page.locator('button:has-text("Share"), button:has-text("Chia sẻ"), [aria-label*="Chia sẻ"]').first();
      if (await isVisibleSafe(shareBtn)) {
        await shareBtn.click({ force: true }).catch(() => {});
        reportStep('map_interacting', { action: 'Mở popup Chia sẻ địa điểm', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await waitWithinBudget(4000 + randomInt(1000, 2000), deadline);
        await page.keyboard.press('Escape').catch(() => {});
        await waitWithinBudget(1500, deadline);
      }
    } else if (chosenAction === 'save') {
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Lưu"), [aria-label*="Lưu"]').first();
      if (await isVisibleSafe(saveBtn)) {
        const box = await saveBtn.boundingBox().catch(() => null);
        if (box) {
          await safeMouseMove(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
          await waitWithinBudget(3500, deadline);
        }
      }
    } else if (chosenAction === 'website_hover') {
      const webBtn = page.locator('button:has-text("Website"), button:has-text("Trang web"), a:has-text("Website"), a:has-text("Trang web"), [aria-label*="Trang web"]').first();
      if (await isVisibleSafe(webBtn)) {
        const box = await webBtn.boundingBox().catch(() => null);
        if (box) {
          await safeMouseMove(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
          await waitWithinBudget(3500, deadline);
        }
      }
    }
  }

  // 3. Check Services section (Dịch vụ) (30 - 45s)
  if (remainingMs(deadline) > 50000) {
    console.log('[map-interaction] 3. Checking Services (Dịch vụ) section...');
    reportStep('map_interacting', { action: 'Xem bảng Dịch vụ chăm sóc da mụn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    const servicesRow = page.locator('div:has-text("Services:"), div:has-text("Dịch vụ:"), [aria-label*="Dịch vụ"]').first();
    if (await isVisibleSafe(servicesRow)) {
      await servicesRow.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await servicesRow.click({ force: true }).catch(() => {});
      await waitWithinBudget(5000 + randomInt(2000, 4000), deadline);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // 4. View Photos tab / gallery (Ảnh) (60 - 80s)
  if (remainingMs(deadline) > 45000) {
    console.log('[map-interaction] 4. Checking Photos tab / gallery...');
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

  // 5. View Reviews tab / More Google reviews (Bài đánh giá) (60 - 80s)
  if (remainingMs(deadline) > 30000) {
    console.log('[map-interaction] 5. Checking Reviews tab & customer reviews...');
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

  // 6. Return to Overview (Tổng quan) and check popular times / opening hours (30s)
  if (remainingMs(deadline) > 10000) {
    console.log('[map-interaction] 6. Returning to Overview tab...');
    reportStep('map_interacting', { action: 'Xem biểu đồ Giờ đông khách trong ngày', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    
    const overviewTab = page.locator('button:has-text("Overview"), button:has-text("Tổng quan"), div[role="tab"]:has-text("Tổng quan")').first();
    if (await isVisibleSafe(overviewTab)) {
      await overviewTab.click({ force: true }).catch(() => {});
      await waitWithinBudget(2000, deadline);
    }

    await safeMouseWheel(0, -600);
    await waitWithinBudget(2500 + randomInt(1000, 2000), deadline);
    await safeMouseWheel(0, 350);
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
  const foundResult = await findAndOpenMapProfile(config);
  const isFound = Boolean(foundResult && (foundResult === true || foundResult.found));
  
  if (isFound) {
    if (!foundResult || !foundResult.directCard) {
      await interactWithMapProfile(config);
    }
  } else {
    console.warn('[map] Warning: Target Map Profile was not found in search results.');
    reportStep('map_not_found', 'Không tìm thấy Profile Map trong kết quả');
    await wait(10000);
  }

  const output = {
    keyword,
    targetBusinessName: config.targetBusinessName,
    found: isFound,
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
