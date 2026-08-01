const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);

try { require('dotenv').config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

// Path to downloaded yt-dlp binary from GitHub
const YTDLP_PATH = path.join(__dirname, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// Fallback API Keys & Services
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const COBALT_API_URL = process.env.COBALT_API_URL || 'https://api.cobalt.tools/api/json';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10);
  if (isNaN(sec) || sec <= 0) return '0:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return 'Variable';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const validHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'music.youtube.com'];
    return validHosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    if (u.pathname.includes('/shorts/')) return u.pathname.split('/shorts/')[1]?.split(/[?/]/)[0];
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

// ── API: Get Video Info via yt-dlp ──

app.get('/api/info', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl || !isValidYouTubeUrl(videoUrl)) {
      return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract video ID from the URL' });
    }

    // 1. Primary Method: yt-dlp binary from GitHub
    if (fs.existsSync(YTDLP_PATH)) {
      try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [
          '-J',
          '--no-playlist',
          `https://www.youtube.com/watch?v=${videoId}`
        ], { maxBuffer: 10 * 1024 * 1024 });

        const info = JSON.parse(stdout);
        const title = info.title || 'Untitled Video';
        const duration = formatDuration(info.duration || 0);
        const views = (info.view_count || 0).toLocaleString();
        const author = info.uploader || info.channel || 'Unknown Author';
        const thumbnail = info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

        // Extract available video formats
        const videoFormats = [];
        const seenQuality = new Set();

        if (info.formats && Array.isArray(info.formats)) {
          // Sort formats by height descending
          const sortedFormats = info.formats.filter(f => f.height && (f.vcodec !== 'none')).sort((a, b) => b.height - a.height);
          for (const f of sortedFormats) {
            const qLabel = `${f.height}p`;
            if (!seenQuality.has(qLabel)) {
              seenQuality.add(qLabel);
              videoFormats.push({
                qualityLabel: qLabel,
                container: f.ext || 'mp4',
                hasAudio: f.acodec && f.acodec !== 'none',
                contentLength: formatBytes(f.filesize || f.filesize_approx || 0),
                formatId: f.format_id
              });
            }
          }
        }

        if (videoFormats.length === 0) {
          videoFormats.push(
            { qualityLabel: '1080p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best' },
            { qualityLabel: '720p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=720]' },
            { qualityLabel: '480p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=480]' },
            { qualityLabel: '360p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=360]' }
          );
        }

        const audioFormats = [
          { audioBitrate: '320 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' },
          { audioBitrate: '192 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' },
          { audioBitrate: '128 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' }
        ];

        return res.json({
          videoId,
          title,
          duration,
          views,
          author,
          thumbnail,
          videoFormats,
          audioFormats,
          source: 'yt-dlp (GitHub)'
        });
      } catch (ytdlpErr) {
        console.error('yt-dlp info error, trying fallback:', ytdlpErr.message);
      }
    }

    // 2. Fallback: YouTube oEmbed API
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);

    if (!oembedRes.ok) {
      throw new Error('Video not found or unavailable');
    }

    const oembed = await oembedRes.json();

    const videoFormats = [
      { qualityLabel: '1080p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best' },
      { qualityLabel: '720p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=720]' },
      { qualityLabel: '480p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=480]' },
      { qualityLabel: '360p', container: 'mp4', hasAudio: true, contentLength: 'Variable', formatId: 'best[height<=360]' }
    ];

    const audioFormats = [
      { audioBitrate: '320 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' },
      { audioBitrate: '192 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' },
      { audioBitrate: '128 kbps', container: 'mp3', contentLength: 'Variable', formatId: 'bestaudio' }
    ];

    res.json({
      videoId,
      title: oembed.title || 'Untitled Video',
      duration: '0:00',
      views: '0',
      author: oembed.author_name || 'Unknown',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      videoFormats,
      audioFormats,
      source: 'YouTube oEmbed'
    });
  } catch (error) {
    console.error('Error fetching video info:', error.message);
    res.status(500).json({ error: 'Failed to fetch video info. The video may be private, restricted, or unavailable.' });
  }
});

// ── API: Download Handler — Proxied with Content-Disposition for direct file save ──

