const API_URL = "https://seninsiten.com/wp-json/bilgehan/v1";

const ApiService = {
    getPlayerName: function() {
        let name = localStorage.getItem('bilgehan_player_name');
        if (!name) {
            name = prompt("Skor tablosu için büyücü adını gir:") || "Gizemli Büyücü";
            localStorage.setItem('bilgehan_player_name', name);
        }
        return name;
    },

    submitScore: async function(level) {
        const name = this.getPlayerName();
        try {
            await fetch(`${API_URL}/skor-ekle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isim: name, seviye: level })
            });
            console.log("Skor buluta işlendi.");
        } catch (error) {
            console.warn("Skor gönderilemedi.", error);
        }
    },

    getLeaderboard: async function() {
        try {
            const response = await fetch(`${API_URL}/en-iyiler`);
            return await response.json();
        } catch (error) {
            console.warn("Liderlik tablosu çekilemedi.", error);
            return [];
        }
    }
};
