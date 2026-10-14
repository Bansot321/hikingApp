//userController.js
const crypto = require("crypto");
const db = require("../config/tursoConfig");

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function signup(req, res) {
  try {
    const { username, email, password, confirmPassword } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({ message: "Please fill in all fields." });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || !password || !confirmPassword) {
      return res.status(400).json({ message: "Please fill in all fields." });
    }

    if (cleanUsername.length < 6 || cleanUsername.length > 16) {
      return res.status(400).json({
        message: "Username must be 6–16 characters long.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    const existing = await db.execute({
      sql: `SELECT id FROM users
            WHERE email = ? COLLATE NOCASE
               OR username = ? COLLATE NOCASE
            LIMIT 1`,
      args: [cleanEmail, cleanUsername],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "Email or username is already registered.",
      });
    }

    const result = await db.execute({
      sql: `INSERT INTO users (username, email, password)
            VALUES (?, ?, ?)`,
      args: [cleanUsername, cleanEmail, password],
    });

    return res.status(201).json({
      message: "Account created successfully.",
      user: {
        id: Number(result.lastInsertRowid),
        username: cleanUsername,
        email: cleanEmail,
      },
    });
  } catch (error) {
    if (
      String(error.code || "").includes("CONSTRAINT") ||
      String(error.message || "").includes("UNIQUE constraint failed")
    ) {
      return res.status(409).json({
        message: "Email or username is already registered.",
      });
    }

    console.error("Signup error:", error.message);
    return res.status(500).json({
      message: "Unable to create account. Please try again.",
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Please enter your email and password.",
      });
    }

    const result = await db.execute({
      sql: `SELECT id, username, email, password
            FROM users
            WHERE email = ? COLLATE NOCASE
            LIMIT 1`,
      args: [email.trim().toLowerCase()],
    });

    const user = result.rows[0];

    // This comparison matches your existing no-bcrypt setup.
    if (!user || user.password !== password) {
      return res.status(401).json({
        message: "Incorrect email or password.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS
    ).toISOString();

    await db.execute({
      sql: `INSERT INTO sessions (user_id, token_hash, expires_at)
            VALUES (?, ?, ?)`,
      args: [Number(user.id), tokenHash, expiresAt],
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      expiresAt,
      user: {
        id: Number(user.id),
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Unable to log in. Please try again.",
    });
  }
}

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Please sign in to continue.",
      });
    }

    const tokenHash = hashToken(token);

    const result = await db.execute({
      sql: `SELECT
              sessions.id AS session_id,
              sessions.user_id,
              sessions.expires_at,
              users.username,
              users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            LIMIT 1`,
      args: [tokenHash],
    });

    const session = result.rows[0];

    if (!session) {
      return res.status(401).json({
        message: "Invalid session. Please sign in again.",
      });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await db.execute({
        sql: "DELETE FROM sessions WHERE id = ?",
        args: [session.session_id],
      });

      return res.status(401).json({
        message: "Your session has expired. Please sign in again.",
      });
    }

    req.user = {
      id: Number(session.user_id),
      username: session.username,
      email: session.email,
    };

    req.sessionId = Number(session.session_id);
    req.tokenHash = tokenHash;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(500).json({
      message: "Unable to verify your session.",
    });
  }
}

function getMe(req, res) {
  return res.status(200).json({ user: req.user });
}

async function logout(req, res) {
  try {
    await db.execute({
      sql: "DELETE FROM sessions WHERE id = ?",
      args: [req.sessionId],
    });

    return res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error.message);
    return res.status(500).json({
      message: "Unable to log out. Please try again.",
    });
  }
}

module.exports = {
  signup,
  login,
  authenticate,
  getMe,
  logout,
};
