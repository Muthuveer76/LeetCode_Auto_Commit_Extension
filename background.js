// Helper to encode Unicode string to Base64 in JS
function encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
        String.fromCodePoint(byte)
    ).join("");
    return btoa(binString);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'commitCode') {
        const { title, code, ext } = request;
        console.log("Background received commit request:", title);
        
        chrome.storage.local.get(['username', 'repo', 'token'], async (result) => {
            if (!result.username || !result.repo || !result.token) {
                const msg = "GitHub credentials not configured";
                console.error(msg);
                sendResponse({ success: false, error: msg });
                return;
            }
            
            // File structure as requested: [Problem Name].[ext]
            const filename = `${title}.${ext}`;
            const url = `https://api.github.com/repos/${result.username}/${result.repo}/contents/${filename}`;
            const token = result.token;
            
            let sha = null;
            try {
                const getRes = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (getRes.ok) {
                    const getData = await getRes.json();
                    sha = getData.sha;
                }
            } catch (e) {
                console.error("Error checking existing file", e);
            }
            
            const encodedCode = encodeBase64(code || "");
            const body = { message: `Auto-commit: ${title}`, content: encodedCode };
            if (sha) body.sha = sha;
            
            try {
                const putRes = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                
                if (putRes.ok) {
                    console.log(`Successfully committed ${filename}`);
                    chrome.action.setBadgeText({ text: 'OK' });
                    chrome.action.setBadgeBackgroundColor({ color: '#2ea44f' });
                    sendResponse({ success: true });
                } else {
                    const errText = await putRes.text();
                    console.error("Failed to commit file", errText);
                    chrome.action.setBadgeText({ text: 'ERR' });
                    chrome.action.setBadgeBackgroundColor({ color: '#cb2431' });
                    sendResponse({ success: false, error: errText });
                }
                
                setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 3000);
            } catch (e) {
                console.error("Error committing file", e);
                chrome.action.setBadgeText({ text: 'ERR' });
                chrome.action.setBadgeBackgroundColor({ color: '#cb2431' });
                sendResponse({ success: false, error: e.toString() });
                setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 3000);
            }
        });
        
        return true; // Keep the message channel open for sendResponse
    }
});
