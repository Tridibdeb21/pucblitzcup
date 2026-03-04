(function () {
    const HANDLE_STORAGE_KEY = 'blitzUserHandle';
    const AVATAR_STORAGE_KEY = 'blitzUserAvatar';
    const AUTH_META_KEY = 'blitzAuthMeta';
    const AUTH_DEPLOY_TOKEN = 'v2.1';
    const AUTH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    const PRESENCE_PING_INTERVAL_MS = 30000;
    const API_BASE_URL = window.location.origin;

    let pingTimer = null;
    let pingInFlight = false;
    let globalProfileModal = null;
    let globalProfileBody = null;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function readAuthMeta() {
        const raw = localStorage.getItem(AUTH_META_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const issuedAt = Number(parsed.issuedAt) || 0;
            const deployToken = String(parsed.deployToken || '').trim();
            if (!issuedAt || !deployToken) return null;
            return { issuedAt, deployToken };
        } catch {
            return null;
        }
    }

    function isAuthSessionValid() {
        const meta = readAuthMeta();
        if (!meta) return false;
        if (meta.deployToken !== AUTH_DEPLOY_TOKEN) return false;
        return (Date.now() - meta.issuedAt) <= AUTH_MAX_AGE_MS;
    }

    function clearAuthSessionStorage() {
        localStorage.removeItem(HANDLE_STORAGE_KEY);
        localStorage.removeItem(AVATAR_STORAGE_KEY);
        localStorage.removeItem('blitzRoomState');
        localStorage.removeItem('blitzBattleRuntimeState');
        localStorage.removeItem('blitzPendingJoinRoomId');
        localStorage.removeItem(AUTH_META_KEY);
    }

    async function logoutServerSession() {
        try {
            await fetch(`${API_BASE_URL}/api/session/logout`, {
                method: 'POST',
                credentials: 'same-origin'
            });
        } catch {
        }
    }

    async function syncAuthFromServerSession() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/session/me`, {
                method: 'GET',
                credentials: 'same-origin'
            });
            if (!response.ok) return;

            const data = await response.json();
            if (!data || !data.authenticated || !data.handle) {
                if (String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim()) {
                    clearAuthSessionStorage();
                }
                return;
            }

            const serverHandle = String(data.handle || '').trim();
            if (!serverHandle) return;

            if (!String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim()) {
                localStorage.setItem(HANDLE_STORAGE_KEY, serverHandle);
            }

            localStorage.setItem(AUTH_META_KEY, JSON.stringify({
                issuedAt: Date.now(),
                deployToken: AUTH_DEPLOY_TOKEN
            }));
        } catch {
        }
    }

    function enforceAuthPolicy() {
        const handle = String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim();
        if (!handle) return;
        if (!isAuthSessionValid()) {
            clearAuthSessionStorage();
        }
    }

    function renderGlobalHandleChip() {
        const chips = document.querySelectorAll('[data-global-handle-chip]');
        enforceAuthPolicy();
        const handle = String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim();
        const avatar = String(localStorage.getItem(AVATAR_STORAGE_KEY) || '').trim();

        if (!chips.length) return;

        chips.forEach((chip) => {
            if (!handle) {
                chip.classList.add('not-verified');
                chip.textContent = 'Login';
                const currentPath = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}`;
                const returnTo = encodeURIComponent(currentPath || '/');
                chip.setAttribute('href', `index.html?login=1&returnTo=${returnTo}`);
                chip.removeAttribute('target');
                chip.removeAttribute('rel');
                chip.setAttribute('title', 'Login in Arena');
                return;
            }

            const avatarHtml = avatar
                ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(handle)}" class="global-handle-avatar">`
                : '';

            chip.classList.remove('not-verified');
            chip.innerHTML = `${avatarHtml}<span>${escapeHtml(handle)}</span>`;
            chip.setAttribute('href', '#');
            chip.dataset.handle = handle;
            chip.setAttribute('target', '_self');
            chip.setAttribute('title', 'Open profile card');
        });
    }

    function normalizeHandle(handle) {
        return String(handle || '').trim().toLowerCase();
    }

    function getRankFromRating(rating) {
        const value = Number(rating) || 0;
        if (value < 1200) return { name: 'Newbie', color: '#8a8f99' };
        if (value < 1400) return { name: 'Pupil', color: '#74ca77' };
        if (value < 1600) return { name: 'Specialist', color: '#4bc7b8' };
        if (value < 1900) return { name: 'Expert', color: '#6ea8fe' };
        if (value < 2100) return { name: 'Candidate Master', color: '#c67bf3' };
        if (value < 2400) return { name: 'Master', color: '#ffb86a' };
        return { name: 'Grandmaster', color: '#ff7d7d' };
    }

    function formatLastSeen(lastSeenTs) {
        const timestamp = Number(lastSeenTs) || 0;
        if (!timestamp) return 'last seen unavailable';
        const diffMs = Math.max(0, Date.now() - timestamp);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;

        if (diffMs < minute) return 'last seen just now';
        if (diffMs < hour) {
            const value = Math.floor(diffMs / minute);
            return `last seen ${value} minute${value === 1 ? '' : 's'} ago`;
        }
        if (diffMs < day) {
            const value = Math.floor(diffMs / hour);
            return `last seen ${value} hour${value === 1 ? '' : 's'} ago`;
        }
        const value = Math.floor(diffMs / day);
        return `last seen ${value} day${value === 1 ? '' : 's'} ago`;
    }

    function buildSiteUserStats(results, targetHandle) {
        const targetNorm = normalizeHandle(targetHandle);
        let played = 0;
        let wins = 0;
        let losses = 0;
        let ties = 0;
        let scoreSum = 0;

        const recent = [];
        for (const match of Array.isArray(results) ? results : []) {
            const p1 = String(match?.player1?.handle || '');
            const p2 = String(match?.player2?.handle || '');
            const p1Norm = normalizeHandle(p1);
            const p2Norm = normalizeHandle(p2);
            if (p1Norm !== targetNorm && p2Norm !== targetNorm) continue;

            played += 1;
            const winnerNorm = normalizeHandle(match?.winner);
            if (winnerNorm === 'tie') ties += 1;
            else if (winnerNorm === targetNorm) wins += 1;
            else losses += 1;

            const ownScore = p1Norm === targetNorm
                ? Number(match?.player1?.score) || 0
                : Number(match?.player2?.score) || 0;
            const oppScore = p1Norm === targetNorm
                ? Number(match?.player2?.score) || 0
                : Number(match?.player1?.score) || 0;
            scoreSum += ownScore;

            recent.push({
                date: String(match?.date || ''),
                opponent: p1Norm === targetNorm ? p2 : p1,
                ownScore,
                oppScore,
                outcome: winnerNorm === 'tie' ? 'T' : winnerNorm === targetNorm ? 'W' : 'L'
            });
        }

        const recentMatches = recent
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);

        let streak = '-';
        if (recentMatches.length) {
            const latest = recentMatches[0].outcome;
            let count = 0;
            for (const item of recentMatches) {
                if (item.outcome !== latest) break;
                count += 1;
            }
            streak = `${latest}${count}`;
        }

        return {
            played,
            wins,
            losses,
            ties,
            winRate: played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0',
            avgScore: played > 0 ? (scoreSum / played).toFixed(1) : '0.0',
            streak,
            recentMatches
        };
    }

    function ensureGlobalProfileModal() {
        if (globalProfileModal && globalProfileBody) return;

        globalProfileModal = document.createElement('div');
        globalProfileModal.className = 'global-profile-modal';
        globalProfileModal.innerHTML = `
            <div class="global-profile-modal-content">
                <h2>User Profile</h2>
                <div class="global-profile-modal-body">Loading profile...</div>
                <div class="global-profile-modal-actions">
                    <button type="button" class="global-profile-modal-logout" data-global-logout="1">Logout</button>
                    <button type="button" class="global-profile-modal-close">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(globalProfileModal);
        globalProfileBody = globalProfileModal.querySelector('.global-profile-modal-body');
        const closeBtn = globalProfileModal.querySelector('.global-profile-modal-close');
        const logoutBtn = globalProfileModal.querySelector('[data-global-logout]');

        closeBtn.addEventListener('click', () => {
            globalProfileModal.style.display = 'none';
        });

        logoutBtn.addEventListener('click', () => {
            logoutServerSession().catch(() => {});
            clearAuthSessionStorage();
            globalProfileModal.style.display = 'none';
            renderGlobalHandleChip();
            startPresenceHeartbeat();
        });

        globalProfileModal.addEventListener('click', (event) => {
            if (event.target === globalProfileModal) {
                globalProfileModal.style.display = 'none';
            }
        });
    }

    async function openGlobalProfileModal(handle) {
        const cleanHandle = String(handle || '').trim();
        if (!cleanHandle) return;

        ensureGlobalProfileModal();
        globalProfileModal.style.display = 'flex';
        globalProfileBody.textContent = 'Loading profile...';

        try {
            const [cfRes, resultsRes, presenceRes] = await Promise.all([
                fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(cleanHandle)}`),
                fetch(`${API_BASE_URL}/api/results`),
                fetch(`${API_BASE_URL}/api/presence/${encodeURIComponent(cleanHandle)}`)
            ]);

            const cfData = await cfRes.json();
            if (cfData.status !== 'OK' || !Array.isArray(cfData.result) || !cfData.result[0]) {
                globalProfileBody.textContent = 'Could not load profile right now.';
                return;
            }

            const profile = cfData.result[0];
            const results = await resultsRes.json();
            const presence = await presenceRes.json();
            const stats = buildSiteUserStats(results, cleanHandle);

            const handle = String(profile.handle || cleanHandle);
            const rank = profile.rank || 'Unrated';
            const maxRank = profile.maxRank || 'Unrated';
            const rating = Number.isFinite(Number(profile.rating)) ? profile.rating : '—';
            const maxRating = Number.isFinite(Number(profile.maxRating)) ? profile.maxRating : '—';
            const avatar = profile.titlePhoto || '';
            const rankColor = getRankFromRating(Number(profile.maxRating) || Number(profile.rating) || 0).color;
            const statusText = presence?.active ? 'online now' : formatLastSeen(presence?.lastSeen);

            const recentHtml = (stats.recentMatches || []).length
                ? stats.recentMatches.map(item => `
                    <li class="global-profile-recent-item">
                        <span>${escapeHtml(item.outcome)}</span>
                        <span>vs ${escapeHtml(item.opponent || 'Unknown')}</span>
                        <span>${escapeHtml(item.ownScore)} - ${escapeHtml(item.oppScore)}</span>
                    </li>
                `).join('')
                : '<li class="global-profile-recent-empty">No recent matches</li>';

            globalProfileBody.innerHTML = `
                <div class="global-profile-head">
                    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(handle)}" class="global-profile-avatar">` : ''}
                    <div>
                        <div class="global-profile-handle" style="color:${rankColor}">${escapeHtml(handle)}</div>
                        <div class="global-profile-rank">${escapeHtml(rank)} · max ${escapeHtml(maxRank)}</div>
                        <div class="global-profile-presence">${escapeHtml(statusText)}</div>
                    </div>
                </div>
                <div class="global-profile-grid">
                    <div><span>Rating</span><strong>${escapeHtml(rating)}</strong></div>
                    <div><span>Max Rating</span><strong>${escapeHtml(maxRating)}</strong></div>
                    <div><span>Played</span><strong>${escapeHtml(stats.played)}</strong></div>
                    <div><span>Wins</span><strong>${escapeHtml(stats.wins)}</strong></div>
                    <div><span>Losses</span><strong>${escapeHtml(stats.losses)}</strong></div>
                    <div><span>Ties</span><strong>${escapeHtml(stats.ties)}</strong></div>
                    <div><span>Win Rate</span><strong>${escapeHtml(stats.winRate)}%</strong></div>
                    <div><span>Streak</span><strong>${escapeHtml(stats.streak)}</strong></div>
                    <div><span>Avg Score</span><strong>${escapeHtml(stats.avgScore)}</strong></div>
                </div>
                <div class="global-profile-links">
                    <a href="https://codeforces.com/profile/${encodeURIComponent(handle)}" target="_blank" rel="noopener noreferrer">CF Profile</a>
                    <a href="results.html?handle=${encodeURIComponent(handle)}" target="_blank" rel="noopener noreferrer">Match History</a>
                </div>
                <div class="global-profile-recent-wrap">
                    <div class="global-profile-recent-title">Recent 5 Matches</div>
                    <ul>${recentHtml}</ul>
                </div>
            `;
        } catch {
            globalProfileBody.textContent = 'Could not load profile right now.';
        }
    }

    async function pingPresence(force = false) {
        enforceAuthPolicy();
        const handle = String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim();
        if (!handle) return;
        if (pingInFlight && !force) return;

        pingInFlight = true;
        try {
            await fetch('/api/presence/ping', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                keepalive: true
            });
        } catch {
        } finally {
            pingInFlight = false;
        }
    }

    function startPresenceHeartbeat() {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }

        pingPresence(true);
        pingTimer = setInterval(() => {
            pingPresence(false);
        }, PRESENCE_PING_INTERVAL_MS);
    }

    window.addEventListener('storage', (event) => {
        if (event.key === HANDLE_STORAGE_KEY || event.key === AVATAR_STORAGE_KEY) {
            renderGlobalHandleChip();
            startPresenceHeartbeat();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            pingPresence(true);
        }
    });

    window.addEventListener('focus', () => {
        pingPresence(true);
    });

    window.addEventListener('pagehide', () => {
        pingPresence(true);
    });

    document.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-global-handle-chip]');
        if (!chip || chip.classList.contains('not-verified')) return;

        event.preventDefault();
        enforceAuthPolicy();
        const handle = String(localStorage.getItem(HANDLE_STORAGE_KEY) || '').trim();
        if (!handle) return;
        openGlobalProfileModal(handle).catch(() => {});
    });

    async function bootstrap() {
        enforceAuthPolicy();
        await syncAuthFromServerSession();
        renderGlobalHandleChip();
        startPresenceHeartbeat();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bootstrap().catch(() => {});
        });
    } else {
        bootstrap().catch(() => {});
    }
})();
