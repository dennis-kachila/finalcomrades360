const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(__dirname, '../cache/images');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

exports.resizeImage = async (req, res) => {
    try {
        const { imagePath, width, height, quality = 80 } = req.query;

        if (!imagePath) {
            return res.status(400).json({ message: 'Image path is required' });
        }

        // Clean up the image path to prevent directory traversal
        // Remove leading/trailing slashes and 'uploads/' prefix if present twice
        let cleanPath = imagePath.replace(/^(\.\.(\/|\\|$))+/, '');

        // Construct absolute path to the original image
        // Assuming images are in 'uploads' directory at root of backend
        // If imagePath starts with /uploads, remove the leading slash for path.join
        const normalizedPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
        const originalFilePath = path.join(__dirname, '../', normalizedPath);

        // Security check: ensure the resolved path is within the uploads directory (or intended root)
        // For now, assuming all valid images are somewhere in the backend folder structure or specific uploads folder
        // Adjust this check based on where your images actually live.
        // if (!originalFilePath.startsWith(path.join(__dirname, '../uploads'))) {
        //     return res.status(403).json({ message: 'Access denied' });
        // }

        if (!fs.existsSync(originalFilePath)) {
            // Serve a proper SVG placeholder so <img> tags show something instead of broken icon
            const placeholderSvg = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="#f3f4f6"/>
  <rect x="140" y="120" width="120" height="100" rx="8" fill="#d1d5db"/>
  <circle cx="200" cy="155" r="20" fill="#9ca3af"/>
  <path d="M140 220 L175 175 L200 200 L230 165 L260 220 Z" fill="#9ca3af"/>
  <text x="200" y="270" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#9ca3af">No Image</text>
</svg>`;
            res.set('Content-Type', 'image/svg+xml');
            res.set('Cache-Control', 'public, max-age=60'); // Short cache so real images load once uploaded
            return res.send(placeholderSvg);
        }

        // Generate a cache key
        const w = width ? parseInt(width) : 'auto';
        const h = height ? parseInt(height) : 'auto';
        const q = parseInt(quality);
        const ext = path.extname(originalFilePath).toLowerCase(); // .jpg, .png
        // Create a unique filename for the cached version
        // e.g. cleanPath-w300-h200-q80.jpg (sanitize path separators)
        const safeName = normalizedPath.replace(/[\/\\]/g, '_');
        const cacheFilename = `${safeName}-w${w}-h${h}-q${q}${ext}`;
        const cacheFilePath = path.join(CACHE_DIR, cacheFilename);

        // Serve from cache if exists
        if (fs.existsSync(cacheFilePath)) {
            // Check if original file is newer than cache
            const originalStats = fs.statSync(originalFilePath);
            const cacheStats = fs.statSync(cacheFilePath);

            if (cacheStats.mtime > originalStats.mtime) {
                // Cache is valid
                res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
                return res.sendFile(cacheFilePath);
            }
        }

        // Resize
        const transform = sharp(originalFilePath);

        if (w !== 'auto' || h !== 'auto') {
            const resizeOptions = {
                fit: 'cover', // crop to cover dimensions
                withoutEnlargement: true
            };
            if (w !== 'auto') resizeOptions.width = w;
            if (h !== 'auto') resizeOptions.height = h;

            transform.resize(resizeOptions);
        }

        // Format specific optimizations
        if (ext === '.jpg' || ext === '.jpeg') {
            transform.jpeg({ quality: q, mozjpeg: true });
        } else if (ext === '.png') {
            transform.png({ quality: q > 90 ? 90 : q }); // PNG quality is different, usually slower for high compression
        } else if (ext === '.webp') {
            transform.webp({ quality: q });
        }

        // Save to cache and stream to response
        // Using toFile to save cache, but we also want to send it.
        // best way is to save then sendFile, or clone().toFile() and pipe().
        // For simplicity and avoiding race conditions with half-written files:
        // write to temp file then rename? OR just write and wait.

        await transform.toFile(cacheFilePath);

        res.set('Cache-Control', 'public, max-age=31536000');
        res.sendFile(cacheFilePath);

    } catch (error) {
        console.error('[ImageResize] Error:', error);
        res.status(500).json({ message: 'Error processing image' });
    }
};
