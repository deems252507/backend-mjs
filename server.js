const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Limit besar karena data transaksi bisa banyak

// Mengambil kredensial database secara otomatis dari Clever Cloud
const pool = mysql.createPool({
    host: process.env.MYSQL_ADDON_HOST,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    port: process.env.MYSQL_ADDON_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Inisialisasi tabel jika belum ada
app.get('/api/init', async (req, res) => {
    try {
        const sql = `CREATE TABLE IF NOT EXISTS app_state (
            id INT AUTO_INCREMENT PRIMARY KEY,
            state_data JSON NOT NULL
        )`;
        await pool.query(sql);
        
        // Cek apakah tabel kosong, jika kosong insert data awal
        const [rows] = await pool.query('SELECT * FROM app_state WHERE id = 1');
        if (rows.length === 0) {
            await pool.query('INSERT INTO app_state (id, state_data) VALUES (1, ?)', [JSON.stringify({})]);
        }
        res.json({ message: "Database siap!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ambil semua data aplikasi
app.get('/api/data', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT state_data FROM app_state WHERE id = 1');
        if (rows.length > 0) {
            res.json(rows[0].state_data);
        } else {
            res.json({});
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Simpan semua data aplikasi
app.post('/api/data', async (req, res) => {
    try {
        const data = JSON.stringify(req.body);
        await pool.query('UPDATE app_state SET state_data = ? WHERE id = 1', [data]);
        res.json({ message: "Data berhasil disimpan" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
