require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");


AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();


mongoose
  .connect("mongodb://127.0.0.1:27017/ai-photo-album")
  .then(() => console.log("MongoDB Connected "))
  .catch((err) => console.log(err));


const ImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    labels: [{ name: String, confidence: String }],
  },
  { timestamps: true },
);

const ImageModel = mongoose.model("Image", ImageSchema);


const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),

  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/png"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG and PNG images are allowed "), false);
    }
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});


async function detectLabels(bucket, key) {
  try {
    const res = await rekognition
      .detectLabels({
        Image: { S3Object: { Bucket: bucket, Name: key } },
        MaxLabels: 10,
        MinConfidence: 70,
      })
      .promise();

    return res.Labels;
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

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

 
    if (
      file.mimetype !== "image/jpeg" &&
      file.mimetype !== "image/jpg" &&
      file.mimetype !== "image/png"
    ) {
      return res.status(400).json({
        error: "Only JPG and PNG images are allowed ",
      });
    }

    const fileName = Date.now() + "-" + file.originalname;


    await s3
      .upload({
        Bucket: "my-ai-photo-album-12345",
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    console.log("Uploaded:", fileName);


    const labels = await detectLabels("my-ai-photo-album-12345", fileName);

    const formatted = labels.map((l) => ({
      name: l.Name,
      confidence: l.Confidence.toFixed(2),
    }));

    await ImageModel.create({
      key: fileName,
      labels: formatted,
    });

    res.json({
      key: fileName,
      imageUrl: getSignedUrl("my-ai-photo-album-12345", fileName),
      labels: formatted,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});


app.get("/images", async (req, res) => {
  try {
    const images = await ImageModel.find().sort({ createdAt: -1 });

    const result = images.map((img) => ({
      key: img.key,
      imageUrl: getSignedUrl("my-ai-photo-album-12345", img.key),
      labels: img.labels,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  try {
    const images = await ImageModel.find({
      "labels.name": { $regex: q, $options: "i" },
    });

    res.json(
      images.map((img) => ({
        key: img.key,
        imageUrl: getSignedUrl("my-ai-photo-album-12345", img.key),
        labels: img.labels,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});


app.delete("/delete/:key", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

    await s3
      .deleteObject({
        Bucket: "my-ai-photo-album-12345",
        Key: key,
      })
      .promise();

    await ImageModel.deleteOne({ key });

    res.json({ message: "Deleted successfully ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});


app.listen(5000, () => console.log("Server running 🚀"));
