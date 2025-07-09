/*
 * client.js
 * Version 0.0.3-alpha
 * This version fixes a major bug in the login/registration form where input
 * fields would clear unexpectedly. The form state management is now more robust.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let currentUser = null;
    let followingList = [];
    let currentView = 'feed';
    let profileUsername = '';
    let currentFeedType = 'global';
    let geminiApiKey = null;
    let isRegisterMode = false;

    // --- DOM Element References ---
    const loginView = document.getElementById('login-view');
    const mainAppView = document.getElementById('main-app-view');
    const authForm = document.getElementById('auth-form');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authEmailInput = document.getElementById('auth-email');
    const emailFormGroup = document.getElementById('email-form-group');
    const authMessage = document.getElementById('auth-message');
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleText = document.getElementById('auth-toggle-text');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotPasswordContainer = document.getElementById('forgot-password-container');
    const postForm = document.getElementById('post-form');
    const timelineFeed = document.getElementById('timeline-feed');
    const formMessage = document.getElementById('form-message');
    const usernameInput = document.getElementById('username');
    const headerUserControls = document.getElementById('header-user-controls');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutBtn = document.getElementById('logout-btn');
    const globalFeedBtn = document.getElementById('global-feed-btn');
    const followedFeedBtn = document.getElementById('followed-feed-btn');
    const feedToggleContainer = document.querySelector('.feed-toggle');
    const feedTitle = document.getElementById('feed-title');
    const backToFeedBtn = document.getElementById('back-to-feed-btn');
    const gumballifyBtn = document.getElementById('gumballify-btn');
    const postTextarea = document.getElementById('text');
    const geminiSpinner = document.getElementById('gemini-spinner');

    // --- API & Utility Functions ---

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
                gumballifyBtn.disabled = true;
                gumballifyBtn.title = "This feature is not available.";
            }
        } catch (error) {
            console.error("Could not fetch API key.", error);
            gumballifyBtn.disabled = true;
        }
    };

    const showMessage = (element, message, type) => {
        element.textContent = message;
        element.className = `form-message ${type}`;
        setTimeout(() => {
            if (element.textContent === message) {
                element.className = 'form-message';
                element.textContent = '';
            }
        }, 5000);
    };

    const formatTimestamp = (isoString) => new Date(isoString).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });

    const createPostElement = (post) => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.dataset.postId = post._id;
        const isOwnPost = post.username === currentUser;
        const isFollowing = followingList.includes(post.username);
        const hasLiked = post.likes && post.likes.includes(currentUser);
        const followButtonHtml = isOwnPost ? '' : `<button class="btn-follow ${isFollowing ? 'following' : ''}" data-username="${post.username}">${isFollowing ? 'Following' : 'Follow'}</button>`;
        const safeText = document.createElement('p');
        safeText.textContent = post.text;
        postCard.innerHTML = `
            <div class="post-header">
                <div class="post-user-info">
                    <span class="post-username" data-username="${post.username}">${post.username}</span>
                    ${followButtonHtml}
                </div>
                <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
            </div>
            <div class="post-content">
                <p>${safeText.innerHTML.replace(/\n/g, '<br>')}</p>
                ${post.image ? `<img src="${post.image}" alt="User post image" class="post-image" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="post-actions">
                <button class="btn-like ${hasLiked ? 'liked' : ''}" data-post-id="${post._id}">
                    <span class="like-icon">♥</span>
                    <span class="like-text">${hasLiked ? 'Liked' : 'Like'}</span>
                </button>
                <span class="like-count">${post.likes ? post.likes.length : 0}</span>
            </div>`;
        return postCard;
    };

    const fetchAndRenderPosts = async () => {
        timelineFeed.innerHTML = '<div class="loading-spinner"></div>';
        try {
            let url = (currentView === 'profile') ? `/api/posts/user/${profileUsername}` : '/api/posts';
            const response = await fetch(url);
            if (!response.ok) throw new Error('Could not fetch posts.');
            let posts = await response.json();
            if (currentView === 'feed' && currentFeedType === 'followed') {
                posts = posts.filter(post => followingList.includes(post.username) || post.username === currentUser);
            }
            timelineFeed.innerHTML = '';
            if (posts.length === 0) {
                timelineFeed.innerHTML = `<p>Nothing to see here!</p>`;
            } else {
                posts.forEach(post => timelineFeed.appendChild(createPostElement(post)));
            }
        } catch (error) {
            console.error('Failed to fetch posts:', error);
            timelineFeed.innerHTML = '<p style="color: var(--error-color);">Could not load the feed.</p>';
        }
    };

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
            followingList = (await res.json()).following || [];
        } catch (error) {
            followingList = [];
        }
        await showFeedView();
    };

    const showLoginView = () => {
        currentUser = null;
        followingList = [];
        geminiApiKey = null;
        localStorage.removeItem('oldSchoolMKUsername');
        mainAppView.classList.add('hidden');
        headerUserControls.classList.add('hidden');
        loginView.classList.remove('hidden');
        authForm.reset();
        gumballifyBtn.disabled = true;
    };

    const showFeedView = async () => {
        currentView = 'feed';
        profileUsername = '';
        feedTitle.textContent = 'The Feed';
        feedToggleContainer.classList.remove('hidden');
        backToFeedBtn.classList.add('hidden');
        await fetchAndRenderPosts();
    };

    const showProfileView = async (username) => {
        currentView = 'profile';
        profileUsername = username;
        feedTitle.textContent = `Posts by ${username}`;
        feedToggleContainer.classList.add('hidden');
        backToFeedBtn.classList.remove('hidden');
        await fetchAndRenderPosts();
    };

    const setupAuthForm = (isRegister) => {
        isRegisterMode = isRegister;
        authMessage.className = 'form-message';
        authMessage.textContent = '';

        if (isRegisterMode) {
            authTitle.textContent = 'Register';
            authSubmitBtn.textContent = 'Register';
            authToggleText.textContent = 'Already have an account?';
            authToggleLink.textContent = 'Login';
            emailFormGroup.classList.remove('hidden');
            authEmailInput.required = true;
            if (forgotPasswordContainer) forgotPasswordContainer.classList.add('hidden');
        } else {
            authTitle.textContent = 'Login';
            authSubmitBtn.textContent = 'Login';
            authToggleText.textContent = 'Need an account?';
            authToggleLink.textContent = 'Register';
            emailFormGroup.classList.add('hidden');
            authEmailInput.required = false;
            if (forgotPasswordContainer) forgotPasswordContainer.classList.remove('hidden');
        }
    };

    const handleAuthSubmit = async (event) => {
        event.preventDefault();
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();
        const endpoint = isRegisterMode ? '/api/register' : '/api/login';
        const body = { username, password };
        if (isRegisterMode) {
            body.email = authEmailInput.value.trim();
        }
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            if (isRegisterMode) {
                authForm.reset();
                setupAuthForm(false);
                showMessage(authMessage, "Registration successful! Please log in.", "success");
                return;
            }

            localStorage.setItem('oldSchoolMKUsername', data.username);
            await showMainApp(data.username);
        } catch (error) {
            showMessage(authMessage, error.message, 'error');
        }
    };

    const handleForgotPassword = async (event) => {
        event.preventDefault();
        const email = prompt("Please enter the email address for your account:");
        if (!email) return;

        try {
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await response.json();
            showMessage(authMessage, data.message, response.ok ? 'success' : 'error');
        } catch (error) {
            showMessage(authMessage, 'Could not connect to the server. Please try again.', 'error');
        }
    };

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

    const handleTimelineClick = (event) => {
        const target = event.target;
        if (target.matches('.post-username')) {
            showProfileView(target.dataset.username);
        } else if (target.closest('.btn-follow')) {
            handleFollowClick(target.closest('.btn-follow'));
        } else if (target.closest('.btn-like')) {
            handleLikeClick(target.closest('.btn-like'));
        }
    };

    const handleFollowClick = async (button) => {
        const userToFollow = button.dataset.username;
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
            if (currentView === 'feed' && currentFeedType === 'followed') {
                await fetchAndRenderPosts();
            }
        } catch (error) {
            showMessage(formMessage, 'Could not complete follow action.', 'error');
        }
    };

    const handleLikeClick = async (button) => {
        const postId = button.dataset.postId;
        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser }),
            });
            if (!response.ok) throw new Error('Failed to like post.');
            const updatedPost = await response.json();
            const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
            if (postCard) {
                const likeButton = postCard.querySelector('.btn-like');
                const likeCount = postCard.querySelector('.like-count');
                const likeText = postCard.querySelector('.like-text');
                const hasLiked = updatedPost.likes.includes(currentUser);
                likeButton.classList.toggle('liked', hasLiked);
                likeText.textContent = hasLiked ? 'Liked' : 'Like';
                likeCount.textContent = updatedPost.likes.length;
            }
        } catch (error) {
            console.error('Like error:', error);
        }
    };

    const handleFeedTypeToggle = async (feedType) => {
        if (currentFeedType === feedType) return;
        currentFeedType = feedType;
        globalFeedBtn.classList.toggle('active', feedType === 'global');
        followedFeedBtn.classList.toggle('active', feedType === 'followed');
        await fetchAndRenderPosts();
    };

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
                 throw new Error("The AI returned no suggestions.");
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

    const init = () => {
        gumballifyBtn.disabled = true;
        gumballifyBtn.title = "Connecting...";
        const savedUsername = localStorage.getItem('oldSchoolMKUsername');
        if (savedUsername) {
            showMainApp(savedUsername);
        } else {
            showLoginView();
            setupAuthForm(false); // Set initial state to Login mode cleanly
        }
        authForm.addEventListener('submit', handleAuthSubmit);
        authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            authForm.reset(); // Reset form only when user explicitly toggles
            setupAuthForm(!isRegisterMode);
        });
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', handleForgotPassword);
        }
        postForm.addEventListener('submit', handlePostSubmit);
        logoutBtn.addEventListener('click', showLoginView);
        timelineFeed.addEventListener('click', handleTimelineClick);
        globalFeedBtn.addEventListener('click', () => handleFeedTypeToggle('global'));
        followedFeedBtn.addEventListener('click', () => handleFeedTypeToggle('followed'));
        backToFeedBtn.addEventListener('click', showFeedView);
        gumballifyBtn.addEventListener('click', handleGumballifyClick);
    };

    init();
});
