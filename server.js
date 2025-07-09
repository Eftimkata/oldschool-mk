/*
 * server.js
 * Version 0.0.3-alpha
 * This version fully implements the "Forgot Password" feature using Resend
 * to email a secure, one-time reset link to users.
 */

const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Resend } = require('resend'); // Import Resend
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// --- Database Connection ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set.");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db, usersCollection, postsCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("oldschool_mk");
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

app.get('/api/config', (req, res) => res.json({ apiKey: process.env.GEMINI_API_KEY }));

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        if (!username || !password || !email || password.length < 6) {
            return res.status(400).json({ message: 'Username, email, and a password of at least 6 characters are required.' });
        }
        const existingUser = await usersCollection.findOne({
            $or: [
                { username: { $regex: new RegExp(`^${username}$`, 'i') } },
                { email: { $regex: new RegExp(`^${email}$`, 'i') } }
            ]
        });
        if (existingUser) {
            const message = existingUser.username.toLowerCase() === username.toLowerCase() ? 'Username is already taken.' : 'Email is already in use.';
            return res.status(409).json({ message });
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUserDocument = { username, email, password: hashedPassword, following: [] };
        await usersCollection.insertOne(newUserDocument);
        res.status(201).json({ username: newUserDocument.username });
    } catch (error) {
        console.error('[POST /api/register] Error:', error);
        res.status(500).json({ message: 'Server failed during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }
        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        res.status(200).json({ username: user.username });
    } catch (error) {
        console.error('[POST /api/login] Error:', error);
        res.status(500).json({ message: 'Server failed during login.' });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const user = await usersCollection.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

        if (user) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const tokenExpiry = Date.now() + 3600000; // 1 hour from now

            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { resetPasswordToken: resetToken, resetPasswordExpires: tokenExpiry } }
            );

            const resetURL = `https://oldschool-mk.onrender.com/reset-password.html?token=${resetToken}`;

            // --- ACTUAL EMAIL SENDING LOGIC ---
            await resend.emails.send({
                from: 'onboarding@resend.dev', // Resend's default "from" address for free tier
                to: user.email,
                subject: 'Old School MK - Password Reset',
                html: `<p>You requested a password reset for your Old School MK account.</p>
                       <p>Please click the link below to set a new password:</p>
                       <a href="${resetURL}">Reset Password</a>
                       <p>This link will expire in one hour.</p>
                       <p>If you did not request this, please ignore this email.</p>`
            });
        }
        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error('[POST /api/forgot-password] Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

// NEW: POST /api/reset-password - Handles the final password reset
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password || password.length < 6) {
            return res.status(400).json({ message: 'A valid token and a new password of at least 6 characters are required.' });
        }

        const user = await usersCollection.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // Check if token is not expired
        });

        if (!user) {
            return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await usersCollection.updateOne(
            { _id: user._id },
            {
                $set: { password: hashedPassword },
                $unset: { resetPasswordToken: "", resetPasswordExpires: "" } // Clear the token fields
            }
        );

        res.status(200).json({ message: 'Password has been successfully reset. You can now log in.' });

    } catch (error) {
        console.error('[POST /api/reset-password] Error:', error);
        res.status(500).json({ message: 'An error occurred while resetting the password.' });
    }
});


// --- Other Routes (Unchanged) ---
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } }, { projection: { password: 0, email: 0 } });
        res.json(user);
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});
app.get('/api/posts', async (req, res) => {
    try {
        const postsArray = await postsCollection.find().sort({ timestamp: -1 }).toArray();
        const sanitizedPosts = postsArray.map(post => ({ likes: [], ...post, _id: post._id.toString() }));
        res.json(sanitizedPosts);
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});
app.get('/api/posts/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const postsArray = await postsCollection.find({ username }).sort({ timestamp: -1 }).toArray();
        const sanitizedPosts = postsArray.map(post => ({ likes: [], ...post, _id: post._id.toString() }));
        res.json(sanitizedPosts);
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});
app.post('/api/posts', async (req, res) => {
    try {
        const { username, text, image } = req.body;
        const newPost = { username, text, image: image || null, timestamp: new Date(), likes: [] };
        const result = await postsCollection.insertOne(newPost);
        res.status(201).json({ ...newPost, _id: result.insertedId.toString() });
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});
app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid ID.' });
        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        const updateOperation = post.likes && post.likes.includes(username) ? { $pull: { likes: username } } : { $addToSet: { likes: username } };
        const result = await postsCollection.findOneAndUpdate({ _id: new ObjectId(id) }, updateOperation, { returnDocument: 'after' });
        res.status(200).json(result.value);
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});
app.post('/api/follow', async (req, res) => {
    try {
        const { follower, userToFollow } = req.body;
        const followerUser = await usersCollection.findOne({ username: follower });
        if (!followerUser) return res.status(404).json({ message: 'User not found.' });
        const updateOperation = followerUser.following.includes(userToFollow) ? { $pull: { following: userToFollow } } : { $addToSet: { following: userToFollow } };
        const result = await usersCollection.findOneAndUpdate({ username: follower }, updateOperation, { returnDocument: 'after' });
        res.status(200).json(result.value);
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});

// Start the server after connecting to the DB
connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
});
