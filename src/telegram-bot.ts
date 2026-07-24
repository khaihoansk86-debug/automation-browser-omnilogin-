import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { OmniLogin } from '@omnilogin/sdk';
import { loadGscConfig, syncGscKeywordPool } from './gsc.js';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    document?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    chat: {
      id: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
      text?: string;
    };
    data?: string;
  };
};

type AppAlias = {
  alias: string;
  appId: string;
  name: string;
};

type ProfileRef = {
  id: number;
  name: string;
};

type MktProxyConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  keys: string[];
  rotateMode: 'current' | 'new';
};

type GscSyncConfig = {
  enabled: boolean;
  syncBeforeRun: boolean;
};

type ProfileWaitResult = 'completed' | 'captcha' | 'stopped';

type RunState = {
  active: boolean;
  appAlias?: string;
  appId?: string;
  startedAt?: string;
  command?: string;
  profiles?: number[];
  currentProfile?: number;
  profileRunSeconds?: number;
  closeAfterRun?: boolean;
  lastMessage?: string;
  childProcess?: any;
};

const DEFAULT_APP_ID = 'khaihoan-derma-rank-qa';
const DEFAULT_APP_ALIASES: AppAlias[] = [
  {
    alias: 'derma',
    appId: DEFAULT_APP_ID,
    name: 'Khai Hoàn Derma Rank QA',
  },
  {
    alias: 'nuoi',
    appId: 'profile-warmup-random',
    name: 'Profile Warmup Random',
  },
  {
    alias: 'index',
    appId: 'index-url-khaihoanderma',
    name: 'Đánh giá & Index URL Khai Hoàn Derma',
  },
  {
    alias: 'fb',
    appId: 'facebook-traffic-derma',
    name: 'Bơm Traffic Facebook -> Web Khải Hoàn Derma',
  },
];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (page: unknown, omni: unknown, params: Record<string, unknown>) => Promise<void>;

function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;

  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

function parsePositiveInt(value: string | undefined, fallback?: number) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

interface DelayRange {
  min: number;
  max: number;
}

function parseDelayRange(value: string | undefined, defaultVal: number): DelayRange {
  if (!value) return { min: defaultVal, max: defaultVal };
  const parts = value.split(/[-,]/).map((p) => parseInt(p.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const min = Math.min(parts[0], parts[1]);
    const max = Math.max(parts[0], parts[1]);
    return { min, max };
  }
  const parsed = parseInt(value, 10);
  if (!isNaN(parsed) && parsed > 0) {
    return { min: parsed, max: parsed };
  }
  return { min: defaultVal, max: defaultVal };
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseCsv(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(text: string) {
  const args: Record<string, string> = {};
  const parts = text.split(/\s+/).slice(1);
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (!key || rest.length === 0) continue;
    args[key.toLowerCase()] = rest.join('=').trim();
  }
  return args;
}

function parseProfileRefs(args: Record<string, string>) {
  const raw = args.profiles || args.profile;
  if (!raw) return [];

  const refs: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Check if it's a range like 37-66
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start <= end) {
        for (let i = start; i <= end; i++) {
          refs.push(String(i));
        }
      } else {
        for (let i = start; i >= end; i--) {
          refs.push(String(i));
        }
      }
    } else {
      refs.push(trimmed);
    }
  }
  return refs;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function code(value: unknown) {
  return `<code>${escapeHtml(value)}</code>`;
}

function getAiAppLogPath(appId: string) {
  const explicit = process.env.AI_APP_LOG_PATH?.trim();
  if (explicit) return explicit;
  const appData = process.env.APPDATA || `${process.env.USERPROFILE}\\AppData\\Roaming`;
  return `${appData}\\omnilogin\\ai-app\\logs\\${appId}.log`;
}

function getLocalAiAppScriptPath(appId: string) {
  const explicit = process.env.LOCAL_AI_APP_SCRIPT_PATH?.trim();
  if (explicit) return explicit;
  return `${process.cwd()}\\exports\\${appId}.js`;
}

function getFileSize(path: string) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function readFileSlice(path: string, start: number) {
  try {
    const raw = readFileSync(path, 'utf8');
    return raw.slice(Math.min(start, raw.length));
  } catch {
    return '';
  }
}

function loadAppAliases(defaultAppId: string) {
  const aliases = new Map<string, AppAlias>();

  const addAlias = (alias: string, appId: string, name?: string) => {
    const normalizedAlias = alias.trim().toLowerCase();
    const normalizedAppId = appId.trim();
    if (!normalizedAlias || !normalizedAppId) return;
    aliases.set(normalizedAlias, {
      alias: normalizedAlias,
      appId: normalizedAppId,
      name: name?.trim() || normalizedAppId,
    });
  };

  for (const item of DEFAULT_APP_ALIASES) {
    addAlias(item.alias, item.appId, item.name);
  }

  addAlias('default', defaultAppId, 'AI App mặc định');

  const raw = process.env.AI_APP_ALIASES?.trim();
  if (raw) {
    for (const item of raw.split(',')) {
      const [alias, appId, name] = item.split(':');
      if (alias && appId) addAlias(alias, appId, name);
    }
  }

  return [...aliases.values()];
}

function resolveApp(args: Record<string, string>, aliases: AppAlias[], defaultAppId: string) {
  const requested = (args.app || args.wf || args.workflow || args.aiapp || 'derma').trim();
  const byAlias = aliases.find((item) => item.alias === requested.toLowerCase());
  if (byAlias) return byAlias;

  return {
    alias: requested || 'default',
    appId: requested || defaultAppId,
    name: requested || defaultAppId,
  };
}

async function loadProfilesByNameOrId(omni: OmniLogin) {
  const profiles: ProfileRef[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await omni.profiles.list({
      page,
      pageSize: 100,
      sort: 'date_created',
      sortType: 'asc',
    });
    const docs = (result.docs || []) as Array<{ id?: number; name?: string }>;
    profiles.push(
      ...docs
        .filter((item) => Number.isInteger(item.id))
        .map((item) => ({
          id: Number(item.id),
          name: String(item.name || ''),
        })),
    );
    if (docs.length < 100) break;
  }
  return profiles;
}

async function resolveProfileRefs(omni: OmniLogin, refs: string[], defaultProfileRef: string) {
  const requested = refs.length > 0 ? refs : [defaultProfileRef];
  const profiles = await loadProfilesByNameOrId(omni);
  if (requested.some((ref) => ref.trim().toLowerCase() === 'all')) {
    const allProfileIds = profiles
      .slice()
      .sort((left, right) => {
        const leftNumber = Number(left.name);
        const rightNumber = Number(right.name);
        if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) return leftNumber - rightNumber;
        return left.id - right.id;
      })
      .map((profile) => profile.id);

    return {
      requested,
      resolved: allProfileIds,
      unresolved: [],
      profiles,
    };
  }

  const resolved: number[] = [];
  const unresolved: string[] = [];

  for (const ref of requested) {
    const byName = profiles.find((profile) => profile.name === ref);
    if (byName) {
      resolved.push(byName.id);
      continue;
    }

    const id = Number(ref);
    if (Number.isInteger(id) && id > 0 && profiles.some((profile) => profile.id === id)) {
      resolved.push(id);
      continue;
    }

    unresolved.push(ref);
  }

  return {
    requested,
    resolved: [...new Set(resolved)],
    unresolved,
    profiles,
  };
}

function loadMktProxyConfig(): MktProxyConfig {
  const apiKey = process.env.MKT_PROXY_API_KEY?.trim() || '';
  const keys = parseCsv(process.env.MKT_PROXY_KEYS);
  return {
    enabled: parseBoolean(process.env.MKT_PROXY_ENABLED, Boolean(apiKey && keys.length > 0)),
    apiBaseUrl: process.env.MKT_PROXY_API_BASE_URL?.trim() || 'https://api.mktproxy.com/api',
    apiKey,
    keys,
    rotateMode: process.env.MKT_PROXY_ROTATE_MODE?.trim() === 'new' ? 'new' : 'current',
  };
}

function pickMktProxyKey(profile: ProfileRef, config: MktProxyConfig) {
  if (config.keys.length === 0) return undefined;
  const profileNumber = Number(profile.name);
  const index = Number.isInteger(profileNumber) && profileNumber > 0 ? (profileNumber - 1) % config.keys.length : profile.id % config.keys.length;
  return config.keys[index];
}

