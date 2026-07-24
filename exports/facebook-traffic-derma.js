const DEFAULTS = {
  fbSearchQuery: 'Dược mỹ phẩm-Khải Hoàn Derma',
  targetDomain: 'khaihoanderma.com',
  targetBaseUrl: 'https://khaihoanderma.com/',
  fbWarmupMinSeconds: 60,  // 1 minute
  fbWarmupMaxSeconds: 120, // 2 minutes
  targetWebMinSeconds: 120, // 2 minutes
  targetWebMaxSeconds: 240, // 4 minutes
  exportPath: 'C:\\Users\\Admin\\Desktop\\key_derma\\facebook-traffic-derma-output.json',
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
  const x = randomInt(120, 1080);
  const y = randomInt(120, 620);
  await safeMouseMove(x, y, { steps: randomInt(8, 20) });
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

// ----------------------------------------------------
// Step 1: Facebook Feed Warmup (1 - 2 minutes)
// ----------------------------------------------------
async function watchFacebookStory(activePage, warmupDeadline) {
  try {
    // Scroll to top of feed to see Story tray
    await activePage.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await wait(1500);

    const storyClicked = await activePage.evaluate(() => {
      // Find Story cards in Facebook top tray
      const storyCandidates = Array.from(document.querySelectorAll('a[href*="/stories/"], div[role="button"][aria-label*="story" i], div[role="button"][aria-label*="tin" i], div[role="button"][aria-label*="Story" i], div[role="button"][aria-label*="Tin" i]'));
      for (const card of storyCandidates) {
        const text = (card.textContent || '').trim();
        if (!text.includes('Tạo tin') && !text.includes('Create story') && !text.includes('Tạo Story')) {
          const rect = card.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20 && rect.top >= 0 && rect.top < 450) {
            try {
              card.scrollIntoView({ block: 'center', inline: 'center' });
              card.click();
              return true;
            } catch (e) {}
          }
        }
      }
      return false;
    });

    if (storyClicked) {
      console.log('[fb-warmup] Successfully opened Facebook Story! Watching 8-12 seconds...');
      reportStep('fb_warmup_story', 'Đang mở xem Story trên Facebook...');
      await waitWithinBudget(randomInt(8000, 12000), warmupDeadline);
      await activePage.keyboard.press('Escape').catch(() => {});
      await wait(1500);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookStory error:', err.message || String(err));
  }
  return false;
}

async function watchFacebookVideo(activePage, warmupDeadline) {
  try {
    const videoClicked = await activePage.evaluate(() => {
      const videoEls = Array.from(document.querySelectorAll('video, a[href*="/watch/"], a[href*="/reel/"]'));
      for (const v of videoEls) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 80 && rect.top > 0 && rect.top < window.innerHeight) {
          try {
            v.scrollIntoView({ block: 'center' });
            v.click();
            return true;
          } catch (e) {}
        }
      }
      return false;
    });

    if (videoClicked) {
      console.log('[fb-warmup] Focused on Video/Reel! Watching 10-16 seconds...');
      reportStep('fb_warmup_video', 'Đang tạm dừng xem Video/Reel trên Feed...');
      await waitWithinBudget(randomInt(10000, 16000), warmupDeadline);
      return true;
    }
  } catch (err) {
    console.log('[fb-warmup] watchFacebookVideo error:', err.message || String(err));
  }
  return false;
}

async function warmupFacebookFeed(config, deadline) {
  console.log('[fb-warmup] Navigating to Facebook home...');
  reportStep('fb_warmup_start', 'Mở Facebook và lướt tin ngẫu nhiên...');

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    console.log('[fb-warmup] Navigation error, continuing:', err.message || String(err));
  }
  await wait(3000 + randomInt(0, 2000));

  const targetDurationMs = randomInt(config.fbWarmupMinSeconds, config.fbWarmupMaxSeconds) * 1000;
  const warmupDeadline = Date.now() + Math.min(targetDurationMs, remainingMs(deadline));
  const startedAt = Date.now();

  let actionCount = 0;

  while (remainingMs(warmupDeadline) > 0) {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const totalSec = Math.floor(targetDurationMs / 1000);
    reportStep('fb_warmup_reading', { elapsed: elapsedSec, total: totalSec });

    if (Math.random() < 0.75) await moveMouseNaturally();

    const burstCount = randomInt(2, 3);
    for (let burst = 0; burst < burstCount && remainingMs(warmupDeadline) > 0; burst++) {
      await safeMouseWheel(0, randomInt(250, 500));
      actionCount++;
      await waitWithinBudget(randomInt(900, 1600), warmupDeadline);
    }

    if (Math.random() < 0.18 && remainingMs(warmupDeadline) > 3000) {
      await safeMouseWheel(0, -randomInt(120, 280));
      actionCount++;
    }

    await waitWithinBudget(randomInt(900, 2200), warmupDeadline);
  }

  reportStep('fb_warmup_done', `Đã lướt Facebook Feed liên tục với ${actionCount} lượt cuộn`);
  return { elapsedMs: Date.now() - startedAt, actionCount };
}

