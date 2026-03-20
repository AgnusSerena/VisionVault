require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");

// ===== AWS CONFIG =====
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

// ===== DB CONNECT =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("Mongo Error:", err));

// ===== MODEL =====
const ImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    labels: [
      {
        name: String,
        confidence: String,
      },
    ],
  },
  { timestamps: true },
);

const ImageModel = mongoose.model("Image", ImageSchema);

// ===== APP =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== MULTER =====
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG/PNG allowed"), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ===== HELPERS =====
async function detectLabels(bucket, key) {
  try {
    const res = await rekognition
      .detectLabels({
        Image: { S3Object: { Bucket: bucket, Name: key } },
        MaxLabels: 10,
        MinConfidence: 70,
      })
      .promise();

    return res.Labels || [];
  } catch (err) {
    console.error("Rekognition error:", err.message);
    return [];
  }
}

function getSignedUrl(bucket, key) {
  return s3.getSignedUrl("getObject", {
    Bucket: bucket,
    Key: key,
    Expires: 300,
  });
}

// ===== ROUTES =====

// 🚀 UPLOAD
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const file = req.file;
    const fileName = `${Date.now()}-${file.originalname}`;
    const bucket = process.env.S3_BUCKET_NAME;

    // Upload to S3
    await s3
      .upload({
        Bucket: bucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    console.log("Uploaded:", fileName);

    // Rekognition
    const labels = await detectLabels(bucket, fileName);

    const formatted = labels.map((l) => ({
      name: l.Name,
      confidence: l.Confidence.toFixed(2),
    }));

    // Save DB
    await ImageModel.create({
      key: fileName,
      labels: formatted,
    });

    res.json({
      success: true,
      key: fileName,
      imageUrl: getSignedUrl(bucket, fileName),
      labels: formatted,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// 📌 GET ALL
app.get("/images", async (req, res) => {
  try {
    const bucket = process.env.S3_BUCKET_NAME;

    const images = await ImageModel.find().sort({ createdAt: -1 });

    const result = images.map((img) => ({
      key: img.key,
      imageUrl: getSignedUrl(bucket, img.key),
      labels: img.labels,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

// 🔍 SEARCH
app.get("/search", async (req, res) => {
  try {
    const bucket = process.env.S3_BUCKET_NAME;
    const q = req.query.q;

    if (!q) return res.json([]);

    const images = await ImageModel.find({
      "labels.name": { $regex: q, $options: "i" },
    });

    res.json(
      images.map((img) => ({
        key: img.key,
        imageUrl: getSignedUrl(bucket, img.key),
        labels: img.labels,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

// ❌ DELETE
app.delete("/delete/:key", async (req, res) => {
  try {
    const bucket = process.env.S3_BUCKET_NAME;
    const key = decodeURIComponent(req.params.key);

    await s3
      .deleteObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();

    await ImageModel.deleteOne({ key });

    res.json({ success: true, message: "Deleted ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ===== SERVER =====
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on ${PORT} 🚀`));
