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

async function moveMouseNaturally() {
  const x = randomInt(400, 650);
  const y = randomInt(250, 550);
  await safeMouseMove(x, y, { steps: randomInt(8, 16) });
}

// Scroll specifically inside the active Drawer container or page
async function scrollDrawerOrPage(deltaY) {
  try {
    await page.evaluate((dy) => {
      const drawer = document.querySelector('div.I6TXqe, div.m6QErb, div.section-layout, div.x3Eknd, div.B7vV8c, div.kno-ecr-pt');
      if (drawer && typeof drawer.scrollBy === 'function') {
        drawer.scrollBy({ top: dy, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: dy, behavior: 'smooth' });
      }
    }, deltaY);
  } catch {}
  await wait(600);
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
        await btn.click().catch(() => {});
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
  
  try {
    await page.goto('https://www.google.com/?hl=vi&gl=vn', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (gotoErr) {
    console.log('[map] page.goto warning, navigating to direct search URL...');
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=vi&gl=vn`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(3000);
    return;
  }

  await maybeAcceptGoogleConsent();
  await wait(1500);

  console.log(`[map] Searching keyword: "${keyword}"`);
  reportStep('search_keyword', keyword);
  
  const searchInput = page.locator('textarea[name="q"], input[name="q"], input[aria-label*="Tìm kiếm"]').first();
  let inputReady = false;
  for (let i = 0; i < 6; i++) {
    if (await isVisibleSafe(searchInput)) {
      inputReady = true;
      break;
    }
    await wait(1500);
    await maybeAcceptGoogleConsent();
  }

  if (!inputReady) {
    console.log('[map] Search input not found, navigating directly to search result URL...');
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=vi&gl=vn`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(3000);
    return;
  }

  await searchInput.click().catch(() => {});
  await wait(300 + randomInt(100, 300));

  // Natural human typing
  for (const char of keyword) {
    await page.keyboard.type(char, { delay: randomInt(40, 90) });
  }
  await wait(600 + randomInt(200, 600));
  await searchInput.press('Enter').catch(() => {});

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await wait(2500 + randomInt(500, 1500));

  // Check captcha
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (bodyText.includes('unusual traffic') || bodyText.includes('không phải người máy') || bodyText.includes('recaptcha')) {
    throw new Error('Google yêu cầu xác minh CAPTCHA (Cần xoay IP mới)');
  }
}

// Find and click strictly on Khải Hoàn Skincare card to OPEN the Profile Details
async function clickTargetPlaceCardStrictly() {
  try {
    return await page.evaluate(() => {
      try {
        const cards = Array.from(document.querySelectorAll('div[jscontroller] [role="heading"], div.rllt__details, div[data-cid], div.VkpGBb, div.dbg0pd, g-card, div.I6TXqe, div.g, div[role="article"], a[href*="maps/place"]'));
        
        for (const card of cards) {
          const text = (card.innerText || '').toLowerCase();
          if (text.includes('khải hoàn') && (text.includes('skincare') || text.includes('spa') || text.includes('nhà thuốc') || text.includes('vạn thủy tú') || text.includes('phan thiết'))) {
            const clickable = card.querySelector('[role="heading"], a, div.dbg0pd, span') || card;
            if (clickable && typeof clickable.scrollIntoView === 'function') {
              clickable.scrollIntoView({ block: 'center' });
            }
            if (clickable && typeof clickable.click === 'function') {
              clickable.click();
            }
            return { success: true, name: (card.innerText || '').split('\n')[0].trim() };
          }
        }
        return { success: false };
      } catch (innerErr) {
        return { success: false, error: String(innerErr) };
      }
    });
  } catch (err) {
    console.log('[map] clickTargetPlaceCardStrictly safe catch:', err.message || String(err));
    return { success: false };
  }
}

// Helper: Click STRICTLY inside the opened Khải Hoàn Skincare Drawer / Place Panel
async function clickInsideKhảiHoànDrawer(targetType) {
  try {
    return await page.evaluate((type) => {
      try {
        const containers = Array.from(document.querySelectorAll('div.I6TXqe, div.m6QErb, div.section-layout, div[role="main"], div.x3Eknd, div.B7vV8c, div.kno-ecr-pt, div.pane'));
        let targetDrawer = null;
        
        for (const c of containers) {
          const text = (c.innerText || '').toLowerCase();
          if (text.includes('khải hoàn') && (text.includes('đường đi') || text.includes('trang web') || text.includes('01 vạn thủy tú') || text.includes('bài đánh giá') || text.includes('ảnh') || text.includes('thông tin khác'))) {
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
              if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
              el.click();
              return { success: true, clicked: 'duong_di' };
            }
          }
        } else if (type === 'trang_web') {
          const allButtons = Array.from(targetDrawer.querySelectorAll('button, a, div[role="button"], span'));
          for (const el of allButtons) {
            const label = (el.getAttribute('aria-label') || el.innerText || '').trim();
            if (label === 'Trang web' || label.startsWith('Trang web') || el.getAttribute('href')?.includes('khaihoan') || el.getAttribute('data-value') === 'Website') {
              if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
              el.click();
              return { success: true, clicked: 'trang_web' };
            }
          }
        } else if (type === 'dich_vu') {
          const allDivs = Array.from(targetDrawer.querySelectorAll('div, button, a'));
          for (const el of allDivs) {
            const text = (el.innerText || '').toLowerCase();
            if (text.includes('dịch vụ:') || text.includes('cấy tảo xoắn') || text.includes('nặn mụn')) {
              if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
              el.click();
              return { success: true, clicked: 'dich_vu' };
            }
          }
        } else if (type === 'danh_gia') {
          const allTabs = Array.from(targetDrawer.querySelectorAll('button, a, div[role="tab"], div'));
          for (const el of allTabs) {
            const text = (el.innerText || '').toLowerCase();
            if (text.includes('bài đánh giá') || text.includes('14 bài đánh giá') || text.includes('reviews')) {
              if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
              el.click();
              return { success: true, clicked: 'danh_gia' };
            }
          }
        } else if (type === 'anh') {
          const img = targetDrawer.querySelector('button[aria-label*="Ảnh"], div[role="tab"]:has-text("Ảnh"), div.m6QErb button img, div[jsaction*="photo"], button.aoRNLd img, div.lA3jAc img, img');
          if (img) {
            if (typeof img.scrollIntoView === 'function') img.scrollIntoView({ block: 'center' });
            img.click();
            return { success: true, clicked: 'anh' };
          }
        }

        return { success: false, reason: 'button_not_found' };
      } catch (innerErr) {
        return { success: false, error: String(innerErr) };
      }
    }, targetType);
  } catch (err) {
    console.log('[map] clickInsideKhảiHoànDrawer safe catch:', err.message || String(err));
    return { success: false };
  }
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

  // 2. Scroll down slightly to locate "Các địa điểm khác" / "Doanh nghiệp khác" button
  console.log('[map] Scrolling down to find "Các địa điểm khác" / "Doanh nghiệp khác" button...');
  for (let s = 0; s < 3; s++) {
    await moveMouseNaturally();
    await safeMouseWheel(0, 260 + randomInt(50, 100));
    await wait(500);
  }

  const morePlacesSelectors = [
    'a:has-text("Các địa điểm khác")',
    'button:has-text("Các địa điểm khác")',
    'div[role="button"]:has-text("Các địa điểm khác")',
    'span:has-text("Các địa điểm khác")',
    'a:has-text("Doanh nghiệp khác")',
    'button:has-text("Doanh nghiệp khác")',
    'div[role="button"]:has-text("Doanh nghiệp khác")',
    'span:has-text("Doanh nghiệp khác")',
    'a:has-text("Địa điểm khác")',
    'button:has-text("Địa điểm khác")',
    'a:has-text("Xem thêm địa điểm")',
    'button:has-text("Xem thêm địa điểm")',
    'a:has-text("Xem tất cả địa điểm")',
    'button:has-text("Xem tất cả địa điểm")',
    'g-more-link a',
    'g-more-link button',
    'g-more-link',
    'a[data-async-trigger*="local"]',
    'a[data-async-context*="local"]',
    'a:has-text("More businesses")',
    'a:has-text("More places")',
  ];

  let clickedMore = false;
  for (const selector of morePlacesSelectors) {
    const btn = page.locator(selector).first();
    if (await isVisibleSafe(btn)) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await wait(500);
      await btn.click({ force: true }).catch(() => {});
      clickedMore = true;
      console.log(`[map] Clicked more places via selector: ${selector}`);
      break;
    }
  }

  if (!clickedMore) {
    try {
      clickedMore = await page.evaluate(() => {
        const allLinks = Array.from(document.querySelectorAll('a, button, div[role="button"], span, g-more-link'));
        for (const el of allLinks) {
          const t = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
          if (
            t.includes('các địa điểm khác') ||
            t.includes('doanh nghiệp khác') ||
            t.includes('địa điểm khác') ||
            t.includes('xem thêm địa điểm') ||
            t.includes('xem tất cả địa điểm') ||
            t.includes('more businesses') ||
            t.includes('more places')
          ) {
            const clickable = el.closest('a, button, div[role="button"], g-more-link') || el;
            if (typeof clickable.scrollIntoView === 'function') clickable.scrollIntoView({ block: 'center' });
            clickable.click();
            return true;
          }
        }
        return false;
      });
    } catch {}
  }

  await wait(3500 + randomInt(500, 1500));

  // 3. Search inside Local Finder / Places View (Scan pages 1 -> 5)
  const maxPages = 5;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    console.log(`[map] Scanning Places list strictly (Page ${pageIndex}/${maxPages})...`);
    reportStep('map_scanning', `Đang tìm Map trang ${pageIndex}...`);

    for (let scrollStep = 0; scrollStep < 5; scrollStep++) {
      await moveMouseNaturally();
      await scrollDrawerOrPage(300 + randomInt(100, 200));
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
      await nextBtn.click({ force: true }).catch(() => {});
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
    await searchInput.click().catch(() => {});
    await wait(400);
    await searchInput.fill(config.targetBusinessName + ' ' + config.targetLocationKeyword).catch(() => {});
    await searchInput.press('Enter').catch(() => {});
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

// Stage 4 Helper: Click actively into Khải Hoàn web/social links (khaihoanderma / khaihoanskincare / facebook) and deep browse
async function performWebOrSocialEngagement(deadline, startMs, dwellSeconds) {
  console.log('[map-stage4] Phase 4: Navigating and browsing Khải Hoàn Web / Social...');
  reportStep('map_interacting', { action: 'Mở website & mạng xã hội của Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  // 1. Scroll drawer down to show Web/Social section
  for (let s = 0; s < 4; s++) {
    await moveMouseNaturally();
    await scrollDrawerOrPage(350 + randomInt(100, 200));
    await wait(800);
  }

  // 2. Click "Thông tin khác về Nhà thuốc Khải Hoàn..." or specific web links
  const targetChoices = ['khaihoanderma', 'khaihoanskincare', 'facebook'];
  const chosenTarget = targetChoices[Math.floor(Math.random() * targetChoices.length)];
  console.log(`[map-stage4] Target destination: ${chosenTarget}`);

  let clickedLink = false;

  // Try clicking on links directly inside the drawer DOM
  try {
    clickedLink = await page.evaluate((target) => {
      const anchors = Array.from(document.querySelectorAll('a[href], div[role="button"], button'));
      
      // Look for destination matching target
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = (a.innerText || '').toLowerCase();
        if (target === 'khaihoanderma' && (href.includes('khaihoanderma') || text.includes('khải hoàn derma'))) {
          a.click();
          return true;
        }
        if (target === 'khaihoanskincare' && (href.includes('khaihoanskincare') || text.includes('khaihoanskincare') || text.includes('khải hoàn skincare'))) {
          a.click();
          return true;
        }
        if (target === 'facebook' && (href.includes('NhaThuocKhaiHoanPT') || href.includes('facebook.com') && text.includes('khải hoàn'))) {
          a.click();
          return true;
        }
      }

      // If specific link not found, try clicking "Thông tin khác về..." or "Trang web"
      for (const a of anchors) {
        const text = (a.innerText || a.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('thông tin khác') || text === 'trang web' || text.startsWith('trang web')) {
          a.click();
          return true;
        }
      }
      return false;
    }, chosenTarget);
  } catch {}

  await wait(4000);

  // Check if navigation actually occurred or if we need direct URL goto
  const currentUrl = page.url();
  console.log('[map-stage4] Current URL after click:', currentUrl);

  if (currentUrl.includes('google.com/search') || currentUrl.includes('google.com/maps')) {
    // If still on Google search, navigate directly to destination
    const targetUrl = chosenTarget === 'khaihoanderma' 
      ? 'https://khaihoanderma.com/'
      : (chosenTarget === 'khaihoanskincare' ? 'https://khaihoanskincare.com/' : 'https://www.facebook.com/NhaThuocKhaiHoanPT/');
    
    console.log(`[map-stage4] Navigating directly to: ${targetUrl}`);
    reportStep('map_interacting', { action: `Mở trực tiếp: ${targetUrl}`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
    await wait(4000);
  }

  // 3. DEEP DWELL & PRODUCT BROWSING ON DESTINATION WEBSITE
  const activeUrl = page.url();
  console.log('[map-stage4] Deep browsing active page:', activeUrl);

  // Step 3A: Browse Homepage / Landing Page (25 - 40s)
  for (let hs = 0; hs < 4; hs++) {
    if (remainingMs(deadline) <= 15000) break;
    await moveMouseNaturally();
    await scrollDrawerOrPage(320 + randomInt(80, 200));
    const label = activeUrl.includes('facebook') ? 'Fanpage Facebook Khải Hoàn' : (activeUrl.includes('khaihoanskincare') ? 'Web khaihoanskincare.com' : 'Web khaihoanderma.com');
    reportStep('map_interacting', { action: `Lướt xem trang chủ ${label}`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await waitWithinBudget(3500 + randomInt(1500, 3000), deadline);
  }

  // Step 3B: Click into 1st Product / Treatment Service Detail Page (40 - 60s)
  if (!activeUrl.includes('facebook') && remainingMs(deadline) > 30000) {
    console.log('[map-stage4] Clicking 1st product/article on website...');
    const productSelectors = [
      'a[href*="/san-pham/"]',
      'a[href*="/product/"]',
      'a[href*="/dich-vu/"]',
      'a[href*="/bang-gia/"]',
      '.product-title a',
      '.woocommerce-loop-product__link',
      'article a',
      'h3.entry-title a',
      '.wp-block-post-title a'
    ];
    
    let clickedProduct = false;
    for (const pSel of productSelectors) {
      const pLinks = page.locator(pSel);
      const count = await pLinks.count();
      if (count > 0) {
        const pIdx = Math.floor(Math.random() * Math.min(count, 6));
        const chosenLink = pLinks.nth(pIdx);
        const pText = (await chosenLink.innerText().catch(() => '')) || 'sản phẩm';
        reportStep('map_interacting', { action: `Mở xem chi tiết: ${pText.trim().substring(0, 30)}...`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await chosenLink.scrollIntoViewIfNeeded().catch(() => {});
        await wait(600);
        await chosenLink.click({ force: true }).catch(() => {});
        clickedProduct = true;
        await wait(4000 + randomInt(1000, 2000));
        break;
      }
    }

    // Scroll & read product details (mô tả, thành phần, công dụng, giá)
    if (clickedProduct) {
      for (let ps = 0; ps < 5; ps++) {
        if (remainingMs(deadline) <= 20000) break;
        await moveMouseNaturally();
        await scrollDrawerOrPage(280 + randomInt(80, 180));
        reportStep('map_interacting', { action: 'Đọc công dụng, thành phần & giá sản phẩm', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
        await waitWithinBudget(4000 + randomInt(1500, 3000), deadline);
      }

      // Step 3C: Click into 2nd Related Product if time permits (30 - 50s)
      if (remainingMs(deadline) > 30000) {
        console.log('[map-stage4] Clicking 2nd related product on website...');
        const relatedLinks = page.locator('.related a[href*="/san-pham/"], .up-sells a[href*="/san-pham/"], a[href*="/san-pham/"], .product-title a');
        const rCount = await relatedLinks.count();
        if (rCount > 0) {
          const rIdx = Math.floor(Math.random() * Math.min(rCount, 4));
          const rLink = relatedLinks.nth(rIdx);
          const rText = (await rLink.innerText().catch(() => '')) || 'sản phẩm liên quan';
          reportStep('map_interacting', { action: `Xem sản phẩm liên quan: ${rText.trim().substring(0, 30)}...`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
          await rLink.scrollIntoViewIfNeeded().catch(() => {});
          await wait(600);
          await rLink.click({ force: true }).catch(() => {});
          await wait(4000);

          while (remainingMs(deadline) > 10000) {
            await moveMouseNaturally();
            await scrollDrawerOrPage(300 + randomInt(80, 180));
            reportStep('map_interacting', { action: 'Đọc chi tiết sản phẩm điều trị da', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
            await waitWithinBudget(3500 + randomInt(1500, 3000), deadline);
          }
        }
      }
    }
  }

  // Complete remaining budget with smooth human scrolling
  while (remainingMs(deadline) > 10000) {
    await moveMouseNaturally();
    await scrollDrawerOrPage(250 + randomInt(50, 150));
    await waitWithinBudget(3000, deadline);
  }
}

// Click specifically inside the Khải Hoàn detail drawer (yellow circle) to focus before scrolling
async function focusAndActivateDrawer() {
  console.log('[map] Moving mouse and clicking inside Khải Hoàn Drawer to focus and activate scrolling...');
  reportStep('map_interacting', { action: 'Rê chuột & kích hoạt bảng thông tin Khải Hoàn' });
  
  try {
    const box = await page.evaluate(() => {
      const drawer = document.querySelector('div.I6TXqe, div.m6QErb, div.section-layout, div.x3Eknd, div.B7vV8c, div.kno-ecr-pt');
      if (drawer) {
        const rect = drawer.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + Math.min(rect.height / 2, 380)),
          found: true
        };
      }
      return { x: 480, y: 380, found: false };
    });

    // Naturally move mouse into the yellow-circled area
    await safeMouseMove(box.x, box.y, { steps: randomInt(10, 18) });
    await wait(300);
    // Click on safe blank space inside the drawer to focus (without triggering links)
    await page.mouse.click(box.x, box.y).catch(() => {});
    await wait(800);
  } catch {}
}

// FULL 4-STAGE INTERACTION: Rê chuột kích hoạt Drawer -> Lướt tổng quan -> Đường đi -> Xem Ảnh -> Đọc Đánh giá -> Lướt Web/Social
async function interactWithMapProfile(config) {
  const dwellSeconds = randomInt(
    Number(param('mapDwellMinSeconds') || config.mapDwellMinSeconds),
    Number(param('mapDwellMaxSeconds') || config.mapDwellMaxSeconds)
  );
  const deadline = Date.now() + dwellSeconds * 1000;
  const startMs = Date.now();

  console.log(`[map] Starting comprehensive 4-Stage Profile interaction for ${dwellSeconds}s (~${Math.round(dwellSeconds/60)} mins)...`);

  // BƯỚC 0: Rê chuột & click vào khu vực khoanh tròn màu vàng (bảng thông tin Profile) để kích hoạt lướt chuột
  await focusAndActivateDrawer();

  // Lướt xem tổng quan thông tin, biểu đồ giờ cao điểm, địa chỉ 01 Vạn Thủy Tú (20 - 30s)
  for (let ov = 0; ov < 3; ov++) {
    await moveMouseNaturally();
    await scrollDrawerOrPage(280 + randomInt(80, 150));
    reportStep('map_interacting', { action: `Xem thông tin giờ mở cửa, địa chỉ 01 Vạn Thủy Tú (${ov+1}/3)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3000 + randomInt(1000, 2000));
  }
  await scrollDrawerOrPage(-1500);
  await wait(1000);

  // ==========================================
  // GIAI ĐOẠN 1: BẤM NÚT "ĐƯỜNG ĐI" & NHẬP VỊ TRÍ PHAN THIẾT (45 - 60s)
  // ==========================================
  console.log('[map-stage1] Phase 1: Clicking scoped "Đường đi" button inside Khải Hoàn Profile...');
  reportStep('map_interacting', { action: 'Bấm nút "Đường đi" đến Khải Hoàn', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  // Make sure drawer is scrolled to top first to expose action buttons
  await scrollDrawerOrPage(-2000);
  await wait(1000);

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
      await originInput.click().catch(() => {});
      await wait(400);
      await originInput.fill('').catch(() => {});
      for (const char of startingPoint) {
        await page.keyboard.type(char, { delay: randomInt(35, 75) });
      }
      await wait(600);
      await originInput.press('Enter').catch(() => {});
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
      await scrollDrawerOrPage(randomInt(-100, 100));
      reportStep('map_interacting', { action: `Xem lộ trình từ ${startingPoint.split(',')[0]} đến Khải Hoàn`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
      await wait(4000 + randomInt(1500, 3000));
    }
    
    // Close directions / back to overview
    const backBtn = page.locator('button[aria-label*="Quay lại"], button[aria-label*="Back"], button.hYBOP, button[jsaction*="back"], button[aria-label*="Đóng"]').first();
    if (await isVisibleSafe(backBtn)) {
      await backBtn.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await wait(2500);
  }

  // ==========================================
  // GIAI ĐOẠN 2: XEM ALBUM ẢNH CỦA KHẢI HOÀN (35 - 50s)
  // ==========================================
  console.log('[map-stage2] Phase 2: Viewing Photos Album of Khải Hoàn...');
  reportStep('map_interacting', { action: 'Mở Album ảnh cơ sở vật chất & liệu trình', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
  
  await scrollDrawerOrPage(-1500);
  await wait(800);
  await clickInsideKhảiHoànDrawer('anh');
  await wait(3000);

  for (let p = 0; p < 3; p++) {
    await moveMouseNaturally();
    await scrollDrawerOrPage(300 + randomInt(100, 200));
    reportStep('map_interacting', { action: `Xem ảnh cơ sở & liệu trình trị mụn (${p+1}/3)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 3: XEM DỊCH VỤ & ĐỌC ĐÁNH GIÁ 5 SAO (35 - 50s)
  // ==========================================
  console.log('[map-stage3] Phase 3: Reading Reviews & Services of Khải Hoàn...');
  reportStep('map_interacting', { action: 'Xem dịch vụ & bài đánh giá 5 sao', elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });

  await scrollDrawerOrPage(-1000);
  await wait(800);
  await clickInsideKhảiHoànDrawer('dich_vu');
  await wait(2000);
  await clickInsideKhảiHoànDrawer('danh_gia');
  await wait(2000);

  for (let r = 0; r < 3; r++) {
    await moveMouseNaturally();
    await scrollDrawerOrPage(260 + randomInt(80, 180));
    reportStep('map_interacting', { action: `Đọc nhận xét đánh giá khách hàng (${r+1}/3)`, elapsed: Math.floor((Date.now() - startMs)/1000), total: dwellSeconds });
    await wait(3500 + randomInt(1500, 3000));
  }

  // ==========================================
  // GIAI ĐOẠN 4: BẤM "THÔNG TIN KHÁC" / KHAIHOANDERMA / KHAIHOANSKINCARE / FACEBOOK & LƯỚT SẢN PHẨM (60 - 150s)
  // ==========================================
  await performWebOrSocialEngagement(deadline, startMs, dwellSeconds);

  await waitWithinBudget(remainingMs(deadline), deadline);
  console.log('[map] Full 4-Stage Profile Engagement finished successfully!');
  reportStep('map_done', 'Hoàn tất trọn vẹn 4 giai đoạn Google Map & Web/Social');
}

async function ensureWindowMaximized() {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' }
    });
    await cdp.detach().catch(() => {});
  } catch {
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
    } catch {}
  }
}

async function main() {
  await ensureWindowMaximized();
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

  try {
    const output = {
      keyword,
      targetBusinessName: config.targetBusinessName,
      found: Boolean(found),
      url: page.url(),
      title: await page.title().catch(() => ''),
      finishedAt: new Date().toISOString(),
    };

    console.log('[map] Execution Output:', JSON.stringify(output, null, 2));
    if (omni?.file?.export) {
      await omni.file.export(output, {
        path: config.exportPath,
        format: 'json',
        onConflict: 'overwrite',
      }).catch(() => {});
    }
  } catch {}
}

try {
  await main();
} catch (fatalError) {
  const message = fatalError?.message || String(fatalError);
  console.error('[map-fatal-error]', message);
  reportStep('error', message);
}