// ----------------------------------------------------
// Step 2: Search for Facebook Page
// ----------------------------------------------------
async function searchFacebookPage(query, deadline) {
  console.log(`[fb-search] Searching for Fanpage: "${query}"...`);
  reportStep('fb_search_start', `Tìm kiếm Facebook Page: "${query}"...`);

  try {
    const searchInput = page.locator('input[aria-label*="Search Facebook"], input[aria-label*="Tìm kiếm trên Facebook"], input[placeholder*="Search"], input[type="search"], label[aria-label*="Search"] input, input[aria-label*="Tìm kiếm"]').first();
    
    if (await isVisibleSafe(searchInput)) {
      await searchInput.click().catch(() => {});
      await wait(500);
      try {
        await page.keyboard.type(query, { delay: randomInt(60, 150) });
      } catch (err) {
        await searchInput.fill(query).catch(() => {});
      }
      await wait(800 + randomInt(200, 600));
      await searchInput.press('Enter').catch(() => {});
    } else {
      console.log('[fb-search] Direct search input not found, navigating via URL...');
      await page.goto(`https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    }
  } catch (err) {
    console.log('[fb-search] Search action error, fallback navigation:', err.message || String(err));
    await page.goto(`https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  }

  await wait(4000 + randomInt(0, 2000));
  reportStep('fb_search_results', 'Đang quét kết quả tìm kiếm Page...');

  let pageFound = false;

  try {
    const pageLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const results = [];
      for (const a of anchors) {
        const text = (a.textContent || '').trim();
        const parentText = (a.closest('div[role="article"], div[role="main"] > div') || a.parentElement)?.textContent || '';
        const href = a.href || '';
        if (
          (text.includes('Khải Hoàn Derma') || text.includes('Dược mỹ phẩm-Khải Hoàn')) &&
          href.includes('facebook.com')
        ) {
          results.push({
            href,
            text,
            parentText,
            matchedInfo: parentText.includes('Spa') || parentText.includes('Vạn Thuỷ Tú') || parentText.includes('Phan Thiết') || parentText.includes('Bình Thuận')
          });
        }
      }
      return results;
    });

    console.log(`[fb-search] Found ${pageLinks.length} candidate Page links.`);

    if (pageLinks.length > 0) {
      const bestMatch = pageLinks.find(p => p.matchedInfo) || pageLinks[0];
      console.log('[fb-search] Opening target Fanpage:', bestMatch.href);

      const linkLocator = page.locator(`a[href="${bestMatch.href.replace(/"/g, '\\"')}"]`).first();
      if (await isVisibleSafe(linkLocator)) {
        await linkLocator.scrollIntoViewIfNeeded().catch(() => {});
        await wait(600);
        await linkLocator.click().catch(() => {});
        pageFound = true;
      } else {
        await page.goto(bestMatch.href, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        pageFound = true;
      }
    }
  } catch (err) {
    console.log('[fb-search] Error matching page result:', err.message || String(err));
  }

  if (!pageFound) {
    console.log('[fb-search] Fallback: Navigating directly to Khải Hoàn Derma Fanpage URL...');
    await page.goto('https://www.facebook.com/khaihoanderma', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
  }

  await wait(4000 + randomInt(0, 2000));
  reportStep('fb_page_opened', 'Đã truy cập vào Fanpage Khải Hoàn Derma!');
  return true;
}

function normalizeFacebookPermalink(value) {
  try {
    const parsed = new URL(value, 'https://www.facebook.com/');
    const isFacebook =
      parsed.hostname === 'facebook.com' || parsed.hostname.endsWith('.facebook.com');
    if (!isFacebook || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return '';

    const storyId = parsed.searchParams.get('story_fbid');
    const ownerId = parsed.searchParams.get('id');
    const photoId = parsed.searchParams.get('fbid');
    parsed.hash = '';
    parsed.search = '';
    if (storyId) {
      parsed.searchParams.set('story_fbid', storyId);
      if (ownerId) parsed.searchParams.set('id', ownerId);
    } else if (photoId) {
      parsed.searchParams.set('fbid', photoId);
    }
    return parsed.href;
  } catch {
    return '';
  }
}

async function getPostIdentity(article) {
  const text = (await article.innerText().catch(() => '')).trim();
  const permalinkCandidates = await article
    .locator(
      'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], ' +
      'a[href*="/share/p/"]',
    )
    .all();
  let permalinkUrl = '';
  let bestPriority = Number.POSITIVE_INFINITY;

  for (const candidate of permalinkCandidates) {
    const href = (await candidate.getAttribute('href').catch(() => '')) || '';
    const normalized = normalizeFacebookPermalink(href);
    if (!normalized) continue;

    const priority =
      /\/posts\/|\/permalink\/|story_fbid=/i.test(normalized)
        ? 0
        : 1;
    if (priority < bestPriority) {
      permalinkUrl = normalized;
      bestPriority = priority;
    }
  }

  return {
    key: permalinkUrl || text.replace(/\s+/g, ' ').slice(0, 220),
    permalinkUrl,
  };
}

async function collectPageArticles(activePage, seenPostKeys, limit) {
  try {
    const discoveredPosts = await activePage.evaluate(() => {
      // 1. Try finding posts via standard accessibility roles
      let postElements = Array.from(document.querySelectorAll('div[role="article"], div[aria-posinset]'));
      
      // 2. Fallback: try finding via reaction buttons if the above fails
      if (postElements.length === 0) {
        const reactionButtons = Array.from(document.querySelectorAll('div[role="button"]'))
          .filter((element) => {
            const text = (element.innerText || '').trim().toLowerCase();
            return text === 'thích' || text === 'like' || text === 'react' || text === 'bày tỏ cảm xúc';
          });
          
        for (const btn of reactionButtons) {
          let current = btn.parentElement;
          for (let level = 1; current && current !== document.body && level <= 20; level++) {
            const box = current.getBoundingClientRect();
            const text = (current.innerText || '').trim();
            if (box.width >= 300 && box.width <= 1000 && box.height >= 100 && text.length >= 30) {
              postElements.push(current);
              break;
            }
            current = current.parentElement;
          }
        }
      }

      const roots = [];
      const uniqueRoots = new Set();

      for (const postRoot of postElements) {
        if (!postRoot || uniqueRoots.has(postRoot)) continue;
        
        // Also verify the element is visible and large enough
        const box = postRoot.getBoundingClientRect();
        if (box.width < 300 || box.height < 100) continue;
        
        uniqueRoots.add(postRoot);

        const seeMore = Array.from(postRoot.querySelectorAll('div[role="button"]'))
          .find((element) => {
            const text = (element.innerText || '').trim();
            return text === 'Xem thêm' || text === 'See more';
          });
          
        const hasVisibleLink = postRoot.querySelector('a[href*="khaihoanderma.com"], a[href*="l.facebook.com/l.php?u=https%3A%2F%2Fkhaihoanderma.com"]');
        
        if (!seeMore && !hasVisibleLink) continue;

        const cleanText = (postRoot.innerText || '')
          .replace(/Facebook/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const seed = cleanText.slice(0, 700);
        let hash = 2166136261;
        for (let index = 0; index < seed.length; index++) {
          hash ^= seed.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }

        const key = `omni-fb-${(hash >>> 0).toString(16)}`;
        postRoot.setAttribute('data-omni-fb-post-key', key);
        const postBox = postRoot.getBoundingClientRect();
        roots.push({
          key,
          documentTop: Math.round(postBox.top + window.scrollY),
        });
      }

      roots.sort((left, right) => left.documentTop - right.documentTop);
      return roots;
    });
    const collected = [];

    for (const discoveredPost of discoveredPosts) {
      const key = discoveredPost.key;
      if (!key || seenPostKeys.has(key)) continue;

      const article = activePage
        .locator(`[data-omni-fb-post-key="${key}"]`)
        .first();
      if (!(await article.isVisible().catch(() => false))) continue;

      seenPostKeys.add(key);
      collected.push({
        key,
        permalinkUrl: '',
        article,
      });
      if (collected.length >= limit) break;
    }

    return collected;
  } catch (err) {
    console.log('[fb-target] collectPageArticles error:', err.message || String(err));
    return [];
  }
}

async function reacquireSelectedPost(activePage, postKey) {
  const currentPosts = await collectPageArticles(activePage, new Set(), 20);
  const matchedPost = currentPosts.find((item) => item.key === postKey);
  if (!matchedPost) return null;

  await matchedPost.article
    .evaluate((element) => {
      element.setAttribute('data-omni-fb-selected-post', 'true');
    })
    .catch(() => {});
  return matchedPost.article;
}

async function findExactSeeMoreControl(post) {
  const controls = await post.locator('div[role="button"]').all();
  for (const control of controls) {
    const text = (await control.innerText().catch(() => '')).trim();
    if (text === 'Xem thêm' || text === 'See more') return control;
  }
  return null;
}

async function positionSelectedPostContent(activePage, postKey, fallbackPost) {
  reportStep('fb_positioning_post', 'Đang cuộn lên phần nội dung của bài được chọn');
  try {
    let post = await reacquireSelectedPost(activePage, postKey);
    if (!post && fallbackPost && await isVisibleSafe(fallbackPost)) {
      post = fallbackPost;
      await post
        .evaluate((element) => {
          element.setAttribute('data-omni-fb-selected-post', 'true');
        })
        .catch(() => {});
    }
    if (!post) return null;

    await post
      .evaluate((element) => {
        element.setAttribute('data-omni-fb-selected-post', 'true');
      })
      .catch(() => {});
    await post.scrollIntoViewIfNeeded().catch(() => {});
    await wait(700);

    const postBox = await post.boundingBox().catch(() => null);
    if (postBox && (postBox.y < 70 || postBox.y > 320)) {
      const adjustment = Math.max(-700, Math.min(700, Math.round(postBox.y - 155)));
      if (Math.abs(adjustment) > 40) {
        await safeMouseMove(820, 350, { steps: randomInt(4, 8) });
        await safeMouseWheel(0, adjustment);
        await wait(randomInt(500, 800));
      }
    }

    const markedPost = activePage
      .locator('[data-omni-fb-selected-post="true"]')
      .first();
    if (await isVisibleSafe(markedPost)) {
      post = markedPost;
    } else {
      post = await reacquireSelectedPost(activePage, postKey) || post;
    }
    return post;
  } catch (err) {
    console.log('[fb-target] positionSelectedPostContent error:', err.message || String(err));
    return null;
  }
}

async function expandSeeMoreInPost(
  activePage,
  postKey,
  positionedPost,
  targetDomain,
) {
  try {
    let post = positionedPost;

    for (let attempt = 1; attempt <= 3; attempt++) {
      post = await reacquireSelectedPost(activePage, postKey) || post;
      if (!post) return null;

      const alreadyVisibleLink = await findSelectedPostWebsiteLink(
        activePage,
        post,
        targetDomain,
      );
      if (alreadyVisibleLink.success) {
        reportStep('fb_see_more_opened', 'Nội dung bài đã mở và đã thấy link Derma');
        return { post, linkResult: alreadyVisibleLink };
      }

      let selected = await findExactSeeMoreControl(post);
      if (!selected) {
        console.log(`[fb-target] "Xem thêm" not found on click attempt ${attempt}/3.`);
        await wait(500);
        continue;
      }

      await selected.scrollIntoViewIfNeeded().catch(() => {});
      await wait(500);

      post = await reacquireSelectedPost(activePage, postKey) || post;
      selected = await findExactSeeMoreControl(post);
      if (!selected) {
        const openedLink = await findSelectedPostWebsiteLink(
          activePage,
          post,
          targetDomain,
        );
        if (openedLink.success) {
          reportStep('fb_see_more_opened', 'Đã mở rộng nội dung và thấy link Derma');
          return { post, linkResult: openedLink };
        }
        continue;
      }

      const seeMoreBox = await selected.boundingBox().catch(() => null);
      await selected
        .evaluate((element) => {
          document
            .querySelectorAll('[data-omni-fb-see-more-target]')
            .forEach((item) => item.removeAttribute('data-omni-fb-see-more-target'));
          element.setAttribute('data-omni-fb-see-more-target', 'true');
        })
        .catch(() => {});
      reportStep(
        'fb_see_more_clicking',
        `Đã thấy Xem thêm, đang bấm mở nội dung bài (lần ${attempt}/3)`,
      );

      if (seeMoreBox) {
        const jitterX = randomInt(-10, 10);
        const jitterY = randomInt(-4, 4);
        await activePage.mouse
          .click(
            seeMoreBox.x + seeMoreBox.width / 2 + jitterX,
            seeMoreBox.y + seeMoreBox.height / 2 + jitterY,
          )
          .catch(() => {});
      } else {
        await selected
          .evaluate((element) => element.click())
          .catch(() => {});
      }

      let linkResult = { success: false };
      for (let linkAttempt = 1; linkAttempt <= 4; linkAttempt++) {
        await wait(300);
        linkResult = await findSelectedPostWebsiteLink(
          activePage,
          post,
          targetDomain,
        );
        if (linkResult.success) break;
      }

      if (!linkResult.success) {
        const stillCollapsed = await activePage
          .locator('[data-omni-fb-see-more-target="true"]')
          .evaluate((element) => {
            const text = (element.textContent || '').trim();
            return text === 'Xem thêm' || text === 'See more';
          })
          .catch(() => false);

        if (stillCollapsed) {
          console.log(
            `[fb-target] Coordinate click did not expand the post on attempt ${attempt}; using DOM click fallback.`,
          );
          await activePage
            .locator('[data-omni-fb-see-more-target="true"]')
            .evaluate((element) => element.click())
            .catch(() => {});
          await wait(350);
        }

        const linkResult = await findSelectedPostWebsiteLink(
          activePage,
          post,
          targetDomain,
        );
        if (linkResult.success) {
          console.log('[fb-target] Expanded "Xem thêm" and found the Derma link.');
          reportStep('fb_see_more_opened', 'Đã mở rộng nội dung và thấy link Derma');
          return { post, linkResult };
        }
      }

      console.log(
        `[fb-target] Click attempt ${attempt}/3 did not expose a Derma link; retrying.`,
      );
    }

    return null;
  } catch (err) {
    console.log('[fb-target] expandSeeMoreInPost error:', err.message || String(err));
  }
  return null;
}

function normalizeTargetUrl(value, targetDomain) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const domain = targetDomain.toLowerCase();
    const allowedProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    const allowedHostname = hostname === domain || hostname === `www.${domain}`;
    if (allowedProtocol && allowedHostname) return parsed.href;
  } catch {}
  return '';
}

function sameTargetResource(left, right, targetDomain) {
  const leftUrl = normalizeTargetUrl(left, targetDomain);
  const rightUrl = normalizeTargetUrl(right, targetDomain);
  if (!leftUrl || !rightUrl) return false;

  const normalizePath = (value) => {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    try {
      return decodeURIComponent(path).toLowerCase();
    } catch {
      return path.toLowerCase();
    }
  };
  return normalizePath(leftUrl) === normalizePath(rightUrl);
}

function resolveFacebookOutboundUrl(href, targetDomain) {
  try {
    const parsed = new URL(href, 'https://www.facebook.com/');
    if (
      parsed.hostname === 'l.facebook.com' ||
      (parsed.hostname.endsWith('.facebook.com') && parsed.pathname === '/l.php')
    ) {
      return normalizeTargetUrl(parsed.searchParams.get('u') || '', targetDomain);
    }
    return normalizeTargetUrl(parsed.href, targetDomain);
  } catch {}
  return '';
}

async function findPostWebsiteLink(post, targetDomain) {
  try {
    const anchors = await post.locator('a[href]').all();
    for (const anchor of anchors) {
      if (!(await anchor.isVisible().catch(() => false))) continue;
      const href = await anchor.getAttribute('href').catch(() => '');
      const text = (await anchor.innerText().catch(() => '')).trim();
      const normalizedText = text.toLowerCase();
      const destinationUrl = resolveFacebookOutboundUrl(href || '', targetDomain);
      const hasDermaLabel =
        normalizedText.includes('khaihoanderma') || normalizedText.includes('derma');
      if (!destinationUrl || !hasDermaLabel) continue;

      const parsedDestination = new URL(destinationUrl);
      if (parsedDestination.pathname.replace(/\/+$/, '') === '') continue;

      await anchor.scrollIntoViewIfNeeded().catch(() => {});
      return {
        success: true,
        anchor,
        href: href || destinationUrl,
        destinationUrl,
        text: text || destinationUrl,
      };
    }
  } catch (err) {
    console.log('[fb-target] findPostWebsiteLink error:', err.message || String(err));
  }
  return { success: false };
}

async function findSelectedPostWebsiteLink(activePage, post, targetDomain) {
  const result = await activePage.evaluate((domain) => {
    document
      .querySelectorAll('[data-omni-fb-derma-link]')
      .forEach((element) => element.removeAttribute('data-omni-fb-derma-link'));

    const normalize = (href) => {
      try {
        const parsed = new URL(href, 'https://www.facebook.com/');
        let destination = parsed;
        if (
          parsed.hostname === 'l.facebook.com' ||
          (parsed.hostname.endsWith('.facebook.com') && parsed.pathname === '/l.php')
        ) {
          destination = new URL(parsed.searchParams.get('u') || '');
        }
        const hostname = destination.hostname.toLowerCase();
        const allowed = hostname === domain || hostname === `www.${domain}`;
        if (!allowed || !/^https?:$/.test(destination.protocol)) return '';
        if (destination.pathname.replace(/\/+$/, '') === '') return '';
        return destination.href;
      } catch {
        return '';
      }
    };

    const selectedRoot = document.querySelector('[data-omni-fb-selected-post="true"]');
    const scopes = selectedRoot ? [selectedRoot, document] : [document];
    for (const scope of scopes) {
      for (const anchor of Array.from(scope.querySelectorAll('a[href]'))) {
        const box = anchor.getBoundingClientRect();
        const style = getComputedStyle(anchor);
        const visible =
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden';
        if (!visible) continue;

        const href = anchor.getAttribute('href') || '';
        const text = (anchor.innerText || '').trim();
        const destinationUrl = normalize(href);
        if (!destinationUrl || !/khaihoanderma|derma/i.test(text)) continue;

        if (
          scope === document &&
          (
            box.x < window.innerWidth * 0.35 ||
            box.y < 0 ||
            box.y > window.innerHeight
          )
        ) {
          continue;
        }

        anchor.setAttribute('data-omni-fb-derma-link', 'true');
        return {
          success: true,
          href,
          destinationUrl,
          text: text || destinationUrl,
        };
      }
    }
    return { success: false };
  }, targetDomain);

  if (!result.success) return result;
  const anchor = activePage.locator('[data-omni-fb-derma-link="true"]').first();
  if (!(await anchor.isVisible().catch(() => false))) return { success: false };
  return {
    ...result,
    anchor,
  };
}

async function clickAnchorInCurrentTab(anchor, destinationUrl, targetDomain) {
  const originalUrl = await page.url().catch(() => '');
  const beforePages = await page.browser.pages().catch(() => ({ pages: [] }));
  const beforeIds = new Set(beforePages.pages.map((item) => item.targetId));
  const originalPage = beforePages.pages.find((item) => item.url === originalUrl);

  let anchorPrepared = false;
  try {
    await anchor.evaluate((element, safeUrl) => {
      element.setAttribute('href', safeUrl);
      element.setAttribute('target', '_self');
      element.setAttribute('data-omni-fb-target-link', 'true');
    }, destinationUrl);
    await anchor.scrollIntoViewIfNeeded().catch(() => {});
    const anchorBox = await anchor.boundingBox().catch(() => null);
    reportStep('fb_target_link_clicking', 'Đang bấm link sản phẩm Khải Hoàn Derma');
    if (anchorBox) {
      const jitterX = randomInt(-15, 15);
      const jitterY = randomInt(-5, 5);
      await page.mouse
        .click(
          anchorBox.x + anchorBox.width / 2 + jitterX,
          anchorBox.y + anchorBox.height / 2 + jitterY,
        )
        .catch(() => {});
    } else {
      await anchor.evaluate((element) => element.click()).catch(() => {});
    }
    anchorPrepared = true;
  } catch (error) {
    console.log(
      '[one-tab] Facebook detached the product link before click:',
      error.message || String(error),
    );
  }
  if (anchorPrepared) await wait(1200);

  let startedAt = Date.now();
  const clickNavigationTimeout = anchorPrepared ? 8000 : 0;
  while (Date.now() - startedAt < clickNavigationTimeout) {
    const tabs = await page.browser.pages().catch(() => ({ pages: [] }));
    const destinationPage = tabs.pages.find((item) =>
      sameTargetResource(item.url, destinationUrl, targetDomain)
    );
    if (destinationPage) {
      await page.browser.bringToFront(destinationPage.targetId).catch(() => {});
      for (const tab of tabs.pages) {
        const createdByClick = !beforeIds.has(tab.targetId);
        const oldFacebookTab = originalPage && tab.targetId === originalPage.targetId;
        if (
          tab.targetId !== destinationPage.targetId &&
          (createdByClick || oldFacebookTab)
        ) {
          await page.browser.closePage(tab.targetId).catch(() => {});
        }
      }
      return destinationPage.url;
    }

    const currentUrl = await page.url().catch(() => '');
    if (sameTargetResource(currentUrl, destinationUrl, targetDomain)) return currentUrl;
    await wait(300);
  }

  const tabsAfterClick = await page.browser.pages().catch(() => ({ pages: [] }));
  for (const tab of tabsAfterClick.pages) {
    if (!beforeIds.has(tab.targetId)) {
      await page.browser.closePage(tab.targetId).catch(() => {});
    }
  }
  if (originalPage) {
    await page.browser.bringToFront(originalPage.targetId).catch(() => {});
  }

  console.log('[one-tab] Facebook did not navigate; opening the extracted product URL in the same tab.');
  reportStep('fb_target_link_fallback', 'Facebook chưa chuyển trang, đang mở URL sản phẩm trong cùng tab');
  await page.goto(destinationUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 35000,
  }).catch(() => {});

  startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const currentUrl = await page.url().catch(() => '');
    if (sameTargetResource(currentUrl, destinationUrl, targetDomain)) return currentUrl;
    await wait(300);
  }

  console.log('[one-tab] Same-tab navigation failed; replacing the Facebook tab with a target tab.');
  const replacement = await page.browser
    .newPage(destinationUrl, { active: true })
    .catch(() => null);
  if (replacement) {
    startedAt = Date.now();
    while (Date.now() - startedAt < 20000) {
      const tabs = await page.browser.pages().catch(() => ({ pages: [] }));
      const destinationPage = tabs.pages.find((item) =>
        sameTargetResource(item.url, destinationUrl, targetDomain)
      );
      if (destinationPage) {
        await page.browser.bringToFront(destinationPage.targetId).catch(() => {});
        if (originalPage && originalPage.targetId !== destinationPage.targetId) {
          await page.browser.closePage(originalPage.targetId).catch(() => {});
        }
        return destinationPage.url;
      }
      await wait(300);
    }
  }

  return '';
}