app.get('/api/download', async (req, res) => {
  try {
    const { url, quality, format: fmt } = req.query;

    if (!url || !isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract video ID' });
    }

    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const isAudio = (fmt === 'mp3' || quality?.includes('kbps'));

    // Helper: proxy a remote URL through our server with attachment headers
    function proxyDownload(streamUrl, filename, mimeType) {
      return new Promise((resolve, reject) => {
        const safeName = filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'download';
        const mod = streamUrl.startsWith('https') ? require('https') : require('http');

        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.youtube.com/',
            'Accept': '*/*'
          }
        };

        function doGet(getUrl) {
          mod.get(getUrl, options, (upstream) => {
            // Follow redirects (301, 302, 303, 307, 308)
            if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
              upstream.resume(); // consume response to free memory
              doGet(upstream.headers.location);
              return;
            }

            if (upstream.statusCode !== 200) {
              upstream.resume();
              reject(new Error(`Upstream returned status ${upstream.statusCode}`));
              return;
            }

            res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
            res.setHeader('Content-Type', mimeType);
            if (upstream.headers['content-length']) {
              res.setHeader('Content-Length', upstream.headers['content-length']);
            }

            upstream.pipe(res);
            upstream.on('end', resolve);
            upstream.on('error', reject);
            res.on('close', () => upstream.destroy()); // cleanup if client disconnects
          }).on('error', (err) => {
            reject(err);
          });
        }

        doGet(streamUrl);
      });
    }

    // Get video title for the download filename
    let videoTitle = 'video';
    if (fs.existsSync(YTDLP_PATH)) {
      try {
        const { stdout: titleOut } = await execFileAsync(YTDLP_PATH, [
          '--print', 'title',
          '--no-playlist',
          targetUrl
        ]);
        videoTitle = titleOut.trim() || 'video';
      } catch (e) {
        // title fetch failed, use fallback
      }
    }

    // 1. Try yt-dlp (100% Free, combined formats with audio)
    if (fs.existsSync(YTDLP_PATH)) {
      try {
        let formatSpec;
        if (isAudio) {
          formatSpec = 'bestaudio[ext=m4a]/bestaudio/best';
        } else {
          // Use "best" which selects the best COMBINED (video+audio) format
          const numHeight = (quality || '720').replace(/[^0-9]/g, '') || '720';
          formatSpec = `best[height<=${numHeight}][ext=mp4]/best[height<=${numHeight}]/best`;
        }

        const { stdout } = await execFileAsync(YTDLP_PATH, [
          '-g',
          '-f', formatSpec,
          '--no-playlist',
          targetUrl
        ]);

        const streamUrl = stdout.trim().split('\n')[0];
        if (streamUrl && streamUrl.startsWith('http')) {
          const ext = isAudio ? 'mp3' : 'mp4';
          const mime = isAudio ? 'audio/mpeg' : 'video/mp4';
          const qualityTag = isAudio ? (quality || 'audio') : (quality || '720p');
          const filename = `${videoTitle} [${qualityTag}].${ext}`;
          return await proxyDownload(streamUrl, filename, mime);
        }
      } catch (ytdlpErr) {
        console.error('yt-dlp download error:', ytdlpErr.message);
        if (ytdlpErr.stderr) console.error('yt-dlp stderr:', ytdlpErr.stderr);
      }
    }

    // 2. Try Cobalt API
    if (COBALT_API_URL) {
      try {
        const cobaltRes = await fetch(COBALT_API_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: targetUrl,
            videoQuality: (quality || '720').replace(/[^0-9]/g, '') || '720',
            isAudioOnly: isAudio
          })
        });

        if (cobaltRes.ok) {
          const data = await cobaltRes.json();
          if (data.url) {
            const ext = isAudio ? 'mp3' : 'mp4';
            const mime = isAudio ? 'audio/mpeg' : 'video/mp4';
            const filename = `${videoTitle} [${quality || '720p'}].${ext}`;
            return await proxyDownload(data.url, filename, mime);
          }
        }
      } catch (cobaltErr) {
        console.error('Cobalt API notice:', cobaltErr.message);
      }
    }

    // 3. Try Apify Token
    if (APIFY_TOKEN) {
      try {
        const actorInput = {
          startUrls: [{ url: targetUrl }],
          quality: quality || 'highest',
          format: fmt || 'mp4',
          maxResults: 1
        };

        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/bernardo~youtube-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(actorInput)
          }
        );

        if (apifyRes.ok) {
          const items = await apifyRes.json();
          if (items && items.length > 0 && items[0].formats) {
            const requestedQuality = quality || '720p';
            const matchedFormat = items[0].formats.find(f =>
              f.qualityLabel === requestedQuality && f.url
            ) || items[0].formats.find(f => f.url && f.hasVideo && f.hasAudio);

            if (matchedFormat && matchedFormat.url) {
              const ext = isAudio ? 'mp3' : 'mp4';
              const mime = isAudio ? 'audio/mpeg' : 'video/mp4';
              const filename = `${videoTitle} [${quality || '720p'}].${ext}`;
              return await proxyDownload(matchedFormat.url, filename, mime);
            }
          }
        }
      } catch (apifyErr) {
        console.error('Apify API notice:', apifyErr.message);
      }
    }

    // 4. Fallback — no provider could extract a URL
    res.status(500).json({ error: 'Download failed. No provider could extract a download link. Please try again.' });

  } catch (error) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed. Please try again.' });
    }
  }
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ytdlpConfigured: fs.existsSync(YTDLP_PATH),
    cobaltConfigured: !!COBALT_API_URL,
    apifyConfigured: !!APIFY_TOKEN,
    rapidApiConfigured: !!RAPIDAPI_KEY,
    timestamp: new Date().toISOString()
  });
});

// ── Catch-all route for SEO landers & SPA routing ──
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🚀 YouTube Video Downloader server running at http://localhost:${PORT}`);
  console.log(`  ⚡ yt-dlp Engine: ${fs.existsSync(YTDLP_PATH) ? 'Active (GitHub Latest Binary) ✅' : 'not found'}`);
  console.log(`  🌐 Cobalt API: ${COBALT_API_URL ? 'enabled (100% Free) ✅' : 'disabled'}`);
  console.log(`  📦 Apify token: ${APIFY_TOKEN ? 'configured ✅' : 'not set'}`);
  console.log(`  🔑 RapidAPI key: ${RAPIDAPI_KEY ? 'configured ✅' : 'not set'}\n`);
});

module.exports = app;
