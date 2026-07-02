// Cat.io - Agar.io Clone Mini Game

(function() {
    const agarioBtn = document.getElementById('play-agario-btn');
    const agarioOverlay = document.getElementById('agario-overlay');
    const agarioStage = document.getElementById('agario-stage');
    const agarioCloseBtn = document.getElementById('agario-close-btn');
    const canvas = document.getElementById('agario-canvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('agario-score');
    
    const gameoverScreen = document.getElementById('agario-gameover');
    const finalScoreDisplay = document.getElementById('agario-final-score');
    const respawnBtn = document.getElementById('agario-respawn-btn');

    let animationId = null;
    let isPlaying = false;
    let lastTime = 0;
    let viewW = 360;
    let viewH = 640;
    let canvasDpr = 1;

    // Constants
    const WORLD_SIZE = 4000;
    const INIT_MASS = 10;
    const BOT_COUNT = 40;
    const FOOD_COUNT = 500;
    
    // Images
    const catImages = [];
    const baseCats = ['cat_1.png', 'cat_2.png', 'cat_3.png', 'cat_4.png', 'cat_5.png', 'cat_6.png', 'cat_7.png', 'cat_8.png', 'cat_9.png', 'cat_10.png', 'cat_11.png', 'skin_bard.png', 'skin_vampire.png', 'skin_zombie.png', 'skin_rapper.png', 'skin_oldman.png'];
    for(let name of baseCats) {
        const img = new Image();
        img.src = `assets/sprites/${name}`;
        catImages.push(img);
    }
    
    // Function to get image based on mass (levels 1-11)
    function getCatImageForMass(mass) {
        // Level up every 20 mass units roughly
        let index = Math.floor(mass / 20);
        if (index > catImages.length - 1) index = catImages.length - 1;
        return catImages[index];
    }

    let camera = { x: WORLD_SIZE/2, y: WORLD_SIZE/2, zoom: 1 };
    let player = createEntity(WORLD_SIZE/2, WORLD_SIZE/2, INIT_MASS, true);
    
    let bots = [];
    let foods = [];
    
    let mouseX = 0, mouseY = 0;

    function getRadius(mass) {
        return Math.sqrt(mass * 100 / Math.PI);
    }

    function createEntity(x, y, mass, isPlayer) {
        return {
            x: x, y: y,
            mass: mass,
            radius: getRadius(mass),
            targetX: x, targetY: y,
            isPlayer: isPlayer,
            aiTimer: 0
        };
    }

    function initGame() {
        player = createEntity(WORLD_SIZE/2, WORLD_SIZE/2, INIT_MASS, true);
        bots = [];
        foods = [];
        
        for(let i=0; i<BOT_COUNT; i++) {
            bots.push(createEntity(
                Math.random() * WORLD_SIZE, 
                Math.random() * WORLD_SIZE, 
                Math.random() * 50 + 5, // Random mass 5-55
                false
            ));
        }
        
        for(let i=0; i<FOOD_COUNT; i++) {
            foods.push({
                x: Math.random() * WORLD_SIZE,
                y: Math.random() * WORLD_SIZE,
                color: `hsl(${Math.random() * 360}, 100%, 70%)`
            });
        }
        
        gameoverScreen.classList.remove('visible');
        const rewardEl = document.getElementById('agario-reward-text');
        if (rewardEl) rewardEl.textContent = '';
        isPlaying = true;
        lastTime = performance.now();
        resize();
        animate(lastTime);
    }

    function resize() {
        if (!agarioStage) return;
        const w = Math.max(1, agarioStage.clientWidth);
        const h = Math.max(1, agarioStage.clientHeight);
        viewW = w;
        viewH = h;
        canvasDpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * canvasDpr);
        canvas.height = Math.round(h * canvasDpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    }

    if (agarioStage && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (agarioOverlay.classList.contains('active')) resize();
        });
        ro.observe(agarioStage);
    }
    window.addEventListener('resize', () => {
        if (agarioOverlay.classList.contains('active')) resize();
    });

    function pointerToCanvas(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function onPointerMove(e) {
        if(!isPlaying || !player) return;
        let clientX = e.clientX;
        let clientY = e.clientY;
        if(e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        const p = pointerToCanvas(clientX, clientY);
        mouseX = p.x;
        mouseY = p.y;
    }
    
    if (agarioStage) {
        agarioStage.addEventListener('mousemove', onPointerMove);
        agarioStage.addEventListener('touchmove', onPointerMove, { passive: true });
    }

    function updateEntityRadius(entity) {
        entity.radius = getRadius(entity.mass);
    }

    function moveEntity(entity, dt) {
        let speed = 600 / Math.pow(entity.radius, 0.4); // Faster base speed
        let dx = entity.targetX - entity.x;
        let dy = entity.targetY - entity.y;
        let dist = Math.hypot(dx, dy);
        
        if (dist > 5) {
            let vx = (dx / dist) * speed;
            let vy = (dy / dist) * speed;
            entity.x += vx * dt;
            entity.y += vy * dt;
        }
        
        // Bounds
        entity.x = Math.max(entity.radius, Math.min(WORLD_SIZE - entity.radius, entity.x));
        entity.y = Math.max(entity.radius, Math.min(WORLD_SIZE - entity.radius, entity.y));
    }

    function updateAI(bot, dt) {
        bot.aiTimer -= dt;
        if (bot.aiTimer <= 0) {
            bot.aiTimer = Math.random() * 0.2 + 0.05; // Update target fast (0.05-0.25s)
            
            let nearestBigger = null;
            let minDistBigger = Infinity;
            
            let nearestSmaller = null;
            let minDistSmaller = Infinity;
            
            // Check player
            if (player) {
                let d = Math.hypot(player.x - bot.x, player.y - bot.y);
                if (player.mass > bot.mass * 1.1 && d < minDistBigger) { nearestBigger = player; minDistBigger = d; }
                else if (bot.mass > player.mass * 1.1 && d < minDistSmaller) { nearestSmaller = player; minDistSmaller = d; }
            }
            
            // Check bots
            for (let other of bots) {
                if (other === bot) continue;
                let d = Math.hypot(other.x - bot.x, other.y - bot.y);
                if (other.mass > bot.mass * 1.1 && d < minDistBigger) { nearestBigger = other; minDistBigger = d; }
                else if (bot.mass > other.mass * 1.1 && d < minDistSmaller) { nearestSmaller = other; minDistSmaller = d; }
            }
            
            if (nearestBigger && minDistBigger < 400) {
                // Run away
                bot.targetX = bot.x - (nearestBigger.x - bot.x);
                bot.targetY = bot.y - (nearestBigger.y - bot.y);
            } else if (nearestSmaller && minDistSmaller < 500) {
                // Chase
                bot.targetX = nearestSmaller.x;
                bot.targetY = nearestSmaller.y;
            } else {
                // Find food
                let nearestFood = null;
                let minFoodD = Infinity;
                for (let f of foods) {
                    let d = Math.hypot(f.x - bot.x, f.y - bot.y);
                    if (d < minFoodD && d < 400) { nearestFood = f; minFoodD = d; }
                }
                if (nearestFood) {
                    bot.targetX = nearestFood.x;
                    bot.targetY = nearestFood.y;
                } else {
                    // Wander
                    bot.targetX = bot.x + (Math.random() - 0.5) * 500;
                    bot.targetY = bot.y + (Math.random() - 0.5) * 500;
                }
            }
        }
    }

    function checkCollisions() {
        let allEntities = [player, ...bots].filter(e => e !== null);
        
        // Entity vs Food
        for (let e of allEntities) {
            for (let i = foods.length - 1; i >= 0; i--) {
                let f = foods[i];
                let dist = Math.hypot(e.x - f.x, e.y - f.y);
                if (dist < e.radius) {
                    // Eaten food
                    e.mass += 0.5;
                    updateEntityRadius(e);
                    
                    // Replace food
                    foods[i] = {
                        x: Math.random() * WORLD_SIZE,
                        y: Math.random() * WORLD_SIZE,
                        color: `hsl(${Math.random() * 360}, 100%, 70%)`
                    };
                }
            }
        }
        
        // Entity vs Entity
        for (let i = 0; i < allEntities.length; i++) {
            for (let j = i + 1; j < allEntities.length; j++) {
                let e1 = allEntities[i];
                let e2 = allEntities[j];
                
                let dist = Math.hypot(e1.x - e2.x, e1.y - e2.y);
                let overlapDist = (e1.radius + e2.radius) * 0.95; // 5% overlap triggers eating
                
                if (e1.mass > e2.mass * 1.1 && dist < overlapDist) {
                    eat(e1, e2);
                } else if (e2.mass > e1.mass * 1.1 && dist < overlapDist) {
                    eat(e2, e1);
                }
            }
        }
    }

    function eat(predator, prey) {
        predator.mass += prey.mass;
        updateEntityRadius(predator);
        
        if (prey === player) {
            player = null;
            die();
        } else {
            let idx = bots.indexOf(prey);
            if(idx > -1) {
                bots.splice(idx, 1);
                // Spawn a new bot far away
                bots.push(createEntity(
                    Math.random() * WORLD_SIZE, 
                    Math.random() * WORLD_SIZE, 
                    Math.random() * 30 + 5, 
                    false
                ));
            }
        }
    }

    function die() {
        isPlaying = false;
        const finalMass = parseInt(scoreDisplay.innerText, 10) || 0;
        finalScoreDisplay.innerText = finalMass;
        const reward = Math.floor(finalMass / 30);
        const rewardEl = document.getElementById('agario-reward-text');
        if (reward > 0 && window.GameState) {
            GameState.addFishCoins(reward);
            if (rewardEl) rewardEl.textContent = `+${reward} 🐟 added to your balance!`;
        } else if (rewardEl) {
            rewardEl.textContent = '';
        }
        gameoverScreen.classList.add('visible');
    }

    function drawGrid() {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 2 / camera.zoom;
        const step = 50;
        
        let startX = Math.floor((camera.x - (viewW/2)/camera.zoom) / step) * step;
        let endX = startX + viewW/camera.zoom + step;

        let startY = Math.floor((camera.y - (viewH/2)/camera.zoom) / step) * step;
        let endY = startY + viewH/camera.zoom + step;
        
        ctx.beginPath();
        for (let x = startX; x < endX; x += step) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y < endY; y += step) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    function drawEntity(entity) {
        ctx.save();
        ctx.translate(entity.x, entity.y);
        
        ctx.beginPath();
        // Clip exactly to radius
        ctx.arc(0, 0, entity.radius, 0, Math.PI * 2);
        ctx.closePath();
        
        // Draw shadow
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;
        
        // Clip to circle and draw image
        ctx.clip();
        
        let img = getCatImageForMass(entity.mass);
        if (img && img.complete) {
            // Scale image up by 15% to push the white border outside the clipping circle
            let drawRadius = entity.radius * 1.15;
            ctx.drawImage(img, -drawRadius, -drawRadius, drawRadius * 2, drawRadius * 2);
        } else {
            ctx.fillStyle = '#ff9ebb';
            ctx.fill();
        }
        
        // Draw Mass Tag
        let fontSize = Math.max(10, entity.radius * 0.35);
        ctx.font = `900 ${fontSize}px "Outfit", sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = fontSize * 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let yOffset = entity.radius * 0.65; 
        ctx.strokeText(Math.floor(entity.mass), 0, yOffset);
        ctx.fillText(Math.floor(entity.mass), 0, yOffset);
        
        // Removed white stroke to fix "halo" effect
        
        ctx.restore();
    }

    function animate(time) {
        if(!agarioOverlay.classList.contains('active')) {
            isPlaying = false;
            return;
        }
        animationId = requestAnimationFrame(animate);
        
        let dt = (time - lastTime) / 1000;
        if(dt > 0.1) dt = 0.1; // clamp dt
        lastTime = time;

        if (isPlaying && player) {
            // Update player target
            player.targetX = camera.x + (mouseX - viewW/2) / camera.zoom;
            player.targetY = camera.y + (mouseY - viewH/2) / camera.zoom;
            
            moveEntity(player, dt);
            
            // Camera follows player smoothly
            camera.x += (player.x - camera.x) * 5 * dt;
            camera.y += (player.y - camera.y) * 5 * dt;
            
            // Camera zoom adjusts to radius
            let targetZoom = 30 / player.radius;
            targetZoom = Math.max(0.3, Math.min(1.5, targetZoom));
            camera.zoom += (targetZoom - camera.zoom) * 2 * dt;
            
            scoreDisplay.innerText = Math.floor(player.mass);
        }

        if (isPlaying) {
            for (let bot of bots) {
                updateAI(bot, dt);
                moveEntity(bot, dt);
            }
            checkCollisions();
        }

        // --- RENDER ---
        ctx.fillStyle = '#141724';
        ctx.fillRect(0, 0, viewW, viewH);
        
        ctx.save();
        ctx.translate(viewW / 2, viewH / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw Map Border
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

        drawGrid();

        // Draw Food
        for (let f of foods) {
            ctx.beginPath();
            ctx.arc(f.x, f.y, 4, 0, Math.PI*2);
            ctx.fillStyle = f.color;
            ctx.fill();
        }

        // Draw Bots
        for (let bot of bots) {
            drawEntity(bot);
        }

        // Draw Player
        if (player) {
            drawEntity(player);
            
            // Draw player name tag
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${16}px "Fredoka One", sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText("YOU", player.x, player.y - player.radius - 10);
        }

        ctx.restore();
    }

    function openAgario() {
        const minigamesOverlay = document.getElementById('minigames-overlay');
        if (minigamesOverlay) minigamesOverlay.classList.remove('active');
        agarioOverlay.classList.add('active');
        initGame();
    }

    function closeAgario() {
        agarioOverlay.classList.remove('active');
        isPlaying = false;
        lastTime = 0;
        if (animationId) cancelAnimationFrame(animationId);
    }

    if(agarioBtn) {
        agarioBtn.addEventListener('click', openAgario);
    }

    if (agarioCloseBtn) {
        agarioCloseBtn.addEventListener('click', closeAgario);
    }
    
    if (respawnBtn) {
        respawnBtn.addEventListener('click', () => {
            initGame();
        });
    }

})();