async function findInternalLink(activePage, targetDomain, currentUrl, mode, visitedUrls) {
  const selectors = mode === 'related'
    ? [
        '.related.related-products-wrapper a[href]',
        '.related-products-wrapper a[href]',
        'section.related a[href]',
        '.related a[href]',
        '.related.products a[href]',
        '[class*="related-product"] a[href]',
      ]
    : [
        'main a[href]',
        '#main a[href]',
        '.content-area a[href]',
        '.page-wrapper a[href]',
      ];

  if (mode === 'related') {
    const relatedSection = activePage
      .locator(
        '.related.related-products-wrapper, .related-products-wrapper, ' +
        'section.related, .related.products, [class*="related-product"]',
      )
      .first();
    if ((await relatedSection.count().catch(() => 0)) > 0) {
      await relatedSection.scrollIntoViewIfNeeded().catch(() => {});
      await wait(800);
    }
  }

  const anchors = await activePage.locator(selectors.join(', ')).all();
  const candidates = [];
  const candidateUrls = new Set();

  for (const anchor of anchors) {
    if (mode !== 'related' && !(await anchor.isVisible().catch(() => false))) continue;
    const href = (await anchor.getAttribute('href').catch(() => '')) || '';
    let absoluteHref = '';
    try {
      absoluteHref = new URL(href, currentUrl).href;
    } catch {
      continue;
    }

    const destinationUrl = normalizeTargetUrl(absoluteHref, targetDomain);
    if (!destinationUrl || sameTargetResource(destinationUrl, currentUrl, targetDomain)) continue;
    if (
      visitedUrls.some((visitedUrl) =>
        sameTargetResource(destinationUrl, visitedUrl, targetDomain)
      )
    ) {
      continue;
    }

    const parsed = new URL(destinationUrl);
    const path = parsed.pathname.toLowerCase();
    if (
      path === '/' ||
      path.startsWith('/wp-admin') ||
      path.includes('/cart') ||
      path.includes('/gio-hang') ||
      path.includes('/checkout') ||
      path.includes('/thanh-toan') ||
      path.includes('/my-account') ||
      path.includes('/tai-khoan') ||
      path.includes('/account') ||
      path.includes('/customer/account') ||
      path.includes('/login') ||
      path.includes('/dang-nhap') ||
      path.includes('/wp-login.php')
    ) {
      continue;
    }

    if (
      mode === 'related' &&
      !path.includes('/product/') &&
      !path.includes('/san-pham/')
    ) {
      continue;
    }

    if (candidateUrls.has(destinationUrl)) continue;
    candidateUrls.add(destinationUrl);
    candidates.push({
      anchor,
      destinationUrl,
      text: (await anchor.innerText().catch(() => '')).trim(),
    });
  }

  if (candidates.length === 0) return null;
  return candidates[randomInt(0, candidates.length - 1)];
}

