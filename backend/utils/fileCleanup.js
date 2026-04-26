const fs = require('fs');
const path = require('path');

/**
 * Safely deletes an array of file URLs/paths from the server hard drive.
 * Automatically resolves relative paths to absolute system paths.
 * Ignores any default images or external URLs.
 * 
 * @param {string|string[]} fileUrls - A single file path or array of file paths (e.g. '/uploads/products/123.jpg')
 */
const deleteFiles = (fileUrls) => {
    if (!fileUrls) return;
    
    // Normalize to array
    const urls = Array.isArray(fileUrls) ? fileUrls : [fileUrls];
    
    if (urls.length === 0) return;

    urls.forEach(url => {
        if (!url || typeof url !== 'string') return;
        
        // Safety checks: don't delete external URLs, data URIs, or default system images
        if (url.startsWith('http') || url.startsWith('data:') || url.includes('default-') || url.includes('default_')) {
            return;
        }

        try {
            // Strip leading slash if present
            const relativePath = url.startsWith('/') ? url.substring(1) : url;
            
            // Construct absolute path
            // Assumes this file is in backend/utils/ and uploads is in backend/uploads/
            const absolutePath = path.join(__dirname, '..', relativePath);

            // Ensure we are only deleting within the uploads directory to prevent directory traversal attacks
            if (!absolutePath.includes(path.join(__dirname, '..', 'uploads'))) {
                console.warn(`[FileCleanup] Security block: Attempted to delete file outside uploads directory: ${absolutePath}`);
                return;
            }

            fs.unlink(absolutePath, (err) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        // File already missing, which is fine
                        // console.log(`[FileCleanup] File not found (already deleted?): ${absolutePath}`);
                    } else {
                        console.error(`[FileCleanup] Failed to delete file: ${absolutePath}`, err);
                    }
                } else {
                    console.log(`[FileCleanup] Safely deleted orphaned file: ${absolutePath}`);
                }
            });
        } catch (e) {
            console.error(`[FileCleanup] Error processing file deletion for url ${url}:`, e);
        }
    });
};

module.exports = { deleteFiles };
