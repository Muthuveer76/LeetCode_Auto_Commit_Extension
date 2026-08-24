document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const repoInput = document.getElementById('repo');
  const tokenInput = document.getElementById('token');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load saved data
  chrome.storage.local.get(['username', 'repo', 'token'], (result) => {
    if (result.username) usernameInput.value = result.username;
    if (result.repo) repoInput.value = result.repo;
    if (result.token) tokenInput.value = result.token;
  });

  // Save data
  saveButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();

    if (!username || !repo || !token) {
      statusDiv.style.color = '#cb2431';
      statusDiv.textContent = 'Please fill all fields!';
      setTimeout(() => { statusDiv.textContent = ''; }, 2000);
      return;
    }

    chrome.storage.local.set({ username, repo, token }, () => {
      statusDiv.style.color = '#2ea44f';
      statusDiv.textContent = 'Settings saved!';
      setTimeout(() => { statusDiv.textContent = ''; }, 2000);
    });
  });

  const testButton = document.getElementById('test-conn');
  testButton.addEventListener('click', () => {
    chrome.storage.local.get(['username', 'repo', 'token'], async (result) => {
      if (!result.username || !result.repo || !result.token) {
        statusDiv.style.color = '#cb2431';
        statusDiv.textContent = 'Save settings first!';
        return;
      }
      
      statusDiv.style.color = '#0366d6';
      statusDiv.textContent = 'Testing connection...';
      
      const url = `https://api.github.com/repos/${result.username}/${result.repo}/contents/leetcode_test_connection.txt`;
      const body = {
        message: 'Testing LeetCode Auto-Committer Connection',
        content: btoa('Connection successful!')
      };
      
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${result.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        if (res.ok || res.status === 422) {
          // 422 means file already exists, which means we have access
          statusDiv.style.color = '#2ea44f';
          statusDiv.textContent = 'Connection Successful!';
        } else {
          const text = await res.text();
          console.error(text);
          statusDiv.style.color = '#cb2431';
          statusDiv.textContent = 'Failed! Check console.';
        }
      } catch (e) {
        statusDiv.style.color = '#cb2431';
        statusDiv.textContent = 'Network Error!';
      }
    });
  });
});
