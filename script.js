(function() {
    // State
    let player1Handle = '';
    let player2Handle = '';
    let player1Score = 0;
    let player2Score = 0;
    let player1Rank = '';
    let player2Rank = '';
    let player1RankColor = '';
    let player2RankColor = '';
    let battleActive = false;
    let timerInterval = null;
    let breakInterval = null;
    let apiCheckInterval = null;
    let totalDurationSec = 600;
    let timeLeftSec = 600;
    let checkIntervalSec = 3;
    let currentProblem = null;
    let problemLocked = false;
    let breakActive = false;
    let breakSecondsLeft = 0;
    let breakStartTime = null; // Track when break started
    let usedProblemIds = new Set();
    let playersValidated = false;
    let currentProblemIndex = 0;
    let countdownInterval = null;
    let isCountdownActive = false;
    let blitzNumber = 1;
    let notificationPermission = false;
    let battleStartTime = null;
    let battleDuration = 600;
    
    // Track solved problems per player
    let p1SolvedProblems = new Set();
    let p2SolvedProblems = new Set();
    
    // Problems configuration
    let problems = [];
    let problemResults = {
        p1: [],
        p2: []
    };

    // DOM elements
    const p1HandleSpan = document.getElementById('p1Handle');
    const p2HandleSpan = document.getElementById('p2Handle');
    const p1RankSpan = document.getElementById('p1Rank');
    const p2RankSpan = document.getElementById('p2Rank');
    const p1ScoreSpan = document.getElementById('p1Score');
    const p2ScoreSpan = document.getElementById('p2Score');
    const p1Row = document.getElementById('player1Row');
    const p2Row = document.getElementById('player2Row');
    const probNameSpan = document.getElementById('probName');
    const probPointsSpan = document.getElementById('probPoints');
    const probRatingSpan = document.getElementById('probRating');
    const problemUrl = document.getElementById('problemUrl');
    const lockStatusDiv = document.getElementById('lockStatus');
    const breakTimerDiv = document.getElementById('breakTimer');
    const subNote = document.getElementById('subNote');
    const matchTimer = document.getElementById('matchTimer');
    const matchStatusText = document.getElementById('matchStatusText');
    const breakIndicator = document.getElementById('breakIndicator');
    const apiStatus = document.getElementById('apiStatus');
    const startBtn = document.getElementById('startBattleBtn');
    const cancelGameBtn = document.getElementById('cancelGameBtn');
    const loginBtn = document.getElementById('loginBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const p1HandleInput = document.getElementById('p1HandleInput');
    const p2HandleInput = document.getElementById('p2HandleInput');
    const p1InputGroup = document.getElementById('p1InputGroup');
    const p2InputGroup = document.getElementById('p2InputGroup');
    const totalDurationInput = document.getElementById('totalDuration');
    const checkIntervalInput = document.getElementById('checkInterval');
    const problemsBody = document.getElementById('problemsBody');
    const addProblemBtn = document.getElementById('addProblemBtn');
    const leaderboardHeader = document.getElementById('leaderboardHeader');
    const leaderboardBody = document.getElementById('leaderboardBody');
    const notificationCenter = document.getElementById('notificationCenter');
    const celebrationModal = document.getElementById('celebrationModal');
    const winnerHandleSpan = document.getElementById('winnerHandle');
    const closeCelebrationBtn = document.getElementById('closeCelebration');
    const loggedInfo = document.getElementById('loggedInfo');
    
    // Modals
    const countdownModal = document.getElementById('countdownModal');
    const countdownNumber = document.getElementById('countdownNumber');
    const passwordModal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const confirmCancel = document.getElementById('confirmCancel');
    const cancelPassword = document.getElementById('cancelPassword');

    const CANCEL_PASSWORD = 'PUC103815';
    const API_BASE_URL = 'https://blitzing-2.onrender.com/api';

    // Rating options
    const ratingOptions = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600];

    // Debug function
    function debugLog(message) {
        console.log(`[DEBUG] ${message}`);
    }

    // Update timer based on real elapsed time
    function updateTimerFromRealTime() {
        if (!battleActive || !battleStartTime) return timeLeftSec;
        
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - battleStartTime) / 1000);
        const newTimeLeft = Math.max(0, battleDuration - elapsedSeconds);
        
        if (newTimeLeft !== timeLeftSec) {
            timeLeftSec = newTimeLeft;
            updateTimerDisplay();
            saveState();
            
            if (timeLeftSec <= 0) {
                stopBattle();
            }
        }
        return timeLeftSec;
    }

    // Update break timer based on real elapsed time
    function updateBreakTimerFromRealTime() {
        if (!breakActive || !breakStartTime) return breakSecondsLeft;
        
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - breakStartTime) / 1000);
        const newBreakLeft = Math.max(0, 60 - elapsedSeconds);
        
        if (newBreakLeft !== breakSecondsLeft) {
            breakSecondsLeft = newBreakLeft;
            breakTimerDiv.textContent = `⏳ break ${breakSecondsLeft}s`;
            breakIndicator.textContent = `Break ${breakSecondsLeft}s`;
            saveState();
            
            if (breakSecondsLeft <= 0) {
                endBreak();
            }
        }
        return breakSecondsLeft;
    }

    // Reset to default state
    function resetToDefaultState() {
        debugLog('Resetting to default state');
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (breakInterval) {
            clearInterval(breakInterval);
            breakInterval = null;
        }
        if (apiCheckInterval) {
            clearInterval(apiCheckInterval);
            apiCheckInterval = null;
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        battleActive = false;
        breakActive = false;
        isCountdownActive = false;
        problemLocked = false;
        currentProblem = null;
        currentProblemIndex = 0;
        battleStartTime = null;
        breakStartTime = null;
        
        timeLeftSec = parseInt(totalDurationInput.value) * 60 || 600;
        updateTimerDisplay();
        
        breakTimerDiv.style.display = 'none';
        breakIndicator.style.display = 'none';
        
        probNameSpan.textContent = '—';
        probPointsSpan.textContent = '0';
        probRatingSpan.textContent = 'Rating: 1200';
        problemUrl.href = '#';
        problemUrl.style.pointerEvents = 'none';
        problemUrl.style.opacity = '0.7';
        
        lockStatusDiv.textContent = '🔓 open · waiting solve';
        lockStatusDiv.className = 'problem-lock-status';
        
        matchStatusText.innerHTML = '⏳ Ready to start';
        matchStatusText.classList.remove('status-live', 'status-ended');
        
        startBtn.disabled = false;
        
        document.querySelectorAll('.config-dashboard input, .config-dashboard select, .config-dashboard button, #addProblemBtn, .remove-problem, #loginBtn').forEach(el => {
            if (el) el.disabled = false;
        });
        
        document.querySelectorAll('.problem-points-input, .problem-rating-select').forEach(input => {
            input.disabled = false;
        });
        
        saveState();
    }

    // Request notification permission
    async function requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('This browser does not support desktop notification');
            return;
        }
        
        if (Notification.permission === 'granted') {
            notificationPermission = true;
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            notificationPermission = permission === 'granted';
        }
    }

    // Show desktop notification
    function showDesktopNotification(title, message, isWinner = false) {
        const notification = document.createElement('div');
        notification.className = `desktop-notification ${isWinner ? 'winner' : ''}`;
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
            <div>${message}</div>
        `;
        notification.onclick = () => notification.remove();
        notificationCenter.appendChild(notification);
        
        setTimeout(() => notification.remove(), 5000);

        if (notificationPermission && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    // Codeforces rank mapping
    function getRankFromRating(rating) {
        if (rating < 1200) return { name: 'Newbie', color: 'rank-newbie' };
        if (rating < 1400) return { name: 'Pupil', color: 'rank-pupil' };
        if (rating < 1600) return { name: 'Specialist', color: 'rank-specialist' };
        if (rating < 1900) return { name: 'Expert', color: 'rank-expert' };
        if (rating < 2100) return { name: 'Candidate Master', color: 'rank-cm' };
        if (rating < 2300) return { name: 'Master', color: 'rank-master' };
        if (rating < 2400) return { name: 'International Master', color: 'rank-im' };
        if (rating < 3000) return { name: 'Grandmaster', color: 'rank-gm' };
        return { name: 'Legendary Grandmaster', color: 'rank-lgm' };
    }

    // Save result to server
    async function saveResultToServer(result) {
        try {
            const response = await fetch(`${API_BASE_URL}/results`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(result)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save result');
            }
            
            const data = await response.json();
            console.log('Result saved:', data);
        } catch (error) {
            console.error('Error saving result:', error);
        }
    }

    // Load saved state
    function loadSavedState() {
        debugLog('Loading saved state');
        const saved = localStorage.getItem('blitzCupState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                player1Handle = state.player1Handle || '';
                player2Handle = state.player2Handle || '';
                player1Score = state.player1Score || 0;
                player2Score = state.player2Score || 0;
                battleActive = state.battleActive || false;
                breakActive = state.breakActive || false;
                breakSecondsLeft = state.breakSecondsLeft || 0;
                currentProblemIndex = state.currentProblemIndex || 0;
                problems = state.problems || [];
                problemResults = state.problemResults || { p1: [], p2: [] };
                usedProblemIds = new Set(state.usedProblemIds || []);
                p1SolvedProblems = new Set(state.p1SolvedProblems || []);
                p2SolvedProblems = new Set(state.p2SolvedProblems || []);
                blitzNumber = state.blitzNumber || 1;
                battleStartTime = state.battleStartTime || null;
                battleDuration = state.battleDuration || 600;
                breakStartTime = state.breakStartTime || null;
                problemLocked = state.problemLocked || false;
                
                if (state.currentProblem) {
                    currentProblem = state.currentProblem;
                }
                
                // Calculate time left based on real elapsed time
                if (battleActive && battleStartTime) {
                    const now = Date.now();
                    const elapsedSeconds = Math.floor((now - battleStartTime) / 1000);
                    timeLeftSec = Math.max(0, battleDuration - elapsedSeconds);
                    debugLog(`Battle active, elapsed: ${elapsedSeconds}s, time left: ${timeLeftSec}s`);
                } else {
                    timeLeftSec = state.timeLeftSec || 600;
                }
                
                // Calculate break time left based on real elapsed time
                if (breakActive && breakStartTime) {
                    const now = Date.now();
                    const elapsedSeconds = Math.floor((now - breakStartTime) / 1000);
                    breakSecondsLeft = Math.max(0, 60 - elapsedSeconds);
                    debugLog(`Break active, elapsed: ${elapsedSeconds}s, break left: ${breakSecondsLeft}s`);
                }
                
                if (problems.length === 0) {
                    problems.push({ index: 1, points: 500, rating: 1200 });
                }
                
                renderProblems();
                
                if (player1Handle) {
                    p1HandleSpan.href = `https://codeforces.com/profile/${player1Handle}`;
                    p1HandleSpan.textContent = player1Handle;
                }
                if (player2Handle) {
                    p2HandleSpan.href = `https://codeforces.com/profile/${player2Handle}`;
                    p2HandleSpan.textContent = player2Handle;
                }
                
                if (battleActive) {
                    debugLog('Restoring active battle UI');
                    
                    document.querySelectorAll('.config-dashboard input, .config-dashboard select, .config-dashboard button, #addProblemBtn, .remove-problem, #loginBtn').forEach(el => {
                        if (el) el.disabled = true;
                    });
                    
                    document.querySelectorAll('.problem-points-input, .problem-rating-select').forEach(input => {
                        input.disabled = true;
                    });
                    
                    if (currentProblem) {
                        probNameSpan.textContent = currentProblem.name;
                        probPointsSpan.textContent = problems[currentProblemIndex - 1]?.points || 500;
                        probRatingSpan.textContent = `Rating: ${currentProblem.rating}`;
                        problemUrl.href = currentProblem.url;
                        problemUrl.style.pointerEvents = 'auto';
                        problemUrl.style.opacity = '1';
                        problemUrl.textContent = `🔗 Open ${currentProblem.name} on Codeforces`;
                        
                        lockStatusDiv.textContent = problemLocked ? 
                            `🔒 LOCKED · solved` : 
                            `🔓 Problem ${currentProblemIndex}/${problems.length} · waiting for AC`;
                    }
                    
                    if (breakActive) {
                        breakTimerDiv.style.display = 'block';
                        breakTimerDiv.textContent = `⏳ break ${breakSecondsLeft}s`;
                        breakIndicator.style.display = 'inline-block';
                        breakIndicator.textContent = `Break ${breakSecondsLeft}s`;
                        matchStatusText.innerHTML = '<span class="status-live">🔴 LIVE</span>';
                    } else {
                        matchStatusText.innerHTML = '<span class="status-live">🔴 LIVE</span>';
                    }
                    
                    updatePlayerUI();
                    updateTimerDisplay();
                    renderLeaderboard();
                    startBattleTimer();
                    
                    if (apiCheckInterval) clearInterval(apiCheckInterval);
                    apiCheckInterval = setInterval(checkSubmissions, checkIntervalSec * 1000);
                    
                    apiStatus.innerHTML = `🔄 Reconnected to ongoing battle`;
                    reconnectBtn.style.display = 'inline-block';
                    
                    // Check if time already expired
                    if (timeLeftSec <= 0) {
                        stopBattle();
                    }
                    
                    // Check if break already expired
                    if (breakActive && breakSecondsLeft <= 0) {
                        endBreak();
                    }
                }
                
                if (player1Handle && player2Handle) {
                    playersValidated = true;
                    loggedInfo.innerHTML = `👤 ${player1Handle} vs ${player2Handle}`;
                    p1HandleInput.value = player1Handle;
                    p2HandleInput.value = player2Handle;
                    fetchUserRanks();
                }
            } catch (e) {
                console.error('Error loading state:', e);
            }
        }
        
        if (problems.length === 0) {
            problems.push({ index: 1, points: 500, rating: 1200 });
            renderProblems();
        }
    }

    // Save state
    function saveState() {
        const state = {
            player1Handle,
            player2Handle,
            player1Score,
            player2Score,
            battleActive,
            timeLeftSec,
            breakActive,
            breakSecondsLeft,
            currentProblemIndex,
            currentProblem,
            problemLocked,
            problems,
            problemResults,
            usedProblemIds: Array.from(usedProblemIds),
            p1SolvedProblems: Array.from(p1SolvedProblems),
            p2SolvedProblems: Array.from(p2SolvedProblems),
            blitzNumber,
            battleStartTime,
            battleDuration,
            breakStartTime
        };
        localStorage.setItem('blitzCupState', JSON.stringify(state));
        debugLog('State saved');
    }

    // Fetch user ranks
    async function fetchUserRanks() {
        try {
            const response = await fetch(`https://codeforces.com/api/user.info?handles=${player1Handle};${player2Handle}`);
            const data = await response.json();
            
            if (data.status === 'OK') {
                const users = data.result;
                
                const p1Rating = users[0].rating || 0;
                const p1RankInfo = getRankFromRating(p1Rating);
                player1Rank = p1RankInfo.name;
                player1RankColor = p1RankInfo.color;
                
                const p2Rating = users[1].rating || 0;
                const p2RankInfo = getRankFromRating(p2Rating);
                player2Rank = p2RankInfo.name;
                player2RankColor = p2RankInfo.color;
                
                updatePlayerUI();
            }
        } catch (error) {
            console.error('Error fetching ranks:', error);
        }
    }

    // Fetch user's solved problems
    async function fetchUserSolvedProblems(handle) {
        try {
            const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=1000`);
            const data = await response.json();
            
            if (data.status === 'OK') {
                const solved = new Set();
                data.result.forEach(sub => {
                    if (sub.verdict === 'OK' && sub.problem) {
                        const problemId = `${sub.problem.contestId}${sub.problem.index}`;
                        solved.add(problemId);
                    }
                });
                return solved;
            }
            return new Set();
        } catch (error) {
            console.error('Error fetching solved problems:', error);
            return new Set();
        }
    }

    // Format time
    function formatTime(seconds) {
        const mins = Math.floor(Math.max(0, seconds) / 60);
        const secs = Math.floor(Math.max(0, seconds) % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
        matchTimer.textContent = formatTime(timeLeftSec);
    }

    function updateMatchStatus() {
        if (!battleActive) {
            matchStatusText.innerHTML = '⏸️ Ended';
            matchStatusText.classList.remove('status-live');
            matchStatusText.classList.add('status-ended');
            breakIndicator.style.display = 'none';
        } else if (breakActive) {
            matchStatusText.innerHTML = '<span class="status-live">🔴 LIVE</span>';
            breakIndicator.style.display = 'inline-block';
            breakIndicator.textContent = `Break ${breakSecondsLeft}s`;
        } else {
            matchStatusText.innerHTML = '<span class="status-live">🔴 LIVE</span>';
            breakIndicator.style.display = 'none';
        }
    }

    function updatePlayerUI() {
        if (player1Handle) {
            p1HandleSpan.href = `https://codeforces.com/profile/${player1Handle}`;
            p1HandleSpan.textContent = player1Handle;
        }
        if (player2Handle) {
            p2HandleSpan.href = `https://codeforces.com/profile/${player2Handle}`;
            p2HandleSpan.textContent = player2Handle;
        }
        
        p1HandleSpan.className = `player-handle ${player1RankColor}`;
        p1RankSpan.textContent = player1Rank;
        p1RankSpan.className = `player-rank ${player1RankColor}`;
        
        p2HandleSpan.className = `player-handle ${player2RankColor}`;
        p2RankSpan.textContent = player2Rank;
        p2RankSpan.className = `player-rank ${player2RankColor}`;
        
        p1ScoreSpan.textContent = player1Score;
        p2ScoreSpan.textContent = player2Score;
        
        renderLeaderboard();
        updateMatchStatus();
    }

    function renderLeaderboard() {
        let headerHtml = '<tr><th>Player</th><th>Rank</th><th>Total</th>';
        problems.forEach((prob, index) => {
            headerHtml += `<th>P${index + 1}<br><small>${prob.points}pts</small></th>`;
        });
        headerHtml += '</tr>';
        leaderboardHeader.innerHTML = headerHtml;
        
        let p1Row = '<tr>';
        p1Row += `<td><span class="${player1RankColor}"><strong>${player1Handle || 'player1'}</strong></span></td>`;
        p1Row += `<td><span class="${player1RankColor}">${player1Rank}</span></td>`;
        p1Row += `<td><strong style="color: #ffd966;">${player1Score}</strong></td>`;
        
        problems.forEach((prob, index) => {
            const result = problemResults.p1[index];
            if (result && result.solved) {
                p1Row += `<td class="problem-cell solved">✓</td>`;
            } else if (result && result.attempts > 0) {
                p1Row += `<td class="problem-cell attempted">✗</td>`;
            } else {
                p1Row += `<td class="problem-cell">—</td>`;
            }
        });
        p1Row += '</tr>';
        
        let p2Row = '<tr>';
        p2Row += `<td><span class="${player2RankColor}"><strong>${player2Handle || 'player2'}</strong></span></td>`;
        p2Row += `<td><span class="${player2RankColor}">${player2Rank}</span></td>`;
        p2Row += `<td><strong style="color: #ffd966;">${player2Score}</strong></td>`;
        
        problems.forEach((prob, index) => {
            const result = problemResults.p2[index];
            if (result && result.solved) {
                p2Row += `<td class="problem-cell solved">✓</td>`;
            } else if (result && result.attempts > 0) {
                p2Row += `<td class="problem-cell attempted">✗</td>`;
            } else {
                p2Row += `<td class="problem-cell">—</td>`;
            }
        });
        p2Row += '</tr>';
        
        leaderboardBody.innerHTML = p1Row + p2Row;
    }

    // Add new problem
    addProblemBtn.addEventListener('click', () => {
        if (battleActive) return;
        
        const problemCount = problems.length + 1;
        problems.push({
            index: problemCount,
            points: 500,
            rating: 1200
        });
        renderProblems();
        renderLeaderboard();
    });

    function renderProblems() {
        let html = '';
        problems.forEach((prob, idx) => {
            let ratingOptionsHtml = '';
            ratingOptions.forEach(rating => {
                const selected = rating === prob.rating ? 'selected' : '';
                ratingOptionsHtml += `<option value="${rating}" ${selected}>${rating}</option>`;
            });
            
            html += `
                <tr class="problem-row" data-index="${idx}">
                    <td><strong>Problem ${idx + 1}</strong></td>
                    <td>
                        <input type="number" class="problem-points-input" value="${prob.points}" min="1" max="2000" step="1" data-index="${idx}" ${battleActive ? 'disabled' : ''}>
                    </td>
                    <td>
                        <select class="problem-rating-select" data-index="${idx}" ${battleActive ? 'disabled' : ''}>
                            ${ratingOptionsHtml}
                        </select>
                    </td>
                    <td>
                        <button class="remove-problem" data-index="${idx}" ${battleActive || problems.length <= 1 ? 'disabled' : ''}>✕</button>
                    </td>
                </tr>
            `;
        });
        problemsBody.innerHTML = html;
        
        document.querySelectorAll('.problem-points-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                problems[idx].points = Math.max(1, parseInt(e.target.value) || 1);
                renderLeaderboard();
                saveState();
            });
        });
        
        document.querySelectorAll('.problem-rating-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                problems[idx].rating = parseInt(e.target.value);
                saveState();
            });
        });
        
        document.querySelectorAll('.remove-problem').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (battleActive) return;
                const idx = e.target.dataset.index;
                problems.splice(idx, 1);
                renderProblems();
                renderLeaderboard();
                saveState();
            });
        });
    }

    // Validate Codeforces handle
    async function validateHandle(handle) {
        try {
            const response = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
            const data = await response.json();
            return data.status === 'OK';
        } catch {
            return false;
        }
    }

    // Login
    loginBtn.addEventListener('click', async () => {
        const p1 = p1HandleInput.value.trim();
        const p2 = p2HandleInput.value.trim();
        
        if (!p1 || !p2) {
            alert('Please enter both player handles');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ validating...';
        
        const [p1Valid, p2Valid] = await Promise.all([
            validateHandle(p1),
            validateHandle(p2)
        ]);

        loginBtn.disabled = false;
        loginBtn.textContent = '✓ set players';

        if (!p1Valid) {
            p1InputGroup.classList.add('invalid');
            setTimeout(() => p1InputGroup.classList.remove('invalid'), 500);
            alert(`Invalid Codeforces handle: ${p1}`);
            return;
        }
        
        if (!p2Valid) {
            p2InputGroup.classList.add('invalid');
            setTimeout(() => p2InputGroup.classList.remove('invalid'), 500);
            alert(`Invalid Codeforces handle: ${p2}`);
            return;
        }

        player1Handle = p1;
        player2Handle = p2;
        playersValidated = true;
        
        p1HandleSpan.href = `https://codeforces.com/profile/${player1Handle}`;
        p2HandleSpan.href = `https://codeforces.com/profile/${player2Handle}`;
        
        player1Score = 0;
        player2Score = 0;
        problemResults = { p1: [], p2: [] };
        usedProblemIds.clear();
        p1SolvedProblems.clear();
        p2SolvedProblems.clear();
        
        apiStatus.innerHTML = `📡 Fetching solved problems... <span class="checking-animation"></span>`;
        
        const [p1Solved, p2Solved] = await Promise.all([
            fetchUserSolvedProblems(player1Handle),
            fetchUserSolvedProblems(player2Handle)
        ]);
        
        p1SolvedProblems = p1Solved;
        p2SolvedProblems = p2Solved;
        
        await fetchUserRanks();
        updatePlayerUI();
        loggedInfo.innerHTML = `👤 ${p1} vs ${p2}`;
        apiStatus.innerHTML = `✅ Valid players! P1 solved: ${p1SolvedProblems.size}, P2 solved: ${p2SolvedProblems.size}`;
        saveState();
    });

    // Countdown
    function startCountdown() {
        return new Promise((resolve) => {
            isCountdownActive = true;
            let count = 10;
            countdownModal.style.display = 'flex';
            countdownNumber.textContent = count;
            
            countdownInterval = setInterval(() => {
                count--;
                countdownNumber.textContent = count;
                
                if (count === 0) {
                    clearInterval(countdownInterval);
                    countdownModal.style.display = 'none';
                    isCountdownActive = false;
                    resolve();
                }
            }, 1000);
        });
    }

    function cancelCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownModal.style.display = 'none';
            isCountdownActive = false;
        }
    }

    // Fetch problems (ensuring unsolved by both)
    async function fetchProblemsFromCF(targetRating) {
        try {
            apiStatus.innerHTML = `📡 Fetching unsolved problems... <span class="checking-animation"></span>`;
            
            const response = await fetch(`https://codeforces.com/api/problemset.problems?tags=implementation`);
            const data = await response.json();
            
            if (data.status !== 'OK') throw new Error('API error');
            
            const problems = data.result.problems;
            
            let filtered = problems.filter(p => 
                p.rating && 
                Math.abs(p.rating - targetRating) <= 100 &&
                p.contestId && 
                p.index
            );
            
            const unsolvedProblems = filtered.filter(p => {
                const probId = `${p.contestId}${p.index}`;
                return !p1SolvedProblems.has(probId) && !p2SolvedProblems.has(probId) && !usedProblemIds.has(probId);
            });
            
            if (unsolvedProblems.length === 0) {
                const widerFiltered = problems.filter(p => 
                    p.rating && 
                    p.rating >= 800 && 
                    p.rating <= 1600 &&
                    p.contestId && 
                    p.index
                );
                
                const widerUnsolved = widerFiltered.filter(p => {
                    const probId = `${p.contestId}${p.index}`;
                    return !p1SolvedProblems.has(probId) && !p2SolvedProblems.has(probId) && !usedProblemIds.has(probId);
                });
                
                if (widerUnsolved.length === 0) {
                    throw new Error('No unsolved problems found');
                }
                
                const randomIndex = Math.floor(Math.random() * widerUnsolved.length);
                const problem = widerUnsolved[randomIndex];
                const probId = `${problem.contestId}${problem.index}`;
                
                usedProblemIds.add(probId);
                
                return {
                    id: probId,
                    name: problem.name,
                    rating: problem.rating,
                    contestId: problem.contestId,
                    index: problem.index,
                    url: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`
                };
            }
            
            const randomIndex = Math.floor(Math.random() * unsolvedProblems.length);
            const problem = unsolvedProblems[randomIndex];
            const probId = `${problem.contestId}${problem.index}`;
            
            usedProblemIds.add(probId);
            
            return {
                id: probId,
                name: problem.name,
                rating: problem.rating,
                contestId: problem.contestId,
                index: problem.index,
                url: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`
            };
            
        } catch (error) {
            console.error('Error:', error);
            apiStatus.innerHTML = `⚠️ No unsolved problems found!`;
            
            for (let attempt = 0; attempt < 50; attempt++) {
                let fallbackRating = targetRating;
                let contestId = Math.floor(Math.random() * 2000) + 1000;
                let index = String.fromCharCode(65 + Math.floor(Math.random() * 6));
                let probId = `${contestId}${index}`;
                
                if (!p1SolvedProblems.has(probId) && !p2SolvedProblems.has(probId) && !usedProblemIds.has(probId)) {
                    usedProblemIds.add(probId);
                    return {
                        id: probId,
                        name: `Problem ${index} (CF ${contestId})`,
                        rating: fallbackRating,
                        contestId: contestId,
                        index: index,
                        url: `https://codeforces.com/problemset/problem/${contestId}/${index}`
                    };
                }
            }
            
            let contestId = 1000 + Math.floor(Math.random() * 1000);
            let index = 'A';
            let probId = `${contestId}${index}`;
            usedProblemIds.add(probId);
            return {
                id: probId,
                name: `Problem A (CF ${contestId})`,
                rating: targetRating,
                contestId: contestId,
                index: index,
                url: `https://codeforces.com/problemset/problem/${contestId}/A`
            };
        }
    }

    // Check submissions
    async function checkSubmissions() {
        if (!battleActive || breakActive || problemLocked || !currentProblem || currentProblemIndex > problems.length) return;

        try {
            const [p1Response, p2Response] = await Promise.all([
                fetch(`https://codeforces.com/api/user.status?handle=${player1Handle}&from=1&count=20`),
                fetch(`https://codeforces.com/api/user.status?handle=${player2Handle}&from=1&count=20`)
            ]);

            const p1Data = await p1Response.json();
            const p2Data = await p2Response.json();

            if (!problemResults.p1[currentProblemIndex - 1]) {
                problemResults.p1[currentProblemIndex - 1] = { attempts: 0, solved: false };
            }
            if (!problemResults.p2[currentProblemIndex - 1]) {
                problemResults.p2[currentProblemIndex - 1] = { attempts: 0, solved: false };
            }

            const p1Seen = new Set();
            const p2Seen = new Set();

            if (p1Data.status === 'OK') {
                for (let sub of p1Data.result) {
                    if (sub.problem && 
                        sub.problem.contestId === currentProblem.contestId && 
                        sub.problem.index === currentProblem.index) {
                        
                        const subId = sub.id;
                        if (!p1Seen.has(subId)) {
                            p1Seen.add(subId);
                            
                            if (!problemResults.p1[currentProblemIndex - 1].solved) {
                                problemResults.p1[currentProblemIndex - 1].attempts++;
                            }
                            
                            if (sub.verdict === 'OK' && !problemLocked) {
                                handleSolve('p1');
                                break;
                            }
                        }
                    }
                }
            }

            if (p2Data.status === 'OK' && !problemLocked) {
                for (let sub of p2Data.result) {
                    if (sub.problem && 
                        sub.problem.contestId === currentProblem.contestId && 
                        sub.problem.index === currentProblem.index) {
                        
                        const subId = sub.id;
                        if (!p2Seen.has(subId)) {
                            p2Seen.add(subId);
                            
                            if (!problemResults.p2[currentProblemIndex - 1].solved) {
                                problemResults.p2[currentProblemIndex - 1].attempts++;
                            }
                            
                            if (sub.verdict === 'OK' && !problemLocked) {
                                handleSolve('p2');
                                break;
                            }
                        }
                    }
                }
            }

            updatePlayerUI();
            saveState();
            
        } catch (error) {
            console.error('Error checking submissions:', error);
        }
    }

    function handleSolve(player) {
        if (problemLocked || !battleActive) return;
        
        problemLocked = true;
        const problemPoints = problems[currentProblemIndex - 1]?.points || 500;
        
        if (player === 'p1') {
            player1Score += problemPoints;
            problemResults.p1[currentProblemIndex - 1].solved = true;
            p1Row.classList.add('solved');
            if (currentProblem) {
                p1SolvedProblems.add(currentProblem.id);
            }
            showDesktopNotification(
                '✅ Problem Solved!',
                `${player1Handle} solved Problem ${currentProblemIndex}!`
            );
        } else {
            player2Score += problemPoints;
            problemResults.p2[currentProblemIndex - 1].solved = true;
            p2Row.classList.add('solved');
            if (currentProblem) {
                p2SolvedProblems.add(currentProblem.id);
            }
            showDesktopNotification(
                '✅ Problem Solved!',
                `${player2Handle} solved Problem ${currentProblemIndex}!`
            );
        }
        
        lockStatusDiv.textContent = `🔒 LOCKED · solved by ${player === 'p1' ? player1Handle : player2Handle}`;
        lockStatusDiv.classList.add('solved-flash');
        
        updatePlayerUI();
        saveState();
        
        if (currentProblemIndex >= problems.length) {
            stopBattle();
        } else {
            startBreak();
        }
    }

    async function loadNextProblem() {
        if (!battleActive || currentProblemIndex >= problems.length) {
            stopBattle();
            return;
        }

        p1Row.classList.remove('solved');
        p2Row.classList.remove('solved');
        
        const problemRating = problems[currentProblemIndex]?.rating || 1200;
        const prob = await fetchProblemsFromCF(problemRating);
        currentProblem = prob;
        currentProblemIndex++;
        
        const problemPoints = problems[currentProblemIndex - 1]?.points || 500;
        
        probNameSpan.textContent = prob.name;
        probPointsSpan.textContent = problemPoints;
        probRatingSpan.textContent = `Rating: ${prob.rating}`;
        
        problemUrl.href = prob.url;
        problemUrl.style.pointerEvents = 'auto';
        problemUrl.style.opacity = '1';
        problemUrl.textContent = `🔗 Open ${prob.name} on Codeforces`;
        
        lockStatusDiv.textContent = `🔓 Problem ${currentProblemIndex}/${problems.length} · waiting for AC`;
        lockStatusDiv.className = 'problem-lock-status';
        
        problemLocked = false;
        
        showDesktopNotification(
            '📋 New Problem',
            `Problem ${currentProblemIndex} loaded: ${prob.name}`
        );
        
        updatePlayerUI();
        saveState();
    }

    function startBreak() {
        breakActive = true;
        breakSecondsLeft = 60;
        breakStartTime = Date.now(); // Record when break started
        breakTimerDiv.style.display = 'block';
        breakTimerDiv.textContent = `⏳ break ${breakSecondsLeft}s`;
        breakIndicator.style.display = 'inline-block';
        breakIndicator.textContent = `Break ${breakSecondsLeft}s`;

        if (apiCheckInterval) {
            clearInterval(apiCheckInterval);
            apiCheckInterval = null;
        }

        // We don't need a break interval anymore - we'll update based on real time in the main timer
        
        updateMatchStatus();
        saveState();
    }

    function endBreak() {
        breakActive = false;
        breakStartTime = null;
        breakTimerDiv.style.display = 'none';
        breakIndicator.style.display = 'none';
        
        if (battleActive && currentProblemIndex < problems.length) {
            loadNextProblem().then(() => {
                apiCheckInterval = setInterval(checkSubmissions, checkIntervalSec * 1000);
            });
        }
        
        updateMatchStatus();
        saveState();
    }

    function startBattleTimer() {
        if (timerInterval) clearInterval(timerInterval);
        
        timerInterval = setInterval(() => {
            if (!battleActive) {
                clearInterval(timerInterval);
                return;
            }
            
            // Update main timer based on real elapsed time
            if (battleStartTime) {
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - battleStartTime) / 1000);
                const newTimeLeft = Math.max(0, battleDuration - elapsedSeconds);
                
                if (newTimeLeft !== timeLeftSec) {
                    timeLeftSec = newTimeLeft;
                    updateTimerDisplay();
                    saveState();
                    
                    if (timeLeftSec <= 0) {
                        stopBattle();
                    }
                }
            }
            
            // Update break timer based on real elapsed time
            if (breakActive && breakStartTime) {
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - breakStartTime) / 1000);
                const newBreakLeft = Math.max(0, 60 - elapsedSeconds);
                
                if (newBreakLeft !== breakSecondsLeft) {
                    breakSecondsLeft = newBreakLeft;
                    breakTimerDiv.textContent = `⏳ break ${breakSecondsLeft}s`;
                    breakIndicator.textContent = `Break ${breakSecondsLeft}s`;
                    saveState();
                    
                    if (breakSecondsLeft <= 0) {
                        endBreak();
                    }
                }
            }
        }, 1000);
    }

    async function stopBattle() {
        debugLog('Stopping battle');
        battleActive = false;
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        if (apiCheckInterval) {
            clearInterval(apiCheckInterval);
            apiCheckInterval = null;
        }
        
        breakActive = false;
        breakTimerDiv.style.display = 'none';
        breakIndicator.style.display = 'none';
        battleStartTime = null;
        breakStartTime = null;
        
        let winner = '';
        let winnerMessage = '';
        if (player1Score > player2Score) {
            winner = player1Handle;
            winnerMessage = `${player1Handle} WINS THE BATTLE!`;
        } else if (player2Score > player1Score) {
            winner = player2Handle;
            winnerMessage = `${player2Handle} WINS THE BATTLE!`;
        } else {
            winner = 'tie';
            winnerMessage = `It's a TIE!`;
        }
        
        const result = {
            blitzNumber: blitzNumber,
            date: new Date().toISOString(),
            player1: {
                handle: player1Handle,
                score: player1Score,
                rank: player1Rank
            },
            player2: {
                handle: player2Handle,
                score: player2Score,
                rank: player2Rank
            },
            winner: winner,
            problems: problems.map((p, idx) => ({
                points: p.points,
                rating: p.rating,
                p1Result: problemResults.p1[idx] || { attempts: 0, solved: false },
                p2Result: problemResults.p2[idx] || { attempts: 0, solved: false }
            })),
            duration: battleDuration / 60
        };
        
        await saveResultToServer(result);
        
        showDesktopNotification('🏆 Battle Finished!', winnerMessage, true);
        
        blitzNumber++;
        
        if (winner !== 'tie') {
            winnerHandleSpan.textContent = winner;
            celebrationModal.style.display = 'flex';
            
            for (let i = 0; i < 50; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.animationDelay = Math.random() * 2 + 's';
                confetti.style.background = ['gold', '#ff6b6b', '#4d9eff', '#ffd966'][Math.floor(Math.random() * 4)];
                celebrationModal.appendChild(confetti);
                setTimeout(() => confetti.remove(), 3000);
            }
        }
        
        resetToDefaultState();
        saveState();
    }

    // Start battle
    startBtn.addEventListener('click', async () => {
        if (!playersValidated) {
            alert('Please set and validate player handles first');
            return;
        }

        if (problems.length === 0) {
            alert('Please add at least one problem');
            return;
        }

        if (battleActive) {
            stopBattle();
        }

        await startCountdown();

        battleDuration = (parseInt(totalDurationInput.value) || 10) * 60;
        checkIntervalSec = parseInt(checkIntervalInput.value) || 3;
        timeLeftSec = battleDuration;
        battleStartTime = Date.now();
        
        player1Score = 0;
        player2Score = 0;
        currentProblemIndex = 0;
        problemResults = { p1: [], p2: [] };
        usedProblemIds.clear();
        
        battleActive = true;
        breakActive = false;
        
        startBtn.disabled = true;
        
        document.querySelectorAll('.config-dashboard input, .config-dashboard select, .config-dashboard button, #addProblemBtn, .remove-problem, #loginBtn').forEach(el => {
            if (el) el.disabled = true;
        });
        
        document.querySelectorAll('.problem-points-input, .problem-rating-select').forEach(input => {
            input.disabled = true;
        });
        
        if (apiCheckInterval) clearInterval(apiCheckInterval);
        
        breakTimerDiv.style.display = 'none';
        breakIndicator.style.display = 'none';
        matchStatusText.innerHTML = '<span class="status-live">🔴 LIVE</span>';
        matchStatusText.classList.remove('status-ended');
        
        updatePlayerUI();
        updateTimerDisplay();
        renderLeaderboard();
        startBattleTimer();
        
        await loadNextProblem();
        
        apiCheckInterval = setInterval(checkSubmissions, checkIntervalSec * 1000);
        
        saveState();
        debugLog(`Battle started with duration: ${battleDuration}s, start time: ${battleStartTime}`);
    });

    // Cancel game - FIXED: Now properly shows password modal
    cancelGameBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        debugLog('Cancel button clicked');
        
        if (!battleActive && !isCountdownActive) {
            alert('No active game to cancel');
            return;
        }
        
        passwordModal.style.display = 'flex';
        passwordInput.value = '';
        passwordInput.focus();
    });

    // Confirm cancel with password
    confirmCancel.addEventListener('click', function() {
        const enteredPassword = passwordInput.value;
        debugLog(`Password entered: ${enteredPassword}`);
        
        if (enteredPassword === CANCEL_PASSWORD) {
            debugLog('Correct password, cancelling game');
            passwordModal.style.display = 'none';
            
            if (isCountdownActive) {
                cancelCountdown();
            }
            
            if (battleActive) {
                stopBattle();
            }
            
            showDesktopNotification('⛔ Game Cancelled', 'Game cancelled by administrator', true);
            
            resetToDefaultState();
            
            saveState();
        } else {
            debugLog('Incorrect password');
            alert('Incorrect password!');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    // Cancel password modal
    cancelPassword.addEventListener('click', function() {
        passwordModal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === passwordModal) {
            passwordModal.style.display = 'none';
        }
    });

    closeCelebrationBtn.addEventListener('click', () => {
        celebrationModal.style.display = 'none';
    });

    reconnectBtn.addEventListener('click', () => {
        loadSavedState();
        reconnectBtn.style.display = 'none';
    });

    // Initialize
    async function init() {
        debugLog('Initializing application');
        await requestNotificationPermission();
        loadSavedState();
        updatePlayerUI();
        updateTimerDisplay();
        renderLeaderboard();
        
        if (battleActive) {
            startBattleTimer();
            if (apiCheckInterval) clearInterval(apiCheckInterval);
            apiCheckInterval = setInterval(checkSubmissions, checkIntervalSec * 1000);
        }
    }

    init();
})();
