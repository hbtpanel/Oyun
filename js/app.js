const GameApp = {
  state: {
        level: 1, points: 0, movesLeft: 0,
        tubes: [], selectedTube: null, isAnimating: false,
        pouringData: null, ritualUsedInLevel: false,
        winPhase: 0, winStartTime: 0, levelStartTime: 0,
        autoSolveUsesInLevel: 0,
        moveHistory: [] // YENİ: Oyunun hafızası
    },

    init: function() {
        Renderer.init();
        this.setupEvents();
        
        // Oturum kontrolü
        const activeUser = localStorage.getItem('bilgehan_active_user');
        if (activeUser) {
            ApiService.currentUser = activeUser;
            document.getElementById('login-overlay').style.display = 'none';
        } else {
            // Giriş yapılmamışsa oyun ekranını bekle
            document.getElementById('start-overlay').style.display = 'none';
        }
    },

    startGameSession: async function() {
        if (!ApiService.currentUser) return;

        // 1. Yerel veriyi al (Cihazın hafızası)
        let localLevel = parseInt(localStorage.getItem('bilgehan_active_level')) || 1;
        let localPoints = parseInt(localStorage.getItem('bilgehan_active_points')) || 0;

        // 2. Veritabanından (DB) veriyi çek
        let dbLevel = 1;
        let dbPoints = 0;
        
        const dbData = await ApiService.getProgress(); 
        if (dbData && dbData.success) {
            dbLevel = dbData.level;
            dbPoints = dbData.points;
        }

        // 3. HANGİSİ İLERİDEYSE ONU SEÇ (Akıllı Senkronizasyon)
        if (dbLevel > localLevel) {
            // Veritabanı ileride (Manuel değiştirilmiş veya başka cihazda oynanmış)
            this.state.level = dbLevel;
            this.state.points = dbPoints;
            localStorage.setItem('bilgehan_active_level', dbLevel);
            localStorage.setItem('bilgehan_active_points', dbPoints);
            console.log("Veritabanı daha ileride, seviye eşitlendi:", dbLevel);
            
        } else if (localLevel > dbLevel) {
            // Yerel hafıza ileride (İnternet kopukken oynanmış olabilir)
            this.state.level = localLevel;
            this.state.points = localPoints;
            ApiService.saveProgress(localLevel, localPoints);
            console.log("Yerel hafıza daha ileride, DB güncellendi:", localLevel);
            
        } else {
            // Eşitlerse normal başla (Puanı yüksek olanı al)
            this.state.level = localLevel;
            this.state.points = Math.max(localPoints, dbPoints);
        }

        // 4. Doğru verilerle oyunu başlat
        this.startNewLevel(this.state.level);
        requestAnimationFrame((time) => this.loop(time));
    },

    startNewLevel: function(levelNumber) {
        const levelData = LevelGenerator.generate(levelNumber);
        this.state.tubes = levelData.tubesData;
        this.state.movesLeft = levelData.movesLimit;
        this.state.ritualUsedInLevel = false; 
        this.state.autoSolveUsesInLevel = 0; 
        this.state.levelStartTime = Date.now(); 
        this.state.moveHistory = []; // YENİ: Her bölümde geçmişi sıfırla
        this.updateUI();
    },

    loop: function(time) {
        Renderer.draw(this.state, time);
        requestAnimationFrame((time) => this.loop(time));
    },

   handleInteraction: function(x, y) {
        // YENİ: isAutoSolving (Yapay zeka büyüsü) çalışırken oyuncu tıklayamaz!
        if (this.state.isAnimating || this.state.winPhase > 0 || this.state.isAutoSolving) return;

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
            let t = this.state.tubes[clickedTube];
           let isSealed = false;
            if (t.blocks.length > 0 && t.blocks.length === t.capacity) {
                const tubeColor = t.blocks[0].color;
                const allSame = t.blocks.every(b => b.color === tubeColor && !b.hidden);
                
                // YENİ: Oyundaki o renge ait toplam blok sayısını bul
                const colorTotalInGame = this.state.tubes.reduce((acc, curr) => 
                    acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);
                
                // Mühürlenmesi için: Şişe tam dolu olmalı VE oyundaki o rengin TÜM bloklarını barındırmalı
                if (allSame && t.blocks.length === t.capacity && t.blocks.length === colorTotalInGame) {
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

    // YENİ: Yapay Zekanın hamle sonucunu kafasında canlandırması
    simulateState: function(fromIdx, toIdx) {
        // PERFORMANS: JSON.parse(JSON.stringify) CPU düşmanıdır. Sadece gerekli veriyi hızlıca kopyalıyoruz.
        let clone = this.state.tubes.map(t => ({
            capacity: t.capacity,
            blocks: t.blocks.map(b => ({ color: b.color, hidden: b.hidden }))
        }));
        
        let source = clone[fromIdx];
        let target = clone[toIdx];
        
        if (source.blocks.length === 0) return "";
        let topColor = source.blocks[source.blocks.length - 1].color;
        
        let count = 0;
        for (let i = source.blocks.length - 1; i >= 0; i--) {
            if (!source.blocks[i].hidden && source.blocks[i].color === topColor) count++;
            else break;
        }
        
        let space = target.capacity - target.blocks.length;
        let amount = Math.min(count, space);
        
        for (let i = 0; i < amount; i++) target.blocks.push(source.blocks.pop());
        if (source.blocks.length > 0) source.blocks[source.blocks.length - 1].hidden = false;
        
        // Tablonun anlık resmini metin olarak döndür
        return clone.map(t => t.blocks.map(b => b.hidden ? '?' : b.color).join(',')).join('|');
    },

  // GÜNCELLENDİ: Hafıza Kontrollü Zeka
    findBestMove: function(visitedStates) {
        let bestMove = null;
        let bestScore = -1000;

        for (let i = 0; i < this.state.tubes.length; i++) {
            for (let j = 0; j < this.state.tubes.length; j++) {
                if (i === j) continue;

                if (this.canPour(i, j)) {
                    // YENİ: Bu hamle sonucunda oluşacak tabloyu tahmin et
                    let predictedState = this.simulateState(i, j);
                    
                    // KRİTİK: Eğer bu tabloyu daha önce gördüysek, bu hamleyi YASAKLA! (Sonsuz döngü çözer)
                    if (visitedStates.has(predictedState)) continue;

                    let score = 0;
                    let fromTube = this.state.tubes[i];
                    let toTube = this.state.tubes[j];

                    if (toTube.blocks.length > 0) score += 50; 
                    
                    let topColor = fromTube.blocks[fromTube.blocks.length - 1].color;
                    let allSame = fromTube.blocks.every(b => b.color === topColor && !b.hidden);
                    
                    if (allSame && toTube.blocks.length === 0) score -= 100; 

                    let sameColorCount = 0;
                    for (let k = fromTube.blocks.length - 1; k >= 0; k--) {
                        if (fromTube.blocks[k].color === topColor) sameColorCount++; else break;
                    }
                    if (fromTube.blocks.length > sameColorCount) score += 20;

                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { from: i, to: j };
                    }
                }
            }
        }
        // Eğer tüm hamleler eksi puansa (veya hepsi eski duruma dönüyorsa) null döndür
        return bestScore > -500 ? bestMove : null;
    },

   executePour: async function(fromIndex, toIndex) {
        // --- YENİ: HAMLEYİ GERİ ALMA GEÇMİŞİNE KAYDET (Son 5 hamle) ---
        const historyState = this.state.tubes.map(t => ({
            capacity: t.capacity,
            blocks: t.blocks.map(b => ({ color: b.color, hidden: b.hidden }))
        }));
        this.state.moveHistory.push(historyState);
        if (this.state.moveHistory.length > 5) this.state.moveHistory.shift(); 
        // -------------------------------------------------------------

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
        
        // YENİ: Oyun kazanılmadıysa, oyuncunun yapabileceği başka hamle kaldı mı kontrol et
        if (this.state.winPhase === 0) {
            this.checkDeadEnd();
        }
    },

    checkWinCondition: function() {
        let isWon = true;

        for (let tube of this.state.tubes) {
            // Şişe tamamen boşsa sorun yok, kontrol etmeye gerek yok
            if (tube.blocks.length === 0) continue; 
            
            // Eğer şişe tam dolu DEĞİLSE, oyun henüz bitmemiştir
            if (tube.blocks.length !== tube.capacity) {
                isWon = false;
                break;
            }

            // Şişe tam doluysa: Hepsi aynı renk mi ve gizli (soru işaretli) blok yok mu?
            const tubeColor = tube.blocks[0].color;
            const isUniform = tube.blocks.every(b => b.color === tubeColor && !b.hidden);
            
            if (!isUniform) {
                isWon = false;
                break;
            }
        }

        if (isWon && this.state.winPhase === 0) {
            this.handleLevelWinSequence(); 
        } else if (this.state.movesLeft <= 0 && this.state.winPhase === 0) {
            setTimeout(() => { this.showDefeatModal(); }, 500);
        }
    },

    // --- YENİ: GERİ ALMA SİHRİ ---
    undoMove: function() {
        if (this.state.isAnimating || this.state.winPhase > 0 || this.state.isAutoSolving) return;
        
        if (this.state.moveHistory.length === 0) {
            alert("Geri alınacak hamle yok Büyücüm!");
            return;
        }

        if (this.state.points < 50) {
            alert("Hamleyi geri almak için 50 puana ihtiyacın var!");
            return;
        }

        // Puanı düş ve geçmişten son hamleyi al
        this.state.points -= 50;
        const previousState = this.state.moveHistory.pop();
        
        // Tabloyu eski haline getir (Birebir kopyala)
        this.state.tubes = previousState.map(t => ({
            capacity: t.capacity,
            blocks: t.blocks.map(b => ({ color: b.color, hidden: b.hidden }))
        }));

        this.state.movesLeft++; // Giden hamle hakkını geri ver
        
        AudioManager.play('click'); 
        this.saveGame();
        this.updateUI();
    },

    // --- YENİ: TIKANMA KONTROLÜ (DEAD-END) ---
    checkDeadEnd: function() {
        let hasValidMove = false;
        
        // Tablodaki tüm şişe kombinasyonlarını birbiriyle dene
        for (let i = 0; i < this.state.tubes.length; i++) {
            for (let j = 0; j < this.state.tubes.length; j++) {
                if (i === j) continue;
                if (this.canPour(i, j)) {
                    hasValidMove = true;
                    break;
                }
            }
            if (hasValidMove) break;
        }

        // Eğer geçerli hiçbir hamle yoksa, uyarı ver
        if (!hasValidMove && this.state.movesLeft > 0) {
            setTimeout(() => {
                const modal = document.getElementById('defeat-modal');
                const title = modal.querySelector('h2');
                const desc = modal.querySelector('p');
                
                title.innerText = "BÜYÜ TIKANDI!";
                title.style.color = "#f39c12"; // Turuncu uyarı rengi
                desc.innerText = "Hiçbir şişe birbiriyle eşleşmiyor. Geri al veya Ritüel yap!";
                
                modal.classList.remove('hidden');
            }, 600); // Sıvı akma animasyonunun bitmesini biraz bekler
        }
    },

    // --- GÜNCELLEME: YENİLGİ EKRANI METİNLERİNİ SIFIRLAMA ---
    showDefeatModal: function() {
        const modal = document.getElementById('defeat-modal');
        const title = modal.querySelector('h2');
        const desc = modal.querySelector('p');
        
        // Tıkanma (Dead-end) uyarısından sonra normal yenilgi ekranına dönmesini garanti eder
        title.innerText = "HAMLELER BİTTİ!";
        title.style.color = "#e74c3c"; 
        desc.innerText = "Büyü yarım kaldı... Ne yapmak istersin?";

        modal.classList.remove('hidden');
        const ritualBtn = document.getElementById('btn-ritual-retry');
        if (this.state.ritualUsedInLevel) {
            ritualBtn.style.opacity = "0.5";
            ritualBtn.innerText = "Ritüel Hakkı Bitti";
            ritualBtn.disabled = true;
        } else {
            ritualBtn.style.opacity = "1";
            ritualBtn.innerText = "🔮 RİTÜEL YAP (+5 Hamle & Şişe)";
            ritualBtn.disabled = false;
        }
    },

   handleLevelWinSequence: function() {
        this.state.winPhase = 1;
        this.state.winStartTime = Date.now();
        AudioManager.play('win');
        
        // ESKİDEN BURADAYDI, İPTAL ETTİK:
        // document.getElementById('win-text-overlay').classList.remove('hidden');

        setTimeout(() => {
            this.state.winPhase = 2;
            const smoke = document.getElementById('magic-smoke-transition');
            smoke.classList.remove('hidden');
            
            requestAnimationFrame(() => {
                smoke.classList.add('smoke-active');
            });

            setTimeout(() => {
                this.state.level++;
                this.state.points += 50;
                this.saveGame();
                
                this.startNewLevel(this.state.level);
                
                // ESKİDEN BURADAYDI, İPTAL ETTİK:
                // document.getElementById('win-text-overlay').classList.add('hidden');

                smoke.classList.remove('smoke-active'); 
                
                setTimeout(() => {
                    smoke.classList.add('hidden');
                    this.state.winPhase = 0; 
                }, 800); 
                
            }, 800); 

        }, 2500); 
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
            ritualBtn.innerText = "🔮 RİTÜEL YAP (+5 Hamle & Şişe)";
            ritualBtn.disabled = false;
        }
    },

    buyExtraMoves: function() {
        if (this.state.points >= 100) {
            this.state.points -= 100;
            this.state.movesLeft += 5;
            document.getElementById('defeat-modal').classList.add('hidden');
            this.saveGame(); 
            this.updateUI();
            AudioManager.play('click');
        } else { alert("Büyücüm, yeterli puanın yok!"); }
    },

    saveGame: function() {
        if (!ApiService.currentUser) return;
        ApiService.saveProgress(this.state.level, this.state.points);
    },

  triggerDesperateHelp: async function() {
        // GÜNCELLENDİ: Artık çok daha insaflı ve sabit! (25 Puan)
        let ritualCost = 25;
        
        if (this.state.points < ritualCost) {
            alert(`Bu karanlık ritüel için ${ritualCost} puana ihtiyacın var Büyücüm!`);
            return;
        }

        // Puanı düş ve veritabanına kaydet
        this.state.points -= ritualCost;
        this.saveGame();
        this.updateUI();

        const ritualScreen = document.getElementById('magic-ritual-screen');
        ritualScreen.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 3000));
        ritualScreen.classList.add('hidden');
        AudioManager.play('zonk');
        
        this.state.tubes.push({ capacity: 4, blocks: [] });
        this.state.movesLeft += 10;
        this.updateUI();
    },

   // GÜNCELLENDİ: Sonsuz Döngü Korumalı Öğretici Sihir
   // GÜNCELLENDİ: Sadece 1 Şişe Kapatana Kadar Çalışır ve Daha Ucuzdur!
    executeAutoSolveSpell: async function() {
        if (this.state.isAnimating || this.state.winPhase > 0 || this.state.isAutoSolving) return;

        let solveCost = 30 + (30 * this.state.autoSolveUsesInLevel);
        
        if (this.state.points < solveCost) {
            alert(`Yapay Zeka yardımı için ${solveCost} puana ihtiyacın var!`);
            return;
        }

        this.state.isAutoSolving = true; // YENİ: Yapay Zeka kilidini kapat (Oyuncu müdahale edemez)

        this.state.points -= solveCost;
        this.state.autoSolveUsesInLevel++;
        this.saveGame();
        this.updateUI();
        AudioManager.play('zonk');
        
        let visitedStates = new Set();
        let stuckCounter = 0; 

       // YENİ: Büyüye başlamadan önce ekrandaki kapalı (tamamlanmış) şişeleri say
        let initialSealedCount = 0;
        this.state.tubes.forEach(t => {
            if(t.blocks.length > 0 && t.blocks.length === t.capacity && t.blocks.every(b => b.color === t.blocks[0].color && !b.hidden)) {
                const tubeColor = t.blocks[0].color;
                const colorTotalInGame = this.state.tubes.reduce((acc, curr) => acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);
                // Sadece rengin tüm bloklarını içeren şişeleri "tamamlanmış" say
                if (t.blocks.length === colorTotalInGame) {
                    initialSealedCount++;
                }
            }
        });

        // DÖNGÜ: Oyun bitene veya güvenlik sınırına takılana kadar çalış
        while (this.state.winPhase === 0 && stuckCounter < 50) {
            let currentStateStr = this.state.tubes.map(t => t.blocks.map(b => b.hidden ? '?' : b.color).join(',')).join('|');
            visitedStates.add(currentStateStr);

            let nextMove = this.findBestMove(visitedStates);
            
            if (!nextMove) {
                alert("Yapay Zeka tıkandı! Farklı bir hamle yapıp onu yönlendirebilirsin.");
                break;
            }

            await this.executePour(nextMove.from, nextMove.to);
            stuckCounter++;

          // YENİ HAMLE SONRASI KONTROL: Yeni bir şişe kapandı mı?
            let currentSealedCount = 0;
            this.state.tubes.forEach(t => {
                if(t.blocks.length > 0 && t.blocks.length === t.capacity && t.blocks.every(b => b.color === t.blocks[0].color && !b.hidden)) {
                    const tubeColor = t.blocks[0].color;
                    const colorTotalInGame = this.state.tubes.reduce((acc, curr) => acc + curr.blocks.filter(b => b.color === tubeColor).length, 0);
                    if (t.blocks.length === colorTotalInGame) {
                        currentSealedCount++;
                    }
                }
            });

           // Eğer şu anki kapalı şişe sayısı, büyü başladığındaki sayıdan büyükse, hedef tamamlandı!
            if (currentSealedCount > initialSealedCount) {
                break; // Döngüyü kır, büyücüye kontrolü geri ver.
            }

            await new Promise(r => setTimeout(r, 400));
        }
        
        this.state.isAutoSolving = false; // YENİ: Yapay Zeka işini bitirdi, kilidi aç!
    },
    setupEvents: function() {
        const handleAuth = async (isLogin) => {
            const user = document.getElementById('username-input').value.trim();
            const pass = document.getElementById('password-input').value.trim();
            const msgEl = document.getElementById('auth-message');
            
            
            msgEl.style.color = "#f1c40f"; 
            msgEl.innerText = "Büyü Kitaplarına Bakılıyor...";
            
            const result = await (isLogin ? ApiService.login(user, pass) : ApiService.register(user, pass));
            
            if (result.success) {
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('start-overlay').style.display = 'flex'; 
                
            } else {
                msgEl.style.color = "#e74c3c"; 
                msgEl.innerText = result.message;
            }

            // YENİ: Geri Al Butonu
        document.getElementById('btn-undo').addEventListener('click', () => {
            this.undoMove();
        });

        // YENİ: Tıkanma/Yenilgi ekranını kapatıp tabloya dönme butonu
        const btnCloseDefeat = document.getElementById('btn-close-defeat');
        if(btnCloseDefeat) {
            btnCloseDefeat.addEventListener('click', () => {
                document.getElementById('defeat-modal').classList.add('hidden');
            });
        }
        };

        const btnLogin = document.getElementById('btn-login');
        if(btnLogin) btnLogin.addEventListener('click', () => handleAuth(true));
        
        const btnRegister = document.getElementById('btn-register');
        if(btnRegister) btnRegister.addEventListener('click', () => handleAuth(false));
        
        const btnLogout = document.getElementById('btn-logout');
        if(btnLogout) {
            btnLogout.addEventListener('click', () => {
                ApiService.logout();
                location.reload(); 
            });
        }

        document.getElementById('btn-start').addEventListener('click', () => {
            let elem = document.documentElement;
            if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log(err));
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            document.getElementById('start-overlay').style.display = 'none';
            AudioManager.play('click'); 
            
            this.startGameSession(); 
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

        // --- YENİ: Sihirli Şişe Kapatma Butonu ---
        document.getElementById('btn-auto-solve').addEventListener('click', () => {
            this.executeAutoSolveSpell();
        });

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
            const modal = document.getElementById('leaderboard-modal');
            const listDiv = document.getElementById('leaderboard-list');
            modal.style.display = 'flex'; // YENİ: Doğrudan stili değiştirerek açar
            listDiv.innerHTML = '<p style="text-align:center; color:#bdc3c7;">Parşömenler Okunuyor...</p>';
            
            try {
                const list = await ApiService.getLeaderboard();
                if (!list || list.length === 0) {
                    listDiv.innerHTML = '<p style="text-align:center; color:#bdc3c7;">Henüz hiç büyücü yok.</p>';
                    return;
                }
                
                let html = '<table style="width:100%; color:white; border-collapse: collapse;">';
                html += '<tr style="border-bottom: 1px solid #34495e; color:#f1c40f;"><th style="padding:5px; text-align:left;">Büyücü</th><th style="padding:5px;">Sv.</th><th style="padding:5px; text-align:right;">Puan</th></tr>';
                
                list.forEach((item, index) => {
                    let rankColor = index === 0 ? '#f1c40f' : (index === 1 ? '#bdc3c7' : (index === 2 ? '#d35400' : 'white'));
                    html += `<tr style="color:${rankColor};">`;
                    html += `<td style="padding:8px 5px; border-bottom: 1px solid rgba(255,255,255,0.05);">${index + 1}. ${item.username}</td>`;
                    html += `<td style="padding:8px 5px; text-align:center; border-bottom: 1px solid rgba(255,255,255,0.05);">${item.level}</td>`;
                    html += `<td style="padding:8px 5px; text-align:right; border-bottom: 1px solid rgba(255,255,255,0.05);">${item.points}</td>`;
                    html += `</tr>`;
                });
                html += '</table>';
                listDiv.innerHTML = html;
            } catch (e) {
                listDiv.innerHTML = '<p style="text-align:center; color:#e74c3c;">Tabloya ulaşılamadı!</p>';
            }
        });

    const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
        if(btnCloseLeaderboard) {
            btnCloseLeaderboard.addEventListener('click', () => {
                document.getElementById('leaderboard-modal').style.display = 'none'; // YENİ: Doğrudan stili değiştirerek kapatır
            });
        }
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