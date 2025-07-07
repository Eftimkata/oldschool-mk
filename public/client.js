/*
 * client.js
 * This script handles all frontend interactions for the Old School MK site.
 * It now manages user sessions, registration, following, and feed toggling.
 * This version is updated to use the new /api/login endpoint.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let currentUser = null;
    let followingList = [];
    let currentFeed = 'global'; // 'global' or 'followed'
    let geminiApiKey = null; // To be fetched from server

    // --- DOM Element References ---
    const loginView = document.getElementById('login-view');
    const mainAppView = document.getElementById('main-app-view');
    const registerForm = document.getElementById('register-form');
    const registerUsernameInput = document.getElementById('register-username');
    const registerMessage = document.getElementById('register-message');
    const postForm = document.getElementById('post-form');
    const timelineFeed = document.getElementById('timeline-feed');
    const formMessage = document.getElementById('form-message');
    const usernameInput = document.getElementById('username');
    const headerUserControls = document.getElementById('header-user-controls');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutBtn = document.getElementById('logout-btn');
    const globalFeedBtn = document.getElementById('global-feed-btn');
    const followedFeedBtn = document.getElementById('followed-feed-btn');
    const gumballifyBtn = document.getElementById('gumballify-btn');
    const postTextarea = document.getElementById('text');
    const geminiSpinner = document.getElementById('gemini-spinner');

    // --- API & Utility Functions ---

    /** Fetches the Gemini API Key from the server and updates UI accordingly. */
    const fetchApiKey = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Could not fetch server configuration.');
            
            const config = await response.json();
            geminiApiKey = config.apiKey;

            if (geminiApiKey) {
                gumballifyBtn.disabled = false;
                gumballifyBtn.title = "Rewrite your post in Gumball's style!";
            } else {
                console.warn("Gumball-ify feature disabled: API key not found on server.");
                gumballifyBtn.disabled = true;
                gumballifyBtn.title = "This feature is not available. The server admin needs to set an API key.";
            }
        } catch (error) {
            console.error("Could not fetch API key.", error);
            gumballifyBtn.disabled = true;
            gumballifyBtn.title = "Could not connect to the server to enable this feature.";
        }
    };

    /** Displays a message in a specified message area. */
    const showMessage = (element, message, type) => {
        element.textContent = message;
        element.className = `form-message ${type}`;
        setTimeout(() => {
            if (element.textContent === message) {
                element.className = 'form-message';
                element.textContent = '';
            }
        }, 4000);
    };

    /** Formats an ISO date string. */
    const formatTimestamp = (isoString) => new Date(isoString).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    /** Creates the HTML for a single post. */
    const createPostElement = (post) => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.dataset.author = post.username;

        const isOwnPost = post.username === currentUser;
        const isFollowing = followingList.includes(post.username);

        const followButtonHtml = isOwnPost ? '' : `
            <button class="btn-follow ${isFollowing ? 'following' : ''}" data-username="${post.username}">
                ${isFollowing ? 'Following' : 'Follow'}
            </button>`;

        const safeText = document.createElement('p');
        safeText.textContent = post.text;

        postCard.innerHTML = `
            <div class="post-header">
                <div class="post-user-info">
                    <span class="post-username">${post.username}</span>
                    ${followButtonHtml}
                </div>
                <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
            </div>
            <div class="post-content">
                <p>${safeText.innerHTML.replace(/\n/g, '<br>')}</p>
                ${post.image ? `<img src="${post.image}" alt="User post image" class="post-image" onerror="this.style.display='none'">` : ''}
            </div>`;
        return postCard;
    };

    /** Fetches posts and renders them to the timeline. */
    const fetchAndRenderPosts = async () => {
        timelineFeed.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const postResponse = await fetch('/api/posts');
            if (!postResponse.ok) throw new Error('Could not fetch posts.');
            
            let posts = await postResponse.json();
            
            if (currentFeed === 'followed') {
                posts = posts.filter(post => followingList.includes(post.username) || post.username === currentUser);
            }

            timelineFeed.innerHTML = '';
            if (posts.length === 0) {
                timelineFeed.innerHTML = `<p>Nothing to see here! ${currentFeed === 'followed' ? 'Follow some people to see their posts.' : 'Be the first to post!'}</p>`;
            } else {
                posts.forEach(post => timelineFeed.appendChild(createPostElement(post)));
            }
        } catch (error) {
            console.error('Failed to fetch posts:', error);
            timelineFeed.innerHTML = '<p style="color: var(--error-color);">Could not load the feed. Please try refreshing.</p>';
        }
    };

    /** Switches to the main application view after login. */
    const showMainApp = async (username) => {
        currentUser = username;
        loginView.classList.add('hidden');
        mainAppView.classList.remove('hidden');
        headerUserControls.classList.remove('hidden');
        welcomeMessage.textContent = `Welcome, ${currentUser}!`;
        usernameInput.value = currentUser;
        
        await fetchApiKey();
        
        try {
            const res = await fetch(`/api/users/${currentUser}`);
            if (!res.ok) throw new Error('User data not found.');
            const userData = await res.json();
            followingList = userData.following || [];
        } catch (error) {
            console.error("Could not fetch user's following list", error);
            followingList = [];
        }

        await fetchAndRenderPosts();
    };

    /** Switches to the login view. */
    const showLoginView = () => {
        currentUser = null;
        followingList = [];
        geminiApiKey = null;
        localStorage.removeItem('oldSchoolMKUsername');
        mainAppView.classList.add('hidden');
        headerUserControls.classList.add('hidden');
        loginView.classList.remove('hidden');
        registerUsernameInput.value = '';
        gumballifyBtn.disabled = true;
    };

    /** Handles user login/registration. */
    const handleLogin = async (event) => {
        event.preventDefault();
        const username = registerUsernameInput.value.trim();
        try {
            // Use the new /api/login endpoint
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            localStorage.setItem('oldSchoolMKUsername', data.username);
            await showMainApp(data.username);
        } catch (error) {
            showMessage(registerMessage, error.message, 'error');
        }
    };

    /** Handles new post submission. */
    const handlePostSubmit = async (event) => {
        event.preventDefault();
        const postData = {
            username: currentUser,
            text: postForm.text.value,
            image: postForm.image.value,
        };
        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData),
            });
            if (!response.ok) throw new Error((await response.json()).message);
            
            postForm.reset();
            usernameInput.value = currentUser;
            showMessage(formMessage, 'Post created!', 'success');
            await fetchAndRenderPosts();
        } catch (error) {
            showMessage(formMessage, error.message, 'error');
        }
    };

    /** Handles follow/unfollow clicks. */
    const handleFollowClick = async (event) => {
        if (!event.target.matches('.btn-follow')) return;
        const userToFollow = event.target.dataset.username;
        
        try {
            const response = await fetch('/api/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ follower: currentUser, userToFollow }),
            });
            if (!response.ok) throw new Error((await response.json()).message);
            
            const updatedUser = await response.json();
            followingList = updatedUser.following;

            document.querySelectorAll(`.btn-follow[data-username="${userToFollow}"]`).forEach(btn => {
                const isFollowing = followingList.includes(userToFollow);
                btn.textContent = isFollowing ? 'Following' : 'Follow';
                btn.classList.toggle('following', isFollowing);
            });

            if (currentFeed === 'followed') {
                await fetchAndRenderPosts();
            }
        } catch (error) {
            console.error("Follow error:", error);
            showMessage(formMessage, 'Could not complete follow action.', 'error');
        }
    };
    
    /** Calls Gemini API to rewrite text. */
    const handleGumballifyClick = async () => {
        if (!geminiApiKey) {
            showMessage(formMessage, 'Gumball-ify feature is not available.', 'error');
            return;
        }
        const originalText = postTextarea.value.trim();
        if (!originalText) {
            showMessage(formMessage, 'Please write something first!', 'error');
            return;
        }
        gumballifyBtn.disabled = true;
        geminiSpinner.classList.remove('hidden');
        const prompt = `Rewrite the following social media post in the chaotic, energetic, and hilariously absurd style of the cartoon character Gumball Watterson. Exaggerate everything, add random non-sequiturs, and make it sound like a kid on a massive sugar rush wrote it. Keep the core idea of the original post, but crank the absurdity to 11. Original Post: "${originalText}" Rewritten Post:`;
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Gemini API error! Status: ${response.status}`);
            const result = await response.json();
            if (!result.candidates || result.candidates.length === 0) {
                 throw new Error("The AI returned no suggestions. It might be too busy causing chaos!");
            }
            const text = result.candidates[0].content.parts[0].text;
            postTextarea.value = text.trim();
        } catch (error) {
            showMessage(formMessage, `Gumball-ifier failed: ${error.message}`, 'error');
        } finally {
            if (geminiApiKey) gumballifyBtn.disabled = false;
            geminiSpinner.classList.add('hidden');
        }
    };

    /** Handles switching between global and followed feeds. */
    const handleFeedToggle = async (feedType) => {
        if (currentFeed === feedType) return;
        currentFeed = feedType;
        globalFeedBtn.classList.toggle('active', feedType === 'global');
        followedFeedBtn.classList.toggle('active', feedType === 'followed');
        await fetchAndRenderPosts();
    };

    /** Initializes the application */
    const init = () => {
        gumballifyBtn.disabled = true;
        gumballifyBtn.title = "Connecting...";

        const savedUsername = localStorage.getItem('oldSchoolMKUsername');
        if (savedUsername) {
            showMainApp(savedUsername);
        } else {
            showLoginView();
        }

        // Changed from 'submit' to the new handler name
        registerForm.addEventListener('submit', handleLogin);
        postForm.addEventListener('submit', handlePostSubmit);
        logoutBtn.addEventListener('click', showLoginView);
        timelineFeed.addEventListener('click', handleFollowClick);
        globalFeedBtn.addEventListener('click', () => handleFeedToggle('global'));
        followedFeedBtn.addEventListener('click', () => handleFeedToggle('followed'));
        gumballifyBtn.addEventListener('click', handleGumballifyClick);
    };

    init();
});