async function inspectProductGallery(activePage) {
  const selectors = [
    '.product-thumbnails img',
    '.woocommerce-product-gallery .flex-control-thumbs img',
    '.product-gallery .product-thumbnails img',
  ];

  for (const selector of selectors) {
    const candidates = await activePage.locator(selector).all();
    for (const candidate of candidates.slice(0, 6)) {
      if (!(await candidate.isVisible().catch(() => false))) continue;
      await candidate.scrollIntoViewIfNeeded().catch(() => {});
      await candidate.click().catch(() => {});
      reportStep('web_gallery_checked', 'Đã xem ảnh sản phẩm');
      return true;
    }
  }

  const mainImage = activePage
    .locator(
      '.woocommerce-product-gallery__image img, .product-gallery img, .product-images img',
    )
    .first();
  if (await isVisibleSafe(mainImage)) {
    await mainImage.scrollIntoViewIfNeeded().catch(() => {});
    reportStep('web_gallery_checked', 'Đã xem ảnh chính của sản phẩm');
    return true;
  }

  reportStep('web_gallery_checked', 'Trang không có ảnh sản phẩm hiển thị');
  return false;
}

async function verifyTargetPage(activePage, expectedUrl, targetDomain, expectedKind) {
  const currentUrl = await activePage.url().catch(() => '');
  if (!sameTargetResource(currentUrl, expectedUrl, targetDomain)) return null;

  await activePage.waitForLoadState('domcontentloaded').catch(() => {});
  const title = (await activePage.title().catch(() => '')).trim();
  const bodyText = (await activePage.locator('body').innerText().catch(() => '')).trim();
  const normalizedBody = bodyText.toLowerCase();
  const errorSignals = [
    'page not found',
    'trang không tồn tại',
    'không tìm thấy trang',
    'maintenance mode',
    'đang bảo trì',
  ];
  const titleSignalsError = /(^|\s)404(\s|$)/.test(title.toLowerCase());
  if (
    !title ||
    bodyText.length < 80 ||
    titleSignalsError ||
    errorSignals.some((signal) => normalizedBody.includes(signal))
  ) {
    return null;
  }

  const heading = (
    await activePage
      .locator('h1, .product-title, .entry-title')
      .first()
      .innerText()
      .catch(() => '')
  ).trim();
  if (!heading) return null;

  if (expectedKind === 'product') {
    const productMarker = activePage
      .locator(
        '.product-main, .product-info, .product-summary, ' +
        '[class*="product-detail"], form.cart',
      )
      .first();
    const parsedExpected = new URL(expectedUrl);
    const productPath =
      parsedExpected.pathname.includes('/product/') ||
      parsedExpected.pathname.includes('/san-pham/');
    if (!productPath || !(await isVisibleSafe(productMarker))) return null;
  }

  return {
    url: normalizeTargetUrl(currentUrl, targetDomain),
    title,
    heading,
    bodyLength: bodyText.length,
  };
}

