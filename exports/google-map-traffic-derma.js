const DEFAULTS = {
  keywordFilePath: 'C:\\Users\\Admin\\Desktop\\key map google.txt',
  targetBusinessName: 'Nhà thuốc Khải Hoàn Skincare',
  targetLocationKeyword: 'Phan Thiết',
  targetAddressSnippet: '01 Vạn Thủy Tú',
  mapDwellMinSeconds: 210,  // ~3.5 minutes
  mapDwellMaxSeconds: 360,  // ~6 minutes
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\google-map-output.json',
};

const PHAN_THIET_LOCATIONS = [
  'Chợ Phan Thiết, Đức Nghĩa, Phan Thiết',
  'Co.opmart Phan Thiết, Nguyễn Tất Thành',
  'Lotte Mart Phan Thiết, KĐT Hùng Vương',
  'Công viên Võ Văn Kiệt, Phú Thủy, Phan Thiết',
  'Bến xe Phan Thiết, Trần Quý Cáp',
  'Bệnh viện Đa khoa tỉnh Bình Thuận, Trường Chinh',
  'Cảng cá Phan Thiết, Đức Thắng',
  'Trường Dục Thanh, Trưng Nhị, Phan Thiết',
  'Bãi biển Đồi Dương, Lê Lợi, Phan Thiết',
  'Đường Trần Hưng Đạo, Phan Thiết',
  'Đường Thủ Khoa Huân, Phan Thiết',
  'Đường Nguyễn Tất Thành, Phan Thiết',
  'Đường Tuyên Quang, Phan Thiết',
  'Đường Lê Hồng Phong, Phan Thiết',
  'Đường Hải Thượng Lãn Ông, Phan Thiết',
  'Đường Mậu Thân, Phan Thiết',
  'Đường Hùng Vương, Phú Thủy, Phan Thiết',
  'Đường Tôn Đức Thắng, Phan Thiết',
  'Đường Nguyễn Thị Minh Khai, Đức Nghĩa',
  'Đường Võ Thị Sáu, Phan Thiết',
  'Khu đô thị Hùng Vương, Phan Thiết',
  'Khu đô thị Bắc Phan Thiết, Xuân An',
  'Cầu Trần Hưng Đạo, Phan Thiết',
  'Chợ Phú Thủy, Lê Văn Phấn, Phan Thiết',
  'Chợ Đồn, Hàm Tiến, Phan Thiết',
  'UBND Thành phố Phan Thiết, Trần Hưng Đạo',
  'Bưu điện Phan Thiết, Lê Hồng Phong',
  'Khách sạn Cà Ty, Phan Thiết',
  'Novaworld Phan Thiết, Tiến Thành',
  'Vòng xoay tượng đài Chiến Thắng, Phan Thiết',
  'Ga Phan Thiết, Phong Nẫm',
  'Đường Huỳnh Thúc Kháng, Mũi Né',
  'Tháp Po Sah Inư, Phú Hài, Phan Thiết',
  'Chợ Lạc Đạo, Phan Thiết',
  'Chợ Thanh Hải, Phan Thiết',
];

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

