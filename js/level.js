const LevelGenerator = {
    colors: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'],

    generate: function(levelNumber) {
        const colorCount = Math.min(3 + Math.floor(levelNumber / 4), this.colors.length);
        // 15. Seviyeden sonra darboğaz: Sadece 1 boş şişe!
        const emptyCount = levelNumber >= 15 ? 1 : 2; 
        const totalTubes = colorCount + emptyCount;
        
        const shuffleSteps = levelNumber * 8 + 10;
       // --- YENİ ZORLUK ÇARPANLARI ---
        let multiplier = 2; // Varsayılan (Kalfa & Usta)
        if (levelNumber <= 5) multiplier = 3; // Çırak
        else if (levelNumber >= 31) multiplier = 1.5; // Bilgehan (x1.5 zor)

        const moves = Math.floor(shuffleSteps * multiplier);

        let tubes = [];

        // 1. Çözülmüş (Kazanılmış) durumu yarat
        for (let i = 0; i < totalTubes; i++) {
            let capacity = 4; // Standart kapasite
            
            // 10. Seviyeden sonra şişe boyları (kapasiteleri) değişir!
            if (levelNumber > 10 && i < colorCount) {
                capacity = (i % 2 === 0) ? 5 : 3; 
            }
            if (i >= colorCount) capacity = 4; // Boş şişeler standart kalır

            let blocks = [];
            if (i < colorCount) {
                // Şişeyi kendi kapasitesi kadar aynı renkle doldur
                for (let c = 0; c < capacity; c++) {
                    blocks.push({ color: this.colors[i], hidden: false });
                }
            }
            tubes.push({ capacity: capacity, blocks: blocks });
        }

        // 2. Geriye Doğru Karıştır (Reverse Shuffling)
        for (let step = 0; step < shuffleSteps; step++) {
            let src = Math.floor(Math.random() * totalTubes);
            let target = Math.floor(Math.random() * totalTubes);

            if (src !== target && tubes[src].blocks.length > 0 && tubes[target].blocks.length < tubes[target].capacity) {
                let liquid = tubes[src].blocks.pop();
                tubes[target].blocks.push(liquid);
            }
        }

        // 3. Gizem Katmanı: Karanlık İksirler (5. Seviyeden Sonra)
        if (levelNumber > 5) {
            tubes.forEach(t => {
                if (t.blocks.length >= 3) {
                    t.blocks[0].hidden = true; // En alt bloğu gizle
                    if (levelNumber > 12 && t.blocks.length >= 4) {
                        t.blocks[1].hidden = true; // Zor seviyelerde alttan 2. bloğu da gizle
                    }
                }
            });
        }

        // Kural: En üstteki blok ASLA gizli olamaz (oynanabilirlik için)
        tubes.forEach(t => {
            if (t.blocks.length > 0) t.blocks[t.blocks.length - 1].hidden = false;
        });

        return { tubesData: tubes, movesLimit: moves };
    }
};
