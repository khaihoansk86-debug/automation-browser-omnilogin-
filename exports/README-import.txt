Files:
- khaihoan-derma-rank-qa.aiapp.json
- khaihoan-derma-rank-qa.js
- profile-warmup-random.aiapp.json
- profile-warmup-random.js

Recommended import:
1. Open Omnilogin.
2. Go to AI Coding / AI App import if available.
3. Choose khaihoan-derma-rank-qa.aiapp.json.
4. Select the Omnilogin profile when running.

What it does:
- Reads a random keyword from C:\Users\Admin\Desktop\key_derma\keyderma.txt unless the keyword input is filled.
- Opens Google and searches the keyword.
- Records whether khaihoanderma.com appears in the top organic links and its position.
- Opens khaihoanderma.com directly for site QA and crawls internal product/category links for up to 90 seconds.
- Writes result JSON to C:\Users\Admin\Desktop\key_derma\khaihoan-derma-rank-qa-output.json.

Note:
Omnilogin's "Quy trinh tu dong > Nhap file" workflow-package format is private in the desktop app.
If that dialog rejects this JSON, use the .js file in AI Coding by creating a new script and pasting/importing its content.

Profile warmup flow:
- App id: profile-warmup-random
- Telegram alias: nuoi
- Example: /run app=nuoi profiles=1,2 delay=60 close=1
- Randomly mixes Google search/read, YouTube watch, news reading, direct browsing, scrolling, light link clicks, and page health reloads.