// Helper: Click STRICTLY inside the opened Khải Hoàn Skincare Drawer
async function clickInsideKhảiHoànDrawer(targetType) {
  return await page.evaluate((type) => {
    const containers = Array.from(document.querySelectorAll('div.I6TXqe, div.m6QErb, div.section-layout, div[role="main"], div.x3Eknd, div.B7vV8c, div.kno-ecr-pt'));
    let targetDrawer = null;
    
    for (const c of containers) {
      const text = (c.innerText || '').toLowerCase();
      if (text.includes('khải hoàn') && (text.includes('đường đi') || text.includes('trang web') || text.includes('01 vạn thủy tú') || text.includes('bài đánh giá') || text.includes('thông tin khác'))) {
        targetDrawer = c;
        break;
      }
    }
    
    if (!targetDrawer) {
      const allText = (document.body.innerText || '').toLowerCase();
      if (allText.includes('khải hoàn skincare') || allText.includes('nhà thuốc khải hoàn')) {
        targetDrawer = document.body;
      }
    }

    if (!targetDrawer) return { success: false, reason: 'drawer_not_found' };

    if (type === 'duong_di') {
      const allButtons = Array.from(targetDrawer.querySelectorAll('button, a, div[role="button"], span'));
      for (const el of allButtons) {
        const label = (el.getAttribute('aria-label') || el.innerText || '').trim();
        if (label === 'Đường đi' || label.startsWith('Đường đi') || el.getAttribute('data-value') === 'Directions') {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, clicked: 'duong_di' };
        }
      }
    } else if (type === 'trang_web') {
      const allButtons = Array.from(targetDrawer.querySelectorAll('button, a, div[role="button"], span'));
      for (const el of allButtons) {
        const label = (el.getAttribute('aria-label') || el.innerText || '').trim();
        if (label === 'Trang web' || label.startsWith('Trang web') || el.getAttribute('href')?.includes('khaihoan') || el.getAttribute('data-value') === 'Website') {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, clicked: 'trang_web' };
        }
      }
    } else if (type === 'dich_vu') {
      const allDivs = Array.from(targetDrawer.querySelectorAll('div, button, a'));
      for (const el of allDivs) {
        const text = (el.innerText || '').toLowerCase();
        if (text.includes('dịch vụ:') || text.includes('cấy tảo xoắn') || text.includes('nặn mụn')) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, clicked: 'dich_vu' };
        }
      }
    } else if (type === 'danh_gia') {
      const allTabs = Array.from(targetDrawer.querySelectorAll('button, a, div[role="tab"], div'));
      for (const el of allTabs) {
        const text = (el.innerText || '').toLowerCase();
        if (text.includes('bài đánh giá') || text.includes('14 bài đánh giá') || text.includes('reviews')) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, clicked: 'danh_gia' };
        }
      }
    } else if (type === 'anh') {
      const img = targetDrawer.querySelector('div.m6QErb button img, div[jsaction*="photo"], button.aoRNLd img, div.lA3jAc img, img');
      if (img) {
        img.scrollIntoView({ block: 'center' });
        img.click();
        return { success: true, clicked: 'anh' };
      }
    }

    return { success: false, reason: 'button_not_found' };
  }, targetType);
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

