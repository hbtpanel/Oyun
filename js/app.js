const GameApp = {
    state: {
        level: 1, points: 0, movesLeft: 0,
        tubes: [], selectedTube: null, isAnimating: false,
        pouringData: null, ritualUsedInLevel: false,
        winPhase: 0, winStartTime: 0 // YENİ: Zafer Animasyonu Kontrolcüleri
    },

    init: function() {
        this.loadGame();
        Renderer.init();
        this.setupEvents();
        this.startNewLevel(this.state.level);
        requestAnimationFrame((time) => this.loop(time));
    },

    startNewLevel: function(levelNumber) {
        const levelData = LevelGenerator.generate(levelNumber);
        this.state.tubes = levelData.tubesData;
        this.state.movesLeft = levelData.movesLimit;
        this.state.ritualUsedInLevel = false; 
        this.updateUI();
    },

    loop: function(time) {
        Renderer.draw(this.state, time);
        requestAnimationFrame((time) => this.loop(time));
    },

    handleInteraction: function(x, y) {
        // Animasyon sürerken veya zafer kutlamasındayken dokunmaları engelle
        if (this.state.isAnimating || this.state.winPhase > 0) return;

        const rect = Renderer.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;

        let clickedTube = -1;
        for (let i = 0; i < this.state.tubes.length; i++) {
            const coord = Renderer.tubeCoords[i];
            if (!coord) continue; 
            if (canvasX >= coord.x && canvasX <= coord.x + coord.width &&
                canvasY >= coord.y - 40 && canvasY <= coord.y + coord.height + 10) {
                clickedTube = i;
                break;
            }
        }

        if (clickedTube !== -1) {
           // GÜNCEL: Mühürlü şişe kontrolü
            let t = this.state.tubes[clickedTube];
            let isSealed = false;
            if (t.blocks.length > 0 && t.blocks.length === t.capacity) {
                const tubeColor = t.blocks[0].color;
                const allSame = t.blocks.every(b => b.color === tubeColor && !b.hidden);
                
                // Kritik: Bu renkten dışarıda (diğer şişelerde) hala var mı?
                const colorTotalInGame = this.state.tubes.reduce((acc, curr) => 
                    acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);
                
                if (allSame && colorTotalInGame === t.capacity) {
                    isSealed = true;
                }
            }
            
            if (this.state.selectedTube === null) {
                if (t.blocks.length > 0 && !isSealed) {
                    this.state.selectedTube = clickedTube;
                    AudioManager.play('click');
                }
            } else {
                if (this.state.selectedTube === clickedTube) {
                    this.state.selectedTube = null; 
                    AudioManager.play('click');
                } else if (!isSealed && this.canPour(this.state.selectedTube, clickedTube)) {
                    this.executePour(this.state.selectedTube, clickedTube);
                } else {
                    this.state.selectedTube = null; 
                }
            }
        } else {
            if (this.state.selectedTube !== null) this.state.selectedTube = null;
        }
    },

    canPour: function(fromIndex, toIndex) {
        const fromTube = this.state.tubes[fromIndex];
        const toTube = this.state.tubes[toIndex];

        if (fromTube.blocks.length === 0) return false;
        if (toTube.blocks.length >= toTube.capacity) return false; 
        
        const fromTop = fromTube.blocks[fromTube.blocks.length - 1];
        if (fromTop.hidden) return false; 

        if (toTube.blocks.length === 0) return true; 
        
        const toTop = toTube.blocks[toTube.blocks.length - 1];
        return fromTop.color === toTop.color;
    },

    executePour: async function(fromIndex, toIndex) {
        this.state.isAnimating = true;
        
        const fromTube = this.state.tubes[fromIndex];
        const colorToMoveObj = fromTube.blocks[fromTube.blocks.length - 1];

        let sameColorBlockCount = 0;
        for (let i = fromTube.blocks.length - 1; i >= 0; i--) {
            if (!fromTube.blocks[i].hidden && fromTube.blocks[i].color === colorToMoveObj.color) {
                sameColorBlockCount++;
            } else { break; }
        }

        const targetTube = this.state.tubes[toIndex];
        const availableSpace = targetTube.capacity - targetTube.blocks.length;
        const actualBlockPourCount = Math.min(sameColorBlockCount, availableSpace);
        
        this.state.pouringData = {
            from: fromIndex, to: toIndex, color: colorToMoveObj.color,
            progress: 0, blockCount: actualBlockPourCount 
        };

        AudioManager.play('pour');

        const baseDuration = 1000;
        const extraDurationPerBlock = 500;
        const totalPourDuration = baseDuration + (actualBlockPourCount - 1) * extraDurationPerBlock; 
        
        await new Promise(resolve => {
            let startTime = Date.now();
            const animatePour = () => {
                let elapsed = Date.now() - startTime;
                this.state.pouringData.progress = Math.min(elapsed / totalPourDuration, 1);
                if (this.state.pouringData.progress < 1) requestAnimationFrame(animatePour);
                else resolve();
            };
            requestAnimationFrame(animatePour);
        });

        const liquidsToMove = [];
        for (let i = 0; i < actualBlockPourCount; i++) liquidsToMove.push(this.state.tubes[fromIndex].blocks.pop());
        while(liquidsToMove.length > 0) this.state.tubes[toIndex].blocks.push(liquidsToMove.pop());

        if (fromTube.blocks.length > 0) fromTube.blocks[fromTube.blocks.length - 1].hidden = false;
        
        this.state.pouringData = null;
        this.state.selectedTube = null;
        this.state.isAnimating = false;
        this.state.movesLeft--;
        this.updateUI();

        this.checkWinCondition();
    },

    // --- YENİ EFSANEVİ ZAFER DÖNGÜSÜ ---
   checkWinCondition: function() {
        // Bir bölümün kazanılması için: 
        // 1. Hiçbir şişede karışık renk olmamalı.
        // 2. Her renk kendi şişesinde tam kapasiteyle mühürlenmiş olmalı.
        // 3. Hiçbir şişede "gizli (?)" blok kalmamalı.

        let isWon = true;
        // Tüm renkleri ve miktarlarını bulalım
        let colorMap = {};
        this.state.tubes.forEach(t => {
            t.blocks.forEach(b => {
                if (b.hidden) isWon = false; // Hala gizli blok varsa kazanamaz
                colorMap[b.color] = (colorMap[b.color] || 0) + 1;
            });
        });

        // Şimdi her şişeyi kontrol et
        for (let tube of this.state.tubes) {
            if (tube.blocks.length === 0) continue; // Boş şişe sorun değil
            
            const tubeColor = tube.blocks[0].color;
            const isUniform = tube.blocks.every(b => b.color === tubeColor);
            
            // Eğer şişe uniform değilse veya o renkten oyunda hala başka yerlerde varsa
            if (!isUniform || tube.blocks.length !== colorMap[tubeColor]) {
                isWon = false;
                break;
            }
        }

        if (isWon && this.state.winPhase === 0) {
            this.handleLevelWinSequence(); // Zafer sinemasını başlat!
        } else if (this.state.movesLeft <= 0 && this.state.winPhase === 0) {
            setTimeout(() => { this.showDefeatModal(); }, 500);
        }
    },

    handleLevelWinSequence: function() {
        // 1. AŞAMA: KUTLAMA (Konfeti, Yazı ve Meksika Dalgası)
        this.state.winPhase = 1;
        this.state.winStartTime = Date.now();
        AudioManager.play('win');
        
        document.getElementById('win-text-overlay').classList.remove('hidden');

        // 2.5 Saniye kutlama sürer, sonra 2. AŞAMA: SİHİRLİ DUMAN
        setTimeout(() => {
            this.state.winPhase = 2;
            const smoke = document.getElementById('magic-smoke-transition');
            smoke.classList.remove('hidden');
            
            // Dumanın yükselmesi için küçük bir gecikme
            requestAnimationFrame(() => {
                smoke.classList.add('smoke-active');
            });

            // 3. AŞAMA: ARKA PLANDA BÖLÜMÜ DEĞİŞTİR (Duman Ekranı Kapattığında)
            setTimeout(() => {
                this.state.level++;
                this.state.points += 50;
                this.saveGame();
                if(typeof ApiService !== 'undefined') ApiService.submitScore(this.state.level);
                
                // Bölümü dumanın arkasında gizlice yenile
                this.startNewLevel(this.state.level);
                
                // Zafer yazısını gizle
                document.getElementById('win-text-overlay').classList.add('hidden');

                // 4. AŞAMA: DUMANI DAĞIT VE OYUNA DÖN
                smoke.classList.remove('smoke-active'); // Duman aşağı iner
                
                setTimeout(() => {
                    smoke.classList.add('hidden');
                    this.state.winPhase = 0; // Kontrolleri oyuncuya geri ver
                }, 800); // Dumanın inme süresi
                
            }, 800); // Dumanın ekranı kaplama süresi

        }, 2500); // Kutlama süresi
    },

    showDefeatModal: function() {
        const modal = document.getElementById('defeat-modal');
        modal.classList.remove('hidden');
        const ritualBtn = document.getElementById('btn-ritual-retry');
        if (this.state.ritualUsedInLevel) {
            ritualBtn.style.opacity = "0.5";
            ritualBtn.innerText = "Ritüel Hakkı Bitti";
            ritualBtn.disabled = true;
        } else {
            ritualBtn.style.opacity = "1";
            ritualBtn.innerText = "RİTÜEL YAP (+5 Hamle & Şişe)";
            ritualBtn.disabled = false;
        }
    },

    buyExtraMoves: function() {
        if (this.state.points >= 100) {
            this.state.points -= 100;
            this.state.movesLeft += 5;
            document.getElementById('defeat-modal').classList.add('hidden');
            this.updateUI();
            AudioManager.play('click');
        } else { alert("Büyücüm, yeterli puanın yok!"); }
    },

    saveGame: function() {
        const saveData = { level: this.state.level, points: this.state.points };
        localStorage.setItem('bilgehan_save', JSON.stringify(saveData));
    },

    loadGame: function() {
        const data = localStorage.getItem('bilgehan_save');
        if (data) {
            const parsed = JSON.parse(data);
            this.state.level = parsed.level;
            this.state.points = parsed.points;
        }
    },

    triggerDesperateHelp: async function() {
        const ritualScreen = document.getElementById('magic-ritual-screen');
        ritualScreen.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 4000));
        ritualScreen.classList.add('hidden');
        AudioManager.play('zonk');
        
        this.state.tubes.push({ capacity: 4, blocks: [] });
        this.state.movesLeft += 10;
        this.updateUI();
    },

    setupEvents: function() {
        document.getElementById('btn-start').addEventListener('click', () => {
            let elem = document.documentElement;
            if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log(err));
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            document.getElementById('start-overlay').style.display = 'none';
            AudioManager.play('click'); 
        });

        Renderer.canvas.addEventListener('touchstart', (e) => {
            if (e.touches[0]) {
                this.handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault(); 
            }
        }, { passive: false });

        Renderer.canvas.addEventListener('mousedown', (e) => {
            this.handleInteraction(e.clientX, e.clientY);
        });

        document.getElementById('btn-help').addEventListener('click', () => { this.triggerDesperateHelp(); });

        document.getElementById('btn-buy-moves').addEventListener('click', () => this.buyExtraMoves());
        document.getElementById('btn-ritual-retry').addEventListener('click', () => {
            if (!this.state.ritualUsedInLevel) {
                document.getElementById('defeat-modal').classList.add('hidden');
                this.triggerDesperateHelp(); 
                this.state.movesLeft += 5; 
                this.state.ritualUsedInLevel = true;
                this.updateUI();
            }
        });
        document.getElementById('btn-restart-level').addEventListener('click', () => {
            document.getElementById('defeat-modal').classList.add('hidden');
            this.startNewLevel(this.state.level); 
            AudioManager.play('click');
        });

        document.getElementById('btn-leaderboard').addEventListener('click', async () => {
            if(typeof ApiService !== 'undefined') {
                ApiService.getLeaderboard().then(list => {
                    console.log("Skor Tablosu: ", list);
                    alert("Liderlik tablosu konsola yazdırıldı!");
                }).catch(e => console.log("Liderlik tablosu henüz bağlanmadı."));
            }
        });
    },

    updateUI: function() {
        document.getElementById('lvl-text').innerText = this.state.level;
        document.getElementById('pts-text').innerText = this.state.points;
        const movesElem = document.getElementById('moves-text');
        if (movesElem) {
            movesElem.innerText = this.state.movesLeft;
            movesElem.style.color = this.state.movesLeft <= 5 ? '#e74c3c' : '#f1c40f';
        }
    }
};

window.onload = () => GameApp.init();