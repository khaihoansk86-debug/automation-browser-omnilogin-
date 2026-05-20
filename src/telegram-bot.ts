import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { OmniLogin } from '@omnilogin/sdk';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
    };
  };
};

type AppAlias = {
  alias: string;
  appId: string;
  name: string;
};

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
};

const DEFAULT_APP_ID = 'khaihoan-derma-rank-qa';
const DEFAULT_APP_ALIASES: AppAlias[] = [
  {
    alias: 'derma',
    appId: DEFAULT_APP_ID,
    name: 'Khai Hoàn Derma Rank QA',
  },
];

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

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
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

function parseProfiles(args: Record<string, string>) {
  const raw = args.profiles || args.profile;
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
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
      allowed_updates: ['message'],
    });
  }

  sendMessage(chatId: number, text: string) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }
}

function helpText(defaultAppId: string) {
  return [
    '<b>Bot điều khiển Omnilogin</b>',
    '',
    '<b>Lệnh hỗ trợ</b>',
    `${code('/list')} - xem danh sách workflow/AI App`,
    `${code('/run profile=1')} - chạy workflow mặc định`,
    `${code('/run app=derma profile=1')} - chạy workflow theo alias`,
    `${code('/run app=derma profiles=1,2 delay=60')} - chạy nhiều profile, nghỉ giữa mỗi profile`,
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

function listText(aliases: AppAlias[], defaultAppId: string) {
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

async function runAiAppForProfiles(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  app: AppAlias,
  profiles: number[],
  delaySeconds: number,
  profileRunSeconds: number,
  closeAfterRun: boolean,
  state: RunState,
) {
  state.active = true;
  state.appAlias = app.alias;
  state.appId = app.appId;
  state.startedAt = new Date().toISOString();
  state.profiles = profiles;
  state.profileRunSeconds = profileRunSeconds;
  state.closeAfterRun = closeAfterRun;

  try {
    for (let index = 0; index < profiles.length; index++) {
      if (!state.active) break;
      const profileId = profiles[index];
      state.currentProfile = profileId;
      state.lastMessage = `Đang chạy profile ${profileId}`;
      await telegram.sendMessage(
        chatId,
        [
          '<b>Bắt đầu chạy workflow</b>',
          `Alias: ${code(app.alias)}`,
          `AI App: ${code(app.appId)}`,
          `Tên: ${escapeHtml(app.name)}`,
          `Profile: ${code(profileId)}`,
          `Thứ tự: ${code(`${index + 1}/${profiles.length}`)}`,
        ].join('\n'),
      );

      const result = await omni.aiApps.run(app.appId, {
        profileId,
        mode: 'debug',
      });

      if (!result.ok) {
        await telegram.sendMessage(
          chatId,
          [
            '<b>Profile chạy lỗi</b>',
            `Alias: ${code(app.alias)}`,
            `Profile: ${code(profileId)}`,
            `Lỗi: ${code(result.error || 'không rõ lỗi')}`,
          ].join('\n'),
        );
      } else {
        await telegram.sendMessage(
          chatId,
          [
            '<b>Đã gửi lệnh chạy</b>',
            `Alias: ${code(app.alias)}`,
            `Profile: ${code(profileId)}`,
            'Omnilogin đang xử lý AI App trong nền.',
            `Bot sẽ chờ: ${code(`${profileRunSeconds} giây`)}`,
          ].join('\n'),
        );
      }

      if (result.ok && profileRunSeconds > 0) {
        state.lastMessage = `Đang chờ profile ${profileId} hoàn tất trong ${profileRunSeconds}s`;
        await telegram.sendMessage(
          chatId,
          [
            '<b>Đang chờ workflow hoàn tất</b>',
            `Profile: ${code(profileId)}`,
            `Thời gian chờ: ${code(`${profileRunSeconds} giây`)}`,
            `Tự đóng profile sau khi chờ: ${code(closeAfterRun ? 'có' : 'không')}`,
          ].join('\n'),
        );
        await delay(profileRunSeconds * 1000);
      }

      if (!state.active) break;

      if (result.ok && closeAfterRun) {
        state.lastMessage = `Đang đóng profile ${profileId}`;
        try {
          await omni.close(profileId);
          await telegram.sendMessage(
            chatId,
            [
              '<b>Đã đóng profile</b>',
              `Profile: ${code(profileId)}`,
            ].join('\n'),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await telegram.sendMessage(
            chatId,
            [
              '<b>Không đóng được profile</b>',
              `Profile: ${code(profileId)}`,
              `Chi tiết: ${code(message)}`,
            ].join('\n'),
          );
        }
      }

      if (index < profiles.length - 1 && delaySeconds > 0) {
        if (!state.active) break;
        state.lastMessage = `Nghỉ ${delaySeconds}s trước profile tiếp theo`;
        await telegram.sendMessage(
          chatId,
          [
            '<b>Tạm nghỉ giữa profile</b>',
            `Thời gian nghỉ: ${code(`${delaySeconds} giây`)}`,
            `Profile tiếp theo: ${code(profiles[index + 1])}`,
          ].join('\n'),
        );
        await delay(delaySeconds * 1000);
      }
    }

    if (state.active) {
      state.lastMessage = 'Hoàn tất hàng đợi profile';
      await telegram.sendMessage(
        chatId,
        [
          '<b>Hoàn tất hàng đợi</b>',
          `Alias: ${code(app.alias)}`,
          `AI App: ${code(app.appId)}`,
          `Profiles: ${code(profiles.join(', '))}`,
        ].join('\n'),
      );
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

async function main() {
  loadEnvFile();

  const token = requiredEnv('TELEGRAM_BOT_TOKEN');
  const allowedChatId = Number(requiredEnv('TELEGRAM_ALLOWED_CHAT_ID'));
  const defaultAppId = process.env.AI_APP_ID?.trim() || DEFAULT_APP_ID;
  const aliases = loadAppAliases(defaultAppId);
  const defaultProfileId = parsePositiveInt(process.env.DEFAULT_PROFILE_ID, 1) || 1;
  const defaultDelaySeconds = parsePositiveInt(process.env.DEFAULT_PROFILE_DELAY_SECONDS, 60) || 60;
  const defaultProfileRunSeconds = parsePositiveInt(process.env.DEFAULT_PROFILE_RUN_SECONDS, 180) || 180;
  const defaultCloseAfterRun = parseBoolean(process.env.CLOSE_PROFILE_AFTER_RUN, true);
  const omniHost = process.env.OMNILOGIN_HOST?.trim() || 'http://localhost:35353';

  const telegram = new TelegramClient(token);
  const omni = new OmniLogin({ host: omniHost, timeout: 60_000 });
  const state: RunState = { active: false };
  let offset = 0;

  console.log(`Telegram bot started. DEFAULT_APP_ID=${defaultAppId}, OMNILOGIN_HOST=${omniHost}`);
  await telegram
    .sendMessage(
      allowedChatId,
      [
        '<b>Bot đã sẵn sàng</b>',
        `Workflow mặc định: ${code(defaultAppId)}`,
        `Omnilogin: ${code(omniHost)}`,
        '',
        `Gõ ${code('/help')} để xem lệnh hỗ trợ.`,
      ].join('\n'),
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
        const text = message?.text?.trim();
        const chatId = message?.chat.id;
        if (!message || !text || !chatId) continue;

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

        if (text.startsWith('/help') || text.startsWith('/start')) {
          await telegram.sendMessage(chatId, helpText(defaultAppId));
          continue;
        }

        if (text.startsWith('/list')) {
          await telegram.sendMessage(chatId, listText(aliases, defaultAppId));
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
          );
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
          await telegram.sendMessage(
            chatId,
            [
              '<b>Đã gửi lệnh dừng</b>',
              `Alias: ${code(app.alias)}`,
              `AI App: ${code(app.appId)}`,
            ].join('\n'),
          );
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
          const profiles = parseProfiles(args);
          if (profiles.length === 0) profiles.push(defaultProfileId);

          const delaySeconds = parsePositiveInt(args.delay, defaultDelaySeconds) || defaultDelaySeconds;
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
            profiles,
            delaySeconds,
            profileRunSeconds,
            closeAfterRun,
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
