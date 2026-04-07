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

   lastTubeCount: 0, // Optimizasyon için eklendi

    init: function() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => { this.lastTubeCount = 0; this.resize(); });
    },

   // renderer.js içindeki resize ve draw fonksiyonlarını güncelle:

resize: function() {
    const dpr = window.devicePixelRatio || 1;
    const winW = window.innerWidth;
    
    // document.documentElement.clientHeight yerine window.innerHeight kullanıyoruz
    const winH = window.innerHeight; 

    this.canvas.style.width = winW + 'px';
    this.canvas.style.height = winH + 'px';
    
    this.canvas.width = winW * dpr;
    this.canvas.height = winH * dpr;
    
    this.ctx.scale(dpr, dpr);
    this.lastTubeCount = 0; 
},

draw: function(gameState, time) {
    const winW = window.innerWidth;
    const winH = window.innerHeight; // Burada da güncelledik

    this.ctx.clearRect(0, 0, winW, winH);


        // Çifte karartmayı önlemek için vignette sildik, sadece soluk arka plan (Performans artışı)
        this.ctx.fillStyle = "rgba(15, 25, 35, 0.7)"; 
        this.ctx.fillRect(0, 0, winW, winH);

        const tubes = gameState.tubes;
        this.activePourState = null;

       // --- AKILLI YERLEŞİM (MAX ALAN) VE OPTİMİZASYON ---
        if (this.lastTubeCount !== tubes.length) {
            this.tubeCoords = []; 
            
            const N = tubes.length;
            const maxCapacity = Math.max(...tubes.map(t => t.capacity));
            const maxTubeHeight = maxCapacity * this.baseBlockHeight;
            
            const isMobile = winW < 600;
            
            // 1. GÜVENLİ ALANLAR (Menülerin arkasında kalmayı kesin engeller)
            const topSafeZone = isMobile ? 85 : 80;    
            const bottomSafeZone = isMobile ? 110 : 100; 
            
            const availableHeight = winH - (topSafeZone + bottomSafeZone); 
            const availableWidth = isMobile ? (winW * 0.96) : (winW * 0.92); 

            // 2. DİNAMİK BOŞLUKLAR (Şişeler büyüsün diye aralarındaki ölü alanı yok ediyoruz!)
            const dynamicGapX = isMobile ? (N > 8 ? 8 : 20) : this.tubeGapX;
            const dynamicGapY = isMobile ? (N > 8 ? 15 : 40) : this.tubeGapY;
            
            let bestCols = 3;
            let bestScale = 0;
            
            // Algoritma 4, 5 veya 6 sütun ihtimallerini dener, hangisi şişeleri daha BÜYÜK yaparsa onu seçer
            const maxColLimit = isMobile ? 6 : 8; 
            const minColLimit = Math.min(isMobile ? 3 : 4, N);

            for (let c = minColLimit; c <= maxColLimit; c++) {
                if (c > N) break;
                
                let r = Math.ceil(N / c); 
                let gridW = c * this.baseTubeWidth + (c - 1) * dynamicGapX;
                let gridH = r * maxTubeHeight + (r - 1) * dynamicGapY;
                
                let scaleW = availableWidth / gridW;
                let scaleH = availableHeight / gridH;
                let currentScale = Math.min(scaleW, scaleH);
                
                if (currentScale > bestScale) {
                    bestScale = currentScale;
                    bestCols = c;
                }
            }

            this.maxTubesPerRow = bestCols;
            const totalRows = Math.ceil(N / this.maxTubesPerRow);
            const totalGapY = (totalRows - 1) * dynamicGapY;
            
            // 3. BÜYÜME SINIRINI ÖZGÜR BIRAK (Eski koddaki 1.15 kısıtlaması kaldırıldı)
            const scale = isMobile ? Math.min(1.85, bestScale) : Math.min(1.3, bestScale);

            this.tubeWidth = this.baseTubeWidth * scale;
            this.blockHeight = this.baseBlockHeight * scale;
            this.currentTubeGapX = dynamicGapX * scale;
            this.currentTubeGapY = dynamicGapY * scale;

            const actualTotalGridHeight = totalRows * (maxTubeHeight * scale) + (totalGapY * scale);
            
            // 4. KUSURSUZ ORTALAMA (Dikeyde kalan boşluğu bulup tam ortaya hizalar)
            const extraSpaceY = Math.max(0, availableHeight - actualTotalGridHeight);
            const gridStartY = topSafeZone + (extraSpaceY / 2);

            for (let i = 0; i < tubes.length; i++) {
                const currentRow = Math.floor(i / this.maxTubesPerRow);
                const currentCol = i % this.maxTubesPerRow;
                let numTubesInRow = this.maxTubesPerRow;
                if (currentRow === totalRows - 1 && tubes.length % this.maxTubesPerRow !== 0) {
                    numTubesInRow = tubes.length % this.maxTubesPerRow;
                }

                const rowWidth = (numTubesInRow * this.tubeWidth) + ((numTubesInRow - 1) * this.currentTubeGapX);
                const rowStartX = (winW - rowWidth) / 2;
                let actualTubeHeight = tubes[i].capacity * this.blockHeight;
                let x = rowStartX + currentCol * (this.tubeWidth + this.currentTubeGapX);
                
                // Şişeler artık gridStartY'yi baz alarak tam ortaya yerleşiyor
                let y = gridStartY + currentRow * ((maxTubeHeight * scale) + this.currentTubeGapY) + ((maxTubeHeight * scale) - actualTubeHeight);
                
                this.tubeCoords[i] = { x, y, width: this.tubeWidth, height: actualTubeHeight };
            }
            this.lastTubeCount = tubes.length;
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

           // YENİ: Başlangıç (Spawn) Animasyonu (Şişeler aşağıdan zıplayarak gelir)
            let spawnElapsed = Date.now() - (gameState.levelStartTime || 0);
            if (spawnElapsed < 800) {
                let easeOut = 1 - Math.pow(1 - (spawnElapsed / 800), 3); 
                y += (window.innerHeight - y) * (1 - easeOut); 
            }

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
        if (gameState.winPhase === 1) {
            this.drawConfetti(time); 
            this.drawWinMessage(time); // YENİ: Tam ortaya mesaj ve çember çizer
        }
    },

    drawTube: function(x, y, tubeData, actualTubeHeight, angle, time, gameState, tubeIndex, isFlying) {
        // Tıpa animasyonu için zamanlayıcı
        const sealAnimTime = gameState.winPhase === 1 ? Date.now() - gameState.winStartTime : 0;

        this.ctx.save();
        
        // Dönme Merkezi
        this.ctx.translate(x + this.tubeWidth/2, y);
        if (angle !== 0) this.ctx.rotate(angle);
        this.ctx.translate(-(x + this.tubeWidth/2), -y);

        // --- SEÇİM PARLAMASI ---
        if (gameState.selectedTube === tubeIndex && !isFlying) {
            this.ctx.shadowColor = "#f1c40f";
            this.ctx.shadowBlur = 25;
        } else {
            this.ctx.shadowBlur = 0;
        }

        // --- ŞİŞE DIŞ ÇERÇEVESİ VE CLIPPING ---
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.quadraticCurveTo(x, y + actualTubeHeight, x + this.tubeWidth/2, y + actualTubeHeight);
        this.ctx.quadraticCurveTo(x + this.tubeWidth, y + actualTubeHeight, x + this.tubeWidth, y + actualTubeHeight - this.tubeWidth/2);
        this.ctx.lineTo(x + this.tubeWidth, y);
        
        this.ctx.save();
        this.ctx.clip(); // Taşan sıvıları gizlemek için

        const blocksArray = tubeData.blocks;
        let relativeProg = 0;
        if (gameState.pouringData) {
            let p = gameState.pouringData.progress;
            if (p >= 0.15 && p <= 0.85) relativeProg = (p - 0.15) / 0.70;
            else if (p > 0.85) relativeProg = 1;
        }

        // --- KAYNAK ŞİŞENİN BOŞALMASI ---
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
        
        // --- HEDEF ŞİŞENİN DOLMASI (Silinmiş Olan Eksik Kısım Geri Geldi!) ---
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
        
        this.ctx.restore(); // Clipping bitti
        
        // Şişe Camını Çiz (Kenarlıklar)
        this.ctx.shadowBlur = 0;
        this.ctx.stroke(); 

        // --- YENİ: GERÇEKÇİ CAM YANSIMASI (3D ETKİ) ---
        // 1. Sol Parlama (Işığın Vurduğu İnce Çizgi)
        let glassShine = this.ctx.createLinearGradient(x, y, x + this.tubeWidth/2, y);
        glassShine.addColorStop(0, "rgba(255, 255, 255, 0.6)"); // Kenar çok parlak
        glassShine.addColorStop(0.3, "rgba(255, 255, 255, 0.1)");
        glassShine.addColorStop(1, "rgba(255, 255, 255, 0)");
        
        this.ctx.fillStyle = glassShine;
        this.ctx.beginPath();
        // Şişenin iç kavislerine uyumlu yansıma
        this.ctx.rect(x + 2, y + 2, this.tubeWidth * 0.35, actualTubeHeight - 5);
        this.ctx.fill();
        
        // 2. Sağ Koyu Gölge (Camın Kalınlığını ve Hacmini Verir)
        let glassShadow = this.ctx.createLinearGradient(x + this.tubeWidth*0.7, y, x + this.tubeWidth, y);
        glassShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
        glassShadow.addColorStop(1, "rgba(0, 0, 0, 0.4)");
        
        this.ctx.fillStyle = glassShadow;
        this.ctx.beginPath();
        this.ctx.rect(x + this.tubeWidth * 0.65, y + 2, this.tubeWidth * 0.33, actualTubeHeight - 5);
        this.ctx.fill();

        // --- YENİ KRİSTAL TIPA VE ANİMASYONU ---
        let isSealed = false;
        if (blocksArray.length > 0 && blocksArray.length === tubeData.capacity) {
            const tubeColor = blocksArray[0].color;
            const allSame = blocksArray.every(b => b.color === tubeColor && !b.hidden);
            
            const colorTotal = gameState.tubes.reduce((acc, curr) => 
                acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);

            if (allSame && colorTotal === tubeData.capacity) {
                isSealed = true;
            }
        }
        
        if (isSealed && angle === 0 && !isFlying) {
            this.ctx.save();
            
            let stopperY = y;
            let stopperAlpha = 1;

            // Yukarıdan Süzülme Animasyonu
            if (gameState.winPhase === 1) {
                const delay = tubeIndex * 150; 
                const duration = 600; 
                const adjustedTime = Math.max(0, sealAnimTime - delay);
                
                if (adjustedTime < duration) {
                    let progress = adjustedTime / duration;
                    progress = 1 - Math.pow(1 - progress, 3);
                    const dropDistance = 60; 
                    stopperY = (y - dropDistance) + (dropDistance * progress);
                    stopperAlpha = progress; 
                }
            }
            
            this.ctx.globalAlpha = stopperAlpha;
            const stopperWidth = this.tubeWidth * 1.1;
            const stopperHeight = 25;
            const sX = x - (stopperWidth - this.tubeWidth) / 2;
            const sY = stopperY - stopperHeight / 1.5;

            // Taban (İçe giren gri kısım)
            this.ctx.fillStyle = "#bdc3c7"; 
            this.ctx.beginPath();
            this.ctx.roundRect(x + 5, sY + 5, this.tubeWidth - 10, stopperHeight, 5);
            this.ctx.fill();

            // Kristal Parlak Üst Kısım
            const crystalGradient = this.ctx.createLinearGradient(sX, sY, sX + stopperWidth, sY + stopperHeight);
            const tubeColor = blocksArray[0].color;
            crystalGradient.addColorStop(0, this.hexToRgba(tubeColor, 0.6));
            crystalGradient.addColorStop(0.5, this.hexToRgba(tubeColor, 1));
            crystalGradient.addColorStop(1, this.hexToRgba(tubeColor, 0.8));

            this.ctx.fillStyle = crystalGradient;
            this.ctx.shadowColor = tubeColor; 
            this.ctx.shadowBlur = 15;
            
            this.ctx.beginPath();
            this.ctx.moveTo(sX + stopperWidth * 0.2, sY);
            this.ctx.lineTo(sX + stopperWidth * 0.8, sY);
            this.ctx.lineTo(sX + stopperWidth, sY + stopperHeight * 0.6);
            this.ctx.lineTo(sX + stopperWidth * 0.5, sY + stopperHeight);
            this.ctx.lineTo(sX, sY + stopperHeight * 0.6);
            this.ctx.closePath();
            this.ctx.fill();

            // Kristal Yansıması
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            this.ctx.beginPath();
            this.ctx.moveTo(sX + stopperWidth * 0.3, sY + 5);
            this.ctx.lineTo(sX + stopperWidth * 0.5, sY + 5);
            this.ctx.lineTo(sX + stopperWidth * 0.4, sY + stopperHeight * 0.4);
            this.ctx.fill();

            this.ctx.restore();
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
        
        // --- YENİ: 3 BOYUTLU SİLİNDİR SIVI EFEKTİ ---
        let gradient = this.ctx.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, this.hexToRgba(color, 0.3));   // Sol gölge (Koyu)
        gradient.addColorStop(0.2, this.hexToRgba(color, 1.0)); // Sol parlama (Işık vuruyor)
        gradient.addColorStop(0.7, this.hexToRgba(color, 0.85));// Orta ana renk
        gradient.addColorStop(1, this.hexToRgba(color, 0.2));   // Sağ gölge (Hacim verir)
        
        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Sıvı Katmanlarını Ayıran Çizgi (Koyulaştırıldı)
        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.stroke();

        // Büyülü Baloncuklar
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        let bubbleCount = Math.floor(width / 15);
        for (let b = 0; b < bubbleCount; b++) {
            let bY = y + height - ((time * 0.05 + b * 20 + index * 50) % height);
            let bX = x + 5 + ((time * 0.01 + b * 10) % (width - 10));
            this.ctx.beginPath();
            this.ctx.arc(bX, bY, 1.5 + (b % 2), 0, Math.PI * 2);
            this.ctx.fill();
        }
    },

   // --- YENİ: DAMLACIKLI, YOĞUN SÜT GİBİ AKIŞ EFEKTİ ---
    drawPouringAnimation: function(data, gameState, time) {
        const toCoord = this.tubeCoords[data.to];
        
        let activeX = this.activePourState.x;
        let activeY = this.activePourState.y;
        let angle = this.activePourState.angle;
        
        let isMovingLeft = (data.to < data.from);

        let pourX = activeX + this.tubeWidth / 2;
        let pourY = activeY;

        if (isMovingLeft) {
             pourX -= (this.tubeWidth/2) * Math.cos(angle);
             pourY -= (this.tubeWidth/2) * Math.sin(Math.abs(angle));
        } else {
             pourX += (this.tubeWidth/2) * Math.cos(angle);
             pourY -= (this.tubeWidth/2) * Math.sin(Math.abs(angle));
        }
        
        const targetX = toCoord.x + toCoord.width / 2;
        const targetY = toCoord.y;

        this.ctx.beginPath();
        let fluidColor = this.hexToRgba(data.color, 0.9);
        let highlightColor = this.hexToRgba("#ffffff", 0.5); 

        let streamGradient = this.ctx.createLinearGradient(pourX, pourY, targetX, targetY);
        streamGradient.addColorStop(0, fluidColor);
        streamGradient.addColorStop(0.2, highlightColor); 
        streamGradient.addColorStop(0.5, fluidColor);
        streamGradient.addColorStop(0.8, highlightColor); 
        streamGradient.addColorStop(1, fluidColor);

        this.ctx.lineWidth = Math.max(8, this.tubeWidth / 5); 
        this.ctx.strokeStyle = streamGradient;
        this.ctx.lineCap = 'round';
        this.ctx.moveTo(pourX, pourY);
        this.ctx.quadraticCurveTo((pourX + targetX) / 2, pourY + 10, targetX, targetY); 
        this.ctx.stroke();
        
        this.ctx.lineWidth = Math.max(2, this.tubeWidth / 20); 
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.stroke();

        // Havada Süzülen Damlacıklar
        if (time % 3 < 1) { 
            this.particles.push({
                x: pourX + (Math.random() - 0.5) * 5, 
                y: pourY, 
                targetX: targetX + (Math.random() - 0.5) * 10, 
                targetY: targetY, 
                color: data.color, 
                life: 1,
                size: Math.random() * 3 + 1, 
                vx: (Math.random() - 0.5) * 2, 
                vy: Math.random() * 2 
            });
        }

        // Hedefe Çarpma Sıçraması
        if (time % 2 < 1) { 
            this.splashParticles.push({
                x: targetX + (Math.random() - 0.5) * 20, 
                y: targetY + 5, 
                vx: (Math.random() - 0.5) * 10, 
                vy: -Math.random() * 12 - 4,    
                color: data.color,
                life: 1,
                size: Math.random() * 4 + 1 
            });
        }
    },

   drawParticles: function(time) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.life -= 0.05; 
            let t = 1 - p.life;
            let controlY = p.y; 
            p.currentX = (1-t)**2 * p.x + 2*t*(1-t) * ((p.x+p.targetX)/2) + t**2 * p.targetX;
            p.currentY = (1-t)**2 * p.y + 2*t*(1-t) * controlY + t**2 * p.targetY;

            if (p.vx) p.currentX += p.vx * (1 - p.life); 
            if (p.vy) p.currentY += p.vy * (1 - p.life); 
            p.vy += 0.1; 

            if (p.life > 0) {
                this.ctx.beginPath();
                this.ctx.arc(p.currentX, p.currentY, p.size || 2, 0, Math.PI * 2);
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
    }, // <--- İŞTE BU VİRGÜL ÇOK ÖNEMLİ. BUNU EKLİYORUZ.

    // --- YENİ: MERKEZİ RİTÜEL ÇEMBERİ VE BÜYÜ TAMAMLANDI MESAJI ---
    drawWinMessage: function(time) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        
        const centerX = winW / 2;
        const centerY = winH / 2;
        
        const circleRadius = Math.min(150, winW * 0.35); 
        const fontSize = Math.min(45, winW * 0.08);

        this.ctx.save();

        // 1. Dönen Ritüel Çemberi (Arka Plan)
        this.ctx.translate(centerX, centerY);
        this.ctx.save();
        this.ctx.rotate(time * 0.001); // Yavaşça döner
        
        // Dış Rün Çemberi (Kesik çizgili)
        this.ctx.beginPath();
        this.ctx.arc(0, 0, circleRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(241, 196, 15, 0.4)"; // Parlak sarı
        this.ctx.lineWidth = 6;
        this.ctx.setLineDash([15, 15]); 
        this.ctx.stroke();

        // İç Büyü Çemberi (Ters yöne döner)
        this.ctx.rotate(-time * 0.002);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, circleRadius * 0.8, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(230, 126, 34, 0.3)"; // Turuncu
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 10]);
        this.ctx.stroke();
        
        this.ctx.restore();

        // 2. "BÜYÜ TAMAMLANDI" Metni (Ön Plan)
        const scale = 1 + Math.sin(time * 0.005) * 0.05;
        this.ctx.scale(scale, scale);

        this.ctx.shadowColor = "#f1c40f";
        this.ctx.shadowBlur = 25;

        this.ctx.font = `bold ${fontSize}px 'Courier New', sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        
        let textGradient = this.ctx.createLinearGradient(-100, -20, 100, 20);
        textGradient.addColorStop(0, "#f39c12");
        textGradient.addColorStop(0.5, "#fff");
        textGradient.addColorStop(1, "#f39c12");

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        this.ctx.strokeText("BÜYÜ TAMAMLANDI", 0, 0);

        this.ctx.fillStyle = textGradient;
        this.ctx.fillText("BÜYÜ TAMAMLANDI", 0, 0);

        this.ctx.restore();
    }
}; // <--- Renderer objesini kapatan en sondaki süslü parantez