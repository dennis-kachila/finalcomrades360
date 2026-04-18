const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Compresses an image and saves it as JPEG.
 * @param {string} inputPath - Path to the input image
 * @param {string} outputPath - Path where the compressed image will be saved
 * @param {Object} options - Compression options
 * @returns {Promise<Object>} - Result object with compression info
 */
async function compressImage(inputPath, outputPath, options = {}) {
  try {
    const {
      quality = 80,           // JPEG quality (0-100)
      maxWidth = 1600,        // Maximum width in pixels
      maxHeight = 1600,       // Maximum height in pixels
      maxSizeBytes = 1 * 1024 * 1024 // 1MB maximum size
    } = options;

    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // Calculate new dimensions while maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth || height > maxHeight) {
      const aspectRatio = width / height;

      if (width > height) {
        newWidth = Math.min(width, maxWidth);
        newHeight = Math.round(newWidth / aspectRatio);
      } else {
        newHeight = Math.min(height, maxHeight);
        newWidth = Math.round(newHeight * aspectRatio);
      }
    }

    // Create sharp instance for processing
    let image = sharp(inputPath).resize(newWidth, newHeight, {
      fit: 'inside',
      withoutEnlargement: true
    });

    // Always convert to JPEG for consistent storage and transfer efficiency.
    image = image.jpeg({
      quality,
      progressive: true,
      mozjpeg: true
    });

    // Compress and save
    const buffer = await image.toBuffer();

    // If still too large, reduce quality iteratively
    let currentQuality = quality;
    let currentBuffer = buffer;

    while (currentBuffer.length > maxSizeBytes && currentQuality > 10) {
      currentQuality -= 10;
      image = sharp(inputPath).resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });

      image = image.jpeg({
        quality: currentQuality,
        progressive: true,
        mozjpeg: true
      });

      currentBuffer = await image.toBuffer();
    }

    // Save the compressed image
    await fs.promises.writeFile(outputPath, currentBuffer);

    const originalSize = fs.statSync(inputPath).size;
    const compressedSize = currentBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio}%`,
      finalQuality: currentQuality,
      newDimensions: { width: newWidth, height: newHeight },
      savedBytes: originalSize - compressedSize
    };

  } catch (error) {
    console.error('Image compression error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Middleware to compress uploaded images
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function compressUploadedImages(req, res, next) {
  try {
    const filesToProcess = [];

    if (req.file) {
      filesToProcess.push(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        filesToProcess.push(...req.files);
      } else {
        Object.values(req.files).forEach((group) => {
          if (Array.isArray(group)) {
            filesToProcess.push(...group);
          }
        });
      }
    }

    if (filesToProcess.length === 0) {
      return next();
    }

    const compressionPromises = filesToProcess.map(async (file) => {
      // Robust check for image mimetype
      if (!file?.mimetype || !file.mimetype.startsWith('image/')) {
        console.log(`[Compression] Skipping non-image file: ${file?.fieldname}`);
        return { skipped: true, reason: 'non-image' };
      }

      const inputPath = file.path;
      if (!inputPath || !fs.existsSync(inputPath)) {
        console.warn(`[Compression] Input path missing for ${file.originalname}`);
        return { skipped: true, reason: 'path-missing' };
      }

      const parsed = path.parse(file.filename || path.basename(inputPath));
      const targetFilename = `${parsed.name}.jpg`;
      const targetPath = path.join(path.dirname(inputPath), targetFilename);
      const tempPath = path.join(
        path.dirname(inputPath),
        `${parsed.name}_compressed_${Date.now()}.jpg`
      );

      try {
        const result = await compressImage(inputPath, tempPath, {
          quality: 80,
          maxWidth: 1600,
          maxHeight: 1600,
          maxSizeBytes: 1 * 1024 * 1024
        });

        if (!result.success) {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          // LOG instead of throwing to prevent global 500 if one secondary image fails
          console.error(`[Compression] Failed to compress ${file.originalname}: ${result.error}`);
          return { skipped: true, reason: 'compression-failed', detail: result.error };
        }

        // SWAP FILES
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }

        fs.renameSync(tempPath, targetPath);

        // Keep Multer file metadata aligned with the converted JPEG artifact.
        file.path = targetPath;
        file.filename = targetFilename;
        file.mimetype = 'image/jpeg';
        file.size = result.compressedSize;
        file.compressed = true;
        file.compressionInfo = result;
        file.originalname = `${path.parse(file.originalname).name}.jpg`;

        console.log(`[Compression] Converted ${file.filename} to JPEG: ${result.compressionRatio} reduction`);
        return result;
      } catch (innerErr) {
        console.error(`[Compression] Fatal error processing ${file.originalname}:`, innerErr);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return { skipped: true, reason: 'fatal-error', detail: innerErr.message };
      }
    });

    await Promise.all(compressionPromises);
    next();
  } catch (error) {
    console.error('Image compression middleware error:', error);
    // If it's a truly global error, let it propagate but log it first
    next(error);
  }
}

module.exports = {
  compressImage,
  compressUploadedImages
};
