const AudioManager = {
    sounds: {
        pour: new Audio('sesler/su_dokulme.mp3'),
        win: new Audio('sesler/zafer.mp3'),
        zonk: new Audio('sesler/sihirli_tup.mp3'),
        click: new Audio('sesler/tiklama.mp3')
    },
    
    play: function(name) {
        if (this.sounds[name]) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(() => {
                // Tarayıcı otomatik ses izni henüz verilmemiş olabilir
                console.log("Ses oynatılamadı: " + name);
            });
        }
    }
};
