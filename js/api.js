const API_URL = "api.php"; // Artık PHP dosyamızla haberleşiyoruz

const ApiService = {
    currentUser: null,

    login: async function(username, password) {
        try {
            const res = await fetch(`${API_URL}?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                this.currentUser = username;
                // Aktif oturumu ve seviyeyi önbellekte tut
                localStorage.setItem('bilgehan_active_user', username);
                localStorage.setItem('bilgehan_active_level', data.level);
                localStorage.setItem('bilgehan_active_points', data.points);
            }
            return data;
        } catch (e) {
            return { success: false, message: "Sunucu bağlantı hatası!" };
        }
    },

    register: async function(username, password) {
        try {
            const res = await fetch(`${API_URL}?action=register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                this.currentUser = username;
                localStorage.setItem('bilgehan_active_user', username);
                localStorage.setItem('bilgehan_active_level', data.level);
                localStorage.setItem('bilgehan_active_points', data.points);
            }
            return data;
        } catch (e) {
            return { success: false, message: "Sunucu bağlantı hatası!" };
        }
    },

    logout: function() {
        this.currentUser = null;
        localStorage.removeItem('bilgehan_active_user');
        localStorage.removeItem('bilgehan_active_level');
        localStorage.removeItem('bilgehan_active_points');
    },

    // Yeni: Seviye geçildiğinde veya puan harcandığında veritabanını güncelle
    saveProgress: async function(level, points) {
        if (!this.currentUser) return;
        try {
            await fetch(`${API_URL}?action=save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.currentUser, level: level, points: points })
            });
            // Olası sayfa yenilemeleri için önbelleği de güncelle
            localStorage.setItem('bilgehan_active_level', level);
            localStorage.setItem('bilgehan_active_points', points);
        } catch (error) {
            console.warn("Kayıt veritabanına iletilemedi.", error);
        }
    },
    // YENİ: Veritabanından en güncel durumu sorgula
    getProgress: async function() {
        if (!this.currentUser) return null;
        try {
            const res = await fetch(`${API_URL}?action=get_progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.currentUser })
            });
            return await res.json();
        } catch (e) {
            return null;
        }
    },

    getLeaderboard: async function() {
        try {
            const response = await fetch(`${API_URL}?action=leaderboard`);
            return await response.json();
        } catch (error) {
            console.warn("Liderlik tablosu çekilemedi.", error);
            return [];
        }
    }
};