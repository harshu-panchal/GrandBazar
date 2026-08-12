import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getOptimizedImageFormat = () =>
    String(process.env.CLOUDINARY_IMAGE_UPLOAD_FORMAT || '').trim().toLowerCase();

const getOptimizedImageQuality = () =>
    String(process.env.CLOUDINARY_IMAGE_UPLOAD_QUALITY || '').trim();

const isImageMimeType = (mimeType = '') =>
    String(mimeType || '').trim().toLowerCase().startsWith('image/');

const getImageUploadOptions = () => {
    const format = getOptimizedImageFormat();
    const quality = getOptimizedImageQuality();
    return {
        ...(format ? { format } : {}),
        ...(quality ? { transformation: `q_${quality}` } : {}),
    };
};

export const uploadToCloudinary = async (fileBuffer, folder = 'categories', options = {}) => {
    const mimeType = String(options.mimeType || '').trim().toLowerCase();
    const resourceType = String(options.resourceType || '').trim().toLowerCase();
    const shouldOptimizeImage =
        options.optimize !== false &&
        (resourceType === 'image' || isImageMimeType(mimeType));

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: shouldOptimizeImage ? 'image' : 'auto',
                ...(shouldOptimizeImage ? getImageUploadOptions() : {}),
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result.secure_url);
                }
            }
        );
        uploadStream.end(fileBuffer);
    });
};

/**
 * Cloudinary's account-level "Restricted media types" security setting
 * (on by default for most accounts) blocks PUBLIC, unsigned delivery of
 * PDF/ZIP uploads outright — no per-upload flag overrides it. The
 * documented workaround is to deliver those assets via a signed URL
 * instead. Use this for any non-image document upload (invoices, etc.)
 * where the caller will need to re-derive a signed delivery link later
 * via `getSignedRawUrl`, rather than trusting a stored public URL.
 */
export const uploadRawToCloudinary = async (fileBuffer, folder = 'documents', { format = 'pdf' } = {}) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'raw', format, type: 'authenticated' },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ publicId: result.public_id, url: result.secure_url });
                }
            }
        );
        uploadStream.end(fileBuffer);
    });
};

/**
 * Generate a fresh signed delivery URL for a raw asset (bypasses the
 * restricted-media-types block). `publicId` must be the raw `public_id`
 * exactly as returned by `uploadRawToCloudinary` — for raw resources
 * Cloudinary bakes the format extension into the public_id itself, so
 * no separate `format` option should be passed here (it would double it up).
 */
export const getSignedRawUrl = (publicId) => {
    // publicId from uploadRawToCloudinary already has the format extension
    // baked in as literal characters (confirmed via Admin API lookup — that's
    // how this account stores authenticated raw uploads) — pass it whole and
    // leave `format` empty, or the download endpoint 404s looking for a
    // resource whose id got the extension stripped twice.
    return cloudinary.utils.private_download_url(publicId, null, {
        resource_type: 'raw',
        type: 'authenticated',
    });
};

export default cloudinary;
