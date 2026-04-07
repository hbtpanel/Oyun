const LevelGenerator = {
    // TAMAMEN ZIT, AYIRT EDİLMESİ EN KOLAY ANA RENKLER
    colors: [
        '#FF0000', // 1. Tam Kırmızı
        '#0000FF', // 2. Tam Mavi
        '#00FF00', // 3. Tam Yeşil
        '#FFFF00', // 4. Tam Sarı
        '#FF00FF', // 5. Parlak Pembe / Macenta
        '#00FFFF', // 6. Açık Mavi / Cyan
        '#FFA500', // 7. Turuncu
        '#800080', // 8. Koyu Mor
        '#8B4513', // 9. Kahverengi
        '#FFFFFF'  // 10. Saf Beyaz
    ],



    generate: function(levelNumber) {
        const colorCount = Math.min(3 + Math.floor(levelNumber / 4), this.colors.length);
        // Her zaman 2 boş şişe (Darboğazı engellemek için)
        const emptyCount = 2; 
        const totalTubes = colorCount + emptyCount;
        
        const shuffleSteps = levelNumber * 8 + 10;
        let multiplier = 2; 
        if (levelNumber <= 5) multiplier = 3; 
        else if (levelNumber >= 31) multiplier = 1.5; 

        const moves = Math.floor(shuffleSteps * multiplier);
        let tubes = [];

        // 1. Çözülmüş (Kazanılmış) durumu yarat
        for (let i = 0; i < totalTubes; i++) {
            let capacity = 4; 
            
            if (levelNumber > 10 && i < colorCount) {
                capacity = (i % 2 === 0) ? 5 : 3; 
            }
            if (i >= colorCount) capacity = 4; 

            let blocks = [];
            if (i < colorCount) {
                for (let c = 0; c < capacity; c++) {
                    blocks.push({ color: this.colors[i], hidden: false });
                }
            }
            tubes.push({ capacity: capacity, blocks: blocks });
        }

        // 2. Geriye Doğru Akıllı Karıştır (Kilitlenmeyi önleyen sistem)
        let validShuffles = 0;
        let attempts = 0;
        
        while (validShuffles < shuffleSteps && attempts < shuffleSteps * 50) {
            attempts++;
            let src = Math.floor(Math.random() * totalTubes);
            let target = Math.floor(Math.random() * totalTubes);

            if (src === target) continue;

            let srcTube = tubes[src];
            let targetTube = tubes[target];

            if (srcTube.blocks.length === 0) continue;
            if (targetTube.blocks.length >= targetTube.capacity) continue;

            let liquid = srcTube.blocks[srcTube.blocks.length - 1]; 
            
            let canReversePour = false;
            if (srcTube.blocks.length === 1) {
                canReversePour = true; 
            } else {
                let blockUnder = srcTube.blocks[srcTube.blocks.length - 2];
                if (blockUnder.color === liquid.color) {
                    canReversePour = true; 
                }
            }

            if (canReversePour) {
                targetTube.blocks.push(srcTube.blocks.pop());
                validShuffles++;
            }
        }

        // 3. Gizem Katmanı: Karanlık İksirler (5. Seviyeden Sonra)
        if (levelNumber > 5) {
            tubes.forEach(t => {
                if (t.blocks.length >= 3) {
                    t.blocks[0].hidden = true; 
                    if (levelNumber > 12 && t.blocks.length >= 4) {
                        t.blocks[1].hidden = true; 
                    }
                }
            });
        }

        tubes.forEach(t => {
            if (t.blocks.length > 0) t.blocks[t.blocks.length - 1].hidden = false;
        });

        return { tubesData: tubes, movesLimit: moves };
    }
};