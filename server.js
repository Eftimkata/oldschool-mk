/*
 * server.js
 * This file sets up the Node.js backend using the Express framework.
 * It now handles user registration, following, and serves posts
 * for both a global feed and a user-specific followed feed.
 * It also includes an endpoint to securely provide the API key to the client.
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config(); // Use this for local development if you have a .env file

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_FILE = path.join(__dirname, 'posts.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// --- Helper Functions for Data Persistence ---

async function readData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// --- API Routes ---

// GET /api/config - Securely provides the API key to the frontend
app.get('/api/config', (req, res) => {
    res.json({ apiKey: process.env.GEMINI_API_KEY });
});

// GET /api/users/:username
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const users = await readData(USERS_FILE);
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.length < 3) {
            return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
        }
        const users = await readData(USERS_FILE);
        if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ message: 'Username is already taken.' });
        }
        const newUser = { username, following: [] };
        users.push(newUser);
        await writeData(USERS_FILE, users);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
});

// GET /api/posts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await readData(POSTS_FILE);
        res.json(posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching posts' });
    }
});

// POST /api/posts
app.post('/api/posts', async (req, res) => {
    try {
        const { username, text, image } = req.body;
        if (!username || !text) {
            return res.status(400).json({ message: 'Username and text are required.' });
        }
        const newPost = {
            id: Date.now(),
            username,
            text,
            image: image || null,
            timestamp: new Date().toISOString(),
        };
        const posts = await readData(POSTS_FILE);
        posts.push(newPost);
        await writeData(POSTS_FILE, posts);
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ message: 'Error creating post' });
    }
});

// POST /api/follow
app.post('/api/follow', async (req, res) => {
    try {
        const { follower, userToFollow } = req.body;
        if (!follower || !userToFollow) {
            return res.status(400).json({ message: 'Required fields missing.' });
        }
        const users = await readData(USERS_FILE);
        const followerUser = users.find(u => u.username === follower);
        if (!followerUser) {
            return res.status(404).json({ message: 'Follower not found.' });
        }
        if (followerUser.following.includes(userToFollow)) {
            followerUser.following = followerUser.following.filter(name => name !== userToFollow);
        } else {
            followerUser.following.push(userToFollow);
        }
        await writeData(USERS_FILE, users);
        res.status(200).json(followerUser);
    } catch (error) {
        res.status(500).json({ message: 'Server error during follow action' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
