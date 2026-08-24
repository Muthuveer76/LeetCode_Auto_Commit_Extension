# LeetCode Auto-Committer Chrome Extension

## Overview
The **LeetCode Auto-Committer** is a Google Chrome extension designed to seamlessly integrate your LeetCode problem-solving workflow with your GitHub profile. Every time you successfully submit a solution on LeetCode, this extension automatically detects the success, extracts your code, formats the problem title, and commits the code directly to a specified GitHub repository without any manual intervention.

## Core Features
- **Zero-Touch Commits**: After initial setup, it runs completely in the background.
- **Robust Detection Mechanism**: Bypasses unstable DOM parsing and complex network interception by querying LeetCode's official public GraphQL APIs using timestamp-based detection.
- **Smart File Naming**: Automatically names files based on the problem number and title (e.g., `3622_Check_Divisibility_by_Digit_Sum_and_Product.py`).
- **Visual Feedback**: Displays color-coded badges on the extension icon (`OK` in green for success, `ERR` in red for failure).
- **Built-in Connection Tester**: Allows users to verify their GitHub credentials and repository access directly from the popup.

---

## System Architecture & Modules Used

The extension is built using the **Manifest V3** standard for Chrome Extensions and consists of four main modules:

### 1. `manifest.json` (Configuration)
The blueprint of the extension. It defines the extension's metadata, requests the necessary permissions (`storage` for credentials), sets host permissions (`leetcode.com` and `api.github.com`), and maps the background and content scripts to their respective execution environments.

### 2. Popup Module (`popup.html`, `popup.css`, `popup.js`)
**Functionality:** The user-facing interface.
- Provides a simple form for users to input their GitHub Username, Repository Name, and Personal Access Token (PAT).
- Uses `chrome.storage.local` to securely persist these credentials.
- Includes a **"Test GitHub Connection"** button that attempts to push a dummy file (`leetcode_test_connection.txt`) to the configured repository to validate the token's scopes and repository existence.

### 3. Content Script (`content.js`)
**Functionality:** The "Eyes and Ears" on the LeetCode page.
- **Event Listener:** Injected into `https://leetcode.com/problems/*`. It listens for click events on the entire document and identifies if a "Submit" button was clicked.
- **Smart Polling:** Once a submit action is detected, it begins polling LeetCode's `questionSubmissionList` GraphQL API every 3 seconds.
- **Race-Condition Immune Detection:** It identifies "new" submissions not by tracking fragile ID states, but by looking at the submission's Unix timestamp. If it finds a submission created within the last 120 seconds that hasn't been processed yet, it tracks it.
- **State Evaluation:** It waits for the submission's `isPending` flag to become false. If the final `statusDisplay` is "Accepted", it fires a secondary GraphQL query (`submissionDetails`) to fetch the exact code and language metadata.
- **Data Handoff:** It packages the code, language extension, and raw title, and sends it to the background script via `chrome.runtime.sendMessage`.

### 4. Background Service Worker (`background.js`)
**Functionality:** The "Backend / Git Client".
- **Message Listener:** Wakes up when it receives a payload from `content.js`.
- **GitHub API Integration:** Retrieves the user's credentials from local storage.
- **Encoding:** Converts the raw code into a Unicode-safe Base64 string (`btoa`).
- **Committing:** Makes a `PUT` request to the GitHub REST API (`https://api.github.com/repos/{owner}/{repo}/contents/{filename}`). If the file already exists (e.g., you optimized a previous solution), it dynamically fetches the file's previous `sha` hash to overwrite it correctly.
- **UI Updates:** Uses `chrome.action.setBadgeText` to show the user a success or error badge.

---

## Detailed Step-by-Step Backend Flow

1. **User Action:** The user clicks the "Submit" button on a LeetCode problem.
2. **Polling Initiated:** `content.js` intercepts the click and sets a `setInterval` to run every 3 seconds.
3. **Status Check:** It sends a POST request to `https://leetcode.com/graphql` with the `questionSubmissionList` query.
4. **Validation:** It parses the latest submission. If the submission is recent (`< 120` seconds old) and currently evaluating (`isPending === true`), it waits.
5. **Acceptance:** Once `isPending` is false, it checks the status. If `status === 10` (Accepted), it queries the `submissionDetails` GraphQL endpoint using the submission ID.
6. **Formatting:** It extracts the `questionFrontendId` and `title`, strips punctuation, and builds the filename: `[ID]_[Title].[ext]`.
7. **Dispatch:** `content.js` sends the payload to `background.js`.
8. **GitHub Push:** `background.js` authenticates via Bearer Token, Base64 encodes the code, and pushes it to GitHub. It returns a success status back to `content.js` (for console logging) and updates the extension icon badge.

---

## Security & Data Storage

The details you enter in the popup (your GitHub Username, Repository Name, and Personal Access Token) are stored entirely on your computer using `chrome.storage.local`.

Here is a breakdown of how this storage works and why it is secure:

- **Local & Offline:** The data never leaves your computer and is never sent to any external servers (other than directly to GitHub when making a commit). It does not sync to the cloud.
- **Sandboxed:** `chrome.storage.local` is deeply isolated by Google Chrome.
  - Other websites (including LeetCode) cannot read this data.
  - Other Chrome extensions cannot read this data.
- **Physical Location:** The actual physical file is encrypted and buried inside your operating system's Google Chrome profile data directory (typically located at `C:\Users\YourUser\AppData\Local\Google\Chrome\User Data\Default\Local Extension Settings\`).
- **How it's used:** When the extension detects an accepted submission, the background script (`background.js`) quietly reads your token from this local storage, attaches it to the GitHub API request, pushes the code, and immediately discards it from memory.

---

## Developer Guide: How to Modify or Build

If you want to modify this project, follow these instructions to set up your development environment.

### Prerequisites
- Google Chrome Browser.
- A text editor (VS Code, Sublime, etc.).
- A GitHub account and a Personal Access Token (PAT) with `repo` scopes.

### Local Installation (Developer Mode)
1. Clone or download this project directory to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left.
5. Select the folder containing `manifest.json`.

### Debugging Guide
If you modify the code and need to troubleshoot, Chrome isolates extension logs into two different places:

- **Debugging `content.js` (LeetCode Interactor):**
  1. Open a LeetCode problem page.
  2. Right-click anywhere on the page and click **Inspect** -> **Console**.
  3. Look for logs prefixed with `LeetCode Auto-Committer:`. This will show you exactly what the GraphQL polling is doing.

- **Debugging `background.js` (GitHub API):**
  1. Go to `chrome://extensions/`.
  2. Find the LeetCode Auto-Committer extension card.
  3. Click the blue **service worker** link next to "Inspect views".
  4. This opens a separate Developer Tools window. Here, you will see logs related to GitHub API requests, token errors, and file pushes.

### Common Modification Ideas
- **Change Folder Structure:** Open `background.js` and modify the `filename` variable on line 21. For example, to put all files in a folder named after the language, change it to: ``const filename = `${ext}/${title}.${ext}`;``
- **Support More Languages:** Open `content.js` and locate the `langToExt` dictionary. You can add or modify file extensions for specific LeetCode environment languages here.