async function fetchMktProxy(config: MktProxyConfig, key: string, preferNew: boolean) {
  const endpoint = preferNew ? 'new' : 'current';
  const url = `${config.apiBaseUrl.replace(/\/$/, '')}/proxies/${endpoint}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': config.apiKey,
    },
  });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: {
      ip?: string;
      port?: string | number;
      username?: string;
      user?: string;
      password?: string;
      pass?: string;
      protocol?: string;
    };
    message?: string;
  };

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message || `MKTProxy API failed: ${response.status}`);
  }

  const data = payload.data;
  const host = String(data.ip || '').trim();
  const port = Number(data.port);
  const username = String(data.username || data.user || '').trim();
  const password = String(data.password || data.pass || '').trim();
  if (!host || !Number.isInteger(port) || port <= 0 || !username || !password) {
    throw new Error('MKTProxy returned incomplete proxy data');
  }

  return {
    proxy_type: String(data.protocol || 'http').toLowerCase() === 'socks5' ? 'Socks5' : 'HTTP',
    host,
    port,
    user_name: username,
    password,
  } as const;
}

async function refreshMktProxyForProfile(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  profileId: number,
  config: MktProxyConfig,
) {
  if (!config.enabled) return;
  if (!config.apiKey || config.keys.length === 0) {
    throw new Error('MKTProxy chưa cấu hình MKT_PROXY_API_KEY hoặc MKT_PROXY_KEYS');
  }

  const profiles = await loadProfilesByNameOrId(omni);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Không tìm thấy profile ID ${profileId} để cập nhật proxy`);

  const key = pickMktProxyKey(profile, config);
  if (!key) throw new Error(`Không chọn được MKTProxy key cho profile ${profile.name || profileId}`);

  const proxyData = await fetchMktProxy(config, key, config.rotateMode === 'new');
  const detail = await omni.profiles.get(profileId);
  const currentProxy = (detail as { proxy?: { id?: number; name?: string } }).proxy;
  const proxyName = currentProxy?.name || `MKTProxy-${key.slice(-4)}`;

  if (currentProxy?.id) {
    await omni.proxies.update(currentProxy.id, {
      name: proxyName,
      ...proxyData,
    });
  } else {
    const created = await omni.proxies.create({
      name: proxyName,
      ...proxyData,
    });
    await omni.profiles.assignProxy(created.id, [profileId]);
  }

  await telegram.sendMessage(
    chatId,
    [
      '<b>Đã cập nhật proxy MKTProxy</b>',
      `Profile: ${code(profile.name || profileId)}`,
      `Key: ${code('...' + key.slice(-4))}`,
      `Proxy: ${code(`${proxyData.host}:${proxyData.port}`)}`,
      `Chế độ: ${code(config.rotateMode)}`,
    ].join('\n'),
  );
}

async function waitForProfileRunOrCaptcha(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  app: AppAlias,
  profileId: number,
  profileRunSeconds: number,
  state: RunState,
  logStartOffset: number,
): Promise<ProfileWaitResult> {
  const deadline = Date.now() + Math.max(0, profileRunSeconds) * 1000;
  const logPath = getAiAppLogPath(app.appId);

  while (Date.now() < deadline) {
    if (!state.active) return 'stopped';

    const newLog = readFileSlice(logPath, logStartOffset);
    if (newLog.includes('GOOGLE_CAPTCHA_DETECTED')) {
      state.lastMessage = `Profile ${profileId} gặp Google CAPTCHA, bỏ qua profile này`;
      await telegram.sendMessage(
        chatId,
        [
          '<b>Phát hiện Google CAPTCHA</b>',
          `Profile: ${code(profileId)}`,
          'Bot sẽ đóng profile này và chuyển sang profile tiếp theo.',
        ].join('\n'),
      );
      await omni.close(profileId).catch(() => undefined);
      return 'captcha';
    }

    await delay(Math.min(5000, Math.max(1000, deadline - Date.now())));
  }

  return state.active ? 'completed' : 'stopped';
}

class TelegramClient {
  constructor(private readonly token: string) {}

  private async request<T>(method: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description || `Telegram API lỗi: ${method}`);
    }

    return payload.result as T;
  }

  getUpdates(offset: number) {
    return this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  async getFile(fileId: string) {
    return this.request<{ file_path: string }>('getFile', { file_id: fileId });
  }

  async downloadFile(filePath: string): Promise<string> {
    const response = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return await response.text();
  }

  sendMessage(chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
    return this.request<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    return this.request<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async sendDocument(chatId: number, filePath: string, caption?: string) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    
    const fileContent = readFileSync(filePath);
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('document', blob, path.basename(filePath));
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const payload = (await response.json()) as { ok: boolean; description?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description || 'Telegram API lỗi: sendDocument');
    }
  }

  editMessageText(chatId: number, messageId: number, text: string) {
    return this.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }).catch((err) => {
      console.log(`[telegram-client] editMessageText failed:`, err.message || String(err));
    });
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.request('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    }).catch((err) => {
      console.log(`[telegram-client] deleteMessage failed:`, err.message || String(err));
    });
  }
}

function welcomeText(omniHost: string) {
  return [
    '<b>╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮</b>',
    '<b>   👏 Chào mừng bạn quay lại với Bot Omnilogin!   </b>',
    '<b>╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯</b>',
    '',
    '⚡ <b>Bot hỗ trợ:</b>',
    '- Đánh giá & Index GSC (Tự động viết review & gửi index URL)',
    '- Nuôi / Warmup Profiles sạch (Tăng trust Chrome)',
    '- Tương tác SEO Google & Rank QA',
    '- Bơm Traffic Facebook -> Website Khải Hoàn Derma',
    '',
    '🔗 <b>Về hệ thống:</b>',
    '- Target Site: <code>khaihoanderma.com</code>',
    `- Host: <code>${omniHost}</code>`,
    '- Hàng đợi: Gửi file <code>.txt</code> chứa link sản phẩm/bài viết',
    '',
    '<i>Nhấp vào các nút dưới đây để chạy kịch bản nhanh hoặc gửi file .txt để cập nhật hàng đợi Index GSC.</i>'
  ].join('\n');
}

function helpText(defaultAppId: string) {
  return [
    '<b>🤖 BOT OMNILOGIN - HƯỚNG DẪN SỬ DỤNG HỆ THỐNG</b>',
    '--------------------------------------------',
    '<b>1. Danh sách kịch bản (Workflow)</b>',
    `• ${code('derma')} : Quét thứ hạng Google + Lướt web Khải Hoàn Derma`,
    `• ${code('nuoi')}  : Nuôi tài khoản (đọc báo, xem YouTube, tìm kiếm ngẫu nhiên)`,
    `• ${code('index')} : Tự động Đánh giá & Index GSC các link trong file gửi lên`,
    `• ${code('fb')}    : Nuôi Facebook 2-3 phút, tìm Fanpage & kích vào link Web Khải Hoàn Derma`,
    '',
    '<b>2. Hướng dẫn chạy 1 profile</b>',
    `• Đánh giá & Index GSC: ${code('/run app=index profile=37')}`,
    `• Bơm Traffic Facebook: ${code('/run app=fb profile=37')}`,
    `• Chạy Rank QA: ${code('/run app=derma profile=37')}`,
    `• Nuôi tài khoản: ${code('/run app=nuoi profile=1')}`,
    '',
    '<b>3. Hướng dẫn chạy hàng loạt (hỗ trợ dải profile, ví dụ 37-66)</b>',
    `• Bơm Traffic Facebook dải profile: ${code('/run app=fb profiles=37-66 delay=60-180 close=1')}`,
    `• Chạy Đánh giá & Index GSC dải profile: ${code('/run app=index profiles=37-40 delay=60-120 close=1')}`,
    `• Nuôi dải tài khoản: ${code('/run app=nuoi profiles=1-10 delay=60 close=1')}`,
    `• Chạy Rank QA dải: ${code('/run app=derma profiles=37-66 delay=60-180 close=1')}`,
    '',
    '<b>4. Giải thích các tham số chính</b>',
    `• ${code('app=...')} : Tên kịch bản cần chạy (${code('derma')} / ${code('nuoi')} / ${code('index')} / ${code('fb')})`,
    `• ${code('profile=...')} : Tên hoặc ID của 1 profile duy nhất`,
    `• ${code('profiles=...')} : Dải profile (${code('37-66')}, hoặc danh sách ${code('1,2,3')}, hoặc ${code('all')})`,
    `• ${code('delay=...')} : Độ trễ ngẫu nhiên giữa các profile (ví dụ: ${code('60-120')} giây)`,
    `• ${code('close=1')} : Tự động đóng trình duyệt sau khi chạy xong (mặc định)`,
    '',
    '<b>5. Lệnh điều khiển & Kiểm tra</b>',
    `• ${code('/status')} : Kiểm tra tiến trình đang chạy trực tiếp`,
    `• ${code('/stop')}   : Dừng chạy và đóng tất cả trình duyệt đang mở`,
    `• ${code('/list')}   : Xem danh sách đầy đủ các kịch bản đang hỗ trợ`,
    `• ${code('/start')} hoặc ${code('/help')} : Hiển thị bảng hướng dẫn này`,
    '--------------------------------------------',
    `Mặc định: ${code(defaultAppId)}`
  ].join('\n');
}

