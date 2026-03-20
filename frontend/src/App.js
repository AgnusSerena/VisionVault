import React, { useState, useEffect, useRef } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const LOAD_COUNT = 4;
  const [visibleCount, setVisibleCount] = useState(LOAD_COUNT);

  const fileInputRef = useRef(null);
  const BACKEND_URL = "http://localhost:5000";

  const fetchImages = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/images`);
      const data = await res.json();

      setGallery(data);
      setVisibleCount(LOAD_COUNT);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("image", file);

      await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      fetchImages();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (key) => {
    if (!key) return;

    try {
      await fetch(`${BACKEND_URL}/delete/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });

      fetchImages();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  useEffect(() => {
    const delay = setTimeout(async () => {
      try {
        if (!search.trim()) {
          fetchImages();
          return;
        }

        const res = await fetch(`${BACKEND_URL}/search?q=${search}`);
        const data = await res.json();

        setGallery(data);
        setVisibleCount(LOAD_COUNT);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    fetchImages();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 100 &&
        visibleCount < gallery.length
      ) {
        setVisibleCount((prev) => prev + LOAD_COUNT);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleCount, gallery]);

  useEffect(() => {
    if (
      document.documentElement.scrollHeight <= window.innerHeight &&
      visibleCount < gallery.length
    ) {
      setVisibleCount((prev) => prev + LOAD_COUNT);
    }
  }, [gallery, visibleCount]);

  return (
    <div className="container">
      <div className="main-card">
        <h1 className="title">Vision Vault</h1>
        <h2>AI Photo Albums</h2>

        <div className="upload-box">
          <input
            type="file"
            accept="image/png, image/jpeg"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button onClick={handleUpload} disabled={loading}>
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search images (e.g. car, person)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <h2 className="gallery-title">Gallery</h2>

      <div className="gallery">
        {gallery.length === 0 ? (
          <p>No images found</p>
        ) : (
          gallery.slice(0, visibleCount).map((img) => (
            <div key={img.key} className="card">
              <img src={img.imageUrl} alt="" />

              <div className="labels">
                {img.labels.map((l) => (
                  <span key={l.name} className="tag">
                    {l.name}
                  </span>
                ))}
              </div>

              <button
                className="delete-btn"
                onClick={() => handleDelete(img.key)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
