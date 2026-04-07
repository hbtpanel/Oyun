const Renderer = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    
    maxTubesPerRow: 5,
    baseTubeWidth: 60,
    baseBlockHeight: 50, 
    tubeGapX: 30,
    tubeGapY: 70,
    maxPourAngle: Math.PI / 2.5, // Daha dik bir dökülme açısı
    
    particles: [],
    splashParticles: [], 
    confettiParticles: [], 
    tubeCoords: [], 
    
    // YENİ: Animasyon sırasında uçan şişenin anlık koordinatları
    activePourState: null, 

    init: function() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },

    resize: function() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    // Matematiksel Yumuşatma (Lerp) - Şişenin uçuşunu pürüzsüz yapar
    lerp: function(start, end, t) {
        return start * (1 - t) + end * t;
    },

    draw: function(gameState, time) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const tubes = gameState.tubes;
        this.tubeCoords = []; 
        this.activePourState = null;

        // --- ADIM 1: TÜM KOORDİNATLARI ÖNCEDEN HESAPLA ---
        const totalRows = Math.ceil(tubes.length / this.maxTubesPerRow);
        const maxCapacity = Math.max(...tubes.map(t => t.capacity));
        const maxTubeHeight = maxCapacity * this.baseBlockHeight;

        const totalGapY = (totalRows - 1) * this.tubeGapY;
        const totalGridHeight = totalRows * maxTubeHeight + totalGapY;
        const desiredHeight = this.canvas.height * 0.8; 
        
        const scale = Math.min(1, desiredHeight / totalGridHeight);
        this.tubeWidth = this.baseTubeWidth * scale;
        this.blockHeight = this.baseBlockHeight * scale;
        this.currentTubeGapX = this.tubeGapX * scale;
        this.currentTubeGapY = this.tubeGapY * scale;

        const gridStartY = (this.canvas.height - (totalRows * maxTubeHeight * scale + totalGapY * scale)) / 2;

        for (let i = 0; i < tubes.length; i++) {
            const currentRow = Math.floor(i / this.maxTubesPerRow);
            const currentCol = i % this.maxTubesPerRow;
            
            let numTubesInRow = this.maxTubesPerRow;
            if (currentRow === totalRows - 1 && tubes.length % this.maxTubesPerRow !== 0) {
                numTubesInRow = tubes.length % this.maxTubesPerRow;
            }

            const rowWidth = (numTubesInRow * this.tubeWidth) + ((numTubesInRow - 1) * this.currentTubeGapX);
            const rowStartX = (this.canvas.width - rowWidth) / 2;

            let actualTubeHeight = tubes[i].capacity * this.blockHeight;
            let x = rowStartX + currentCol * (this.tubeWidth + this.currentTubeGapX);
            let y = gridStartY + currentRow * ((maxTubeHeight * scale) + this.currentTubeGapY) + ((maxTubeHeight * scale) - actualTubeHeight);
            
            this.tubeCoords[i] = { x, y, width: this.tubeWidth, height: actualTubeHeight };
        }

        // --- ADIM 2: SABİT ŞİŞELERİ ÇİZ (Arka Plan) ---
        for (let i = 0; i < tubes.length; i++) {
            // Animasyondaki (uçan) şişeyi en sona bırakıyoruz ki diğerlerinin üstünde görünsün
            if (gameState.pouringData && gameState.pouringData.from === i) continue;

            let baseCoord = this.tubeCoords[i];
            let x = baseCoord.x;
            let y = baseCoord.y;
            
            let yOffset = 0;
            if (gameState.winPhase === 1) {
                let wave = Math.sin((time - gameState.winStartTime) * 0.005 - i * 0.5);
                yOffset = Math.max(0, wave * 40) * -1; 
            } else {
                yOffset = Math.sin(time * 0.002 + i) * 3; // Nefes Alma
            }
            y += yOffset;

            if (gameState.selectedTube === i && !gameState.pouringData) y -= 25; 

            this.drawTube(x, y, tubes[i], baseCoord.height, 0, time, gameState, i, false);
        }

        // --- ADIM 3: UÇAN / DÖKÜLEN ŞİŞEYİ ÇİZ (Ön Plan) ---
        if (gameState.pouringData) {
            let i = gameState.pouringData.from;
            let baseCoord = this.tubeCoords[i];
            let targetCoord = this.tubeCoords[gameState.pouringData.to];
            let p = gameState.pouringData.progress;

            // Uçuş ve Pozisyon Mantığı (Şişe hedefin hemen üstüne uçar)
            let isMovingLeft = baseCoord.x > targetCoord.x; 
            let finalAngle = isMovingLeft ? -this.maxPourAngle : this.maxPourAngle;
            
            // Hedefin çapraz üst noktası
            let destX = targetCoord.x + (isMovingLeft ? targetCoord.width * 0.7 : -targetCoord.width * 0.7);
            let destY = targetCoord.y - baseCoord.height * 0.3; // Hedefin biraz yukarısı

            let currentX, currentY, currentAngle;

            // 3 Aşamalı Animasyon (Uçuş -> Dökme -> Dönüş)
            if (p < 0.15) {
                let phaseP = p / 0.15; 
                currentX = this.lerp(baseCoord.x, destX, phaseP);
                currentY = this.lerp(baseCoord.y, destY, phaseP);
                currentAngle = this.lerp(0, finalAngle, phaseP);
            } else if (p <= 0.85) {
                currentX = destX;
                currentY = destY;
                currentAngle = finalAngle;
            } else {
                let phaseP = (p - 0.85) / 0.15; 
                currentX = this.lerp(destX, baseCoord.x, phaseP);
                currentY = this.lerp(destY, baseCoord.y, phaseP);
                currentAngle = this.lerp(finalAngle, 0, phaseP);
            }

            // Çizim fonksiyonunun kullanması için anlık durumu kaydet
            this.activePourState = { x: currentX, y: currentY, angle: currentAngle };

            this.drawTube(currentX, currentY, tubes[i], baseCoord.height, currentAngle, time, gameState, i, true);
        }

        // --- ADIM 4: AKIŞ EFEKTİ VE PARTİKÜLLER ---
        if (gameState.pouringData) {
            let p = gameState.pouringData.progress;
            // Sadece şişe hedefe ulaştığında (Dökme aşamasında) sıvıyı akıt
            if (p >= 0.15 && p <= 0.85) {
                this.drawPouringAnimation(gameState.pouringData, gameState, time);
            }
        }
        
        this.drawParticles(time);
        if (gameState.winPhase === 1) this.drawConfetti(time); 
    },

    drawTube: function(x, y, tubeData, actualTubeHeight, angle, time, gameState, tubeIndex, isFlying) {
        this.ctx.save();
        
        // Dönme Merkezini Şişenin Üst Ağzı Olarak Ayarla
        this.ctx.translate(x + this.tubeWidth/2, y);
        if (angle !== 0) this.ctx.rotate(angle);
        this.ctx.translate(-(x + this.tubeWidth/2), -y);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.quadraticCurveTo(x, y + actualTubeHeight, x + this.tubeWidth/2, y + actualTubeHeight);
        this.ctx.quadraticCurveTo(x + this.tubeWidth, y + actualTubeHeight, x + this.tubeWidth, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.lineTo(x + this.tubeWidth, y);
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(x + 2, y);
        this.ctx.lineTo(x + 2, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.quadraticCurveTo(x + 2, y + actualTubeHeight - 2, x + this.tubeWidth/2, y + actualTubeHeight - 2);
        this.ctx.quadraticCurveTo(x + this.tubeWidth - 2, y + actualTubeHeight - 2, x + this.tubeWidth - 2, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.lineTo(x + this.tubeWidth - 2, y);
        this.ctx.closePath();
        this.ctx.clip(); 

        const blocksArray = tubeData.blocks;

        // --- YENİ: SIVI BOŞALMA/DOLMA ZAMANLAMASI ---
        // Sıvılar uçuş sırasında değil, sadece dökülme aşamasında (0.15 - 0.85) değişir
        let relativeProg = 0;
        if (gameState.pouringData) {
            let p = gameState.pouringData.progress;
            if (p >= 0.15 && p <= 0.85) relativeProg = (p - 0.15) / 0.70;
            else if (p > 0.85) relativeProg = 1;
        }

        // Kaynak (Uçan) şişenin boşalması
        for (let j = 0; j < blocksArray.length; j++) {
            let blockObj = blocksArray[j];
            let actualBlockH = this.blockHeight;
            
            if (gameState.pouringData && gameState.pouringData.from === tubeIndex) {
                const totalDraining = gameState.pouringData.blockCount;
                if (j >= blocksArray.length - totalDraining) {
                    const blockNum = (totalDraining - 1) - (j - (blocksArray.length - totalDraining));
                    const startTime = blockNum / totalDraining;
                    const endTime = (blockNum + 1) / totalDraining;
                    const blockProg = Math.max(0, Math.min(1, (relativeProg - startTime) / (endTime - startTime)));
                    actualBlockH = this.blockHeight * (1 - blockProg);
                }
            }

            let liquidY = y + actualTubeHeight - (j) * this.blockHeight - actualBlockH;
            let renderColor = blockObj.hidden ? '#2c3e50' : blockObj.color;
            this.drawFluid(x, liquidY, this.tubeWidth, actualBlockH, renderColor, time, j, blocksArray.length);

            if (blockObj.hidden && actualBlockH > 10) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this.ctx.font = `bold ${actualBlockH*0.6}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('?', x + this.tubeWidth/2, liquidY + actualBlockH/2);
            }
        }
        
        // Hedef şişenin dolması
        if (gameState.pouringData && gameState.pouringData.to === tubeIndex) {
             const totalFilling = gameState.pouringData.blockCount;
             const baseLength = blocksArray.length; 

             if (relativeProg > 0.05) { 
                 for (let k = 0; k < totalFilling; k++) {
                     let j = baseLength + k; 
                     if (j < tubeData.capacity) { 
                        const startTime = k / totalFilling;
                        const endTime = (k + 1) / totalFilling;
                        const blockProg = Math.max(0, Math.min(1, (relativeProg - startTime) / (endTime - startTime)));
                        let actualBlockH = this.blockHeight * blockProg;
                        let liquidY = y + actualTubeHeight - (j) * this.blockHeight - actualBlockH;
                        this.drawFluid(x, liquidY, this.tubeWidth, actualBlockH, gameState.pouringData.color, time, j, baseLength+totalFilling);
                     }
                 }
             }
        }
        
        this.ctx.restore(); 

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        this.ctx.fillRect(x + 5, y + 5, this.tubeWidth - 10, actualTubeHeight - 10);
        
       // GÜNCEL Tıpa Efekti: Sadece renk tamamen bu şişeye hapsolduysa tıpa tak
        let isSealed = false;
        if (blocksArray.length > 0 && blocksArray.length === tubeData.capacity) {
            const tubeColor = blocksArray[0].color;
            const allSame = blocksArray.every(b => b.color === tubeColor && !b.hidden);
            
            // Tüm oyundaki bu renkteki blokları say
            const colorTotal = gameState.tubes.reduce((acc, curr) => 
                acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);

            if (allSame && colorTotal === tubeData.capacity) {
                isSealed = true;
            }
        }
        
        if (isSealed && angle === 0 && !isFlying) {
            this.ctx.fillStyle = "#8b5a2b"; 
            this.ctx.fillRect(x + this.tubeWidth*0.2, y - 8, this.tubeWidth*0.6, 12);
            this.ctx.fillRect(x + this.tubeWidth*0.15, y - 12, this.tubeWidth*0.7, 4);
            
            this.ctx.shadowColor = "#f1c40f";
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = "#f1c40f";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x + this.tubeWidth*0.3, y - 6);
            this.ctx.lineTo(x + this.tubeWidth*0.7, y - 6);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0; 
        }

        this.ctx.restore(); 
    },

    drawFluid: function(x, y, width, height, color, time, index, totalBlocks) {
        if (height <= 0) return;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        
        if (index === totalBlocks - 1 && height > width/10) {
            for (let i = 0; i <= width; i += 2) {
                let waveHeight = Math.sin((time * 0.003) + (i * 0.08)) * 1.5; 
                this.ctx.lineTo(x + i, y + waveHeight);
            }
        } else {
            this.ctx.lineTo(x + width, y);
        }
        this.ctx.lineTo(x + width, y + height + 2); 
        this.ctx.lineTo(x, y + height + 2);
        this.ctx.closePath();
        
        let gradient = this.ctx.createRadialGradient(x + width/2, y + height/2, height/4, x + width/2, y + height/2, width/2);
        gradient.addColorStop(0, this.hexToRgba(color, 1));
        gradient.addColorStop(1, this.hexToRgba(color, 0.8)); 
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    },

    // --- YENİ: GERÇEKÇİ KISA AKIŞ (Hortum Görüntüsü İptal) ---
    drawPouringAnimation: function(data, gameState, time) {
        const toCoord = this.tubeCoords[data.to];
        
        // Aktif (uçan) şişenin tam o anki dudak (lip) koordinatlarını hesapla
        let activeX = this.activePourState.x;
        let activeY = this.activePourState.y;
        let angle = this.activePourState.angle;
        
        let isMovingLeft = (data.to < data.from);

        // Eğik şişenin alt dudağı nereden dökülür?
        let pourX = activeX + this.tubeWidth / 2;
        let pourY = activeY;

        if (isMovingLeft) {
             pourX -= (this.tubeWidth/2) * Math.cos(angle);
             pourY -= (this.tubeWidth/2) * Math.sin(Math.abs(angle));
        } else {
             pourX += (this.tubeWidth/2) * Math.cos(angle);
             pourY -= (this.tubeWidth/2) * Math.sin(Math.abs(angle));
        }
        
        // Hedef şişenin ağzı
        const targetX = toCoord.x + toCoord.width / 2;
        const targetY = toCoord.y;

        // Artık şişe hedefin tam üzerinde olduğu için bu çizgi kısacık ve gerçekçi olacak!
        this.ctx.beginPath();
        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = Math.max(5, this.tubeWidth / 7); 
        this.ctx.lineCap = 'round';
        this.ctx.moveTo(pourX, pourY);
        // Kontrol noktasını düşürerek suyun dik düşmesini sağladık
        this.ctx.quadraticCurveTo((pourX + targetX) / 2, pourY, targetX, targetY);
        this.ctx.stroke();
        
        this.ctx.lineWidth = Math.max(2, this.tubeWidth / 20); 
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        this.ctx.stroke();

        if (time % 8 < 3) { 
            this.particles.push({
                x: pourX, y: pourY, targetX: targetX, targetY: targetY, color: data.color, life: 1
            });
        }

        // Hedefe Çarpma Sıçraması (Splash Effect)
        if (time % 4 < 2) {
            this.splashParticles.push({
                x: targetX + (Math.random() - 0.5) * 15, 
                y: targetY + 5, 
                vx: (Math.random() - 0.5) * 6, 
                vy: -Math.random() * 8 - 2,    
                color: data.color,
                life: 1
            });
        }
    },

    drawParticles: function(time) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.life -= 0.05; 
            let t = 1 - p.life;
            let controlY = p.y; // Dik düşüş için kontrol noktası düzenlendi
            p.currentX = (1-t)**2 * p.x + 2*t*(1-t) * ((p.x+p.targetX)/2) + t**2 * p.targetX;
            p.currentY = (1-t)**2 * p.y + 2*t*(1-t) * controlY + t**2 * p.targetY;

            if (p.life > 0) {
                this.ctx.beginPath();
                this.ctx.arc(p.currentX, p.currentY, 2, 0, Math.PI * 2);
                this.ctx.fillStyle = this.hexToRgba(p.color, p.life);
                this.ctx.fill();
            } else { this.particles.splice(i, 1); }
        }

        for (let i = this.splashParticles.length - 1; i >= 0; i--) {
            let sp = this.splashParticles[i];
            sp.x += sp.vx;
            sp.y += sp.vy;
            sp.vy += 0.5; 
            sp.life -= 0.05;

            if (sp.life > 0) {
                this.ctx.beginPath();
                this.ctx.arc(sp.x, sp.y, Math.random() * 2 + 1, 0, Math.PI * 2);
                this.ctx.fillStyle = this.hexToRgba(sp.color, sp.life);
                this.ctx.fill();
            } else { this.splashParticles.splice(i, 1); }
        }
    },

    drawConfetti: function(time) {
        if (time % 2 === 0) {
            this.tubeCoords.forEach(coord => {
                this.confettiParticles.push({
                    x: coord.x + coord.width/2 + (Math.random()-0.5)*20,
                    y: coord.y,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -Math.random() * 15 - 5,
                    color: ['#f1c40f', '#e67e22', '#e74c3c', '#ffffff'][Math.floor(Math.random()*4)],
                    life: 2
                });
            });
        }

        for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
            let c = this.confettiParticles[i];
            c.x += c.vx;
            c.y += c.vy;
            c.vy += 0.2; 
            c.life -= 0.02;

            if (c.life > 0) {
                this.ctx.fillStyle = this.hexToRgba(c.color, c.life);
                this.ctx.fillRect(c.x, c.y, 6, 6); 
            } else { this.confettiParticles.splice(i, 1); }
        }
    },

    hexToRgba: function(hex, alpha) {
        if (!hex) return "rgba(255,255,255,1)";
        var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }
};