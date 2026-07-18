// server/middleware/upload.js
// ============================================================
// File Upload Middleware — Multer + FFmpeg Format Conversion
// Accepts: MP4, WebM, MOV, AVI, MPEG
// Converts non-MP4 files to MP4 via FFmpeg for pipeline compat
// ============================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

// --- Ensure upload directory exists ---
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --- Allowed MIME types ---
const ALLOWED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',    // .mov
  'video/x-msvideo',    // .avi
  'video/mpeg',
];

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 2048) * 1024 * 1024;

// --- Multer Storage Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// --- File Filter ---
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Accepted: MP4, WebM, MOV, AVI, MPEG`
      ),
      false
    );
  }
};

// --- Multer Instance ---
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Post-upload middleware: Converts non-MP4 videos to MP4 via FFmpeg.
 * Replaces the uploaded file with the converted version.
 * Attaches video metadata (duration, resolution) to req.videoMeta.
 */
const convertToMp4 = async (req, res, next) => {
  if (!req.file) return next();

  const inputPath = req.file.path;
  const ext = path.extname(inputPath).toLowerCase();

  try {
    // --- Extract video metadata via FFprobe ---
    const probeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`;
    const probeOutput = JSON.parse(execSync(probeCmd, { encoding: 'utf-8' }));

    const videoStream = probeOutput.streams?.find((s) => s.codec_type === 'video');
    const duration = parseFloat(probeOutput.format?.duration || '0');
    const width = videoStream?.width || null;
    const height = videoStream?.height || null;

    req.videoMeta = { duration, width, height };

    // --- If already MP4, skip conversion ---
    if (ext === '.mp4') {
      logger.info(`Upload is MP4 — no conversion needed: ${req.file.filename}`);
      return next();
    }

    // --- Convert to MP4 ---
    const mp4Filename = `${path.basename(inputPath, ext)}.mp4`;
    const outputPath = path.join(uploadDir, mp4Filename);

    logger.info(`Converting ${ext} → MP4: ${req.file.filename} → ${mp4Filename}`);

    const convertCmd = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',                      // Overwrite if exists
      `"${outputPath}"`,
    ].join(' ');

    execSync(convertCmd, { stdio: 'pipe' });

    // Remove original non-MP4 file
    fs.unlinkSync(inputPath);

    // Update req.file to point to the converted MP4
    req.file.path = outputPath;
    req.file.filename = mp4Filename;
    req.file.mimetype = 'video/mp4';

    // Re-probe the converted file for accurate duration
    const reprobeOutput = JSON.parse(
      execSync(
        `ffprobe -v quiet -print_format json -show_format "${outputPath}"`,
        { encoding: 'utf-8' }
      )
    );
    req.videoMeta.duration = parseFloat(reprobeOutput.format?.duration || duration);

    logger.info(`Conversion complete: ${mp4Filename} (${req.videoMeta.duration.toFixed(1)}s)`);
    next();
  } catch (error) {
    logger.error(`FFmpeg conversion failed: ${error.message}`);

    // Clean up the uploaded file on failure
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    return res.status(422).json({
      success: false,
      error: 'Video conversion failed. Please ensure the file is a valid video.',
    });
  }
};

module.exports = { upload, convertToMp4 };
