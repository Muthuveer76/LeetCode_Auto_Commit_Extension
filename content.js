let processedSubmissionIds = new Set();
let pollingInterval = null;
let pollCount = 0;

document.addEventListener('click', (e) => {
    let target = e.target;
    let isSubmit = false;
    while (target && target !== document) {
        if (target.tagName === 'BUTTON' && (target.textContent || '').toLowerCase().includes('submit')) {
            isSubmit = true;
            break;
        }
        if (target.getAttribute && target.getAttribute('data-e2e-locator') === 'console-submit-button') {
            isSubmit = true;
            break;
        }
        target = target.parentNode;
    }

    if (isSubmit) {
        console.log("LeetCode Auto-Committer: Submit button clicked! Starting polling for results...");
        if (pollingInterval) clearInterval(pollingInterval);
        pollCount = 0;
        
        pollingInterval = setInterval(() => {
            checkLatestSubmission();
            pollCount++;
            if (pollCount > 20) { // Poll for 20 * 3 = 60 seconds
                console.log("LeetCode Auto-Committer: Polling timed out.");
                clearInterval(pollingInterval);
            }
        }, 3000);
    }
});

function getQuestionSlug() {
    const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
    return match ? match[1] : null;
}

function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

async function checkLatestSubmission() {
    const questionSlug = getQuestionSlug();
    if (!questionSlug) return;
    
    const query = `
    query questionSubmissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
        questionSubmissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
            submissions { id statusDisplay status isPending timestamp }
        }
    }`;
    try {
        const res = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Csrftoken': getCsrfToken() },
            body: JSON.stringify({ query, variables: { offset: 0, limit: 1, questionSlug } })
        });
        const data = await res.json();
        const subs = data?.data?.questionSubmissionList?.submissions;
        if (subs && subs.length > 0) {
            const latest = subs[0];
            
            // Treat as pending if isPending is true, or if statusDisplay is explicitly 'Pending', or if statusDisplay is empty
            const isCurrentlyPending = latest.isPending === true || latest.statusDisplay === 'Pending' || latest.statusDisplay === '';

            // Check if this submission was created in the last 120 seconds
            const subTime = parseInt(latest.timestamp);
            const now = Math.floor(Date.now() / 1000);
            const isRecent = (now - subTime) < 120;

            if (isRecent && !processedSubmissionIds.has(latest.id)) {
                if (!isCurrentlyPending) {
                    processedSubmissionIds.add(latest.id);
                    clearInterval(pollingInterval);
                    if (latest.statusDisplay === 'Accepted' || latest.status === 10) {
                        console.log("LeetCode Auto-Committer: New accepted submission detected!", latest.id);
                        await fetchAndCommit(latest.id);
                    } else {
                        console.log("LeetCode Auto-Committer: Submission finished but was not accepted:", latest.statusDisplay, "(Code: " + latest.status + ")");
                    }
                }
            }
        }
    } catch (e) {}
}

function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

function commitDirectly(data) {
    console.log("LeetCode Auto-Committer: Preparing to commit directly", data);
    const langToExt = {
        'cpp': 'cpp', 'java': 'java', 'python': 'py', 'python3': 'py',
        'c': 'c', 'csharp': 'cs', 'javascript': 'js', 'typescript': 'ts',
        'php': 'php', 'swift': 'swift', 'kotlin': 'kt', 'dart': 'dart',
        'golang': 'go', 'ruby': 'rb', 'scala': 'scala', 'rust': 'rs',
        'racket': 'rkt', 'erlang': 'erl', 'elixir': 'ex'
    };
    const langName = (data.langName || '').toLowerCase();
    const ext = langToExt[langName] || 'txt';
    
    chrome.runtime.sendMessage({
        action: 'commitCode',
        title: data.titleSlug,
        code: data.code,
        ext: ext
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("LeetCode Auto-Committer: Message failed", chrome.runtime.lastError.message);
        } else if (response && response.success) {
            console.log("LeetCode Auto-Committer: Successfully pushed to GitHub!");
        } else {
            console.error("LeetCode Auto-Committer: Failed to push to GitHub", response ? response.error : "Unknown error");
        }
    });
}

async function fetchAndCommit(submissionId) {
    console.log("LeetCode Auto-Committer: Fetching details for submission", submissionId);
    const query = `
    query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
            code
            lang {
                name
            }
            question {
                questionFrontendId
                title
                titleSlug
            }
        }
    }`;

    try {
        const csrfToken = getCsrfToken();
        console.log("LeetCode Auto-Committer: CSRF Token found:", !!csrfToken);
        const res = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Csrftoken': csrfToken
            },
            body: JSON.stringify({
                query: query,
                variables: { submissionId: parseInt(submissionId) }
            })
        });
        
        const data = await res.json();
        console.log("LeetCode Auto-Committer: GraphQL response:", data);
        if (data && data.data && data.data.submissionDetails) {
            const details = data.data.submissionDetails;
            
            // Format: 3622_Check_Divisibility_by_Digit_Sum_and_Product
            const qNum = details.question.questionFrontendId || '';
            const rawTitle = details.question.title || details.question.titleSlug;
            // Remove punctuation and replace spaces with underscores
            const formattedTitle = rawTitle.replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '_');
            
            let finalTitle = formattedTitle;
            if (qNum) {
                finalTitle = `${qNum}_${formattedTitle}`;
            }

            commitDirectly({
                langName: details.lang.name,
                titleSlug: finalTitle,
                code: details.code
            });
        } else {
            console.error("LeetCode Auto-Committer: Submission details not found in response.");
        }
    } catch (e) {
        console.error("LeetCode Auto-Committer: Failed to fetch submission details", e);
    }
}