function listText(aliases: AppAlias[], defaultAppId: string) {
  return [
    '<b>Danh sách workflow có thể gọi</b>',
    '',
    ...aliases.map((item) => `${code(item.alias)} → ${code(item.appId)} - ${escapeHtml(item.name)}`),
    '',
    '<b>Lệnh hay dùng</b>',
    code('/run app=nuoi profile=1 close=1'),
    code('/run app=fb profiles=37-66 delay=60 close=1'),
    code('/run app=derma profiles=1,2,3 delay=60 close=1'),
    code('/run app=index profile=37 close=1'),
    code('/run app=index profile=37 close=1'),
    code('/status'),
    code('/stop'),
    '',
    '<b>Workflow mặc định</b>',
    code(defaultAppId),
  ].join('\n');
}

async function runAiAppForProfiles(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  app: AppAlias,
  profileRefs: ProfileRef[],
  delayRange: DelayRange,
  profileRunSeconds: number,
  closeAfterRun: boolean,
  mktProxyConfig: MktProxyConfig,
  gscSyncConfig: GscSyncConfig,
  state: RunState,
) {
  state.active = true;
  state.appAlias = app.alias;
  state.appId = app.appId;
  state.startedAt = new Date().toISOString();
  state.profiles = profileRefs.map((p) => p.id);
  state.profileRunSeconds = profileRunSeconds;
  state.closeAfterRun = closeAfterRun;

  try {
    const queueStartMsg = await telegram.sendMessage(
      chatId,
      [
        `🚀 <b>KHỞI CHẠY HÀNG ĐỢI: [${app.alias}]</b>`,
        `--------------------------------------------`,
        `📋 Tổng số profile: <b>${profileRefs.length}</b>`,
        `👤 Danh sách: <code>${profileRefs.map((p) => p.name).join(', ')}</code>`,
        `🔄 Trạng thái: Đang chuẩn bị chạy...`,
        `--------------------------------------------`
      ].join('\n')
    );

    if (gscSyncConfig.enabled && gscSyncConfig.syncBeforeRun && app.appId === DEFAULT_APP_ID) {
      state.lastMessage = 'Đang đồng bộ keyword từ Google Search Console';
      await telegram.editMessageText(
        chatId,
        queueStartMsg.message_id,
        [
          `🚀 <b>KHỞI CHẠY HÀNG ĐỢI: [${app.alias}]</b>`,
          `--------------------------------------------`,
          `📋 Tổng số profile: <b>${profileRefs.length}</b>`,
          `👤 Danh sách: <code>${profileRefs.map((p) => p.name).join(', ')}</code>`,
          `🔄 Trạng thái: Đang đồng bộ keyword từ GSC...`,
          `--------------------------------------------`
        ].join('\n')
      );
      try {
        const syncResult = await syncGscKeywordPool();
        const gscInfo = syncResult.skipped
          ? `Dùng pool cũ (${syncResult.count || 0} từ khóa)`
          : `Đã đồng bộ mới (${syncResult.count || 0} từ khóa)`;
        await telegram.editMessageText(
          chatId,
          queueStartMsg.message_id,
          [
            `🚀 <b>KHỞI CHẠY HÀNG ĐỢI: [${app.alias}]</b>`,
            `--------------------------------------------`,
            `📋 Tổng số profile: <b>${profileRefs.length}</b>`,
            `👤 Danh sách: <code>${profileRefs.map((p) => p.name).join(', ')}</code>`,
            `🔑 GSC Keywords: <b>${gscInfo}</b>`,
            `🔄 Trạng thái: Đang chuẩn bị chạy các profile...`,
            `--------------------------------------------`
          ].join('\n')
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await telegram.editMessageText(
          chatId,
          queueStartMsg.message_id,
          [
            `🚀 <b>KHỞI CHẠY HÀNG ĐỢI: [${app.alias}]</b>`,
            `--------------------------------------------`,
            `📋 Tổng số profile: <b>${profileRefs.length}</b>`,
            `👤 Danh sách: <code>${profileRefs.map((p) => p.name).join(', ')}</code>`,
            `⚠️ GSC: <i>Lỗi đồng bộ (${escapeHtml(message)})</i>`,
            `🔄 Trạng thái: Đang chuẩn bị chạy các profile...`,
            `--------------------------------------------`
          ].join('\n')
        );
      }
    }

    for (let index = 0; index < profileRefs.length; index++) {
      if (!state.active) break;
      const profileRef = profileRefs[index];
      const profileId = profileRef.id;
      const profileName = profileRef.name;
      state.currentProfile = profileId;
      state.lastMessage = `Đang chạy profile ${profileName}`;

      await telegram.editMessageText(
        chatId,
        queueStartMsg.message_id,
        [
          `🚀 <b>HÀNG ĐỢI HOẠT ĐỘNG: [${app.alias}]</b>`,
          `--------------------------------------------`,
          `📋 Tiến độ: <b>${index + 1}/${profileRefs.length}</b> profiles`,
          `👤 Đang xử lý: <b>Profile ${profileName}</b> (ID: ${profileId})`,
          `--------------------------------------------`
        ].join('\n')
      ).catch(() => {});

      await refreshMktProxyForProfile(telegram, chatId, omni, profileId, mktProxyConfig);
      const aiAppLogOffset = getFileSize(getAiAppLogPath(app.appId));
      const localScriptPath = getLocalAiAppScriptPath(app.appId);
      const hasLocalScript = existsSync(localScriptPath);

      const result = hasLocalScript
        ? await runLocalAiAppScript(telegram, chatId, omni, app, profileId, profileName)
        : await omni.aiApps.run(app.appId, {
            profileId,
            mode: 'debug',
          });

      if (!result) {
        throw new Error(
          `Không thể chạy kịch bản ${app.appId}: không tìm thấy local script và AI App không phản hồi`,
        );
      }

      if (!hasLocalScript) {
        if (!result.ok) {
          await telegram.sendMessage(
            chatId,
            `❌ <b>Profile ${profileName} (ID: ${profileId}) chạy lỗi:</b> ${code(result.error || 'không rõ lỗi')}`
          );
        } else {
          await telegram.sendMessage(
            chatId,
            `🟢 <b>Profile ${profileName} (ID: ${profileId}) đã gửi lệnh chạy thành công.</b>`
          );
        }
      }

      if (result.ok && !hasLocalScript && profileRunSeconds > 0) {
        state.lastMessage = `Đang chờ profile ${profileName} hoàn tất trong ${profileRunSeconds}s`;
        const waitResult = await waitForProfileRunOrCaptcha(
          telegram,
          chatId,
          omni,
          app,
          profileId,
          profileRunSeconds,
          state,
          aiAppLogOffset,
        );
        if (waitResult === 'captcha') {
          if (index < profileRefs.length - 1) {
            const actualDelay = delayRange.min === delayRange.max 
              ? delayRange.min 
              : delayRange.min + Math.floor(Math.random() * (delayRange.max - delayRange.min + 1));
            if (actualDelay > 0) {
              state.lastMessage = `Nghỉ ${actualDelay}s sau CAPTCHA trước profile tiếp theo`;
              const captchaDelayMsg = await telegram.sendMessage(
                chatId,
                `⏳ <b>Tạm nghỉ sau CAPTCHA:</b> Đang nghỉ ${actualDelay}s trước khi chuyển sang profile tiếp theo...`
              );
              await delay(actualDelay * 1000);
              await telegram.deleteMessage(chatId, captchaDelayMsg.message_id).catch(() => {});
            }
          }
          continue;
        }
      }

      if (!state.active) break;

      if (closeAfterRun) {
        state.lastMessage = `Đang đóng profile ${profileName}`;
        try {
          await omni.close(profileId);
        } catch (error) {
          console.log(`[bot] failed to close profile ${profileId}:`, error);
        }
      }

      if (index < profileRefs.length - 1) {
        const actualDelay = delayRange.min === delayRange.max 
          ? delayRange.min 
          : delayRange.min + Math.floor(Math.random() * (delayRange.max - delayRange.min + 1));
        if (actualDelay > 0) {
          if (!state.active) break;
          state.lastMessage = `Nghỉ ${actualDelay}s trước profile tiếp theo`;
          const delayMsg = await telegram.sendMessage(
            chatId,
            `⏳ <b>Tạm nghỉ:</b> Đang nghỉ ${actualDelay}s trước khi chạy Profile <b>${profileRefs[index + 1].name}</b>...`
          );
          await delay(actualDelay * 1000);
          await telegram.deleteMessage(chatId, delayMsg.message_id).catch(() => {});
        }
      }
    }

    if (state.active) {
      state.lastMessage = 'Hoàn tất hàng đợi profile';
      await telegram.editMessageText(
        chatId,
        queueStartMsg.message_id,
        [
          `✅ <b>ĐÃ HOÀN TẤT TOÀN BỘ HÀNG ĐỢI!</b>`,
          `--------------------------------------------`,
          `🎯 Kịch bản: <b>[${app.alias}]</b>`,
          `📋 Tổng số đã chạy: <b>${profileRefs.length}</b> profiles`,
          `👤 Danh sách: <code>${profileRefs.map((p) => p.name).join(', ')}</code>`,
          `--------------------------------------------`
        ].join('\n')
      ).catch(() => {});
    } else {
      state.lastMessage = 'Hàng đợi đã dừng';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.lastMessage = message;
    await telegram.sendMessage(
      chatId,
      [
        '<b>Lỗi khi chạy workflow</b>',
        `Alias: ${code(app.alias)}`,
        `Chi tiết: ${code(message)}`,
      ].join('\n'),
    );
  } finally {
    state.active = false;
    state.currentProfile = undefined;
  }
}

function readJsonFileSafe(path: string) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch (e) {
    console.log('[telegram-bot] readJsonFileSafe failed:', path, e);
  }
  return null;
}

const defaultMenuKeyboard = {
  remove_keyboard: true
};

const defaultInlineKeyboard = {
  inline_keyboard: [
    [
      { text: '💙 Chạy Facebook Traffic (37-66)', callback_data: '/run app=fb profiles=37-66' }
    ],
    [
      { text: '🚀 Chạy Đánh giá & Index GSC (Profile 37)', callback_data: '/run app=index profile=37' }
    ],
    [
      { text: '🌱 Chạy Nuôi Profile (37-66)', callback_data: '/run app=warmup profiles=37-66' },
      { text: '📈 Chạy Rank QA (37-66)', callback_data: '/run app=derma profiles=37-66' }
    ],
    [
      { text: '📊 Xem trạng thái', callback_data: '/status' },
      { text: '🛑 Dừng kịch bản', callback_data: '/stop' }
    ],
    [
      { text: '📋 Danh sách Apps', callback_data: '/list' },
      { text: '❓ Trợ giúp', callback_data: '/help' }
    ]
  ]
};

async function runLocalAiAppScript(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  app: AppAlias,
  profileId: number,
  profileName: string,
) {
  const scriptPath = getLocalAiAppScriptPath(app.appId);
  if (!existsSync(scriptPath)) return null;

  // Set up live status message
  let statusMessageId: number | null = null;
  const statusLines: Record<string, string> = {};

  if (app.appId === 'profile-warmup-random') {
    statusLines.warmup = '🔵 Đang chạy các tác vụ duyệt web ngẫu nhiên...';
  } else if (app.appId === 'facebook-traffic-derma') {
    statusLines.warmup = '⚪ Mở Facebook News Feed';
    statusLines.search = '⚪ Tìm kiếm Fanpage Khải Hoàn Derma';
    statusLines.rank = '⚪ Lướt 1-10 bài đăng & Tìm link Website';
    statusLines.audit = '⚪ Tương tác Website (Xem ảnh, Tab, Giỏ hàng)';
  } else {
    statusLines.warmup = '⚪ Tìm kiếm & đọc báo (Warmup)';
    statusLines.search = '⚪ Tìm kiếm từ khóa Derma';
    statusLines.rank = '⚪ Quét thứ hạng Google Search';
    statusLines.audit = '⚪ Tương tác trang mục tiêu (Audit)';
  }

  function escapeHtml(text: string) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderStatus(currentStep: string, detail?: any) {
    if (app.appId === 'profile-warmup-random') {
      return [
        `🤖 <b>Log tiến trình: Profile ${profileName}</b> (ID: ${profileId})`,
        `--------------------------------------------`,
        statusLines.warmup,
        `--------------------------------------------`,
        `<i>Cập nhật liên tục từ trình duyệt...</i>`
      ].join('\n');
    }

    if (app.appId === 'index-url-khaihoanderma') {
      if (currentStep === 'gsc_navigating') {
        statusLines.navigating = `🟢 Hoàn thành Đọc báo (Warmup)`;
        statusLines.inspecting = `🟢 Hoàn thành Đánh giá sản phẩm`;
        statusLines.submitting = `🔵 ${escapeHtml(detail || 'Đang mở GSC...')}`;
      } else if (currentStep === 'derma_start') {
        statusLines.submitting = `🔵 Đang kiểm tra URL GSC: <code>${escapeHtml(detail || '')}</code>`;
      } else if (currentStep === 'derma_page') {
        statusLines.submitting = `🔵 Đang phân tích dữ liệu Google Index (URL ${detail?.pageNum || 1}/${detail?.maxPages || 1})...`;
      } else if (currentStep === 'derma_found') {
        const urlStr = typeof detail === 'string' ? detail : (detail?.keyword || '');
        statusLines.submitting = `🟢 Đã index (bỏ qua): <code>${escapeHtml(urlStr)}</code>`;
      } else if (currentStep === 'audit_start') {
        statusLines.submitting = `🔵 Đang gửi yêu cầu lập chỉ mục...`;
      } else if (currentStep === 'audit_reading') {
        const elapsed = detail?.elapsed || 0;
        const total = detail?.total || 180;
        statusLines.submitting = `🔵 Đang chạy Live Test GSC: ${elapsed}/${total}s...`;
      } else if (currentStep === 'audit_done') {
        statusLines.submitting = `🟢 Đã gửi yêu cầu lập chỉ mục thành công!`;
      } else if (currentStep === 'gsc_quota_exceeded') {
        statusLines.submitting = `🔴 Đã hết hạn ngạch ngày của Google!`;
      } else if (currentStep === 'gsc_done') {
        statusLines.submitting = `🟢 Đã hoàn tất toàn bộ danh sách!`;
      } else if (currentStep === 'review_start') {
        statusLines.navigating = `🔵 Đang khởi động kịch bản Đánh giá & Index...`;
        statusLines.inspecting = `🔵 Đang mở sản phẩm: <code>${escapeHtml(detail || '')}</code>`;
      } else if (currentStep === 'review_generating') {
        statusLines.inspecting = `🔵 Đang viết đánh giá AI cho sản phẩm...`;
      } else if (currentStep === 'review_done') {
        statusLines.inspecting = `🟢 Đã gửi đánh giá sản phẩm thành công!`;
      }

      return [
        `🤖 <b>Log tiến trình: Profile ${profileName}</b> (ID: ${profileId})`,
        `--------------------------------------------`,
        statusLines.navigating,
        statusLines.inspecting,
        statusLines.submitting,
        `--------------------------------------------`,
        `<i>Cập nhật liên tục từ trình duyệt...</i>`
      ].join('\n');
    }

    if (app.appId === 'facebook-traffic-derma') {
      if (currentStep === 'fb_warmup_start') {
        statusLines.warmup = `🔵 Mở Facebook & lướt tin ngẫu nhiên...`;
      } else if (currentStep === 'fb_warmup_reading') {
        const elapsed = detail?.elapsed || 0;
        const total = detail?.total || 180;
        statusLines.warmup = `🔵 Đang lướt Facebook Feed (${elapsed}/${total}s)...`;
      } else if (currentStep === 'fb_warmup_done') {
        statusLines.warmup = `🟢 Đã lướt Facebook Feed 1-2 phút`;
      } else if (currentStep === 'fb_search_start') {
        statusLines.search = `🔵 ${escapeHtml(detail || 'Tìm kiếm Fanpage...')}`;
      } else if (currentStep === 'fb_search_results') {
        statusLines.search = `🔵 Đang quét tìm Page: "Dược mỹ phẩm-Khải Hoàn Derma"...`;
      } else if (currentStep === 'fb_page_opened') {
        statusLines.search = `🟢 Đã vào Fanpage Khải Hoàn Derma`;
      } else if (currentStep === 'fb_target_start') {
        statusLines.rank = `🔵 Lướt 1-10 bài đăng & Tìm link Website...`;
      } else if (currentStep === 'fb_post_reading') {
        statusLines.rank = `🔵 Lướt bài đăng ${detail?.postNum || 1}/${detail?.maxPosts || 10} & kiểm tra link...`;
      } else if (currentStep === 'fb_link_found') {
        statusLines.rank = `🟢 Đã bấm link trên bài đăng Fanpage sang khaihoanderma.com`;
      } else if (currentStep === 'web_audit_start') {
        statusLines.audit = `🔵 Đang lướt xem bài viết, sản phẩm & giỏ hàng (4 phút)...`;
      } else if (currentStep === 'web_audit_reading') {
        const elapsed = detail?.elapsed || 0;
        const total = detail?.total || 240;
        statusLines.audit = `🔵 Đang lướt Website khaihoanderma.com (${elapsed}/${total}s)...`;
      } else if (currentStep === 'web_add_to_cart') {
        statusLines.audit = `🟢 Đã giả lập bỏ sản phẩm vào giỏ hàng!`;
      } else if (currentStep === 'web_audit_done') {
        statusLines.audit = `🟢 Hoàn thành 4 phút lướt đọc bài & tương tác Website!`;
      }

      return [
        `🤖 <b>Log tiến trình: Profile ${profileName}</b> (ID: ${profileId})`,
        `--------------------------------------------`,
        statusLines.warmup,
        statusLines.search,
        statusLines.rank,
        statusLines.audit,
        `--------------------------------------------`,
        `<i>Cập nhật liên tục từ trình duyệt...</i>`
      ].join('\n');
    }

    if (currentStep === 'news_start') {
      statusLines.warmup = `🔵 Đang đọc báo: ${escapeHtml(detail || 'Tin tức...')}`;
    } else if (currentStep === 'news_reading') {
      const elapsed = detail?.elapsed || 0;
      const total = detail?.total || 0;
      statusLines.warmup = `🔵 Đang đọc báo: ${elapsed}/${total} giây...`;
    } else if (currentStep === 'news_done') {
      statusLines.warmup = `🟢 Đã đọc báo xong`;
    } else if (currentStep === 'derma_start') {
      statusLines.search = `🔵 Đang tìm kiếm từ khóa: <b>${escapeHtml(detail || '')}</b>`;
    } else if (currentStep === 'derma_page') {
      statusLines.rank = `🔵 Đang quét trang ${detail?.pageNum || 1}/${detail?.maxPages || 5} của Google...`;
    } else if (currentStep === 'derma_found') {
      statusLines.search = `🟢 Đã tìm từ khóa: <b>${escapeHtml(detail?.keyword || '')}</b>`;
      statusLines.rank = `🟢 Tìm thấy tại Trang ${detail?.pageNum || 1}, Vị trí ${detail?.position || 1}`;
    } else if (currentStep === 'derma_not_found') {
      statusLines.search = `🟢 Đã tìm từ khóa: <b>${escapeHtml(detail?.keyword || '')}</b>`;
      statusLines.rank = `🟡 Không tìm thấy trên Google (sẽ đi trực tiếp)`;
    } else if (currentStep === 'audit_start') {
      statusLines.audit = `🔵 Bắt đầu tương tác website mục tiêu...`;
    } else if (currentStep === 'audit_reading') {
      const elapsed = detail?.elapsed || 0;
      const total = detail?.total || 0;
      const url = String(detail?.url || '');
      const urlPath = url ? url.substring(url.indexOf('//') + 2) : '';
      const shortUrl = urlPath.length > 30 ? '...' + urlPath.substring(urlPath.length - 27) : urlPath;
      statusLines.audit = `🔵 Đang lướt trang: ${escapeHtml(shortUrl)} (${elapsed}/${total}s)...`;
    } else if (currentStep === 'audit_done') {
      statusLines.audit = `🟢 Đã tương tác xong website`;
    }

    return [
      `🤖 <b>Log tiến trình: Profile ${profileName}</b> (ID: ${profileId})`,
      `--------------------------------------------`,
      statusLines.warmup,
      statusLines.search,
      statusLines.rank,
      statusLines.audit,
      `--------------------------------------------`,
      `<i>Cập nhật liên tục từ trình duyệt...</i>`
    ].join('\n');
  }

  try {
    const msg = await telegram.sendMessage(chatId, renderStatus('init'));
    statusMessageId = msg.message_id;
  } catch (e) {
    console.log('[telegram-status] failed to send initial status:', e);
  }

  const scriptStartedAt = Date.now();
  try {
    // Open profile with retry logic
    let session: any;
    try {
      const openResult = await omni.open(profileId, { headless: false });
      session = openResult.session;
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('already') || errMsg.includes('openned') || errMsg.includes('open')) {
        console.log(`Profile ${profileId} browser is already open/opening. Closing and retrying in 3s...`);
        await omni.close(profileId).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000));
        const openResult = await omni.open(profileId, { headless: false });
        session = openResult.session;
      } else {
        throw err;
      }
    }

    const reporter = async (step: string, detail?: any) => {
      if (statusMessageId !== null) {
        const updatedText = renderStatus(step, detail);
        await telegram.editMessageText(chatId, statusMessageId, updatedText).catch(() => {});
      }
    };

    const script = readFileSync(scriptPath, 'utf8');
    const runScript = new AsyncFunction('page', 'omni', '__params', script);

    await runScript(session.page, session.services, {
      reporter,
      openAiApiKey: process.env.OPENAI_API_KEY?.trim()
    });
    const elapsedMs = Date.now() - scriptStartedAt;

    let reportText = `🟢 <b>Kịch bản đã hoàn tất thành công!</b>\nProfile: <b>${profileName}</b> (ID: ${profileId})`;

    if (app.appId === 'khaihoan-derma-rank-qa') {
      const outPath = 'C:\\Users\\Admin\\Desktop\\key_derma\\khaihoan-derma-rank-qa-output.json';
      const output = readJsonFileSafe(outPath);
      if (output) {
        const keyword = output.keyword || 'Không rõ';
        const rank = output.googleRank;
        const rankText = rank !== null && rank !== undefined ? `Trang ${Math.ceil(rank/10)} (Vị trí ${rank})` : 'Không tìm thấy (vào trực tiếp)';
        const newsHost = output.newsWarmup?.selectedResult?.host || 'Không rõ';
        const newsDuration = Math.floor((output.newsWarmup?.readStats?.elapsedMs || 0) / 1000);
        const visitedCount = output.siteAudit?.visitedPages?.length || 0;
        const auditDuration = Math.floor((output.siteAudit?.elapsedMs || 0) / 1000);
        const totalDuration = Math.floor(elapsedMs / 1000);
        const totalMin = Math.floor(totalDuration / 60);
        const totalSec = totalDuration % 60;

        reportText = [
          `📊 <b>BÁO CÁO CHI TIẾT: PROFILE ${profileName}</b>`,
          `--------------------------------------------`,
          `🤖 Kịch bản: <b>Khải Hoàn Derma Rank QA</b>`,
          `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
          `🔑 Từ khóa: <code>${escapeHtml(keyword)}</code>`,
          `📈 Thứ hạng Google: <b>${rankText}</b>`,
          `📰 Đọc báo (Warmup): <code>${escapeHtml(newsHost)}</code> (${newsDuration}s)`,
          `👁️ Tương tác Web: Đã duyệt <b>${visitedCount} trang</b> (${auditDuration}s)`,
          `⏱️ Tổng thời gian: <b>${totalMin} phút ${totalSec}s</b>`,
          `--------------------------------------------`,
          `✅ <b>HOÀN THÀNH XUẤT SẮC!</b>`
        ].join('\n');
      }
    } else if (app.appId === 'profile-warmup-random') {
      const outPath = 'C:\\Users\\Admin\\Desktop\\profile-warmup-random-output.json';
      const output = readJsonFileSafe(outPath);
      if (output) {
        const actions = Array.isArray(output.actions) ? output.actions : [];
        const taskSummaryLines = actions.map((act: any) => {
          const name = act.taskName;
          const emoji = act.ok ? '🟢' : '🔴';
          const elapsed = Math.floor((act.elapsedMs || 0) / 1000);
          if (name === 'youtubeWatch') {
            const videoTitle = act.result?.video?.title || 'ngẫu nhiên';
            const shortTitle = videoTitle.length > 35 ? videoTitle.substring(0, 32) + '...' : videoTitle;
            return `• ${emoji} YouTube: Xem "${escapeHtml(shortTitle)}" (${elapsed}s)`;
          } else if (name === 'newsBrowse') {
            const site = act.result?.site || 'tin tức';
            const shortSite = site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            return `• ${emoji} Đọc báo: <code>${escapeHtml(shortSite)}</code> (${elapsed}s)`;
          } else if (name === 'directBrowse') {
            const url = act.result?.url || 'trang web';
            const shortUrl = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            return `• ${emoji} Duyệt web: <code>${escapeHtml(shortUrl)}</code> (${elapsed}s)`;
          }
          return `• ${emoji} Tác vụ ${name} (${elapsed}s)`;
        }).join('\n');

        const totalDuration = Math.floor(elapsedMs / 1000);

        reportText = [
          `📊 <b>BÁO CÁO CHI TIẾT: PROFILE ${profileName}</b>`,
          `--------------------------------------------`,
          `🤖 Kịch bản: <b>Nuôi & Warmup Profile</b>`,
          `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
          `⏱️ Tổng thời gian: <b>${totalDuration} giây</b>`,
          `📋 Các tác vụ đã hoàn thành:`,
          taskSummaryLines,
          `--------------------------------------------`,
          `✅ <b>NUÔI PROFILE HOÀN TẤT!</b>`
        ].join('\n');
      }
    } else if (app.appId === 'index-url-khaihoanderma') {
      const outPath = 'C:\\Users\\Admin\\Downloads\\index-url-output.json';
      const output = readJsonFileSafe(outPath);
      if (output) {
        const totalDuration = Math.floor(elapsedMs / 1000);
        const totalMin = Math.floor(totalDuration / 60);
        const totalSec = totalDuration % 60;

        let shouldSendFile = false;

        if (output.quotaExceeded) {
          shouldSendFile = true;
          reportText = [
            `⚠️ <b>QUÁ HẠN NGẠCH LẬP CHỈ MỤC (GOOGLE QUOTA EXCEEDED)</b>`,
            `--------------------------------------------`,
            `🤖 Kịch bản: <b>Đánh giá & Index URL Khai Hoàn Derma</b>`,
            `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
            `⏱️ Đã chạy trong: <b>${totalMin} phút ${totalSec}s</b>`,
            `🟢 Đã gửi yêu cầu index mới: <b>${output.indexedCount} URL</b>`,
            `🔵 Đã có sẵn trong chỉ mục (bỏ qua): <b>${output.alreadyIndexedCount} URL</b>`,
            `--------------------------------------------`,
            `📌 <b>DANH SÁCH CÁC URL CHƯA ĐƯỢC INDEX CÒN LẠI:</b>`,
            Array.isArray(output.unindexedUrls) && output.unindexedUrls.length > 0
              ? output.unindexedUrls.map((u: string) => `• <code>${escapeHtml(u)}</code>`).join('\n')
              : 'Không còn URL nào.',
            `--------------------------------------------`,
            `🔴 <b>TẠM DỪNG: Vui lòng thử lại vào ngày mai khi Google reset hạn ngạch!</b>`,
            `📥 <i>Bot đang gửi đính kèm file chứa các link chưa index còn lại...</i>`
          ].join('\n');
        } else if (output.hasError) {
          shouldSendFile = true;
          reportText = [
            `❌ <b>KỊCH BẢN GẶP LỖI KHI LẬP CHỈ MỤC</b>`,
            `--------------------------------------------`,
            `🤖 Kịch bản: <b>Đánh giá & Index GSC Khai Hoàn Derma</b>`,
            `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
            `⚠️ Lỗi: <code>${escapeHtml(output.errorMessage || 'Lỗi không xác định')}</code>`,
            `⏱️ Đã chạy trong: <b>${totalMin} phút ${totalSec}s</b>`,
            `🟢 Đã gửi yêu cầu index mới: <b>${output.indexedCount} URL</b>`,
            `🔵 Đã có sẵn trong chỉ mục (bỏ qua): <b>${output.alreadyIndexedCount} URL</b>`,
            `--------------------------------------------`,
            `📌 <b>DANH SÁCH CÁC URL CHƯA ĐƯỢC INDEX CÒN LẠI:</b>`,
            Array.isArray(output.unindexedUrls) && output.unindexedUrls.length > 0
              ? output.unindexedUrls.map((u: string) => `• <code>${escapeHtml(u)}</code>`).join('\n')
              : 'Không còn URL nào.',
            `--------------------------------------------`,
            `📥 <i>Bot đang gửi đính kèm file chứa các link chưa index còn lại...</i>`
          ].join('\n');
        } else {
          reportText = [
            `📊 <b>BÁO CÁO CHI TIẾT: PROFILE ${profileName}</b>`,
            `--------------------------------------------`,
            `🤖 Kịch bản: <b>Đánh giá & Index GSC Khai Hoàn Derma</b>`,
            `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
            `⏱️ Tổng thời gian: <b>${totalMin} phút ${totalSec}s</b>`,
            `🟢 Đã gửi yêu cầu index mới: <b>${output.indexedCount} URL</b>`,
            `🔵 Đã có sẵn trong chỉ mục (bỏ qua): <b>${output.alreadyIndexedCount} URL</b>`,
            `--------------------------------------------`,
            `🎉 <b>HOÀN THÀNH: Toàn bộ danh sách URL đã được đánh giá và gửi yêu cầu lập chỉ mục thành công!</b>`
          ].join('\n');
        }

        if (statusMessageId !== null) {
          await telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
          statusMessageId = null;
        }
        await telegram.sendMessage(chatId, reportText, defaultMenuKeyboard);

        if (shouldSendFile) {
          const txtFilePath = 'C:\\Users\\Admin\\Downloads\\khaihoanderma.txt';
          if (existsSync(txtFilePath)) {
            try {
              await telegram.sendDocument(
                chatId,
                txtFilePath,
                `Danh sách các URL chưa được index còn lại (Profile ${profileName})`
              );
            } catch (err: any) {
              console.error('[bot] sendDocument failed:', err);
              await telegram.sendMessage(chatId, `❌ Lỗi gửi file danh sách URL còn lại: <code>${err.message}</code>`);
            }
          }
        }

        // Always delete the local queue file after the run finishes
        const txtFilePath = 'C:\\Users\\Admin\\Downloads\\khaihoanderma.txt';
        if (existsSync(txtFilePath)) {
          try {
            unlinkSync(txtFilePath);
            console.log('[bot] Deleted local queue file on run completion.');
          } catch (err) {
            console.error('[bot] failed to delete TXT file:', err);
          }
        }
        return { ok: true as const };
      }
    }

    if (statusMessageId !== null) {
      await telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
      statusMessageId = null;
    }
    await telegram.sendMessage(chatId, reportText, defaultMenuKeyboard);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failText = [
      `❌ <b>KỊCH BẢN CHẠY THẤT BẠI</b>`,
      `--------------------------------------------`,
      `🤖 Kịch bản: <b>${app.name}</b>`,
      `👤 Profile: <b>Tên ${profileName}</b> (ID: <b>${profileId}</b>)`,
      `⚠️ Lỗi: <code>${escapeHtml(message)}</code>`,
      `--------------------------------------------`
    ].join('\n');

    if (statusMessageId !== null) {
      await telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
      statusMessageId = null;
    }
    await telegram.sendMessage(chatId, failText, defaultMenuKeyboard);
    return { ok: false as const, error: message };
  }
}

async function main() {
  loadEnvFile();

  const token = requiredEnv('TELEGRAM_BOT_TOKEN');
  const allowedChatId = Number(requiredEnv('TELEGRAM_ALLOWED_CHAT_ID'));
  const defaultAppId = process.env.AI_APP_ID?.trim() || DEFAULT_APP_ID;
  const aliases = loadAppAliases(defaultAppId);
  const defaultProfileRef = process.env.DEFAULT_PROFILE_ID?.trim() || '1';
  const defaultDelaySeconds = parsePositiveInt(process.env.DEFAULT_PROFILE_DELAY_SECONDS, 60) || 60;
  const defaultProfileRunSeconds = parsePositiveInt(process.env.DEFAULT_PROFILE_RUN_SECONDS, 180) || 180;
  const defaultCloseAfterRun = parseBoolean(process.env.CLOSE_PROFILE_AFTER_RUN, true);
  const mktProxyConfig = loadMktProxyConfig();
  const gscConfig = loadGscConfig();
  const gscSyncConfig: GscSyncConfig = {
    enabled: gscConfig.enabled,
    syncBeforeRun: parseBoolean(process.env.GSC_SYNC_BEFORE_RUN, true),
  };
  const omniHost = process.env.OMNILOGIN_HOST?.trim() || 'http://localhost:35353';

  const telegram = new TelegramClient(token);
  const omni = new OmniLogin({ host: omniHost, timeout: 60_000 });
  const state: RunState = { active: false };
  let offset = 0;



  console.log(`Telegram bot started. DEFAULT_APP_ID=${defaultAppId}, OMNILOGIN_HOST=${omniHost}`);
  await telegram
    .sendMessage(
      allowedChatId,
      welcomeText(omniHost),
      defaultInlineKeyboard
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Startup message was not delivered: ${message}`);
      console.warn('Open Telegram and send /start to the bot once, then commands will work.');
    });

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        const callbackQuery = update.callback_query;

        let text = '';
        let chatId: number | undefined;
        let document = undefined;

        if (message) {
          text = (message.text || message.caption || '').trim();
          chatId = message.chat.id;
          document = message.document;
        } else if (callbackQuery) {
          text = (callbackQuery.data || '').trim();
          chatId = callbackQuery.message?.chat.id;
          // Answer callback query so the loading spinner on the button stops
          await telegram.answerCallbackQuery(callbackQuery.id).catch(() => {});
        }

        if (!chatId) continue;
        if (!text && !document) continue;

        if (chatId !== allowedChatId) {
          await telegram.sendMessage(
            chatId,
            [
              '<b>Không có quyền truy cập</b>',
              'Chat này không được phép điều khiển bot.',
            ].join('\n'),
          );
          continue;
        }

        // Map shortcut buttons to commands
        if (text === '💙 Chạy Facebook Traffic (37-66)') {
          text = '/run app=fb profiles=37-66';
        } else if (text === '🚀 Chạy Đánh giá & Index GSC (Profile 37)') {
          text = '/run app=index profile=37';
        } else if (text === '🌱 Chạy Nuôi Profile (Profiles 37-66)') {
          text = '/run app=warmup profiles=37-66';
        } else if (text === '📈 Chạy Rank QA (Profiles 37-66)') {
          text = '/run app=derma profiles=37-66';
        } else if (text === '📊 Xem trạng thái') {
          text = '/status';
        } else if (text === '🛑 Dừng kịch bản') {
          text = '/stop';
        } else if (text === '📋 Danh sách Apps') {
          text = '/list';
        } else if (text === '❓ Trợ giúp') {
          text = '/help';
        }

        // Handle GSC URL file upload
        if (message && message.document) {
          const doc = message.document;
          const fileName = doc.file_name || 'urls.txt';
          if (fileName.toLowerCase().endsWith('.txt')) {
            await telegram.sendMessage(chatId, `📥 Đang tải file <b>${fileName}</b>...`, defaultMenuKeyboard);
            try {
              const fileInfo = await telegram.getFile(doc.file_id);
              const content = await telegram.downloadFile(fileInfo.file_path);
              
              const savePath = 'C:\\Users\\Admin\\Downloads\\khaihoanderma.txt';
              const dir = path.dirname(savePath);
              if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
              }
              writeFileSync(savePath, content, 'utf8');

              // Reset progress database to run all URLs fresh
              const progressDbPath = 'C:\\Users\\Admin\\Downloads\\khaihoanderma-progress.json';
              if (existsSync(progressDbPath)) {
                try {
                  writeFileSync(progressDbPath, JSON.stringify({ indexed: [] }, null, 2), 'utf8');
                } catch (e) {}
              }

              await telegram.sendMessage(
                chatId,
                [
                  `✅ <b>Đã nhận và lưu file thành công!</b>`,
                  `📂 File: <code>${fileName}</code>`,
                  `📍 Lưu tại: <code>${savePath}</code>`,
                  `🔄 <i>Đã làm mới tiến trình lập chỉ mục cũ (sẽ chạy lại từ đầu).</i>`,
                  '',
                  `👉 Nhập lệnh chạy: ${code('/run app=index profile=37')}`
                ].join('\n'),
                defaultMenuKeyboard
              );
            } catch (err: any) {
              await telegram.sendMessage(chatId, `❌ Lỗi tải file: <code>${err.message}</code>`, defaultMenuKeyboard);
            }
            continue;
          } else {
            await telegram.sendMessage(chatId, '⚠️ Bot chỉ nhận các file dạng text (đuôi <code>.txt</code>).', defaultMenuKeyboard);
            continue;
          }
        }

        if (text.startsWith('/start')) {
          await telegram.sendMessage(chatId, welcomeText(omniHost), defaultInlineKeyboard);
          continue;
        }

        if (text.startsWith('/help')) {
          await telegram.sendMessage(chatId, helpText(defaultAppId), defaultInlineKeyboard);
          continue;
        }

        if (text.startsWith('/list')) {
          await telegram.sendMessage(chatId, listText(aliases, defaultAppId), defaultMenuKeyboard);
          continue;
        }

        if (text.startsWith('/status')) {
          await telegram.sendMessage(
            chatId,
            state.active
              ? [
                  '<b>Trạng thái: Đang chạy</b>',
                  `Alias: ${code(state.appAlias || '')}`,
                  `AI App: ${code(state.appId || '')}`,
                  `Bắt đầu lúc: ${code(state.startedAt || '')}`,
                  `Profiles: ${code(state.profiles?.join(', ') || '')}`,
                  `Profile hiện tại: ${code(state.currentProfile || '')}`,
                  `Thời gian chờ/profile: ${code(state.profileRunSeconds ? `${state.profileRunSeconds}s` : '')}`,
                  `Tự đóng profile: ${code(state.closeAfterRun ? 'có' : 'không')}`,
                  `Ghi chú: ${code(state.lastMessage || '')}`,
                ].join('\n')
              : [
                  '<b>Trạng thái: Đang rảnh</b>',
                  `Ghi chú gần nhất: ${code(state.lastMessage || 'chưa có')}`,
                ].join('\n'),
            defaultMenuKeyboard
          );
          continue;
        }

        if (text.startsWith('/stop')) {
          if (state.childProcess) {
            state.childProcess.kill();
            state.childProcess = undefined;
          }
          const args = parseArgs(text);
          const app = resolveApp(args, aliases, defaultAppId);
          await omni.aiApps.stop(app.appId);
          if (state.currentProfile) {
            await omni.close(state.currentProfile).catch(() => undefined);
          }
          state.active = false;
          state.lastMessage = `Đã gửi lệnh dừng ${app.alias}`;
          await telegram.sendMessage(
            chatId,
            [
              '<b>Đã gửi lệnh dừng</b>',
              `Alias: ${code(app.alias)}`,
              `AI App: ${code(app.appId)}`,
            ].join('\n'),
            defaultMenuKeyboard
          );
          continue;
        }

        if (text.startsWith('/review') || text === 'tự động đánh giá sản phẩm derma' || text.startsWith('/danhgia')) {
          if (state.active) {
            await telegram.sendMessage(
              chatId,
              [
                '<b>Bot đang bận</b>',
                `Dùng ${code('/status')} để xem trạng thái.`,
                `Dùng ${code('/stop')} nếu cần dừng kịch bản đang chạy.`,
              ].join('\n'),
              defaultMenuKeyboard
            );
            continue;
          }

          state.active = true;
          state.appAlias = 'review';
          state.appId = 'auto-review';
          state.startedAt = new Date().toISOString();
          state.command = text;
          state.lastMessage = 'Đang chạy kịch bản tự động đánh giá sản phẩm mới về';

          const statusMsg = await telegram.sendMessage(
            chatId,
            [
              '🚀 <b>Bắt đầu kịch bản tự động đánh giá sản phẩm derma</b>',
              '--------------------------------------------',
              '🔄 Trạng thái: Đang khởi động kịch bản...',
              '--------------------------------------------'
            ].join('\n')
          );

          try {
            // Spawn child process to run npm run auto:review
            const child = spawn('npm', ['run', 'auto:review'], { shell: true, cwd: process.cwd() });
            state.childProcess = child;

            let lastStatusLines: string[] = ['Đang khởi chạy kịch bản...'];
            
            const updateTelegramStatus = async () => {
              const textContent = [
                '🚀 <b>Kịch bản tự động đánh giá sản phẩm derma</b>',
                '--------------------------------------------',
                ...lastStatusLines,
                '--------------------------------------------',
                '<i>Đang chạy ngầm...</i>'
              ].join('\n');
              await telegram.editMessageText(chatId, statusMsg.message_id, textContent).catch(() => {});
            };

            let buffer = '';
            
            const handleOutput = (data: Buffer) => {
              buffer += data.toString('utf8');
              const lines = buffer.split(/\r?\n/);
              // keep the last line if it's incomplete
              buffer = lines.pop() || '';
              
              let updated = false;
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                
                // Print to console so it goes to bot startup log
                console.log(`[auto-review-child] ${trimmed}`);
                
                // Detect progress lines we want to show in Telegram status
                if (
                  (trimmed.includes('Found') && trimmed.includes('product URLs')) ||
                  trimmed.includes('Checking product:') ||
                  trimmed.includes('Using Profile') ||
                  trimmed.includes('Submitting 5-star review') ||
                  trimmed.includes('Review submitted successfully') ||
                  trimmed.includes('Product already reviewed') ||
                  trimmed.includes('Error reviewing product') ||
                  trimmed.includes('Review form not found')
                ) {
                  // Format the line nicely for Telegram
                  let formatted = trimmed;
                  if (trimmed.includes('Found') && trimmed.includes('product URLs')) {
                    const count = trimmed.match(/Found (\d+) product/)?.[1] || '12';
                    formatted = `📋 Tìm thấy <b>${count} sản phẩm</b> trong mục Sản Phẩm Mới Về.`;
                  } else if (trimmed.includes('Checking product:')) {
                    const url = trimmed.split('Checking product:')[1].trim();
                    const basename = url.split('/product/')[1]?.replace(/\/$/, '') || url;
                    formatted = `🔍 <b>Sản phẩm:</b> <code>${basename}</code>`;
                  } else if (trimmed.includes('Using Profile')) {
                    const pName = trimmed.match(/Profile (.*?)( \(|$)/)?.[1] || '';
                    formatted = `👤 Profile: <b>${pName}</b>`;
                  } else if (trimmed.includes('Product already reviewed')) {
                    formatted = `⏭️ <i>Đã được đánh giá trước đó. Bỏ qua.</i>`;
                  } else if (trimmed.includes('Submitting 5-star review')) {
                    formatted = `✍️ <b>Đang gửi đánh giá 5 sao...</b>`;
                  } else if (trimmed.includes('Review submitted successfully')) {
                    formatted = `✅ <b>Đánh giá thành công!</b>`;
                  } else if (trimmed.includes('Error reviewing product')) {
                    formatted = `❌ <b>Gặp lỗi khi gửi đánh giá.</b>`;
                  } else if (trimmed.includes('Review form not found')) {
                    formatted = `⚠️ <i>Không thấy form (có thể đã tắt đánh giá). Bỏ qua.</i>`;
                  }
                  
                  lastStatusLines.push(formatted);
                  if (lastStatusLines.length > 8) {
                    lastStatusLines.shift(); // keep last 8 status lines
                  }
                  updated = true;
                }
              }
              
              if (updated) {
                updateTelegramStatus();
              }
            };

            child.stdout.on('data', handleOutput);
            child.stderr.on('data', handleOutput);

            child.on('close', async (code) => {
              state.active = false;
              state.childProcess = undefined;
              
              const finalMsg = code === 0 
                ? [
                    '✅ <b>HOÀN THÀNH TỰ ĐỘNG ĐÁNH GIÁ DERMA!</b>',
                    '--------------------------------------------',
                    '🎯 Kịch bản tự động đánh giá Sản Phẩm Mới Về đã kết thúc thành công.',
                    '--------------------------------------------'
                  ].join('\n')
                : [
                    '⚠️ <b>KỊCH BẢN ĐÃ KẾT THÚC VỚI LỖI</b>',
                    '--------------------------------------------',
                    `Mã thoát (Exit code): <code>${code}</code>`,
                    '--------------------------------------------'
                  ].join('\n');

              await telegram.editMessageText(chatId, statusMsg.message_id, finalMsg).catch(() => {});
            });

          } catch (err: any) {
            state.active = false;
            state.childProcess = undefined;
            const errMsg = err.message || String(err);
            await telegram.editMessageText(
              chatId,
              statusMsg.message_id,
              `❌ <b>Lỗi khi chạy kịch bản:</b> ${code(errMsg)}`
            ).catch(() => {});
          }
          continue;
        }

        if (text.startsWith('/run')) {
          if (state.active) {
            await telegram.sendMessage(
              chatId,
              [
                '<b>Bot đang bận</b>',
                `Dùng ${code('/status')} để xem trạng thái.`,
                `Dùng ${code('/stop')} nếu cần dừng workflow đang chạy.`,
              ].join('\n'),
            );
            continue;
          }

          const args = parseArgs(text);
          const app = resolveApp(args, aliases, defaultAppId);
          const profileRefs = parseProfileRefs(args);
          const profileResolve = await resolveProfileRefs(omni, profileRefs, defaultProfileRef);
          if (profileResolve.unresolved.length > 0 || profileResolve.resolved.length === 0) {
            await telegram.sendMessage(
              chatId,
              [
                '<b>Không tìm thấy profile</b>',
                `Bạn nhập: ${code(profileResolve.requested.join(', '))}`,
                `Không tìm thấy: ${code(profileResolve.unresolved.join(', ') || 'tất cả')}`,
                '',
                '<b>Profile hiện có</b>',
                code(profileResolve.profiles.map((profile) => `${profile.name}=ID ${profile.id}`).join(', ')),
              ].join('\n'),
            );
            continue;
          }
          const resolvedIds = profileResolve.resolved;
          const profilesToRun = profileResolve.profiles.filter((p) => resolvedIds.includes(p.id));

          const delayRange = parseDelayRange(args.delay, defaultDelaySeconds);
          const profileRunSeconds =
            parsePositiveInt(args.wait || args.runtime || args.runwait, defaultProfileRunSeconds) ||
            defaultProfileRunSeconds;
          const closeAfterRun = parseBoolean(args.close || args.closeprofile, defaultCloseAfterRun);
          state.command = text;
          void runAiAppForProfiles(
            telegram,
            chatId,
            omni,
            app,
            profilesToRun,
            delayRange,
            profileRunSeconds,
            closeAfterRun,
            mktProxyConfig,
            gscSyncConfig,
            state,
          );
          continue;
        }

        await telegram.sendMessage(
          chatId,
          [
            '<b>Không hiểu lệnh</b>',
            '',
            helpText(defaultAppId),
          ].join('\n'),
        );
      }
    } catch (error) {
      console.error(error);
      await delay(3000);
    }
  }
}

await main();
