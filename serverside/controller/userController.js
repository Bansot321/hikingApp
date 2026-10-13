
const db = require("../config/tursoConfig");

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
      sql: `
        SELECT id
        FROM users
        WHERE email = ? COLLATE NOCASE
           OR username = ? COLLATE NOCASE
        LIMIT 1
      `,
      args: [cleanEmail, cleanUsername],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "Email or username is already registered.",
      });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO users (username, email, password)
        VALUES (?, ?, ?)
      `,
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

    const cleanEmail = email.trim().toLowerCase();

    const result = await db.execute({
      sql: `
        SELECT id, username, email, password
        FROM users
        WHERE email = ? COLLATE NOCASE
        LIMIT 1
      `,
      args: [cleanEmail],
    });

    const user = result.rows[0];

    if (!user || user.password !== password) {
      return res.status(401).json({
        message: "Incorrect email or password.",
      });
    }

    return res.status(200).json({
      message: "Login successful.",
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

module.exports = {
  signup,
  login,
};
