const keywordInput = document.querySelector('#keyword');
const randomKeywordInput = document.querySelector('#randomKeyword');
const profileSelect = document.querySelector('#profile');
const delaySecondsInput = document.querySelector('#delaySeconds');
const runButton = document.querySelector('#run');
const state = document.querySelector('#state');
const meta = document.querySelector('#meta');
const output = document.querySelector('#output');

function setState(message, isError = false) {
  state.textContent = message;
  state.classList.toggle('error', isError);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function loadConfig() {
  const config = await fetchJson('/api/config');
  keywordInput.value = config.defaultKeyword || 'Omnilogin';
  meta.textContent = `Target: ${config.targetDomain} | File keyword: ${config.keywordFilePath}`;
}

async function loadKeywords() {
  const keywords = await fetchJson('/api/keywords');
  meta.textContent = `${meta.textContent} | ${keywords.count} keywords`;
}

async function loadProfiles() {
  const profiles = await fetchJson('/api/profiles');
  profileSelect.innerHTML = '';

  if (profiles.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Khong co profile';
    profileSelect.append(option);
    return;
  }

  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = String(profile.id);
    option.textContent = `#${profile.id} - ${profile.name}`;
    option.selected = true;
    profileSelect.append(option);
  }
}

async function runWorkflow() {
  const profileIds = Array.from(profileSelect.selectedOptions)
    .map((option) => Number(option.value))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (profileIds.length === 0) {
    setState('Vui long chon it nhat 1 profile Omnilogin hop le.', true);
    return;
  }

  runButton.disabled = true;
  output.textContent = '';
  setState(`Dang chay ${profileIds.length} profile theo thu tu...`);

  try {
    const result = await fetchJson('/api/run-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        keyword: keywordInput.value,
        profileIds,
        useRandomKeyword: randomKeywordInput.checked,
        delaySeconds: Number(delaySecondsInput.value || 0),
      }),
    });
    const okCount = result.results.filter((item) => item.ok).length;
    const failCount = result.results.length - okCount;
    setState(`Hoan thanh: ${okCount} thanh cong, ${failCount} loi`);
    output.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    setState(error instanceof Error ? error.message : String(error), true);
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', runWorkflow);

try {
  await loadConfig();
  await loadKeywords();
  await loadProfiles();
  setState('San sang');
} catch (error) {
  setState(error instanceof Error ? error.message : String(error), true);
}