// ----------------------------------------------------
// Step 3 & 4: Fanpage Posts Scroll & Target Website Interactions
// ----------------------------------------------------
async function auditFanpageAndWebsite(config, globalDeadline) {
  console.log('[fb-target] Starting random 1-10 Fanpage referral QA phase...');
  reportStep('fb_target_start', 'Bắt đầu bốc số bài từ 1 đến 10...');

  let targetWebOpened = false;
  let activePage = page;
  let clickedLinkInfo = null;

  // Step 3: draw one target from 1-10, then count Page articles until that target.
  const maxPostsToInspect = 10;
  const targetPostIndex = randomInt(1, maxPostsToInspect);
  const seenPostKeys = new Set();
  const countedPosts = [];
  let scanAttempts = 0;
  let selectedPost = null;
  const scanDeadline = Math.min(Date.now() + 45000, globalDeadline - 35000);

  console.log(`[fb-target] Random target post: ${targetPostIndex}/${maxPostsToInspect}.`);
  reportStep('fb_random_position', {
    targetPostIndex,
    maxPosts: maxPostsToInspect,
  });

  while (
    countedPosts.length < targetPostIndex &&
    scanAttempts < 30 &&
    Date.now() < scanDeadline
  ) {
    scanAttempts++;
    const countBeforeScan = countedPosts.length;

    const loadedPosts = await collectPageArticles(
      activePage,
      seenPostKeys,
      targetPostIndex - countedPosts.length,
    );
    if (loadedPosts.length > 0) {
      for (const loadedPost of loadedPosts) {
        countedPosts.push(loadedPost);
        const currentPostIndex = countedPosts.length;
        console.log(
          `[fb-target] Counter ${currentPostIndex}/${targetPostIndex} (random target ${targetPostIndex}/10).`,
        );
        reportStep('fb_post_counter', {
          current: currentPostIndex,
          target: targetPostIndex,
          maxPosts: maxPostsToInspect,
        });

        if (currentPostIndex === targetPostIndex) {
          selectedPost = loadedPost;
          break;
        }
      }
    }

    if (selectedPost) break;
    if (Math.random() < 0.6) await moveMouseNaturally();
    else await safeMouseMove(randomInt(400, 900), randomInt(300, 700), { steps: randomInt(4, 10) });
    const madeProgress = countedPosts.length > countBeforeScan;
    await safeMouseWheel(0, madeProgress ? randomInt(500, 850) : randomInt(800, 1300));
    await wait(randomInt(1200, 2200));
  }

  if (!selectedPost) {
    reportStep(
      'fb_flow_failed',
      `Bộ đếm dừng ở ${countedPosts.length}/${targetPostIndex}, mục tiêu bốc được ${targetPostIndex}/10`,
    );
    throw new Error(
      `[FB_TARGET_POST_NOT_REACHED] Bộ đếm dừng ở ${countedPosts.length}/${targetPostIndex}`,
    );
  }

  reportStep('fb_target_reached', {
    targetPostIndex,
    maxPosts: maxPostsToInspect,
  });
  await selectedPost.article
    .evaluate((element) => {
      element.setAttribute('data-omni-fb-selected-post', 'true');
    })
    .catch(() => {});
  let positionedPost = await positionSelectedPostContent(
    activePage,
    selectedPost.key,
    selectedPost.article,
  );

  let expandedResult = await expandSeeMoreInPost(
    activePage,
    selectedPost.key,
    positionedPost,
    config.targetDomain,
  );
  if (!expandedResult) {
    const recoveryPosts = await collectPageArticles(activePage, new Set(), 10);
    const recoveryPool = recoveryPosts
      .filter((item) => item.key !== selectedPost.key)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    for (const recoveryPost of recoveryPool) {
      reportStep(
        'fb_post_recovery',
        'Bài đã chọn vừa được Facebook tải lại, đang chuyển sang bài có Xem thêm',
      );
      await recoveryPost.article
        .evaluate((element) => {
          document
            .querySelectorAll('[data-omni-fb-selected-post]')
            .forEach((item) => item.removeAttribute('data-omni-fb-selected-post'));
          element.setAttribute('data-omni-fb-selected-post', 'true');
        })
        .catch(() => {});
      positionedPost = await positionSelectedPostContent(
        activePage,
        recoveryPost.key,
        recoveryPost.article,
      );
      expandedResult = await expandSeeMoreInPost(
        activePage,
        recoveryPost.key,
        positionedPost,
        config.targetDomain,
      );
      if (expandedResult) {
        selectedPost = recoveryPost;
        break;
      }
    }
  }
  if (!expandedResult) {
    reportStep('fb_flow_failed', `Không bấm mở được Xem thêm ở bài số ${targetPostIndex}`);
    throw new Error(`[FB_SEE_MORE_REQUIRED] Không bấm mở được Xem thêm ở bài số ${targetPostIndex}`);
  }

  const linkResult = expandedResult.linkResult;
  if (!linkResult.success) {
    reportStep('fb_flow_failed', `Không thấy link xanh ${config.targetDomain} sau khi bấm Xem thêm`);
    throw new Error(`[FB_DERMA_LINK_REQUIRED] Không thấy link xanh ${config.targetDomain} sau khi bấm Xem thêm`);
  }

  clickedLinkInfo = {
    href: linkResult.href,
    destinationUrl: linkResult.destinationUrl,
    text: linkResult.text,
    selectedPostIndex: targetPostIndex,
  };
  console.log(`[fb-target] Clicking selected product link in the current tab: ${linkResult.destinationUrl}`);
  reportStep('fb_link_clicking', `Đang nhấp link sản phẩm ${linkResult.destinationUrl}`);
  const openedUrl = await clickAnchorInCurrentTab(
    linkResult.anchor,
    linkResult.destinationUrl,
    config.targetDomain,
  ).catch(() => '');
  targetWebOpened = sameTargetResource(
    openedUrl,
    linkResult.destinationUrl,
    config.targetDomain,
  );
  if (!targetWebOpened) {
    reportStep('fb_flow_failed', `Đã thấy link nhưng không mở được đúng URL ${linkResult.destinationUrl}`);
    throw new Error(`[FB_REFERRAL_REQUIRED] Không mở được đúng link sản phẩm ${linkResult.destinationUrl}`);
  }
  reportStep('fb_link_found', `Đã nhấp đúng link sản phẩm ${linkResult.destinationUrl}`);

  // Step 4: bounded functional QA on the Derma destination only.
  const qaMinSeconds = config.targetWebMinSeconds;
  const qaMaxSeconds = Math.max(qaMinSeconds, config.targetWebMaxSeconds);
  const targetWebSeconds = randomInt(qaMinSeconds, qaMaxSeconds);
  const webDeadline = Math.min(Date.now() + targetWebSeconds * 1000, globalDeadline);
  const webStartedAt = Date.now();
  if (!clickedLinkInfo) throw new Error('Website QA is missing the clicked Facebook link.');

  let expectedResourceUrl = clickedLinkInfo.destinationUrl;
  const initialPage = await verifyTargetPage(
    activePage,
    expectedResourceUrl,
    config.targetDomain,
    'product',
  );
  if (!initialPage) {
    throw new Error(`Website QA refused the clicked product URL: ${await activePage.url().catch(() => '')}`);
  }

  const visitedPages = [initialPage];
  console.log(`[web-audit] Verified target page and starting ${targetWebSeconds}s bounded QA: ${initialPage.url}`);
  reportStep('web_audit_start', `Đã xác minh trang Derma, bắt đầu kiểm tra cuộn và nội dung (${targetWebSeconds}s)`);

  let galleryChecked = false;
  let detailTabChecked = false;
  let relatedAttempts = 0;
  let relatedClicked = false;
  let searchPerformed = false;

  while (remainingMs(webDeadline) > 0) {
    const currentUrl = await activePage.url().catch(() => '');
    if (!sameTargetResource(currentUrl, expectedResourceUrl, config.targetDomain)) {
      throw new Error(`Website QA left the allowed domain: ${currentUrl}`);
    }

    const elapsedSec = Math.floor((Date.now() - webStartedAt) / 1000);
    reportStep('web_audit_reading', {
      elapsed: elapsedSec,
      total: targetWebSeconds,
      url: currentUrl,
    });

    const deltaY = (Math.random() < 0.75 ? 1 : -1) * randomInt(260, 620);
    await activePage.mouse.wheel(0, deltaY).catch(() => {});

    if (!galleryChecked && elapsedSec >= Math.floor(targetWebSeconds / 5)) {
      galleryChecked = true;
      await inspectProductGallery(activePage);
    }

    if (!detailTabChecked && elapsedSec >= Math.floor(targetWebSeconds / 4)) {
      const detailTab = activePage
        .locator(
          '#tab-title-description a, li.description_tab a, ' +
          '#tab-title-reviews a, li.reviews_tab a',
        )
        .first();
      if (await isVisibleSafe(detailTab)) {
        await detailTab.click().catch(() => {});
      }
      detailTabChecked = true;
    }

    if (
      !searchPerformed &&
      elapsedSec >= Math.floor(targetWebSeconds / 2) &&
      remainingMs(webDeadline) > 10000
    ) {
      searchPerformed = true;
      const searchInput = activePage.locator('input[type="search"], input[name="s"], .search-field').first();
      if (await isVisibleSafe(searchInput)) {
        reportStep('web_search', 'Đang tìm kiếm sản phẩm trên web Khải Hoàn Derma');
        const keywords = ['Chăm sóc da', 'Sữa rửa mặt', 'Toner', 'Serum B5', 'Trị mụn', 'Kem chống nắng', 'Phục hồi da', 'Retinol', 'Cerave', 'Rilastil'];
        const randomKeyword = keywords[randomInt(0, keywords.length - 1)];
        await searchInput.click().catch(() => {});
        await waitWithinBudget(randomInt(500, 1000), webDeadline);
        
        try {
          await activePage.keyboard.type(randomKeyword, { delay: randomInt(60, 150) });
        } catch (err) {
          await searchInput.fill(randomKeyword).catch(() => {});
        }
        
        await waitWithinBudget(randomInt(1000, 2000), webDeadline);
        await searchInput.press('Enter').catch(() => {});
        await activePage.waitForLoadState('domcontentloaded').catch(() => {});
        
        expectedResourceUrl = await activePage.url().catch(() => expectedResourceUrl);
        await waitWithinBudget(randomInt(2000, 4000), webDeadline);
        continue;
      }
    }

    if (
      !relatedClicked &&
      relatedAttempts < 3 &&
      elapsedSec >= Math.floor(targetWebSeconds / 3) &&
      remainingMs(webDeadline) > 8000
    ) {
      relatedAttempts++;
      const relatedLink = await findInternalLink(
        activePage,
        config.targetDomain,
        currentUrl,
        'related',
        visitedPages.map((item) => item.url),
      );
      if (relatedLink) {
        reportStep('web_related_clicking', `Đang kiểm tra sản phẩm tương tự: ${relatedLink.destinationUrl}`);
        await relatedLink.anchor.scrollIntoViewIfNeeded().catch(() => {});
        await waitWithinBudget(randomInt(800, 1500), webDeadline);
        const openedUrl = await clickAnchorInCurrentTab(
          relatedLink.anchor,
          relatedLink.destinationUrl,
          config.targetDomain,
        ).catch(() => '');
        const verifiedPage = await verifyTargetPage(
          activePage,
          relatedLink.destinationUrl,
          config.targetDomain,
          'product',
        );
        if (openedUrl && verifiedPage) {
          expectedResourceUrl = relatedLink.destinationUrl;
          visitedPages.push(verifiedPage);
          relatedClicked = true;
          reportStep('web_related_opened', `Đã mở sản phẩm tương tự: ${verifiedPage.url}`);
          await activePage.mouse.wheel(0, randomInt(260, 520)).catch(() => {});
          await waitWithinBudget(randomInt(2000, 4000), webDeadline);
          break;
        } else {
          const actualUrl = await activePage.url().catch(() => '');
          if (!sameTargetResource(actualUrl, currentUrl, config.targetDomain)) {
            currentUrl = actualUrl; // Update currentUrl anyway to prevent loop confusion
            reportStep('web_related_unverified', `Đã chuyển hướng nhưng không xác thực được trang sản phẩm: ${actualUrl}`);
          }
        }
      } else {
        reportStep(
          'web_related_retry',
          `Chưa thấy sản phẩm tương tự, thử lại ${relatedAttempts}/3`,
        );
        await activePage.mouse.wheel(0, randomInt(650, 950)).catch(() => {});
      }
    }

    await waitWithinBudget(randomInt(3500, 5500), webDeadline);
  }

  if (!relatedClicked) {
    reportStep('web_flow_failed', 'Không mở và xác minh được sản phẩm tương tự');
    throw new Error(
      '[DERMA_RELATED_REQUIRED] Không tìm thấy hoặc không mở được sản phẩm tương tự',
    );
  }

  reportStep('web_audit_done', 'Đã xem nội dung và mở đúng một sản phẩm tương tự');
  return {
    targetWebOpened,
    addedToCart: false,
    visitedPagesCount: visitedPages.length,
    visitedPages,
    relatedClicked,
    galleryChecked,
    clickedLinkInfo,
    verifiedUrl: initialPage.url,
    pageTitle: initialPage.title,
  };
}

