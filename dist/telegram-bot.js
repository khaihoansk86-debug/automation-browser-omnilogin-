import { existsSync, readFileSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { OmniLogin } from '@omnilogin/sdk';
const DEFAULT_APP_ID = 'khaihoan-derma-rank-qa';
const DEFAULT_APP_ALIASES = [
    {
        alias: 'derma',
        appId: DEFAULT_APP_ID,
        name: 'Khai Hoàn Derma Rank QA',
    },
];
function loadEnvFile(path = '.env') {
    if (!existsSync(path))
        return;
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex <= 0)
            continue;
        const key = trimmed.slice(0, equalIndex).trim();
        const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key])
            process.env[key] = value;
    }
}
function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
    return value;
}
function parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0)
        return parsed;
    return fallback;
}
function parseBoolean(value, fallback) {
    if (value === undefined)
        return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized))
        return false;
    return fallback;
}
function parseCsv(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseArgs(text) {
    const args = {};
    const parts = text.split(/\s+/).slice(1);
    for (const part of parts) {
        const [key, ...rest] = part.split('=');
        if (!key || rest.length === 0)
            continue;
        args[key.toLowerCase()] = rest.join('=').trim();
    }
    return args;
}
function parseProfileRefs(args) {
    const raw = args.profiles || args.profile;
    if (!raw)
        return [];
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function code(value) {
    return `<code>${escapeHtml(value)}</code>`;
}
function getAiAppLogPath(appId) {
    const explicit = process.env.AI_APP_LOG_PATH?.trim();
    if (explicit)
        return explicit;
    const appData = process.env.APPDATA || `${process.env.USERPROFILE}\\AppData\\Roaming`;
    return `${appData}\\omnilogin\\ai-app\\logs\\${appId}.log`;
}
function getFileSize(path) {
    try {
        return statSync(path).size;
    }
    catch {
        return 0;
    }
}
function readFileSlice(path, start) {
    try {
        const raw = readFileSync(path, 'utf8');
        return raw.slice(Math.min(start, raw.length));
    }
    catch {
        return '';
    }
}
function loadAppAliases(defaultAppId) {
    const aliases = new Map();
    const addAlias = (alias, appId, name) => {
        const normalizedAlias = alias.trim().toLowerCase();
        const normalizedAppId = appId.trim();
        if (!normalizedAlias || !normalizedAppId)
            return;
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
            if (alias && appId)
                addAlias(alias, appId, name);
        }
    }
    return [...aliases.values()];
}
function resolveApp(args, aliases, defaultAppId) {
    const requested = (args.app || args.wf || args.workflow || args.aiapp || 'derma').trim();
    const byAlias = aliases.find((item) => item.alias === requested.toLowerCase());
    if (byAlias)
        return byAlias;
    return {
        alias: requested || 'default',
        appId: requested || defaultAppId,
        name: requested || defaultAppId,
    };
}
async function loadProfilesByNameOrId(omni) {
    const profiles = [];
    for (let page = 1; page <= 50; page++) {
        const result = await omni.profiles.list({
            page,
            pageSize: 100,
            sort: 'date_created',
            sortType: 'asc',
        });
        const docs = (result.docs || []);
        profiles.push(...docs
            .filter((item) => Number.isInteger(item.id))
            .map((item) => ({
            id: Number(item.id),
            name: String(item.name || ''),
        })));
        if (docs.length < 100)
            break;
    }
    return profiles;
}
async function resolveProfileRefs(omni, refs, defaultProfileRef) {
    const requested = refs.length > 0 ? refs : [defaultProfileRef];
    const profiles = await loadProfilesByNameOrId(omni);
    const resolved = [];
    const unresolved = [];
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
function loadMktProxyConfig() {
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
function pickMktProxyKey(profile, config) {
    if (config.keys.length === 0)
        return undefined;
    const profileNumber = Number(profile.name);
    const index = Number.isInteger(profileNumber) && profileNumber > 0 ? (profileNumber - 1) % config.keys.length : profile.id % config.keys.length;
    return config.keys[index];
}
async function fetchMktProxy(config, key, preferNew) {
    const endpoint = preferNew ? 'new' : 'current';
    const url = `${config.apiBaseUrl.replace(/\/$/, '')}/proxies/${endpoint}?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
        headers: {
            'X-API-Key': config.apiKey,
        },
    });
    const payload = (await response.json());
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
    };
}
async function refreshMktProxyForProfile(telegram, chatId, omni, profileId, config) {
    if (!config.enabled)
        return;
    if (!config.apiKey || config.keys.length === 0) {
        throw new Error('MKTProxy chưa cấu hình MKT_PROXY_API_KEY hoặc MKT_PROXY_KEYS');
    }
    const profiles = await loadProfilesByNameOrId(omni);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile)
        throw new Error(`Không tìm thấy profile ID ${profileId} để cập nhật proxy`);
    const key = pickMktProxyKey(profile, config);
    if (!key)
        throw new Error(`Không chọn được MKTProxy key cho profile ${profile.name || profileId}`);
    const proxyData = await fetchMktProxy(config, key, config.rotateMode === 'new');
    const detail = await omni.profiles.get(profileId);
    const currentProxy = detail.proxy;
    const proxyName = currentProxy?.name || `MKTProxy-${key.slice(-4)}`;
    if (currentProxy?.id) {
        await omni.proxies.update(currentProxy.id, {
            name: proxyName,
            ...proxyData,
        });
    }
    else {
        const created = await omni.proxies.create({
            name: proxyName,
            ...proxyData,
        });
        await omni.profiles.assignProxy(created.id, [profileId]);
    }
    await telegram.sendMessage(chatId, [
        '<b>Đã cập nhật proxy MKTProxy</b>',
        `Profile: ${code(profile.name || profileId)}`,
        `Key: ${code('...' + key.slice(-4))}`,
        `Proxy: ${code(`${proxyData.host}:${proxyData.port}`)}`,
        `Chế độ: ${code(config.rotateMode)}`,
    ].join('\n'));
}
async function waitForProfileRunOrCaptcha(telegram, chatId, omni, app, profileId, profileRunSeconds, state, logStartOffset) {
    const deadline = Date.now() + Math.max(0, profileRunSeconds) * 1000;
    const logPath = getAiAppLogPath(app.appId);
    while (Date.now() < deadline) {
        if (!state.active)
            return 'stopped';
        const newLog = readFileSlice(logPath, logStartOffset);
        if (newLog.includes('GOOGLE_CAPTCHA_DETECTED')) {
            state.lastMessage = `Profile ${profileId} gặp Google CAPTCHA, bỏ qua profile này`;
            await telegram.sendMessage(chatId, [
                '<b>Phát hiện Google CAPTCHA</b>',
                `Profile: ${code(profileId)}`,
                'Bot sẽ đóng profile này và chuyển sang profile tiếp theo.',
            ].join('\n'));
            await omni.close(profileId).catch(() => undefined);
            return 'captcha';
        }
        await delay(Math.min(5000, Math.max(1000, deadline - Date.now())));
    }
    return state.active ? 'completed' : 'stopped';
}
class TelegramClient {
    token;
    constructor(token) {
        this.token = token;
    }
    async request(method, body) {
        const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const payload = (await response.json());
        if (!response.ok || !payload.ok) {
            throw new Error(payload.description || `Telegram API lỗi: ${method}`);
        }
        return payload.result;
    }
    getUpdates(offset) {
        return this.request('getUpdates', {
            offset,
            timeout: 30,
            allowed_updates: ['message'],
        });
    }
    sendMessage(chatId, text) {
        return this.request('sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        });
    }
}
function helpText(defaultAppId) {
    return [
        '<b>Bot điều khiển Omnilogin</b>',
        '',
        '<b>Lệnh hỗ trợ</b>',
        `${code('/list')} - xem danh sách workflow/AI App`,
        `${code('/run profile=1')} - chạy workflow mặc định theo tên profile hoặc ID`,
        `${code('/run app=derma profile=1')} - chạy workflow theo alias`,
        `${code('/run app=derma profiles=1,2 delay=60')} - chạy nhiều profile theo tên hoặc ID, nghỉ giữa mỗi profile`,
        `${code('/run app=derma profiles=1,2 wait=180 delay=60 close=1')} - chờ mỗi profile chạy xong rồi chuyển profile`,
        `${code('/status')} - xem trạng thái hiện tại`,
        `${code('/stop')} - dừng workflow mặc định`,
        `${code('/stop app=derma')} - dừng workflow theo alias`,
        `${code('/help')} - xem hướng dẫn`,
        '',
        '<b>Workflow mặc định</b>',
        code(defaultAppId),
    ].join('\n');
}
function listText(aliases, defaultAppId) {
    return [
        '<b>Danh sách workflow/AI App có thể gọi</b>',
        '',
        ...aliases.map((item) => `${code(item.alias)} → ${code(item.appId)}\n${escapeHtml(item.name)}`),
        '',
        '<b>Ví dụ</b>',
        code('/run app=derma profile=1'),
        code('/run app=derma profiles=1,2 delay=60'),
        code('/run app=derma profiles=1,2 wait=180 delay=60 close=1'),
        '',
        '<b>Workflow mặc định</b>',
        code(defaultAppId),
    ].join('\n');
}
async function runAiAppForProfiles(telegram, chatId, omni, app, profiles, delaySeconds, profileRunSeconds, closeAfterRun, mktProxyConfig, state) {
    state.active = true;
    state.appAlias = app.alias;
    state.appId = app.appId;
    state.startedAt = new Date().toISOString();
    state.profiles = profiles;
    state.profileRunSeconds = profileRunSeconds;
    state.closeAfterRun = closeAfterRun;
    try {
        for (let index = 0; index < profiles.length; index++) {
            if (!state.active)
                break;
            const profileId = profiles[index];
            state.currentProfile = profileId;
            state.lastMessage = `Đang chạy profile ${profileId}`;
            await telegram.sendMessage(chatId, [
                '<b>Bắt đầu chạy workflow</b>',
                `Alias: ${code(app.alias)}`,
                `AI App: ${code(app.appId)}`,
                `Tên: ${escapeHtml(app.name)}`,
                `Profile: ${code(profileId)}`,
                `Thứ tự: ${code(`${index + 1}/${profiles.length}`)}`,
            ].join('\n'));
            await refreshMktProxyForProfile(telegram, chatId, omni, profileId, mktProxyConfig);
            const aiAppLogOffset = getFileSize(getAiAppLogPath(app.appId));
            const result = await omni.aiApps.run(app.appId, {
                profileId,
                mode: 'debug',
            });
            if (!result.ok) {
                await telegram.sendMessage(chatId, [
                    '<b>Profile chạy lỗi</b>',
                    `Alias: ${code(app.alias)}`,
                    `Profile: ${code(profileId)}`,
                    `Lỗi: ${code(result.error || 'không rõ lỗi')}`,
                ].join('\n'));
            }
            else {
                await telegram.sendMessage(chatId, [
                    '<b>Đã gửi lệnh chạy</b>',
                    `Alias: ${code(app.alias)}`,
                    `Profile: ${code(profileId)}`,
                    'Omnilogin đang xử lý AI App trong nền.',
                    `Bot sẽ chờ: ${code(`${profileRunSeconds} giây`)}`,
                ].join('\n'));
            }
            if (result.ok && profileRunSeconds > 0) {
                state.lastMessage = `Đang chờ profile ${profileId} hoàn tất trong ${profileRunSeconds}s`;
                await telegram.sendMessage(chatId, [
                    '<b>Đang chờ workflow hoàn tất</b>',
                    `Profile: ${code(profileId)}`,
                    `Thời gian chờ: ${code(`${profileRunSeconds} giây`)}`,
                    `Tự đóng profile sau khi chờ: ${code(closeAfterRun ? 'có' : 'không')}`,
                ].join('\n'));
                const waitResult = await waitForProfileRunOrCaptcha(telegram, chatId, omni, app, profileId, profileRunSeconds, state, aiAppLogOffset);
                if (waitResult === 'captcha') {
                    if (index < profiles.length - 1 && delaySeconds > 0) {
                        state.lastMessage = `Nghỉ ${delaySeconds}s sau CAPTCHA trước profile tiếp theo`;
                        await telegram.sendMessage(chatId, [
                            '<b>Tạm nghỉ sau CAPTCHA</b>',
                            `Thời gian nghỉ: ${code(`${delaySeconds} giây`)}`,
                            `Profile tiếp theo: ${code(profiles[index + 1])}`,
                        ].join('\n'));
                        await delay(delaySeconds * 1000);
                    }
                    continue;
                }
            }
            if (!state.active)
                break;
            if (result.ok && closeAfterRun) {
                state.lastMessage = `Đang đóng profile ${profileId}`;
                try {
                    await omni.close(profileId);
                    await telegram.sendMessage(chatId, [
                        '<b>Đã đóng profile</b>',
                        `Profile: ${code(profileId)}`,
                    ].join('\n'));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    await telegram.sendMessage(chatId, [
                        '<b>Không đóng được profile</b>',
                        `Profile: ${code(profileId)}`,
                        `Chi tiết: ${code(message)}`,
                    ].join('\n'));
                }
            }
            if (index < profiles.length - 1 && delaySeconds > 0) {
                if (!state.active)
                    break;
                state.lastMessage = `Nghỉ ${delaySeconds}s trước profile tiếp theo`;
                await telegram.sendMessage(chatId, [
                    '<b>Tạm nghỉ giữa profile</b>',
                    `Thời gian nghỉ: ${code(`${delaySeconds} giây`)}`,
                    `Profile tiếp theo: ${code(profiles[index + 1])}`,
                ].join('\n'));
                await delay(delaySeconds * 1000);
            }
        }
        if (state.active) {
            state.lastMessage = 'Hoàn tất hàng đợi profile';
            await telegram.sendMessage(chatId, [
                '<b>Hoàn tất hàng đợi</b>',
                `Alias: ${code(app.alias)}`,
                `AI App: ${code(app.appId)}`,
                `Profiles: ${code(profiles.join(', '))}`,
            ].join('\n'));
        }
        else {
            state.lastMessage = 'Hàng đợi đã dừng';
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.lastMessage = message;
        await telegram.sendMessage(chatId, [
            '<b>Lỗi khi chạy workflow</b>',
            `Alias: ${code(app.alias)}`,
            `Chi tiết: ${code(message)}`,
        ].join('\n'));
    }
    finally {
        state.active = false;
        state.currentProfile = undefined;
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
    const omniHost = process.env.OMNILOGIN_HOST?.trim() || 'http://localhost:35353';
    const telegram = new TelegramClient(token);
    const omni = new OmniLogin({ host: omniHost, timeout: 60_000 });
    const state = { active: false };
    let offset = 0;
    console.log(`Telegram bot started. DEFAULT_APP_ID=${defaultAppId}, OMNILOGIN_HOST=${omniHost}`);
    await telegram
        .sendMessage(allowedChatId, [
        '<b>Bot đã sẵn sàng</b>',
        `Workflow mặc định: ${code(defaultAppId)}`,
        `Omnilogin: ${code(omniHost)}`,
        `MKTProxy: ${code(mktProxyConfig.enabled ? 'bật' : 'tắt')}`,
        '',
        `Gõ ${code('/help')} để xem lệnh hỗ trợ.`,
    ].join('\n'))
        .catch((error) => {
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
                const text = message?.text?.trim();
                const chatId = message?.chat.id;
                if (!message || !text || !chatId)
                    continue;
                if (chatId !== allowedChatId) {
                    await telegram.sendMessage(chatId, [
                        '<b>Không có quyền truy cập</b>',
                        'Chat này không được phép điều khiển bot.',
                    ].join('\n'));
                    continue;
                }
                if (text.startsWith('/help') || text.startsWith('/start')) {
                    await telegram.sendMessage(chatId, helpText(defaultAppId));
                    continue;
                }
                if (text.startsWith('/list')) {
                    await telegram.sendMessage(chatId, listText(aliases, defaultAppId));
                    continue;
                }
                if (text.startsWith('/status')) {
                    await telegram.sendMessage(chatId, state.active
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
                        ].join('\n'));
                    continue;
                }
                if (text.startsWith('/stop')) {
                    const args = parseArgs(text);
                    const app = resolveApp(args, aliases, defaultAppId);
                    await omni.aiApps.stop(app.appId);
                    if (state.currentProfile) {
                        await omni.close(state.currentProfile).catch(() => undefined);
                    }
                    state.active = false;
                    state.lastMessage = `Đã gửi lệnh dừng ${app.alias}`;
                    await telegram.sendMessage(chatId, [
                        '<b>Đã gửi lệnh dừng</b>',
                        `Alias: ${code(app.alias)}`,
                        `AI App: ${code(app.appId)}`,
                    ].join('\n'));
                    continue;
                }
                if (text.startsWith('/run')) {
                    if (state.active) {
                        await telegram.sendMessage(chatId, [
                            '<b>Bot đang bận</b>',
                            `Dùng ${code('/status')} để xem trạng thái.`,
                            `Dùng ${code('/stop')} nếu cần dừng workflow đang chạy.`,
                        ].join('\n'));
                        continue;
                    }
                    const args = parseArgs(text);
                    const app = resolveApp(args, aliases, defaultAppId);
                    const profileRefs = parseProfileRefs(args);
                    const profileResolve = await resolveProfileRefs(omni, profileRefs, defaultProfileRef);
                    if (profileResolve.unresolved.length > 0 || profileResolve.resolved.length === 0) {
                        await telegram.sendMessage(chatId, [
                            '<b>Không tìm thấy profile</b>',
                            `Bạn nhập: ${code(profileResolve.requested.join(', '))}`,
                            `Không tìm thấy: ${code(profileResolve.unresolved.join(', ') || 'tất cả')}`,
                            '',
                            '<b>Profile hiện có</b>',
                            code(profileResolve.profiles.map((profile) => `${profile.name}=ID ${profile.id}`).join(', ')),
                        ].join('\n'));
                        continue;
                    }
                    const profiles = profileResolve.resolved;
                    const delaySeconds = parsePositiveInt(args.delay, defaultDelaySeconds) || defaultDelaySeconds;
                    const profileRunSeconds = parsePositiveInt(args.wait || args.runtime || args.runwait, defaultProfileRunSeconds) ||
                        defaultProfileRunSeconds;
                    const closeAfterRun = parseBoolean(args.close || args.closeprofile, defaultCloseAfterRun);
                    state.command = text;
                    await telegram.sendMessage(chatId, [
                        '<b>Đã map profile</b>',
                        `Bạn nhập: ${code(profileResolve.requested.join(', '))}`,
                        `ID sẽ chạy: ${code(profiles.join(', '))}`,
                    ].join('\n'));
                    void runAiAppForProfiles(telegram, chatId, omni, app, profiles, delaySeconds, profileRunSeconds, closeAfterRun, mktProxyConfig, state);
                    continue;
                }
                await telegram.sendMessage(chatId, [
                    '<b>Không hiểu lệnh</b>',
                    '',
                    helpText(defaultAppId),
                ].join('\n'));
            }
        }
        catch (error) {
            console.error(error);
            await delay(3000);
        }
    }
}
await main();
