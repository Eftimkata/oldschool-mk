/*
 * server.js
 * This file sets up the Node.js backend using the Express framework.
 * This version uses MongoDB for persistent data storage to solve data loss
 * on platforms like OnRender. It also includes a robust login/register flow.
 */

const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set.");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
let usersCollection;
let postsCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("oldschool_mk"); // You can name your database anything
        usersCollection = db.collection("users");
        postsCollection = db.collection("posts");
        console.log("Successfully connected to MongoDB Atlas!");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// --- API Routes ---

// GET /api/config
app.get('/api/config', (req, res) => {
    res.json({ apiKey: process.env.GEMINI_API_KEY });
});

// POST /api/login - Handles both login and registration
app.post('/api/login', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.length < 3) {
            return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
        }

        // Find user or create if they don't exist (upsert)
        const result = await usersCollection.findOneAndUpdate(
            { username: { $regex: new RegExp(`^${username}$`, 'i') } }, // Case-insensitive find
            { $setOnInsert: { username: username, following: [] } },
            { returnDocument: 'after', upsert: true }
        );
        
        res.status(200).json(result.value);
    } catch (error) {
        console.error('[POST /api/login] Error:', error);
        res.status(500).json({ message: 'Server failed during login/registration.' });
    }
});


// GET /api/users/:username
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('[GET /api/users/:username] Error:', error);
        res.status(500).json({ message: 'Server error while fetching user.' });
    }
});

// GET /api/posts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await postsCollection.find().sort({ timestamp: -1 }).toArray();
        res.json(posts);
    } catch (error) {
        console.error('[GET /api/posts] Error:', error);
        res.status(500).json({ message: 'Server error while fetching posts.' });
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
            username,
            text,
            image: image || null,
            timestamp: new Date(),
        };
        const result = await postsCollection.insertOne(newPost);
        res.status(201).json({ ...newPost, _id: result.insertedId });
    } catch (error) {
        console.error('[POST /api/posts] Error:', error);
        res.status(500).json({ message: 'Server failed to create post.' });
    }
});

// POST /api/follow
app.post('/api/follow', async (req, res) => {
    try {
        const { follower, userToFollow } = req.body;
        if (!follower || !userToFollow) {
            return res.status(400).json({ message: 'Required fields missing.' });
        }

        const followerUser = await usersCollection.findOne({ username: follower });
        if (!followerUser) {
            return res.status(404).json({ message: 'Follower not found.' });
        }

        let updateOperation;
        if (followerUser.following.includes(userToFollow)) {
            // Unfollow: remove from array
            updateOperation = { $pull: { following: userToFollow } };
        } else {
            // Follow: add to array
            updateOperation = { $addToSet: { following: userToFollow } }; // $addToSet prevents duplicates
        }

        const result = await usersCollection.findOneAndUpdate(
            { username: follower },
            updateOperation,
            { returnDocument: 'after' }
        );

        res.status(200).json(result.value);
    } catch (error) {
        console.error('[POST /api/follow] Error:', error);
        res.status(500).json({ message: 'Server error during follow action.' });
    }
});

// Start the server after connecting to the DB
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});