// ----------------------------------------------------
// Main Script Entry Point
// ----------------------------------------------------
async function main() {
  const config = {
    fbSearchQuery: String(param('fbSearchQuery') || DEFAULTS.fbSearchQuery),
    targetDomain: String(param('targetDomain') || DEFAULTS.targetDomain),
    targetBaseUrl: String(param('targetBaseUrl') || DEFAULTS.targetBaseUrl),
    fbWarmupMinSeconds: Number(param('fbWarmupMinSeconds') || DEFAULTS.fbWarmupMinSeconds),
    fbWarmupMaxSeconds: Number(param('fbWarmupMaxSeconds') || DEFAULTS.fbWarmupMaxSeconds),
    targetWebMinSeconds: Number(param('targetWebMinSeconds') || DEFAULTS.targetWebMinSeconds),
    targetWebMaxSeconds: Number(param('targetWebMaxSeconds') || DEFAULTS.targetWebMaxSeconds),
    exportPath: String(param('exportPath') || DEFAULTS.exportPath),
  };

  console.log('[fb-flow] Starting Facebook referral QA flow with config:', JSON.stringify(config));

  // Step 1: Facebook Feed Warmup (1 - 2 minutes)
  const warmupDeadline = Date.now() + (config.fbWarmupMaxSeconds + 30) * 1000;
  const warmupStats = await warmupFacebookFeed(config, warmupDeadline);

  // Step 2: Search for Facebook Page
  const searchDeadline = Date.now() + 60000;
  await searchFacebookPage(config.fbSearchQuery, searchDeadline);

  // Step 3 & 4: Fanpage Posts Scroll & Target Website Interactions (Random 2 - 4 minutes)
  const globalDeadline = Date.now() + (config.targetWebMaxSeconds + 180) * 1000;
  const auditStats = await auditFanpageAndWebsite(config, globalDeadline);

  const finalOutput = {
    app: 'facebook-traffic-derma',
    warmupStats,
    auditStats,
    finishedAt: new Date().toISOString(),
  };

  console.log('[fb-flow] Flow completed successfully:', JSON.stringify(finalOutput, null, 2));

  await omni.file.export(finalOutput, {
    path: config.exportPath,
    format: 'json',
    onConflict: 'overwrite',
  }).catch(() => {});

  return finalOutput;
}

return await main();