// Stage 4 Helper: Click randomly into Khải Hoàn web/social links (khaihoanskincare / khaihoanderma / facebook)
async function performWebOrSocialEngagement(deadline, startMs, dwellSeconds) {
  console.log('[map-stage4] Phase 4: Finding Web / Facebook links for Khải Hoàn Skincare...');
  reportStep('map_interacting', { action: 'Tìm liên kết Web & Facebook của Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  // 1. Scroll down the drawer to locate Web/Social links and "Thông tin khác về..."
  for (let s = 0; s < 4; s++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 350 + randomInt(100, 200));
    await wait(1000);
  }

  // Check if "Thông tin khác về..." button is available and click it
  const moreInfoBtn = page.locator('button:has-text("Thông tin khác về"), a:has-text("Thông tin khác về"), [aria-label*="Thông tin khác về"], div[role="button"]:has-text("Thông tin khác")').first();
  if (await isVisibleSafe(moreInfoBtn)) {
    console.log('[map-stage4] Clicking "Thông tin khác về Nhà thuốc Khải Hoàn Skincare"...');
    reportStep('map_interacting', { action: 'Bấm "Thông tin khác về Khải Hoàn"', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await moreInfoBtn.scrollIntoViewIfNeeded().catch(() => {});
    await wait(600);
    await moreInfoBtn.click({ force: true }).catch(() => {});
    await wait(3000 + randomInt(500, 1500));
  }

  // 2. Select target destination (khaihoanskincare.com / khaihoanderma.com / facebook.com)
  const targetChoices = ['khaihoanskincare', 'khaihoanderma', 'facebook'];
  const chosenTarget = targetChoices[Math.floor(Math.random() * targetChoices.length)];
  console.log(`[map-stage4] Chosen target destination: ${chosenTarget}`);

  let clickedLink = false;

  if (chosenTarget === 'khaihoanskincare') {
    reportStep('map_interacting', { action: 'Bấm vào web khaihoanskincare.com', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    const link = page.locator('a[href*="khaihoanskincare.com"]').first();
    if (await isVisibleSafe(link)) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await link.click({ force: true }).catch(() => {});
      clickedLink = true;
    }
  } else if (chosenTarget === 'khaihoanderma') {
    reportStep('map_interacting', { action: 'Bấm vào web khaihoanderma.com', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    const link = page.locator('a[href*="khaihoanderma.com"]').first();
    if (await isVisibleSafe(link)) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await link.click({ force: true }).catch(() => {});
      clickedLink = true;
    }
  } else if (chosenTarget === 'facebook') {
    reportStep('map_interacting', { action: 'Bấm vào Fanpage Facebook Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    const link = page.locator('a[href*="facebook.com"][href*="khaihoan"], a:has-text("Facebook · Nhà Thuốc Khải Hoàn"), a:has-text("Nhà Thuốc Khải Hoàn - Khải Hoàn Skincare")').first();
    if (await isVisibleSafe(link)) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await link.click({ force: true }).catch(() => {});
      clickedLink = true;
    }
  }

  // Fallback 1: Click any available Khải Hoàn domain link
  if (!clickedLink) {
    const fallbackLink = page.locator('a[href*="khaihoanskincare.com"], a[href*="khaihoanderma.com"], a[href*="facebook.com"][href*="khaihoan"]').first();
    if (await isVisibleSafe(fallbackLink)) {
      await fallbackLink.scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await fallbackLink.click({ force: true }).catch(() => {});
      clickedLink = true;
    }
  }

  // Fallback 2: Direct navigation if click failed
  if (!clickedLink) {
    const fallbackUrls = [
      'https://khaihoanskincare.com/',
      'https://khaihoanderma.com/',
      'https://www.facebook.com/nhathuockhaihoan/',
    ];
    const url = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
    console.log(`[map-stage4] Direct fallback navigation to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  await wait(4500 + randomInt(1000, 2000));

  // 3. Deep dwell & browsing inside the target page
  console.log('[map-stage4] Deep browsing on destination page...');
  while (remainingMs(deadline) > 12000) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 320 + randomInt(100, 200));
    const currentUrl = await page.url().catch(() => '');
    const siteLabel = currentUrl.includes('facebook') ? 'Fanpage Facebook Khải Hoàn' : (currentUrl.includes('khaihoanskincare') ? 'Web khaihoanskincare.com' : 'Web khaihoanderma.com');
    reportStep('map_interacting', { action: `Lướt đọc ${siteLabel}`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await waitWithinBudget(3500 + randomInt(1500, 3500), deadline);

    // If budget allows and on website, click into 1-2 product/article links
    if (remainingMs(deadline) > 35000 && !currentUrl.includes('facebook') && Math.random() < 0.35) {
      const subLinks = page.locator('a[href*="/san-pham/"], a[href*="/dich-vu/"], a[href*="/bai-viet/"], a[href*="/bang-gia/"], .product-title a, article a, h3 a');
      const count = await subLinks.count();
      if (count > 0) {
        const idx = Math.floor(Math.random() * Math.min(count, 8));
        console.log(`[map-stage4] Navigating to sub-article/product #${idx}...`);
        await subLinks.nth(idx).click({ force: true }).catch(() => {});
        await wait(3500);
      }
    }
  }
}

// FULL 4-STAGE INTERACTION: Đường đi -> Xem Ảnh -> Đọc Đánh giá -> Lướt Web/Social
async function interactWithMapProfile(config) {
  const dwellSeconds = randomInt(
    Number(param('mapDwellMinSeconds') || config.mapDwellMinSeconds),
    Number(param('mapDwellMaxSeconds') || config.mapDwellMaxSeconds)
  );
  const deadline = Date.now() + dwellSeconds * 1000;
  const startMs = Date.now();

  console.log(`[map] Starting comprehensive 4-Stage Profile interaction for ${dwellSeconds}s (~${Math.round(dwellSeconds/60)} mins)...`);

  // ==========================================
  // GIAI ĐOẠN 1: BẤM NÚT "ĐƯỜNG ĐI" & NHẬP VỊ TRÍ PHAN THIẾT RANDOM (45 - 60s)
  // ==========================================
  console.log('[map-stage1] Phase 1: Clicking scoped "Đường đi" button inside Khải Hoàn Profile...');
  reportStep('map_interacting', { action: 'Bấm nút "Đường đi" đến Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  const clickDir = await clickInsideKhảiHoànDrawer('duong_di');
  if (clickDir && clickDir.success) {
    console.log('[map-stage1] Successfully clicked "Đường đi" inside Khải Hoàn drawer!');
    await wait(3000);

    // Pick unique Phan Thiết starting location per profile
    const profileIdNum = Number(param('profileId') || 37);
    const locIndex = Math.abs(profileIdNum - 1) % PHAN_THIET_LOCATIONS.length;
    const startingPoint = PHAN_THIET_LOCATIONS[locIndex];
    console.log(`[map-stage1] Profile ${profileIdNum} selected starting location: "${startingPoint}"`);
    reportStep('map_interacting', { action: `Nhập điểm đi: ${startingPoint.split(',')[0]}`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

    // Fill origin input with human typing
    const originInput = page.locator('div#directions-searchbox-0 input, input[placeholder*="bắt đầu"], input[aria-label*="bắt đầu"], input[placeholder*="Starting point"], input[aria-label*="Starting point"], input.tactile-searchbox-input').first();
    if (await isVisibleSafe(originInput)) {
      await originInput.click();
      await wait(400);
      await originInput.fill('');
      for (const char of startingPoint) {
        await page.keyboard.type(char, { delay: randomInt(35, 75) });
      }
      await wait(600);
      await originInput.press('Enter');
      await wait(2500 + randomInt(500, 1500));

      const suggestion = page.locator('div[role="listbox"] div[role="option"], ul[role="listbox"] li, div.sbtc').first();
      if (await isVisibleSafe(suggestion)) {
        await suggestion.click().catch(() => {});
      } else {
        await page.keyboard.press('Enter').catch(() => {});
      }
      await wait(3500);
    }

    // Pan & view calculated map route from starting location to 01 Vạn Thủy Tú
    for (let ds = 0; ds < 5; ds++) {
      await moveMouseNaturally();
      await safeMouseWheel(0, randomInt(-100, 100));
      reportStep('map_interacting', { action: `Xem lộ trình từ ${startingPoint.split(',')[0]} đến Khải Hoàn`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await wait(4000 + randomInt(1500, 3000));
    }
    
    // Close directions / back to Khải Hoàn profile
    const backBtn = page.locator('button[aria-label*="Quay lại"], button[aria-label*="Back"], button.hYBOP, button[jsaction*="back"], button[aria-label*="Đóng"]').first();
    if (await isVisibleSafe(backBtn)) {
      await backBtn.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await wait(2500);
  }

  // ==========================================
  // GIAI ĐOẠN 2: XEM ALBUM ẢNH CỦA KHẢI HOÀN (45 - 60s)
  // ==========================================
  console.log('[map-stage2] Phase 2: Viewing Photos Album of Khải Hoàn...');
  reportStep('map_interacting', { action: 'Mở Album ảnh cơ sở vật chất & liệu trình', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  await clickInsideKhảiHoànDrawer('anh');
  await wait(3000);

  for (let p = 0; p < 4; p++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 300 + randomInt(100, 200));
    reportStep('map_interacting', { action: `Xem ảnh cơ sở & liệu trình trị mụn (${p+1}/4)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 3: XEM DỊCH VỤ & ĐỌC ĐÁNH GIÁ 5 SAO (40 - 55s)
  // ==========================================
  console.log('[map-stage3] Phase 3: Reading Reviews & Services of Khải Hoàn...');
  reportStep('map_interacting', { action: 'Xem dịch vụ & bài đánh giá 5 sao', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  await clickInsideKhảiHoànDrawer('dich_vu');
  await wait(2500);
  await clickInsideKhảiHoànDrawer('danh_gia');
  await wait(2500);

  for (let r = 0; r < 4; r++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 260 + randomInt(80, 180));
    reportStep('map_interacting', { action: `Đọc nhận xét đánh giá khách hàng (${r+1}/4)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 4: BẤM "THÔNG TIN KHÁC" / KHAIHOANSKINCARE / KHAIHOANDERMA / FACEBOOK (60 - 120s)
  // ==========================================
  await performWebOrSocialEngagement(deadline, startMs, dwellSeconds);

  await waitWithinBudget(remainingMs(deadline), deadline);
  console.log('[map] Full 4-Stage Profile Engagement finished successfully!');
  reportStep('map_done', 'Hoàn tất trọn vẹn 4 giai đoạn Google Map & Web/Social');
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
