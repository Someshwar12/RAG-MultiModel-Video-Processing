// server/utils/pythonRunner.js
// ============================================================
// Python Worker Runner — Utility for testing & debugging
// Can be called standalone: node utils/pythonRunner.js <script> <json_input>
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_EXE = process.env.PYTHON_EXECUTABLE || 'python3';
const WORKERS_DIR = path.join(__dirname, '..', 'python-workers');

/**
 * Run a Python worker script and collect its output.
 * @param {string} scriptRelPath - Relative to python-workers/
 * @param {Object} inputPayload - JSON input
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false] - Log progress messages
 * @returns {Promise<Object>} - The final result
 */
async function runWorker(scriptRelPath, inputPayload, options = {}) {
  const { verbose = false } = options;
  const scriptPath = path.join(WORKERS_DIR, scriptRelPath);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Worker script not found: ${scriptPath}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, ['-u', scriptPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: WORKERS_DIR,
    });

    let result = null;
    let stderr = '';
    let buffer = '';

    proc.stdin.write(JSON.stringify(inputPayload));
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress' && verbose) {
            console.log(`  [${msg.stage}] ${msg.progress}% — ${msg.message}`);
          } else if (msg.type === 'result') {
            result = msg.data;
          } else if (msg.type === 'error') {
            console.error(`  [ERROR] ${msg.message}`);
          }
        } catch {
          if (verbose) console.log(`  [stdout] ${line}`);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Exit code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(result);
      }
    });
  });
}

// CLI usage: node utils/pythonRunner.js audio/transcribe_and_diarize.py '{"audio_path":"..."}'
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

  const [,, script, jsonInput] = process.argv;
  if (!script) {
    console.log('Usage: node utils/pythonRunner.js <script> [json_input]');
    console.log('Example: node utils/pythonRunner.js audio/transcribe_and_diarize.py \'{"audio_path":"./uploads/audio/test.wav"}\'');
    process.exit(0);
  }

  const input = jsonInput ? JSON.parse(jsonInput) : {};

  console.log(`Running: ${script}`);
  console.log(`Input: ${JSON.stringify(input, null, 2)}`);
  console.log('---');

  runWorker(script, input, { verbose: true })
    .then((result) => {
      console.log('---');
      console.log('Result:', JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runWorker };
