import express from "express";
import { createServer as createViteServer } from "vite";
import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "crop-yield-secret-key";

async function startServer() {
  const db_auth = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db_auth.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT,
      phone TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY,
      otp TEXT,
      expiry INTEGER
    );
  `);

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Auth APIs ---
  app.post("/api/register", async (req, res) => {
    const { username, email, password, phone } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db_auth.run(
        "INSERT INTO users (username, email, password, phone) VALUES (?, ?, ?, ?)",
        [username, email, hashedPassword, phone]
      );
      res.json({ message: "User registered successfully" });
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        res.status(400).json({ error: "Username, email or phone already exists" });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = await db_auth.get("SELECT * FROM users WHERE username = ?", [username]);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h" });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/send-otp", async (req, res) => {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
    try {
      await db_auth.run(
        "INSERT OR REPLACE INTO otps (phone, otp, expiry) VALUES (?, ?, ?)",
        [phone, otp, expiry]
      );
      console.log(`[OTP Simulation] Phone: ${phone}, OTP: ${otp}`);
      res.json({ message: "OTP sent successfully (Simulated)" });
    } catch (err) {
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  app.post("/api/verify-otp", async (req, res) => {
    const { phone, otp } = req.body;
    try {
      const record = await db_auth.get("SELECT * FROM otps WHERE phone = ?", [phone]);
      if (!record || record.otp !== otp || record.expiry < Date.now()) {
        return res.status(401).json({ error: "Invalid or expired OTP" });
      }
      
      let user = await db_auth.get("SELECT * FROM users WHERE phone = ?", [phone]);
      if (!user) {
        // Auto-register if phone exists in OTP but not in users (optional, but let's require registration first for this demo)
        return res.status(404).json({ error: "User not found. Please register first." });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h" });
      await db_auth.run("DELETE FROM otps WHERE phone = ?", [phone]);
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
      res.status(500).json({ error: "OTP verification failed" });
    }
  });

  // API Route to check python health
  app.get("/api/python-health", (req, res) => {
    exec("python3 --version && python3 -m pip list", (error, stdout, stderr) => {
      res.json({ error, stdout, stderr });
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // API Route to install deps
  app.post("/api/install-python-deps", (req, res) => {
    exec("python3 -m pip install pandas numpy xgboost scikit-learn joblib", (error, stdout, stderr) => {
      res.json({ error, stdout, stderr });
    });
  });
  app.post("/api/predict", (req, res) => {
    const inputData = req.body;
    
    // Check if model files exist
    if (!fs.existsSync("model.pkl") || !fs.existsSync("features.pkl")) {
      return res.status(400).json({ error: "Model not trained. Please train the model first." });
    }

    const pythonProcess = spawn("python3", ["predict.py"]);
    let output = "";
    let error = "";

    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Python error:", error);
        // Try to parse output for a JSON error
        try {
          const result = JSON.parse(output);
          if (result.error) {
            return res.status(500).json({ error: result.error, details: error });
          }
        } catch (e) {
          // Not JSON or no error field
        }
        return res.status(500).json({ error: "Prediction failed", details: error });
      }
      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (e) {
        console.error("Parse error:", e, "Output:", output);
        res.status(500).json({ error: "Failed to parse prediction output" });
      }
    });
  });

  // API Route to train model
  app.post("/api/train", (req, res) => {
    exec("python3 model.py", (error, stdout, stderr) => {
      if (error) {
        console.error("Train error:", stderr);
        return res.status(500).json({ error: "Training failed", details: stderr });
      }
      res.json({ message: "Model trained successfully", output: stdout });
    });
  });

  // API Route to get unique values from the dataset
  app.get("/api/uniques", (req, res) => {
    const csvPath = path.join(process.cwd(), "public", "odisha_realistic_dataset-1.csv");
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Dataset not found" });
    }
    const data = fs.readFileSync(csvPath, "utf8");
    const lines = data.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) return res.status(404).json({ error: "Dataset is empty" });
    
    const headers = lines[0].split(",").map(h => h.trim());
    const categorical_cols = ['District', 'Crop', 'Variety', 'Season', 'Soil_Type'];
    const colIndices = categorical_cols.map(col => headers.indexOf(col));
    
    const uniques: Record<string, Set<string>> = {};
    categorical_cols.forEach(col => uniques[col] = new Set());
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(v => v.trim());
      categorical_cols.forEach((col, idx) => {
        const colIdx = colIndices[idx];
        if (colIdx !== -1 && row[colIdx]) {
          uniques[col].add(row[colIdx]);
        }
      });
    }
    
    const result: any = {};
    categorical_cols.forEach(col => {
      if (col !== 'Variety') {
        result[col] = Array.from(uniques[col]).sort();
      }
    });
    
    // Group varieties by crop
    const cropIdx = headers.indexOf('Crop');
    const varietyIdx = headers.indexOf('Variety');
    const varietiesByCrop: Record<string, Set<string>> = {};
    
    if (cropIdx !== -1 && varietyIdx !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",").map(v => v.trim());
        const cropVal = row[cropIdx];
        const varietyVal = row[varietyIdx];
        if (cropVal && varietyVal) {
          if (!varietiesByCrop[cropVal]) varietiesByCrop[cropVal] = new Set();
          varietiesByCrop[cropVal].add(varietyVal);
        }
      }
    }
    
    result.VarietiesByCrop = {};
    for (const crop in varietiesByCrop) {
      result.VarietiesByCrop[crop] = Array.from(varietiesByCrop[crop]).sort();
    }
    
    res.json(result);
  });

  // API Route to get basic statistics from the dataset
  app.get("/api/stats", (req, res) => {
    const csvPath = path.join(process.cwd(), "public", "odisha_realistic_dataset-1.csv");
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Dataset not found" });
    }
    const data = fs.readFileSync(csvPath, "utf8");
    const lines = data.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) return res.status(404).json({ error: "Dataset is empty" });
    
    const headers = lines[0].split(",").map(h => h.trim());
    const yieldIdx = headers.indexOf('Yield');
    const districtIdx = headers.indexOf('District');
    
    if (yieldIdx === -1) return res.status(500).json({ error: "Yield column not found" });
    
    let totalYield = 0;
    let count = 0;
    const districtYields: Record<string, { sum: number, count: number }> = {};
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(v => v.trim());
      const yieldVal = parseFloat(row[yieldIdx]);
      const districtVal = row[districtIdx];
      
      if (!isNaN(yieldVal)) {
        totalYield += yieldVal;
        count++;
        
        if (districtVal) {
          if (!districtYields[districtVal]) districtYields[districtVal] = { sum: 0, count: 0 };
          districtYields[districtVal].sum += yieldVal;
          districtYields[districtVal].count++;
        }
      }
    }
    
    const stateAvg = totalYield / count;
    const districtAvgs: Record<string, number> = {};
    for (const d in districtYields) {
      districtAvgs[d] = districtYields[d].sum / districtYields[d].count;
    }
    
    res.json({
      stateAvg,
      districtAvgs,
      totalRecords: count
    });
  });

  // API Route to get a random sample from the dataset
  app.get("/api/sample", (req, res) => {
    const csvPath = path.join(process.cwd(), "public", "odisha_realistic_dataset-1.csv");
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Dataset not found" });
    }
    const data = fs.readFileSync(csvPath, "utf8");
    const lines = data.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) return res.status(404).json({ error: "Dataset is empty" });
    
    const headers = lines[0].split(",").map(h => h.trim());
    const randomIndex = Math.floor(Math.random() * (lines.length - 1)) + 1;
    const row = lines[randomIndex].split(",").map(v => v.trim());
    
    const result: any = {};
    headers.forEach((h, i) => {
      if (row[i] !== undefined) {
        result[h] = row[i];
      }
    });
    
    res.json(result);
  });

  // Auto-train on startup if missing
  if (!fs.existsSync("model.pkl") || !fs.existsSync("features.pkl")) {
    console.log("Model files missing. Attempting to train model...");
    exec("python3 model.py", (error, stdout, stderr) => {
      if (error) {
        console.error("Auto-train failed:", stderr);
      } else {
        console.log("Auto-train successful:", stdout);
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
