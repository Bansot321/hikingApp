
const crypto = require("crypto");
const db = require("../config/tursoConfig");

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isUniqueConstraintError(error) {
  return (
    String(error.code || "").includes("CONSTRAINT") ||
    String(error.message || "").includes("UNIQUE constraint failed")
  );
}

// SIGNUP
async function signup(req, res) {
  try {
    const { username, email, password, confirmPassword } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        message: "Please fill in all fields.",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || !password || !confirmPassword) {
      return res.status(400).json({
        message: "Please fill in all fields.",
      });
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
      return res.status(400).json({
        message: "Passwords do not match.",
      });
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
    if (isUniqueConstraintError(error)) {
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

// LOGIN
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

    // Preserves compatibility with the current no-bcrypt setup.
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

// AUTHENTICATION MIDDLEWARE
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

    return next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(500).json({
      message: "Unable to verify your session.",
    });
  }
}

// GET CURRENT USER
function getMe(req, res) {
  return res.status(200).json({
    user: req.user,
  });
}

// UPDATE CURRENT USER'S PROFILE
async function updateMe(req, res) {
  try {
    const { username, email } = req.body || {};

    if (typeof username !== "string" || typeof email !== "string") {
      return res.status(400).json({
        message: "Please enter a username and email.",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail) {
      return res.status(400).json({
        message: "Username and email are required.",
      });
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

    // Check whether another account already uses this username or email.
    const existing = await db.execute({
      sql: `SELECT id FROM users
            WHERE (username = ? COLLATE NOCASE
                OR email = ? COLLATE NOCASE)
              AND id != ?
            LIMIT 1`,
      args: [cleanUsername, cleanEmail, req.user.id],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "That username or email is already in use.",
      });
    }

    await db.execute({
      sql: `UPDATE users
            SET username = ?, email = ?
            WHERE id = ?`,
      args: [cleanUsername, cleanEmail, req.user.id],
    });

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: req.user.id,
        username: cleanUsername,
        email: cleanEmail,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({
        message: "That username or email is already in use.",
      });
    }

    console.error("Update profile error:", error.message);

    return res.status(500).json({
      message: "Unable to update your profile. Please try again.",
    });
  }
}

// CHANGE CURRENT USER'S PASSWORD
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } =
      req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        message: "Please fill in all password fields.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Your new password must be at least 8 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "The new passwords do not match.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "Your new password must be different from your current password.",
      });
    }

    // Only retrieve the password belonging to the authenticated user.
    const result = await db.execute({
      sql: "SELECT password FROM users WHERE id = ? LIMIT 1",
      args: [req.user.id],
    });

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        message: "User account not found.",
      });
    }

    if (user.password !== currentPassword) {
      return res.status(400).json({
        message: "Your current password is incorrect.",
      });
    }

    await db.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [newPassword, req.user.id],
    });

    return res.status(200).json({
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change password error:", error.message);

    return res.status(500).json({
      message: "Unable to change your password. Please try again.",
    });
  }
}

// LOGOUT
async function logout(req, res) {
  try {
    await db.execute({
      sql: "DELETE FROM sessions WHERE id = ?",
      args: [req.sessionId],
    });

    return res.status(200).json({
      message: "Logged out successfully.",
    });
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
  updateMe,
  changePassword,
  logout,
};
