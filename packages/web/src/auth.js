const API_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isCallback = urlParams.get('auth') === 'callback';
    
    const landingView = document.getElementById('landing-view');
    const callbackView = document.getElementById('callback-view');
    
    if (isCallback) {
        landingView.classList.add('hidden');
        callbackView.classList.remove('hidden');
        handleAuthCallback();
    } else {
        landingView.classList.remove('hidden');
        callbackView.classList.add('hidden');
        setupLoginButtons();
    }
});

function setupLoginButtons() {
    const googleBtn = document.getElementById('btn-google');
    const githubBtn = document.getElementById('btn-github');
    
    const callbackURL = encodeURIComponent(window.location.origin + '?auth=callback');
    
    googleBtn.addEventListener('click', () => {
        window.location.href = `${API_URL}/api/auth/sign-in/social?provider=google&callbackURL=${callbackURL}`;
    });
    
    githubBtn.addEventListener('click', () => {
        window.location.href = `${API_URL}/api/auth/sign-in/social?provider=github&callbackURL=${callbackURL}`;
    });
}

async function handleAuthCallback() {
    try {
        const response = await fetch(`${API_URL}/api/auth/device/create`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to create device code');
        }
        
        const data = await response.json();
        const deviceCode = data.code;
        
        if (deviceCode) {
            const codeElement = document.getElementById('device-code');
            codeElement.textContent = deviceCode;
            
            setTimeout(() => {
                document.getElementById('manual-code-section').classList.remove('hidden');
            }, 2000);
            
            document.getElementById('btn-copy').addEventListener('click', () => {
                navigator.clipboard.writeText(deviceCode);
                const btn = document.getElementById('btn-copy');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            });
            
            const deepLinkBtn = document.getElementById('deep-link-btn');
            const deepLink = `gamebuilder://auth?code=${deviceCode}`;
            deepLinkBtn.href = deepLink;
            
            window.location.href = deepLink;
        }
    } catch (error) {
        console.error('Auth callback error:', error);
        const title = document.querySelector('.auth-callback h2');
        title.textContent = 'Authentication Failed';
        title.style.color = '#ff4444';
        
        const msg = document.querySelector('.auth-callback p');
        msg.textContent = 'Please try signing in again.';
        
        document.querySelector('.actions').innerHTML = `
            <a href="/" class="btn btn-primary">Try Again</a>
        `;
    }
}
