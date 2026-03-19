import express from "express";
import { createServer as createViteServer } from "vite";
import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
    exec("python3 -m pip install pandas numpy xgboost scikit-learn joblib && python3 model.py", (error, stdout, stderr) => {
      if (error) {
        console.error("Train error:", stderr);
        return res.status(500).json({ error: "Training failed", details: stderr });
      }
      res.json({ message: "Model trained successfully", output: stdout });
    });
  });

  // API Route to get unique values from the dataset
  app.get("/api/uniques", (req, res) => {
    const csvPath = "odisha_realistic_dataset-1.csv";
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Dataset not found" });
    }
    const data = fs.readFileSync(csvPath, "utf8");
    const lines = data.split("\n").filter(l => l.trim().length > 0);
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
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(v => v.trim());
      const cropVal = row[cropIdx];
      const varietyVal = row[varietyIdx];
      if (cropVal && varietyVal) {
        if (!varietiesByCrop[cropVal]) varietiesByCrop[cropVal] = new Set();
        varietiesByCrop[cropVal].add(varietyVal);
      }
    }
    
    result.VarietiesByCrop = {};
    for (const crop in varietiesByCrop) {
      result.VarietiesByCrop[crop] = Array.from(varietiesByCrop[crop]).sort();
    }
    
    res.json(result);
  });

  // API Route to get a random sample from the dataset
  app.get("/api/sample", (req, res) => {
    const csvPath = "odisha_realistic_dataset-1.csv";
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "Dataset not found" });
    }
    const data = fs.readFileSync(csvPath, "utf8");
    const lines = data.split("\n").filter(l => l.trim().length > 0);
    if (lines.length <= 1) return res.status(404).json({ error: "Dataset is empty" });
    
    const headers = lines[0].split(",").map(h => h.trim());
    const randomIndex = Math.floor(Math.random() * (lines.length - 1)) + 1;
    const row = lines[randomIndex].split(",").map(v => v.trim());
    
    const result: any = {};
    headers.forEach((h, i) => {
      result[h] = row[i];
    });
    
    res.json(result);
  });

  // Auto-train on startup if missing
  if (!fs.existsSync("model.pkl") || !fs.existsSync("features.pkl")) {
    console.log("Model files missing. Attempting to train model...");
    exec("python3 -m pip install pandas numpy xgboost scikit-learn joblib && python3 model.py", (error, stdout, stderr) => {
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
