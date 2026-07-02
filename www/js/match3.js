// Minigames Menu & Match-3 Engine

(function() {
    // --- Minigames Menu Logic ---
    const minigamesBtn = document.getElementById('minigames-btn');
    const minigamesOverlay = document.getElementById('minigames-overlay');
    const minigamesCloseBtn = document.getElementById('minigames-close-btn');

    if(minigamesBtn) {
        minigamesBtn.addEventListener('click', () => {
            minigamesOverlay.classList.add('active');
        });
    }
    if(minigamesCloseBtn) {
        minigamesCloseBtn.addEventListener('click', () => {
            minigamesOverlay.classList.remove('active');
        });
    }

    // --- Match-3 Logic ---
    const playMatch3Btn = document.getElementById('play-match3-btn');
    const match3Overlay = document.getElementById('match3-overlay');
    const match3Stage = document.getElementById('match3-stage');
    const match3CloseBtn = document.getElementById('match3-close-btn');
    const canvas = document.getElementById('match3-canvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('match3-score');

    let animationId = null;
    let isPlaying = false;
    let score = 0;
    let viewW = 360;
    let viewH = 640;
    let canvasDpr = 1;

    // Grid config
    const COLS = 8;
    const ROWS = 8;
    const TYPES = 6;
    let tileSize = 0;
    let gridOffsetX = 0;
    let gridOffsetY = 0;

    let grid = [];
    let selectedTile = null;
    let isAnimating = false;

    // Juice State
    let comboCounter = 0;
    let shakeIntensity = 0;
    let particles = [];
    let floatingTexts = [];

    // Load Images
    const catImages = [];
    for(let i=1; i<=TYPES; i++) {
        const img = new Image();
        img.src = `assets/sprites/cat_${i}.png`;
        catImages.push(img);
    }

    function initGame() {
        score = 0;
        scoreDisplay.innerText = score;
        selectedTile = null;
        isAnimating = false;
        comboCounter = 0;
        shakeIntensity = 0;
        particles = [];
        floatingTexts = [];
        resize();
        
        // Fill grid without matches
        grid = [];
        for(let c=0; c<COLS; c++) {
            grid[c] = [];
            for(let r=0; r<ROWS; r++) {
                let type;
                do {
                    type = Math.floor(Math.random() * TYPES);
                } while (
                    (c >= 2 && grid[c-1][r] && grid[c-2][r] && grid[c-1][r].type === type && grid[c-2][r].type === type) ||
                    (r >= 2 && grid[c][r-1] && grid[c][r-2] && grid[c][r-1].type === type && grid[c][r-2].type === type)
                );
                
                grid[c][r] = {
                    type: type,
                    c: c,
                    r: r,
                    x: c * tileSize,
                    y: r * tileSize - tileSize,
                    scale: 1,
                    alpha: 1,
                    isMatched: false
                };
            }
        }
        
        isPlaying = true;
        animate();
    }

    function resize() {
        if (!match3Stage) return;
        viewW = Math.max(1, match3Stage.clientWidth);
        viewH = Math.max(1, match3Stage.clientHeight);
        canvasDpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewW * canvasDpr);
        canvas.height = Math.round(viewH * canvasDpr);
        canvas.style.width = viewW + 'px';
        canvas.style.height = viewH + 'px';
        ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);

        const maxGridW = viewW * 0.92;
        const maxGridH = viewH * 0.88;
        tileSize = Math.floor(Math.min(maxGridW / COLS, maxGridH / ROWS));
        gridOffsetX = (viewW - (tileSize * COLS)) / 2;
        gridOffsetY = (viewH - (tileSize * ROWS)) / 2;
        
        if(grid && grid.length > 0) {
            for(let c=0; c<COLS; c++) {
                for(let r=0; r<ROWS; r++) {
                    if(grid[c][r]) {
                        grid[c][r].x = c * tileSize;
                        grid[c][r].y = r * tileSize;
                    }
                }
            }
        }
    }

    if (match3Stage && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (match3Overlay.classList.contains('active')) resize();
        });
        ro.observe(match3Stage);
    }
    window.addEventListener('resize', () => {
        if (match3Overlay.classList.contains('active')) resize();
    });

    function pointerToCanvas(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function getTileAt(x, y) {
        let c = Math.floor((x - gridOffsetX) / tileSize);
        let r = Math.floor((y - gridOffsetY) / tileSize);
        if(c >= 0 && c < COLS && r >= 0 && r < ROWS) {
            return {c, r};
        }
        return null;
    }

    function onPointerDown(e) {
        if(!isPlaying || isAnimating) return;
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        if(e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        let p = pointerToCanvas(clientX, clientY);
        let pos = getTileAt(p.x, p.y);
        if(!pos || !grid[pos.c][pos.r]) return;

        if(!selectedTile) {
            selectedTile = pos;
        } else {
            // Check if adjacent
            let dc = Math.abs(selectedTile.c - pos.c);
            let dr = Math.abs(selectedTile.r - pos.r);
            
            if((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) {
                // Swap
                swapTiles(selectedTile, pos);
                selectedTile = null;
            } else {
                // Select new
                selectedTile = pos;
            }
        }
    }

    if (match3Stage) {
        match3Stage.addEventListener('mousedown', onPointerDown);
        match3Stage.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onPointerDown(e);
        }, { passive: false });
    }

    async function swapTiles(pos1, pos2) {
        isAnimating = true;
        comboCounter = 0;
        
        let t1 = grid[pos1.c][pos1.r];
        let t2 = grid[pos2.c][pos2.r];
        
        // Logical swap
        grid[pos1.c][pos1.r] = t2;
        grid[pos2.c][pos2.r] = t1;
        t1.c = pos2.c; t1.r = pos2.r;
        t2.c = pos1.c; t2.r = pos1.r;
        
        await waitAnim(150);
        
        let matches = findMatches();
        if(matches.length > 0) {
            handleMatches(matches);
        } else {
            // Swap back
            grid[pos1.c][pos1.r] = t1;
            grid[pos2.c][pos2.r] = t2;
            t1.c = pos1.c; t1.r = pos1.r;
            t2.c = pos2.c; t2.r = pos2.r;
            await waitAnim(150);
            isAnimating = false;
        }
    }

    function findMatches() {
        let matches = [];
        
        // Horizontal
        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS-2; c++) {
                let type = grid[c][r] ? grid[c][r].type : -1;
                if(type === -1) continue;
                if(grid[c+1][r] && grid[c+1][r].type === type && grid[c+2][r] && grid[c+2][r].type === type) {
                    matches.push({c:c, r:r});
                    matches.push({c:c+1, r:r});
                    matches.push({c:c+2, r:r});
                }
            }
        }
        
        // Vertical
        for(let c=0; c<COLS; c++) {
            for(let r=0; r<ROWS-2; r++) {
                let type = grid[c][r] ? grid[c][r].type : -1;
                if(type === -1) continue;
                if(grid[c][r+1] && grid[c][r+1].type === type && grid[c][r+2] && grid[c][r+2].type === type) {
                    matches.push({c:c, r:r});
                    matches.push({c:c, r:r+1});
                    matches.push({c:c, r:r+2});
                }
            }
        }
        
        // Unique
        let unique = [];
        let map = new Set();
        for(let m of matches) {
            let key = `${m.c},${m.r}`;
            if(!map.has(key)) {
                map.add(key);
                unique.push(grid[m.c][m.r]);
            }
        }
        return unique;
    }

    async function handleMatches(matches) {
        comboCounter++;
        let matchSize = matches.length;
        
        // Pop animation and score
        score += matchSize * 10 * comboCounter;
        scoreDisplay.innerText = score;
        
        // Juice: screen shake based on combo and match size
        shakeIntensity = Math.min(25, 5 + comboCounter * 3 + (matchSize > 3 ? 5 : 0));
        
        let centerC = 0, centerR = 0;
        
        for(let t of matches) {
            t.isMatched = true;
            centerC += t.c;
            centerR += t.r;
            
            // Spawn particles
            for(let i=0; i<8; i++) {
                particles.push({
                    x: gridOffsetX + t.c * tileSize + tileSize/2,
                    y: gridOffsetY + t.r * tileSize + tileSize/2,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 10,
                    life: 1.0,
                    color: ['#ff9ebb', '#ffd166', '#06d6a0', '#118ab2', '#ef476f'][Math.floor(Math.random()*5)]
                });
            }
        }
        
        // Juice: Floating texts
        centerC /= matchSize;
        centerR /= matchSize;
        let textX = gridOffsetX + centerC * tileSize + tileSize/2;
        let textY = gridOffsetY + centerR * tileSize;
        
        if (comboCounter > 1) {
            floatingTexts.push({ text: `COMBO x${comboCounter}!`, x: textX, y: textY, life: 1.0, color: '#ffd166', size: 30 });
        } else if (matchSize >= 5) {
            floatingTexts.push({ text: "WOW!", x: textX, y: textY, life: 1.0, color: '#ef476f', size: 36 });
        } else if (matchSize >= 4) {
            floatingTexts.push({ text: "GREAT!", x: textX, y: textY, life: 1.0, color: '#06d6a0', size: 28 });
        }
        
        await waitAnim(200); // Wait for scale to 0
        
        // Remove from grid
        for(let c=0; c<COLS; c++) {
            for(let r=0; r<ROWS; r++) {
                if(grid[c][r] && grid[c][r].isMatched) {
                    grid[c][r] = null;
                }
            }
        }
        
        // Fall down
        for(let c=0; c<COLS; c++) {
            let emptySpaces = 0;
            for(let r=ROWS-1; r>=0; r--) {
                if(grid[c][r] === null) {
                    emptySpaces++;
                } else if(emptySpaces > 0) {
                    grid[c][r+emptySpaces] = grid[c][r];
                    grid[c][r+emptySpaces].r = r+emptySpaces;
                    grid[c][r] = null;
                }
            }
            
            // Spawn new
            for(let r=0; r<emptySpaces; r++) {
                grid[c][r] = {
                    type: Math.floor(Math.random() * TYPES),
                    c: c,
                    r: r,
                    x: c * tileSize,
                    y: -tileSize * (emptySpaces - r), // Start above
                    scale: 1,
                    alpha: 1,
                    isMatched: false
                };
            }
        }
        
        await waitAnim(250); // Wait for fall
        
        let newMatches = findMatches();
        if(newMatches.length > 0) {
            handleMatches(newMatches);
        } else {
            isAnimating = false;
        }
    }

    function waitAnim(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function drawGrid() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(gridOffsetX, gridOffsetY, COLS * tileSize, ROWS * tileSize);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=COLS; i++) {
            ctx.moveTo(gridOffsetX + i * tileSize, gridOffsetY);
            ctx.lineTo(gridOffsetX + i * tileSize, gridOffsetY + ROWS * tileSize);
        }
        for(let i=0; i<=ROWS; i++) {
            ctx.moveTo(gridOffsetX, gridOffsetY + i * tileSize);
            ctx.lineTo(gridOffsetX + COLS * tileSize, gridOffsetY + i * tileSize);
        }
        ctx.stroke();
    }

    function drawTile(tile) {
        if(!tile) return;
        
        ctx.save();
        ctx.translate(gridOffsetX + tile.x + tileSize/2, gridOffsetY + tile.y + tileSize/2);
        ctx.scale(tile.scale, tile.scale);
        
        if (selectedTile && selectedTile.c === tile.c && selectedTile.r === tile.r) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 10;
            ctx.scale(1.1, 1.1);
        }

        ctx.beginPath();
        let r = tileSize/2 * 0.9;
        ctx.arc(0, 0, r, 0, Math.PI*2);
        ctx.clip();
        
        let img = catImages[tile.type];
        if(img && img.complete) {
            // Scale by 1.15 to hide white border like in agario
            let dr = r * 1.15;
            ctx.drawImage(img, -dr, -dr, dr*2, dr*2);
        } else {
            ctx.fillStyle = '#ff9ebb';
            ctx.fillRect(-r, -r, r*2, r*2);
        }
        
        ctx.restore();
    }

    function animate() {
        if(!match3Overlay.classList.contains('active')) {
            isPlaying = false;
            return;
        }
        animationId = requestAnimationFrame(animate);
        
        // Update juice
        if(shakeIntensity > 0) shakeIntensity *= 0.85;
        if(shakeIntensity < 0.5) shakeIntensity = 0;
        
        for(let i=particles.length-1; i>=0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.03;
            if(p.life <= 0) particles.splice(i, 1);
        }
        
        for(let i=floatingTexts.length-1; i>=0; i--) {
            let t = floatingTexts[i];
            t.y -= 2;
            t.life -= 0.02;
            if(t.life <= 0) floatingTexts.splice(i, 1);
        }
        
        // Update positions & scales
        for(let c=0; c<COLS; c++) {
            for(let r=0; r<ROWS; r++) {
                let tile = grid[c][r];
                if(tile) {
                    let targetX = tile.c * tileSize;
                    let targetY = tile.r * tileSize;
                    tile.x += (targetX - tile.x) * 0.2;
                    tile.y += (targetY - tile.y) * 0.2;
                    
                    if(tile.isMatched) {
                        tile.scale += (0 - tile.scale) * 0.2;
                    } else {
                        tile.scale += (1 - tile.scale) * 0.2;
                    }
                }
            }
        }
        
        ctx.clearRect(0, 0, viewW, viewH);
        
        ctx.fillStyle = '#141724';
        ctx.fillRect(0, 0, viewW, viewH);
        
        ctx.save();
        if(shakeIntensity > 0) {
            let sx = (Math.random() - 0.5) * shakeIntensity;
            let sy = (Math.random() - 0.5) * shakeIntensity;
            ctx.translate(sx, sy);
        }
        
        drawGrid();
        
        for(let c=0; c<COLS; c++) {
            for(let r=0; r<ROWS; r++) {
                drawTile(grid[c][r]);
            }
        }
        ctx.restore();
        
        // Draw particles
        for(let p of particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, tileSize * 0.1, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        
        // Draw floating text
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        for(let t of floatingTexts) {
            ctx.globalAlpha = t.life;
            ctx.fillStyle = t.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 5;
            ctx.font = `900 ${t.size}px "Outfit", sans-serif`;
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1.0;
    }

    function openMatch3() {
        if (minigamesOverlay) minigamesOverlay.classList.remove('active');
        match3Overlay.classList.add('active');
        initGame();
    }

    function closeMatch3() {
        const reward = Math.floor(score / 50);
        if (reward > 0 && window.GameState) {
            GameState.addFishCoins(reward);
        }
        match3Overlay.classList.remove('active');
        isPlaying = false;
        if (animationId) cancelAnimationFrame(animationId);
    }

    if(playMatch3Btn) {
        playMatch3Btn.addEventListener('click', openMatch3);
    }

    if(match3CloseBtn) {
        match3CloseBtn.addEventListener('click', closeMatch3);
    }

})();
