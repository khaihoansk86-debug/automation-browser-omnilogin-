export const appConfig = {
  defaultKeyword: process.env.DEFAULT_KEYWORD?.trim() || 'Omnilogin',
  keywordFilePath:
    process.env.KEYWORD_FILE_PATH?.trim() || 'C:\\Users\\Admin\\Desktop\\key_derma\\keyderma.txt',
  targetDomain: process.env.TARGET_DOMAIN?.trim() || 'khaihoanderma.com',
  targetBaseUrl: process.env.TARGET_BASE_URL?.trim() || 'https://khaihoanderma.com/',
  siteQaMaxSeconds: Number(process.env.SITE_QA_MAX_SECONDS || 90),
  omniloginHost: process.env.OMNILOGIN_HOST?.trim() || 'http://localhost:35353',
  serverPort: Number(process.env.PORT || 3000),
  closeProfileAfterRun: process.env.CLOSE_PROFILE_AFTER_RUN !== 'false',
};
