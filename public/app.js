document.addEventListener('DOMContentLoaded', () => {
  // ── DOM References ──
  const form = document.getElementById('download-form');
  const urlInput = document.getElementById('video-url');
  const clearBtn = document.getElementById('clear-btn');
  const fetchBtn = document.getElementById('fetch-btn');
  const btnText = document.getElementById('btn-text');
  const errorMsg = document.getElementById('error-msg');
  const resultSection = document.getElementById('result-section');
  const scrollTopBtn = document.getElementById('scroll-top');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('mobile-nav');

  // ── Coming Soon Toast ──
  const toast = document.createElement('div');
  toast.id = 'coming-soon-toast';
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="material-symbols-outlined" style="font-size:22px;color:#f59e0b;">construction</span>
      <div>
        <div style="font-weight:700;font-size:14px;color:#1f2937;">Coming Soon!</div>
        <div style="font-size:13px;color:#6b7280;">This platform is under development. Stay tuned!</div>
      </div>
    </div>
  `;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '-100px', left: '50%', transform: 'translateX(-50%)',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px',
    padding: '16px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
    zIndex: '9999', transition: 'bottom 0.4s cubic-bezier(0.34,1.56,0.64,1)', maxWidth: '380px', width: '90%'
  });
  document.body.appendChild(toast);

  let toastTimer = null;
  function showComingSoon() {
    toast.style.bottom = '28px';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.bottom = '-100px'; }, 3000);
  }

  document.querySelectorAll('[data-coming-soon]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showComingSoon();
    });
  });

  // ── Mobile Menu Toggle ──
  if (mobileMenuBtn && mobileNav) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = !mobileNav.classList.contains('hidden');
      mobileNav.classList.toggle('hidden', isOpen);
      // Swap icon
      const icon = mobileMenuBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isOpen ? 'menu' : 'close';
    });

    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.classList.add('hidden');
        const icon = mobileMenuBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'menu';
      });
    });
  }

  // ── Scroll to Top ──
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        scrollTopBtn.classList.remove('opacity-0', 'translate-y-3', 'pointer-events-none');
        scrollTopBtn.classList.add('opacity-100', 'translate-y-0');
      } else {
        scrollTopBtn.classList.add('opacity-0', 'translate-y-3', 'pointer-events-none');
        scrollTopBtn.classList.remove('opacity-100', 'translate-y-0');
      }
    });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Clear Button ──
  urlInput.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !urlInput.value);
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    resultSection.classList.add('hidden');
    errorMsg.classList.add('hidden');
    urlInput.focus();
  });

  // ── Format Tab Switching ──
  const tabBtns = document.querySelectorAll('.format-tab');
  const tabPanels = document.querySelectorAll('.format-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;

      // Deactivate all tabs
      tabBtns.forEach(b => {
        b.classList.remove('active', 'bg-primary', 'text-white');
        b.classList.add('bg-gray-100', 'text-gray-600');
      });
      tabPanels.forEach(p => p.classList.add('hidden'));

      // Activate clicked tab
      btn.classList.add('active', 'bg-primary', 'text-white');
      btn.classList.remove('bg-gray-100', 'text-gray-600');

      const target = document.getElementById(targetId);
      if (target) target.classList.remove('hidden');
    });
  });

  // Initialize tab styles
  tabBtns.forEach((btn, i) => {
    if (i === 0) {
      btn.classList.add('bg-primary', 'text-white');
    } else {
      btn.classList.add('bg-gray-100', 'text-gray-600');
    }
  });

  // ── Form Submission ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    // Reset
    errorMsg.classList.add('hidden');
    resultSection.classList.add('hidden');
    setLoading(true);

    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch video information.');
      }

      // Populate result card
      document.getElementById('result-thumb').src = data.thumbnail;
      document.getElementById('result-thumb').alt = data.title || 'Video Thumbnail';
      document.getElementById('result-title').textContent = data.title;
      document.getElementById('result-duration').textContent = data.duration;
      document.getElementById('result-author').innerHTML = `
        <span class="material-symbols-outlined text-base">person</span> ${escapeHtml(data.author)}
      `;
      document.getElementById('result-views').innerHTML = `
        <span class="material-symbols-outlined text-base">visibility</span> ${data.views} views
      `;

      // Render video format rows
      const videoList = document.getElementById('video-formats');
      videoList.innerHTML = data.videoFormats.map(f => `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-surface-alt border border-gray-100 rounded-xl gap-3 hover:border-brand-blue/40 transition-colors">
          <div class="flex items-center gap-4 flex-wrap">
            <span class="font-bold text-sm text-gray-800 min-w-[60px]">${escapeHtml(f.qualityLabel)}</span>
            <span class="text-xs text-gray-500 px-2.5 py-1 bg-white border border-gray-200 rounded">MP4</span>
            <span class="text-xs text-gray-400">${f.contentLength}</span>
            <span class="text-xs text-emerald-500 font-medium">🔊 Audio</span>
          </div>
          <a href="/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(f.qualityLabel)}&format=mp4"
             class="inline-flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold text-sm transition-colors shadow-sm">
            <span class="material-symbols-outlined text-lg">download</span> Download
          </a>
        </div>
      `).join('');

      // Render audio format rows
      const audioList = document.getElementById('audio-formats');
      audioList.innerHTML = data.audioFormats.map(f => `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-surface-alt border border-gray-100 rounded-xl gap-3 hover:border-purple-300 transition-colors">
          <div class="flex items-center gap-4 flex-wrap">
            <span class="font-bold text-sm text-gray-800 min-w-[60px]">MP3 ${escapeHtml(f.audioBitrate)}</span>
            <span class="text-xs text-gray-500 px-2.5 py-1 bg-white border border-gray-200 rounded">MP3</span>
            <span class="text-xs text-gray-400">${f.contentLength}</span>
          </div>
          <a href="/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(f.audioBitrate)}&format=mp3"
             class="inline-flex items-center gap-1.5 px-5 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm">
            <span class="material-symbols-outlined text-lg">music_note</span> Download
          </a>
        </div>
      `).join('');

      // Show results & reset tabs to video
      resultSection.classList.remove('hidden');
      tabBtns.forEach((btn, i) => {
        if (i === 0) {
          btn.classList.add('active', 'bg-primary', 'text-white');
          btn.classList.remove('bg-gray-100', 'text-gray-600');
        } else {
          btn.classList.remove('active', 'bg-primary', 'text-white');
          btn.classList.add('bg-gray-100', 'text-gray-600');
        }
      });
      tabPanels.forEach((p, i) => p.classList.toggle('hidden', i !== 0));

      // Smooth scroll to results
      setTimeout(() => {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);

    } catch (err) {
      errorMsg.textContent = err.message || 'An error occurred. Please try again.';
      errorMsg.classList.remove('hidden');
    } finally {
      setLoading(false);
    }
  });

  // ── Helpers ──
  function setLoading(loading) {
    fetchBtn.disabled = loading;
    if (loading) {
      btnText.innerHTML = '<span class="spinner"></span> Fetching...';
      fetchBtn.classList.add('opacity-80', 'cursor-not-allowed');
    } else {
      btnText.textContent = 'Download';
      fetchBtn.classList.remove('opacity-80', 'cursor-not-allowed');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href').slice(1);
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
        // Close mobile nav if open
        if (mobileNav && !mobileNav.classList.contains('hidden')) {
          mobileNav.classList.add('hidden');
        }
      }
    });
  });

  // ── Dynamic SEO SPA Router ──
  const routeMap = {
    '/': {
      title: 'Free YouTube Video Downloader - Download YouTube Videos HD, 4K & MP3 Online',
      h1: 'YouTube Video Downloader',
      sub: 'Download YouTube Videos for Free in HD, 1080p, 4K and MP3',
      placeholder: 'Paste YouTube link here (e.g. https://www.youtube.com/watch?v=...)'
    },
    '/youtube-video-downloader': {
      title: 'Free YouTube Video Downloader - Download HD, 4K & MP3',
      h1: 'YouTube Video Downloader',
      sub: 'Download YouTube Videos for Free in HD, 1080p, 4K and MP3',
      placeholder: 'Paste YouTube link here...'
    },
    '/youtube-to-mp3': {
      title: 'YouTube to MP3 Converter - Free MP3 Audio Downloader',
      h1: 'YouTube to MP3 Converter',
      sub: 'Convert YouTube Videos to High-Quality MP3 Audio Free',
      placeholder: 'Paste YouTube link to convert to MP3...'
    },
    '/youtube-to-mp4': {
      title: 'YouTube to MP4 Converter - Download HD & 4K MP4 Videos',
      h1: 'YouTube to MP4 Converter',
      sub: 'Download YouTube Videos in MP4 Format (1080p, 4K)',
      placeholder: 'Paste YouTube link to convert to MP4...'
    },
    '/youtube-shorts-downloader': {
      title: 'YouTube Shorts Downloader - Save Shorts Videos Free',
      h1: 'YouTube Shorts Downloader',
      sub: 'Download YouTube Shorts Videos in HD Quality',
      placeholder: 'Paste YouTube Shorts link here...'
    },
    '/youtube-audio-downloader': {
      title: 'YouTube Audio Downloader - Extract Audio Free',
      h1: 'YouTube Audio Downloader',
      sub: 'Download Audio Tracks & Songs from YouTube',
      placeholder: 'Paste YouTube link to extract audio...'
    },
    '/youtube-music-downloader': {
      title: 'YouTube Music Downloader - Save Free Songs & Audio',
      h1: 'YouTube Music Downloader',
      sub: 'Download Music & Songs from YouTube Free',
      placeholder: 'Paste YouTube music video link...'
    },
    '/about-us': {
      title: 'About Us - Free YouTube Video Downloader',
      h1: 'YouTube Video Downloader',
      sub: 'Fastest, Safest & Free Tool to Download YouTube Media',
      placeholder: 'Paste YouTube link here...',
      scrollTo: 'about-us'
    },
    '/faq': {
      title: 'Frequently Asked Questions - YouTube Video Downloader',
      h1: 'Frequently Asked Questions',
      sub: 'Everything You Need to Know About Downloading YouTube Videos',
      placeholder: 'Paste YouTube link here...',
      scrollTo: 'faq'
    }
  };

  function handleRoute(path, push = true) {
    const cleanPath = path.toLowerCase().replace(/\/$/, '') || '/';
    const routeData = routeMap[cleanPath];
    if (routeData) {
      if (push && window.location.pathname !== cleanPath) {
        history.pushState(null, '', cleanPath);
      }
      document.title = routeData.title;
      const h1El = document.querySelector('h1');
      if (h1El) h1El.textContent = routeData.h1;
      const subEl = document.querySelector('h1 + p');
      if (subEl) subEl.textContent = routeData.sub;
      if (urlInput) urlInput.placeholder = routeData.placeholder;

      // Close mobile nav if open
      if (mobileNav && !mobileNav.classList.contains('hidden')) {
        mobileNav.classList.add('hidden');
      }

      // Scroll to specific section if defined, else top
      if (routeData.scrollTo) {
        const targetEl = document.getElementById(routeData.scrollTo);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Intercept clicks on internal routes
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="/"]');
    if (link && !link.hasAttribute('data-coming-soon')) {
      const href = link.getAttribute('href');
      if (routeMap[href]) {
        e.preventDefault();
        handleRoute(href, true);
      }
    }
  });

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    handleRoute(window.location.pathname, false);
  });

  // Initialize current route
  handleRoute(window.location.pathname, false);
});
