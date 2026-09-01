const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ============================================================
// TEST SERVER
// ============================================================

app.get('/api/test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server berhasil berjalan!'
    });
});

// ============================================================
// DATABASE CLEVER CLOUD
// ============================================================

const pool = mysql.createPool({
    host: 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: 'uks2krvuygsynrco',
    password: 'fWwkTbshbBANrTGMj8Aq',
    database: 'b7fgoctdsrijlfhczppz',
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0
});

// ============================================================
// ERROR HANDLER
// ============================================================

pool.on('error', (err) => {
    console.error('Database pool error:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// ============================================================
// CACHE DATA
// ============================================================

let dataCache = null;
let dataCacheTime = 0;

const DATA_CACHE_TTL = 2000;

function invalidateDataCache() {
    dataCache = null;
    dataCacheTime = 0;
}

// Semua request selain GET dianggap mengubah data
app.use((req, res, next) => {
    if (req.method !== 'GET') {
        invalidateDataCache();
    }

    next();
});

// ============================================================
// HELPER
// ============================================================

function safeNumber(value, defaultValue = 0) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return defaultValue;
    }

    return n;
}

function safeInteger(value, defaultValue = null) {
    const n = Number(value);

    if (!Number.isInteger(n)) {
        return defaultValue;
    }

    return n;
}

function safeString(value, defaultValue = '') {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    return String(value);
}

function safeDate(value) {
    if (!value) {
        return new Date();
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        return new Date();
    }

    return d;
}

function safeJSON(value, defaultValue = []) {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    if (Array.isArray(value) || typeof value === 'object') {
        return value;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return defaultValue;
        }
    }

    return defaultValue;
}

// ============================================================
// 1. INISIALISASI TABEL
// ============================================================

app.get('/api/init', async (req, res) => {
    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS spareparts (
                id BIGINT PRIMARY KEY,
                kode VARCHAR(50),
                part_number VARCHAR(255),
                part_numbers_alt TEXT,
                nama VARCHAR(500),
                kategori VARCHAR(100),
                merek VARCHAR(100),
                satuan VARCHAR(50),
                stok_min INT DEFAULT 0,
                stok_awal INT DEFAULT 0,
                harga_beli BIGINT DEFAULT 0,
                harga_jual BIGINT DEFAULT 0,
                satuan_alt VARCHAR(50),
                isi_satuan_alt INT DEFAULT 0,
                harga_jual_alt BIGINT DEFAULT 0,
                pajak_status VARCHAR(20),
                kode_pajak VARCHAR(50),
                keterangan TEXT
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id BIGINT PRIMARY KEY,
                nomor_transaksi VARCHAR(50),
                tanggal DATETIME,
                sparepart_id BIGINT,
                custom_item VARCHAR(500),
                part_numbers_alt TEXT,
                merek VARCHAR(100),
                jenis VARCHAR(20),
                jumlah INT,
                satuan VARCHAR(50),
                jumlah_dasar INT,
                harga_satuan BIGINT,
                tujuan VARCHAR(255),
                keterangan TEXT,
                source VARCHAR(50),
                kasir VARCHAR(100),
                status_bayar VARCHAR(20),
                metode_bayar VARCHAR(50),
                bayar_tunai BIGINT DEFAULT 0,
                transfer_amount BIGINT DEFAULT 0,
                kembalian_diberikan BIGINT DEFAULT 0,
                diskon BIGINT DEFAULT 0,
                tanggal_lunas DATETIME NULL,
                parent_invoice VARCHAR(50) NULL,
                shift_id VARCHAR(100) NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS partners (
                id BIGINT PRIMARY KEY,
                nama VARCHAR(255),
                tipe VARCHAR(50),
                telp VARCHAR(50),
                alamat TEXT
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_expenses (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100),
                shift_id VARCHAR(100) NULL,
                bukti VARCHAR(255) NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_inflows (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100),
                shift_id VARCHAR(100) NULL,
                bukti VARCHAR(255) NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tax_records (
                tax_id VARCHAR(100) PRIMARY KEY,
                trx_id BIGINT,
                tanggal DATETIME,
                nomor_transaksi VARCHAR(50),
                part_number VARCHAR(255),
                nama VARCHAR(500),
                kategori VARCHAR(100),
                merek VARCHAR(100),
                status_bayar VARCHAR(20),
                pelanggan VARCHAR(255),
                jumlah INT,
                satuan VARCHAR(50),
                harga_satuan BIGINT,
                subtotal BIGINT,
                persentase_pajak DECIMAL(5,2),
                nilai_pajak BIGINT
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS retur_records (
                id VARCHAR(50) PRIMARY KEY,
                parent_invoice VARCHAR(50),
                tanggal DATETIME,
                kasir VARCHAR(100),
                pelanggan VARCHAR(255),
                items JSON,
                exchange_items JSON,
                metode_bayar VARCHAR(50) DEFAULT 'Tunai',
                bank_transfer VARCHAR(100) DEFAULT '',
                nilai_retur BIGINT DEFAULT 0,
                nilai_tukar BIGINT DEFAULT 0,
                selisih BIGINT DEFAULT 0,
                arah_selisih VARCHAR(30) DEFAULT 'NONE',
                cash_amount BIGINT DEFAULT 0,
                transfer_amount BIGINT DEFAULT 0
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // =====================================================
        // Pastikan exchange_items tersedia pada database lama
        // =====================================================

        // Migrasi aman untuk database retur lama.
        // Tidak menghapus atau mengubah data lama.
        const returColumns = [
            ['exchange_items', 'ADD COLUMN exchange_items JSON'],
            ['metode_bayar', "ADD COLUMN metode_bayar VARCHAR(50) DEFAULT 'Tunai'"],
            ['bank_transfer', "ADD COLUMN bank_transfer VARCHAR(100) DEFAULT ''"],
            ['nilai_retur', 'ADD COLUMN nilai_retur BIGINT DEFAULT 0'],
            ['nilai_tukar', 'ADD COLUMN nilai_tukar BIGINT DEFAULT 0'],
            ['selisih', 'ADD COLUMN selisih BIGINT DEFAULT 0'],
            ['arah_selisih', "ADD COLUMN arah_selisih VARCHAR(30) DEFAULT 'NONE'"],
            ['cash_amount', 'ADD COLUMN cash_amount BIGINT DEFAULT 0'],
            ['transfer_amount', 'ADD COLUMN transfer_amount BIGINT DEFAULT 0']
        ];

        for (const [, alterSql] of returColumns) {
            try {
                await pool.query(`ALTER TABLE retur_records ${alterSql}`);
            } catch (e) {
                // Kolom sudah ada -> aman diabaikan.
            }
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INT PRIMARY KEY DEFAULT 1,
                kas_awal BIGINT DEFAULT 0,
                active_shift_start BIGINT,
                master_pajak JSON,
                users JSON,
                shift_sessions JSON
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // Migrasi aman untuk database lama. Tidak menghapus data.
        const safeMigrations = [
            ['transactions', 'parent_invoice', 'ADD COLUMN parent_invoice VARCHAR(50) NULL'],
            ['transactions', 'shift_id', 'ADD COLUMN shift_id VARCHAR(100) NULL'],
            ['cash_expenses', 'shift_id', 'ADD COLUMN shift_id VARCHAR(100) NULL'],
            ['cash_expenses', 'bukti', 'ADD COLUMN bukti VARCHAR(255) NULL'],
            ['cash_inflows', 'shift_id', 'ADD COLUMN shift_id VARCHAR(100) NULL'],
            ['cash_inflows', 'bukti', 'ADD COLUMN bukti VARCHAR(255) NULL'],
            ['app_settings', 'shift_sessions', 'ADD COLUMN shift_sessions JSON NULL']
        ];
        for (const [table, column, alterSql] of safeMigrations) {
            try { await pool.query(`ALTER TABLE ${table} ${alterSql}`); }
            catch (e) { /* kolom sudah ada */ }
        }

        const [settings] = await pool.query(`
            SELECT *
            FROM app_settings
            WHERE id = 1
        `);

        if (settings.length === 0) {

            await pool.query(`
                INSERT INTO app_settings
                (
                    id,
                    kas_awal,
                    active_shift_start,
                    master_pajak,
                    users
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                1,
                0,
                Date.now(),
                JSON.stringify([
                    {
                        jenis: 'Aki Basah',
                        persentase: 20
                    },
                    {
                        jenis: 'Aki Kering',
                        persentase: 11
                    },
                    {
                        jenis: 'Oli',
                        persentase: 4
                    },
                    {
                        jenis: 'Air Radiator',
                        persentase: 4
                    },
                    {
                        jenis: 'Minyak Rem',
                        persentase: 4
                    },
                    {
                        jenis: 'Lainnya',
                        persentase: 11
                    }
                ]),
                JSON.stringify([
                    {
                        username: 'owner',
                        password: 'owner123',
                        role: 'Owner',
                        name: 'Pemilik'
                    },
                    {
                        username: 'admin',
                        password: 'admin123',
                        role: 'Admin',
                        name: 'Administrator'
                    },
                    {
                        username: 'pagi',
                        password: 'pagi123',
                        role: 'Kasir',
                        name: 'Kasir Pagi'
                    },
                    {
                        username: 'siang',
                        password: 'siang123',
                        role: 'Kasir',
                        name: 'Kasir Siang'
                    }
                ])
            ]);
        }

        res.json({
            success: true,
            message: 'Database & tabel siap!'
        });

    } catch (error) {

        console.error('INIT ERROR:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 2. MIGRASI DATA
// ============================================================

app.post('/api/migrate', async (req, res) => {

    const oldData = req.body || {};

    try {

        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.spareparts) &&
            oldData.spareparts.length > 0
        ) {

            const values = oldData.spareparts.map(sp => [
                safeInteger(sp.id, Date.now()),
                safeString(sp.kode),
                safeString(sp.part_number),
                safeString(sp.part_numbers_alt),
                safeString(sp.nama),
                safeString(sp.kategori, 'Umum'),
                safeString(sp.merek),
                safeString(sp.satuan, 'Pcs'),
                safeNumber(sp.stok_min),
                safeNumber(sp.stok_awal),
                safeNumber(sp.harga_beli),
                safeNumber(sp.harga_jual),
                safeString(sp.satuan_alt),
                safeNumber(sp.isi_satuan_alt),
                safeNumber(sp.harga_jual_alt),
                safeString(sp.pajak_status, 'Non Pajak'),
                safeString(sp.kode_pajak),
                safeString(sp.keterangan)
            ]);

            for (let i = 0; i < values.length; i += 500) {

                await pool.query(`
                    INSERT IGNORE INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(i, i + 500)
                ]);
            }
        }

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.transactions) &&
            oldData.transactions.length > 0
        ) {

            const values = oldData.transactions
                .filter(t => safeInteger(t.id) !== null)
                .map(t => [

                    safeInteger(t.id),

                    safeString(t.nomor_transaksi),

                    safeDate(t.tanggal),

                    safeInteger(t.sparepart_id),

                    t.custom_item || null,

                    safeString(t.part_numbers_alt),

                    safeString(t.merek),

                    safeString(t.jenis),

                    safeNumber(t.jumlah),

                    safeString(t.satuan),

                    safeNumber(t.jumlah_dasar),

                    safeNumber(t.harga_satuan),

                    safeString(t.tujuan),

                    safeString(t.keterangan),

                    safeString(t.source),

                    safeString(t.kasir),

                    safeString(t.status_bayar),

                    safeString(t.metode_bayar),

                    safeNumber(t.bayar_tunai),

                    safeNumber(t.transfer_amount),

                    safeNumber(t.kembalian_diberikan),

                    safeNumber(t.diskon),

                    t.tanggal_lunas
                        ? safeDate(t.tanggal_lunas)
                        : null,
                    t.parent_invoice || t.parentInvoice || null,
                    t.shift_id || t.shiftId || null
                ]);

            for (let i = 0; i < values.length; i += 500) {

                await pool.query(`
                    INSERT IGNORE INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas,
                        parent_invoice,
                        shift_id
                    )
                    VALUES ?
                `, [
                    values.slice(i, i + 500)
                ]);
            }
        }

        // ----------------------------------------------------
        // PARTNERS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.partners) &&
            oldData.partners.length > 0
        ) {

            const values = oldData.partners
                .filter(p => safeInteger(p.id) !== null)
                .map(p => [
                    safeInteger(p.id),
                    safeString(p.nama),
                    safeString(p.tipe),
                    safeString(p.telp),
                    safeString(p.alamat)
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO partners
                    (
                        id,
                        nama,
                        tipe,
                        telp,
                        alamat
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH EXPENSES
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.cashExpenses) &&
            oldData.cashExpenses.length > 0
        ) {

            const values = oldData.cashExpenses
                .filter(e => safeInteger(e.id) !== null)
                .map(e => [
                    safeInteger(e.id),
                    safeDate(e.tanggal),
                    safeNumber(e.jumlah),
                    safeString(e.keterangan),
                    safeString(e.kasir)
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.cashInflows) &&
            oldData.cashInflows.length > 0
        ) {

            const values = oldData.cashInflows
                .filter(i => safeInteger(i.id) !== null)
                .map(i => [
                    safeInteger(i.id),
                    safeDate(i.tanggal),
                    safeNumber(i.jumlah),
                    safeString(i.keterangan),
                    safeString(i.kasir)
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.taxRecords) &&
            oldData.taxRecords.length > 0
        ) {

            const values = oldData.taxRecords
                .filter(t => t.tax_id)
                .map(t => [
                    safeString(t.tax_id),
                    safeInteger(t.trx_id, 0),
                    safeDate(t.tanggal),
                    safeString(t.nomor_transaksi),
                    safeString(t.part_number),
                    safeString(t.nama),
                    safeString(t.kategori),
                    safeString(t.merek),
                    safeString(t.status_bayar),
                    safeString(t.pelanggan),
                    safeNumber(t.jumlah),
                    safeString(t.satuan),
                    safeNumber(t.harga_satuan),
                    safeNumber(t.subtotal),
                    safeNumber(t.persentase_pajak),
                    safeNumber(t.nilai_pajak)
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        if (
            oldData.kasAwal !== undefined ||
            oldData.users
        ) {

            await pool.query(`
                UPDATE app_settings
                SET
                    kas_awal = ?,
                    active_shift_start = ?,
                    master_pajak = ?,
                    users = ?
                WHERE id = 1
            `, [
                safeNumber(oldData.kasAwal),
                oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []),
                JSON.stringify(oldData.users || [])
            ]);
        }

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Migrasi data lama berhasil!'
        });

    } catch (error) {

        console.error('MIGRATE ERROR:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 3. GET ALL DATA
// ============================================================

app.get('/api/data', async (req, res) => {

    const now = Date.now();

    if (
        dataCache &&
        (now - dataCacheTime) < DATA_CACHE_TTL
    ) {
        return res.json(dataCache);
    }

    let connection;

    try {

        connection = await pool.getConnection();

        const [spareparts] = await connection.query(`
            SELECT *
            FROM spareparts
        `);

        const [transactions] = await connection.query(`
            SELECT *
            FROM transactions
        `);

        const [partners] = await connection.query(`
            SELECT *
            FROM partners
        `);

        const [cashExpenses] = await connection.query(`
            SELECT *
            FROM cash_expenses
        `);

        const [cashInflows] = await connection.query(`
            SELECT *
            FROM cash_inflows
        `);

        const [taxRecords] = await connection.query(`
            SELECT *
            FROM tax_records
        `);

        let returs = [];

        try {

            const [returResult] = await connection.query(`
                SELECT *
                FROM retur_records
            `);

            returs = returResult;

        } catch (e) {

            console.error(
                'Gagal membaca retur_records:',
                e.message
            );
        }

        const [settings] = await connection.query(`
            SELECT *
            FROM app_settings
            WHERE id = 1
        `);

        // ----------------------------------------------------
        // DATE CONVERSION
        // ----------------------------------------------------

        transactions.forEach(t => {

            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }

            if (t.tanggal_lunas instanceof Date) {
                t.tanggal_lunas =
                    t.tanggal_lunas.toISOString();
            }
        });

        cashExpenses.forEach(e => {

            if (e.tanggal instanceof Date) {
                e.tanggal =
                    e.tanggal.toISOString();
            }
        });

        cashInflows.forEach(i => {

            if (i.tanggal instanceof Date) {
                i.tanggal =
                    i.tanggal.toISOString();
            }
        });

        taxRecords.forEach(t => {

            if (t.tanggal instanceof Date) {
                t.tanggal =
                    t.tanggal.toISOString();
            }
        });

        // ----------------------------------------------------
        // RETUR
        // ----------------------------------------------------

        const returRecords = returs.map(r => {

            let items = safeJSON(r.items, []);

            let exchangeItems =
                safeJSON(r.exchange_items, []);

            if (!Array.isArray(items)) {
                items = [];
            }

            if (!Array.isArray(exchangeItems)) {
                exchangeItems = [];
            }

            let tanggal = r.tanggal;

            if (tanggal) {
                tanggal = safeDate(tanggal).toISOString();
            }

            return {
                ...r,

                id: safeString(r.id),

                parent_invoice:
                    safeString(r.parent_invoice),

                tanggal,

                kasir:
                    safeString(r.kasir),

                pelanggan:
                    safeString(r.pelanggan),

                items,

                exchange_items:
                    exchangeItems
            };
        });

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        let masterPajak =
            settings[0]?.master_pajak || [];

        if (typeof masterPajak === 'string') {

            try {
                masterPajak =
                    JSON.parse(masterPajak);
            } catch (e) {
                masterPajak = [];
            }
        }

        let users =
            settings[0]?.users || [];

        let shiftSessions = settings[0]?.shift_sessions || [];
        if (typeof shiftSessions === 'string') {
            try { shiftSessions = JSON.parse(shiftSessions); } catch (e) { shiftSessions = []; }
        }
        if (!Array.isArray(shiftSessions)) shiftSessions = [];

        if (typeof users === 'string') {

            try {
                users =
                    JSON.parse(users);
            } catch (e) {
                users = [];
            }
        }

        const result = {

            spareparts,

            transactions,

            partners,

            cashExpenses,

            cashInflows,

            taxRecords,

            returRecords,

            kasAwal:
                settings[0]?.kas_awal || 0,

            activeShiftStart:
                settings[0]?.active_shift_start ||
                Date.now(),

            masterPajak,

            users,
            shiftSessions
        };

        dataCache = result;
        dataCacheTime = Date.now();

        res.json(result);

    } catch (error) {

        console.error(
            'Error GET DATA:',
            error
        );

        // Jangan mengembalikan cache lama
        // jika database benar-benar gagal.
        if (dataCache) {

            console.log(
                'Mengembalikan data cache karena error database'
            );

            return res.json(dataCache);
        }

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
});

// ============================================================
// 4. SPAREPART
// ============================================================

app.post('/api/sparepart', async (req, res) => {

    try {

        await pool.query(
            'INSERT INTO spareparts SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Sparepart disimpan'
        });

    } catch (error) {

        console.error(
            'Error sparepart:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/sparepart/bulk', async (req, res) => {

    const { items } = req.body;

    try {

        if (
            Array.isArray(items) &&
            items.length > 0
        ) {

            const values = items
                .filter(sp => safeInteger(sp.id) !== null)
                .map(sp => [
                    safeInteger(sp.id),
                    safeString(sp.kode),
                    safeString(sp.part_number),
                    safeString(sp.part_numbers_alt),
                    safeString(sp.nama),
                    safeString(sp.kategori, 'Umum'),
                    safeString(sp.merek),
                    safeString(sp.satuan, 'Pcs'),
                    safeNumber(sp.stok_min),
                    safeNumber(sp.stok_awal),
                    safeNumber(sp.harga_beli),
                    safeNumber(sp.harga_jual),
                    safeString(sp.satuan_alt),
                    safeNumber(sp.isi_satuan_alt),
                    safeNumber(sp.harga_jual_alt),
                    safeString(sp.pajak_status, 'Non Pajak'),
                    safeString(sp.kode_pajak),
                    safeString(sp.keterangan)
                ]);

            for (let i = 0; i < values.length; i += 500) {

                await pool.query(`
                    INSERT IGNORE INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(i, i + 500)
                ]);
            }
        }

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Sparepart bulk disimpan'
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/sparepart/:id', async (req, res) => {

    const id = safeInteger(req.params.id);

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: 'ID sparepart tidak valid'
        });
    }

    try {

        await pool.query(
            'UPDATE spareparts SET ? WHERE id = ?',
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Sparepart diupdate'
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/sparepart/:id', async (req, res) => {

    const id = safeInteger(req.params.id);

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: 'ID sparepart tidak valid'
        });
    }

    try {

        await pool.query(
            'DELETE FROM spareparts WHERE id = ?',
            [id]
        );

        await pool.query(
            'DELETE FROM transactions WHERE sparepart_id = ?',
            [id]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Sparepart dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus sparepart:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 5. TRANSAKSI
// ============================================================

app.post('/api/transactions', async (req, res) => {

    const {
        transactions,
        taxRecords
    } = req.body || {};

    try {

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(transactions) &&
            transactions.length > 0
        ) {

            const values = transactions
                .filter(t => safeInteger(t.id) !== null)
                .map(t => [

                    safeInteger(t.id),

                    safeString(t.nomor_transaksi),

                    safeDate(t.tanggal),

                    safeInteger(t.sparepart_id),

                    t.custom_item || null,

                    safeString(t.part_numbers_alt),

                    safeString(t.merek),

                    safeString(t.jenis),

                    safeNumber(t.jumlah),

                    safeString(t.satuan),

                    safeNumber(t.jumlah_dasar),

                    safeNumber(t.harga_satuan),

                    safeString(t.tujuan),

                    safeString(t.keterangan),

                    safeString(t.source),

                    safeString(t.kasir),

                    safeString(t.status_bayar),

                    safeString(t.metode_bayar),

                    safeNumber(t.bayar_tunai),

                    safeNumber(t.transfer_amount),

                    safeNumber(t.kembalian_diberikan),

                    safeNumber(t.diskon),

                    t.tanggal_lunas
                        ? safeDate(t.tanggal_lunas)
                        : null,
                    t.parent_invoice || t.parentInvoice || null,
                    t.shift_id || t.shiftId || null
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas,
                        parent_invoice,
                        shift_id
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(taxRecords) &&
            taxRecords.length > 0
        ) {

            const values = taxRecords
                .filter(t => t && t.tax_id)
                .map(t => [

                    safeString(t.tax_id),

                    safeInteger(t.trx_id, 0),

                    safeDate(t.tanggal),

                    safeString(t.nomor_transaksi),

                    safeString(t.part_number),

                    safeString(t.nama),

                    safeString(t.kategori),

                    safeString(t.merek),

                    safeString(t.status_bayar),

                    safeString(t.pelanggan),

                    safeNumber(t.jumlah),

                    safeString(t.satuan),

                    safeNumber(t.harga_satuan),

                    safeNumber(t.subtotal),

                    safeNumber(t.persentase_pajak),

                    safeNumber(t.nilai_pajak)
                ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT IGNORE INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [values]);
            }
        }

        invalidateDataCache();

        res.json({
            success: true,
            message: 'Transaksi disimpan'
        });

    } catch (error) {

        console.error(
            'Error transaksi:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// SIMPAN RETUR
// Kompatibel dengan beberapa format request dari frontend
// ============================================================
app.post('/api/transaction/retur', async (req, res) => {
    const body = req.body || {};

    console.log('==========================================');
    console.log('[RETUR] Request diterima');
    console.log('[RETUR] Body keys:', Object.keys(body));
    console.log('==========================================');

    let returRecord =
        body.returRecord ||
        body.retur ||
        body.returnRecord ||
        body.return ||
        null;

    let transactions = body.transactions || body.transaction || [];
    let taxRecords = body.taxRecords || body.tax_records || [];

    if (!returRecord && body.id && (body.parent_invoice || body.parentInvoice)) {
        returRecord = body;
    }

    if (!Array.isArray(transactions)) transactions = [];
    if (!Array.isArray(taxRecords)) taxRecords = [];

    // ============================================================
    // VALIDASI REQUEST RETUR
    // ============================================================
    if (!returRecord || typeof returRecord !== 'object') {
        return res.status(400).json({
            success: false,
            error: 'Data retur tidak valid: returRecord tidak ditemukan',
            receivedKeys: Object.keys(body)
        });
    }

    const returId =
        returRecord.id ||
        returRecord.retur_id ||
        returRecord.returId;

    const parentInvoice =
        returRecord.parent_invoice ||
        returRecord.parentInvoice ||
        returRecord.invoice ||
        returRecord.no_invoice ||
        returRecord.nomor_transaksi;

    const tanggal =
        returRecord.tanggal ||
        returRecord.date ||
        new Date();

    const kasir =
        returRecord.kasir ||
        returRecord.user ||
        returRecord.operator ||
        '';

    const pelanggan =
        returRecord.pelanggan ||
        returRecord.customer ||
        returRecord.nama_pelanggan ||
        '';

    const normalizedItems = Array.isArray(
        returRecord.items ||
        returRecord.retur_items ||
        returRecord.return_items
    ) ? (
        returRecord.items ||
        returRecord.retur_items ||
        returRecord.return_items
    ) : [];

    const normalizedExchangeItems = Array.isArray(
        returRecord.exchange_items ||
        returRecord.exchangeItems ||
        returRecord.tukar_items ||
        returRecord.tukarItems
    ) ? (
        returRecord.exchange_items ||
        returRecord.exchangeItems ||
        returRecord.tukar_items ||
        returRecord.tukarItems
    ) : [];

    if (!returId) {
        return res.status(400).json({
            success: false,
            error: 'Data retur tidak valid: ID retur tidak ditemukan'
        });
    }

    if (!parentInvoice) {
        return res.status(400).json({
            success: false,
            error: 'Data retur tidak valid: nomor invoice tidak ditemukan'
        });
    }

    // ============================================================
    // HITUNG NILAI RETUR/TUKAR DI SERVER
    // Server menjadi sumber kebenaran untuk nilai finansial retur.
    // ============================================================
    const nilaiRetur = normalizedItems.reduce((sum, item) => {
        const subtotal = safeNumber(
            item?.subtotal,
            safeNumber(item?.harga) * safeNumber(item?.qty)
        );
        return sum + subtotal;
    }, 0);

    const nilaiTukar = normalizedExchangeItems.reduce((sum, item) => {
        const subtotal = safeNumber(
            item?.subtotal,
            safeNumber(item?.harga) * safeNumber(item?.qty)
        );
        return sum + subtotal;
    }, 0);

    // Konvensi dipertahankan sama seperti frontend:
    // positif  = REFUND ke pelanggan
    // negatif  = TAMBAH BAYAR dari pelanggan
    // nol      = PERTUKARAN LUNAS
    const selisih = nilaiRetur - nilaiTukar;

    const arahSelisih =
        selisih > 0 ? 'REFUND' :
        selisih < 0 ? 'ADDITIONAL_PAYMENT' :
        'NONE';

    const metodeBayar =
        returRecord.metode_bayar ||
        returRecord.metodeBayar ||
        (returRecord.payment_method || 'Tunai');

    const bankTransfer =
        returRecord.bank_transfer ||
        returRecord.bankTransfer ||
        returRecord.returBank ||
        '';

    const normalizedMethod =
        String(metodeBayar).toLowerCase() === 'transfer'
            ? 'Transfer'
            : 'Tunai';

    if (selisih !== 0 && normalizedMethod === 'Transfer' && !String(bankTransfer).trim()) {
        return res.status(400).json({
            success: false,
            error: 'Bank/rekening wajib dipilih untuk pembayaran selisih transfer'
        });
    }

    const paymentAmount = Math.abs(selisih);
    const cashAmount =
        normalizedMethod === 'Tunai' ? paymentAmount : 0;
    const transferAmount =
        normalizedMethod === 'Transfer' ? paymentAmount : 0;

    // ============================================================
    // DATABASE TRANSACTION
    // Satu RET menjadi induk: record retur + stok + pajak.
    // ============================================================
    let conn;

    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Pastikan invoice asal benar-benar ada.
        const [invoiceRows] = await conn.query(`
            SELECT COUNT(*) AS total
            FROM transactions
            WHERE nomor_transaksi = ?
              AND source = 'Kasir'
              AND jenis = 'KELUAR'
        `, [String(parentInvoice)]);

        if (!invoiceRows[0] || Number(invoiceRows[0].total) === 0) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                error: `Invoice asal ${String(parentInvoice)} tidak ditemukan`
            });
        }

        // Jika RET sudah ada, jangan menggandakan transaksi.
        // ON DUPLICATE KEY UPDATE tetap dipertahankan untuk kompatibilitas
        // proses edit/retry yang sudah ada.
        await conn.query(`
            INSERT INTO retur_records
            (
                id,
                parent_invoice,
                tanggal,
                kasir,
                pelanggan,
                items,
                exchange_items,
                metode_bayar,
                bank_transfer,
                nilai_retur,
                nilai_tukar,
                selisih,
                arah_selisih,
                cash_amount,
                transfer_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                parent_invoice = VALUES(parent_invoice),
                tanggal = VALUES(tanggal),
                kasir = VALUES(kasir),
                pelanggan = VALUES(pelanggan),
                items = VALUES(items),
                exchange_items = VALUES(exchange_items),
                metode_bayar = VALUES(metode_bayar),
                bank_transfer = VALUES(bank_transfer),
                nilai_retur = VALUES(nilai_retur),
                nilai_tukar = VALUES(nilai_tukar),
                selisih = VALUES(selisih),
                arah_selisih = VALUES(arah_selisih),
                cash_amount = VALUES(cash_amount),
                transfer_amount = VALUES(transfer_amount)
        `, [
            String(returId),
            String(parentInvoice),
            safeDate(tanggal),
            String(kasir),
            String(pelanggan),
            JSON.stringify(normalizedItems),
            JSON.stringify(normalizedExchangeItems),
            normalizedMethod,
            String(bankTransfer),
            nilaiRetur,
            nilaiTukar,
            selisih,
            arahSelisih,
            cashAmount,
            transferAmount
        ]);

        // ========================================================
        // SIMPAN TRANSAKSI STOK RETUR/TUKAR
        // ========================================================
        if (transactions.length > 0) {
            const values = transactions
                .filter(t => t && t.id != null)
                .map(t => [
                    safeInteger(t.id),
                    t.nomor_transaksi || t.nomorTransaksi || String(returId),
                    safeDate(t.tanggal || tanggal),
                    safeInteger(t.sparepart_id ?? t.sparepartId),
                    t.custom_item || t.customItem || null,
                    t.part_numbers_alt || t.partNumbersAlt || '',
                    t.merek || '',
                    t.jenis || 'KELUAR',
                    safeNumber(t.jumlah),
                    t.satuan || 'Pcs',
                    safeNumber(t.jumlah_dasar ?? t.jumlahDasar),
                    safeNumber(t.harga_satuan ?? t.hargaSatuan),
                    t.tujuan || pelanggan || '',
                    t.keterangan || '',
                    t.source || 'Retur',
                    t.kasir || kasir || '',
                    t.status_bayar || 'Lunas',
                    t.metode_bayar || (t.jenis === 'MASUK' ? 'Retur' : 'Tukar'),
                    safeNumber(t.bayar_tunai),
                    safeNumber(t.transfer_amount),
                    safeNumber(t.kembalian_diberikan),
                    safeNumber(t.diskon),
                    t.tanggal_lunas ? safeDate(t.tanggal_lunas) : null,
                    t.parent_invoice || t.parentInvoice || parentInvoice || null,
                    t.shift_id || t.shiftId || returRecord.shift_id || null
                ]);

            if (values.length > 0) {
                await conn.query(`
                    INSERT IGNORE INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas,
                        parent_invoice,
                        shift_id
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ========================================================
        // SIMPAN TAX RECORD
        // ========================================================
        if (taxRecords.length > 0) {
            const values = taxRecords
                .filter(t => t && t.tax_id != null)
                .map(t => [
                    String(t.tax_id),
                    safeInteger(t.trx_id ?? t.trxId, 0),
                    safeDate(t.tanggal || tanggal),
                    t.nomor_transaksi || t.nomorTransaksi || String(returId),
                    t.part_number || t.partNumber || '',
                    t.nama || '',
                    t.kategori || '',
                    t.merek || '',
                    t.status_bayar || t.statusBayar || 'Lunas',
                    t.pelanggan || t.customer || pelanggan || '',
                    safeNumber(t.jumlah),
                    t.satuan || 'Pcs',
                    safeNumber(t.harga_satuan ?? t.hargaSatuan),
                    safeNumber(t.subtotal),
                    safeNumber(t.persentase_pajak ?? t.persentasePajak),
                    safeNumber(t.nilai_pajak ?? t.nilaiPajak)
                ]);

            if (values.length > 0) {
                await conn.query(`
                    INSERT IGNORE INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ========================================================
        // VERIFIKASI
        // ========================================================
        const [verify] = await conn.query(`
            SELECT
                id,
                parent_invoice,
                tanggal,
                metode_bayar,
                bank_transfer,
                nilai_retur,
                nilai_tukar,
                selisih,
                arah_selisih,
                cash_amount,
                transfer_amount
            FROM retur_records
            WHERE id = ?
            LIMIT 1
        `, [String(returId)]);

        if (verify.length === 0) {
            await conn.rollback();
            return res.status(500).json({
                success: false,
                error: 'Verifikasi gagal: data retur tidak tersimpan di database'
            });
        }

        await conn.commit();
        invalidateDataCache();

        const saved = verify[0];

        console.log(
            '[RETUR] Berhasil disimpan:',
            String(returId),
            'Invoice:', String(parentInvoice),
            'Retur:', nilaiRetur,
            'Tukar:', nilaiTukar,
            'Selisih:', selisih,
            'Arah:', arahSelisih,
            'Metode:', normalizedMethod,
            'Bank:', bankTransfer || '-'
        );

        return res.json({
            success: true,
            message: 'Retur berhasil disimpan ke server',
            returId: String(returId),
            parentInvoice: String(parentInvoice),
            financial: {
                nilaiRetur,
                nilaiTukar,
                selisih,
                arahSelisih,
                metodeBayar: normalizedMethod,
                bankTransfer: String(bankTransfer),
                cashAmount,
                transferAmount
            },
            saved: {
                id: String(saved.id),
                parent_invoice: String(saved.parent_invoice),
                metode_bayar: saved.metode_bayar,
                bank_transfer: saved.bank_transfer,
                nilai_retur: safeNumber(saved.nilai_retur),
                nilai_tukar: safeNumber(saved.nilai_tukar),
                selisih: safeNumber(saved.selisih),
                arah_selisih: saved.arah_selisih,
                cash_amount: safeNumber(saved.cash_amount),
                transfer_amount: safeNumber(saved.transfer_amount)
            }
        });

    } catch (error) {
        if (conn) {
            try { await conn.rollback(); } catch (rollbackError) {
                console.error('[RETUR] Rollback error:', rollbackError);
            }
        }

        console.error('[RETUR] ERROR:', error);

        return res.status(500).json({
            success: false,
            error: 'Gagal menyimpan retur: ' + error.message
        });
    } finally {
        if (conn) conn.release();
    }
});

// ============================================================
// 7. HAPUS INVOICE
// ============================================================

app.post('/api/transaction/delete-invoice', async (req, res) => {

    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === ''
    ) {

        return res.status(400).json({
            success: false,
            error: 'Nomor invoice tidak valid'
        });
    }

    try {

        const [returs] =
            await pool.query(`
                SELECT id
                FROM retur_records
                WHERE parent_invoice = ?
            `, [String(trxId)]);

        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [String(trxId)]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [String(trxId)]);

        if (returs.length > 0) {

            for (const r of returs) {

                await pool.query(`
                    DELETE FROM transactions
                    WHERE nomor_transaksi = ?
                `, [String(r.id)]);

                await pool.query(`
                    DELETE FROM tax_records
                    WHERE nomor_transaksi = ?
                `, [String(r.id)]);
            }
        }

        await pool.query(`
            DELETE FROM retur_records
            WHERE parent_invoice = ?
        `, [String(trxId)]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Invoice & retur berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus invoice:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 8. HAPUS RETUR
// ============================================================

app.post('/api/transaction/delete-retur', async (req, res) => {

    const returId =
        req.body?.returId;

    if (
        returId === undefined ||
        returId === null ||
        String(returId).trim() === ''
    ) {

        return res.status(400).json({
            success: false,
            error: 'ID retur tidak valid'
        });
    }

    try {

        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [String(returId)]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [String(returId)]);

        await pool.query(`
            DELETE FROM retur_records
            WHERE id = ?
        `, [String(returId)]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Retur berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus retur:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 9. HAPUS TRANSAKSI
// ============================================================

app.post('/api/transaction/delete', async (req, res) => {

    const cleanId =
        safeInteger(req.body?.id);

    if (cleanId === null) {

        return res.status(400).json({
            success: false,
            error: 'ID transaksi tidak valid'
        });
    }

    try {

        await pool.query(`
            DELETE FROM transactions
            WHERE id = ?
        `, [cleanId]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE trx_id = ?
        `, [cleanId]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Transaksi berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus transaksi:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 10. EDIT STRUK
// ============================================================

app.put('/api/transaction/edit-struk', async (req, res) => {

    const invoice =
        req.body?.invoice;

    const items =
        Array.isArray(req.body?.items)
            ? req.body.items
            : [];

    const diskon =
        req.body?.diskon;

    if (
        invoice === undefined ||
        invoice === null ||
        String(invoice).trim() === ''
    ) {

        return res.status(400).json({
            success: false,
            error: 'Invoice tidak valid'
        });
    }

    const conn =
        await pool.getConnection();

    try {

        await conn.beginTransaction();

        // ----------------------------------------------------
        // Ambil ID asli dari database
        // ----------------------------------------------------

        const [trxRows] =
            await conn.query(`
                SELECT
                    id,
                    nomor_transaksi
                FROM transactions
                WHERE nomor_transaksi = ?
                ORDER BY id ASC
            `, [
                String(invoice)
            ]);

        if (trxRows.length === 0) {

            await conn.rollback();

            return res.status(404).json({
                success: false,
                error:
                    'Invoice tidak ditemukan di database'
            });
        }

        // ----------------------------------------------------
        // Update berdasarkan index database
        // ----------------------------------------------------

        for (
            let i = 0;
            i < trxRows.length;
            i++
        ) {

            if (
                i >= items.length
            ) {
                continue;
            }

            const dbId =
                safeInteger(
                    trxRows[i].id
                );

            if (dbId === null) {
                continue;
            }

            const newHarga =
                safeNumber(
                    items[i]?.harga_satuan,
                    0
                );

            // ------------------------------------------------
            // Update transaksi
            // ------------------------------------------------

            await conn.query(`
                UPDATE transactions
                SET harga_satuan = ?
                WHERE id = ?
            `, [
                newHarga,
                dbId
            ]);

            // ------------------------------------------------
            // Update pajak
            // ------------------------------------------------

            const [taxRows] =
                await conn.query(`
                    SELECT
                        tax_id,
                        jumlah,
                        persentase_pajak
                    FROM tax_records
                    WHERE trx_id = ?
                `, [
                    dbId
                ]);

            for (
                const tax of taxRows
            ) {

                const jumlah =
                    safeNumber(
                        tax.jumlah
                    );

                const persen =
                    safeNumber(
                        tax.persentase_pajak
                    );

                const newSubtotal =
                    newHarga * jumlah;

                const newNilaiPajak =
                    (
                        newSubtotal *
                        persen
                    ) / 100;

                await conn.query(`
                    UPDATE tax_records
                    SET
                        harga_satuan = ?,
                        subtotal = ?,
                        nilai_pajak = ?
                    WHERE tax_id = ?
                `, [
                    newHarga,
                    newSubtotal,
                    newNilaiPajak,
                    String(tax.tax_id)
                ]);
            }
        }

        // ----------------------------------------------------
        // Update diskon
        // ----------------------------------------------------

        if (
            diskon !== undefined &&
            diskon !== null &&
            trxRows.length > 0
        ) {

            const firstId =
                safeInteger(
                    trxRows[0].id
                );

            if (firstId !== null) {

                await conn.query(`
                    UPDATE transactions
                    SET diskon = ?
                    WHERE id = ?
                `, [
                    safeNumber(diskon),
                    firstId
                ]);
            }
        }

        await conn.commit();

        invalidateDataCache();

        console.log(
            '[EDIT STRUK] SUCCESS:',
            invoice
        );

        res.json({
            success: true,
            message:
                'Struk berhasil diedit',
            invoice:
                String(invoice)
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            '[EDIT STRUK] ERROR:',
            error
        );

        res.status(500).json({
            success: false,
            error:
                'Gagal menyimpan edit struk: ' +
                error.message
        });

    } finally {

        conn.release();
    }
});

// ============================================================
// 11. PAYOFF / PELUNASAN BON
// ============================================================

app.put('/api/transactions/payoff', async (req, res) => {

    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === ''
    ) {

        return res.status(400).json({
            success: false,
            error: 'Nomor invoice tidak valid'
        });
    }

    const conn =
        await pool.getConnection();

    try {

        await conn.beginTransaction();

        const [trxRows] =
            await conn.query(`
                SELECT *
                FROM transactions
                WHERE nomor_transaksi = ?
            `, [
                String(trxId)
            ]);

        if (trxRows.length === 0) {

            await conn.rollback();

            return res.status(404).json({
                success: false,
                error:
                    'Invoice tidak ditemukan'
            });
        }

        const isAlreadyLunas =
            trxRows.every(
                t =>
                    t.status_bayar === 'Lunas'
            );

        if (isAlreadyLunas) {

            await conn.rollback();

            return res.status(400).json({
                success: false,
                error:
                    'Invoice sudah lunas'
            });
        }

        const total =
            trxRows.reduce(
                (sum, t) =>
                    sum +
                    (
                        safeNumber(
                            t.harga_satuan
                        ) *
                        safeNumber(
                            t.jumlah
                        )
                    ),
                0
            )
            -
            safeNumber(
                trxRows[0].diskon
            );

        await conn.query(`
            UPDATE transactions
            SET
                status_bayar = 'Lunas',
                keterangan = 'Bon (Lunas)',
                tanggal_lunas = NOW()
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await conn.query(`
            UPDATE tax_records
            SET status_bayar = 'Lunas'
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await conn.query(`
            INSERT INTO cash_inflows
            (
                id,
                tanggal,
                jumlah,
                keterangan,
                kasir,
                shift_id,
                bukti
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            Date.now(),
            new Date(),
            total,
            'Pelunasan Bon: ' +
                String(trxId),
            trxRows[0].kasir ||
                'Admin',
            trxRows[0].shift_id || null,
            'PELUNASAN-BON-' + String(trxId)
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Piutang berhasil dilunasi',
            total
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            'Error payoff:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {

        conn.release();
    }
});

// ============================================================
// 12. EDIT TRANSAKSI MANUAL
// ============================================================

app.put('/api/transaction/:id', async (req, res) => {

    const transactionId =
        safeInteger(req.params.id);

    if (
        transactionId === null ||
        transactionId <= 0
    ) {

        return res.status(400).json({
            success: false,
            error:
                'ID transaksi tidak valid'
        });
    }

    const updatedData =
        req.body || {};

    try {

        await pool.query(`
            UPDATE transactions
            SET
                sparepart_id = ?,
                custom_item = ?,
                jenis = ?,
                jumlah = ?,
                satuan = ?,
                jumlah_dasar = ?,
                tujuan = ?,
                keterangan = ?
            WHERE id = ?
        `, [

            safeInteger(
                updatedData.sparepart_id
            ),

            updatedData.custom_item ||
                null,

            safeString(
                updatedData.jenis
            ),

            safeNumber(
                updatedData.jumlah
            ),

            safeString(
                updatedData.satuan
            ),

            safeNumber(
                updatedData.jumlah_dasar
            ),

            safeString(
                updatedData.tujuan
            ),

            safeString(
                updatedData.keterangan
            ),

            transactionId
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Transaksi berhasil diupdate'
        });

    } catch (error) {

        console.error(
            'Error edit transaksi:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 13. HAPUS KAS KELUAR
// ============================================================

app.post('/api/cash-expense/delete', async (req, res) => {

    const id =
        safeInteger(
            req.body?.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: 'ID kas tidak valid'
        });
    }

    try {

        await pool.query(`
            DELETE FROM cash_expenses
            WHERE id = ?
        `, [id]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Pengeluaran kas berhasil dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus cash expense:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 14. HAPUS KAS MASUK
// ============================================================

app.post('/api/cash-inflow/delete', async (req, res) => {

    const id =
        safeInteger(
            req.body?.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: 'ID kas tidak valid'
        });
    }

    try {

        await pool.query(`
            DELETE FROM cash_inflows
            WHERE id = ?
        `, [id]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Tambahan kas berhasil dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus cash inflow:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 15. PARTNER
// ============================================================

app.post('/api/partner', async (req, res) => {

    try {

        await pool.query(
            'INSERT INTO partners SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner disimpan'
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/partner/:id', async (req, res) => {

    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error:
                'ID partner tidak valid'
        });
    }

    try {

        await pool.query(
            'UPDATE partners SET ? WHERE id = ?',
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner diupdate'
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/partner/:id', async (req, res) => {

    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error:
                'ID partner tidak valid'
        });
    }

    try {

        await pool.query(
            'DELETE FROM partners WHERE id = ?',
            [id]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner dihapus'
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 16. SETTINGS
// ============================================================

app.put('/api/settings', async (req, res) => {

    const {
        kasAwal,
        activeShiftStart,
        masterPajak,
        users,
        shiftSessions,
        cashExpenses,
        cashInflows
    } = req.body || {};

    try {

        await pool.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?,
                shift_sessions = ?
            WHERE id = 1
        `, [

            safeNumber(
                kasAwal
            ),

            activeShiftStart ||
                Date.now(),

            JSON.stringify(
                Array.isArray(masterPajak)
                    ? masterPajak
                    : []
            ),

            JSON.stringify(
                Array.isArray(users)
                    ? users
                    : []
            ),

            JSON.stringify(
                Array.isArray(shiftSessions)
                    ? shiftSessions
                    : []
            )
        ]);

        // ----------------------------------------------------
        // CASH EXPENSES
        // ----------------------------------------------------

        if (
            Array.isArray(cashExpenses) &&
            cashExpenses.length > 0
        ) {

            const values =
                cashExpenses
                    .filter(
                        e =>
                            safeInteger(e.id) !== null
                    )
                    .map(e => [
                        safeInteger(e.id),
                        safeDate(e.tanggal),
                        safeNumber(e.jumlah),
                        safeString(e.keterangan),
                        safeString(e.kasir),
                        safeString(e.shift_id || e.shiftId),
                        safeString(e.bukti || e.reference || e.no_bukti)
                    ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        tanggal = VALUES(tanggal),
                        jumlah = VALUES(jumlah),
                        keterangan = VALUES(keterangan),
                        kasir = VALUES(kasir),
                        shift_id = VALUES(shift_id),
                        bukti = VALUES(bukti)
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(cashInflows) &&
            cashInflows.length > 0
        ) {

            const values =
                cashInflows
                    .filter(
                        i =>
                            safeInteger(i.id) !== null
                    )
                    .map(i => [
                        safeInteger(i.id),
                        safeDate(i.tanggal),
                        safeNumber(i.jumlah),
                        safeString(i.keterangan),
                        safeString(i.kasir),
                        safeString(i.shift_id || i.shiftId),
                        safeString(i.bukti || i.reference || i.no_bukti)
                    ]);

            if (values.length > 0) {

                await pool.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        tanggal = VALUES(tanggal),
                        jumlah = VALUES(jumlah),
                        keterangan = VALUES(keterangan),
                        kasir = VALUES(kasir),
                        shift_id = VALUES(shift_id),
                        bukti = VALUES(bukti)
                `, [values]);
            }
        }

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Settings berhasil disimpan'
        });

    } catch (error) {

        console.error(
            'Error settings:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 17. RESTORE DATA
// ============================================================
// CATATAN:
// Endpoint ini TIDAK dipanggil otomatis.
// Data hanya dihapus jika frontend benar-benar
// memanggil POST /api/restore.
// ============================================================

app.post('/api/restore', async (req, res) => {

    const data =
        req.body || {};

    const conn =
        await pool.getConnection();

    try {

        await conn.beginTransaction();

        // ----------------------------------------------------
        // HAPUS DATA LAMA
        // ----------------------------------------------------

        await conn.query(
            'DELETE FROM spareparts'
        );

        await conn.query(
            'DELETE FROM transactions'
        );

        await conn.query(
            'DELETE FROM partners'
        );

        await conn.query(
            'DELETE FROM cash_expenses'
        );

        await conn.query(
            'DELETE FROM cash_inflows'
        );

        await conn.query(
            'DELETE FROM tax_records'
        );

        await conn.query(
            'DELETE FROM retur_records'
        );

        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(data.spareparts) &&
            data.spareparts.length > 0
        ) {

            const values =
                data.spareparts
                    .filter(
                        sp =>
                            safeInteger(sp.id) !== null
                    )
                    .map(sp => [
                        safeInteger(sp.id),
                        safeString(sp.kode),
                        safeString(sp.part_number),
                        safeString(sp.part_numbers_alt),
                        safeString(sp.nama),
                        safeString(sp.kategori, 'Umum'),
                        safeString(sp.merek),
                        safeString(sp.satuan, 'Pcs'),
                        safeNumber(sp.stok_min),
                        safeNumber(sp.stok_awal),
                        safeNumber(sp.harga_beli),
                        safeNumber(sp.harga_jual),
                        safeString(sp.satuan_alt),
                        safeNumber(sp.isi_satuan_alt),
                        safeNumber(sp.harga_jual_alt),
                        safeString(sp.pajak_status, 'Non Pajak'),
                        safeString(sp.kode_pajak),
                        safeString(sp.keterangan)
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {

                await conn.query(`
                    INSERT INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(data.transactions) &&
            data.transactions.length > 0
        ) {

            const values =
                data.transactions
                    .filter(
                        t =>
                            safeInteger(t.id) !== null
                    )
                    .map(t => [

                        safeInteger(t.id),

                        safeString(
                            t.nomor_transaksi
                        ),

                        safeDate(
                            t.tanggal
                        ),

                        safeInteger(
                            t.sparepart_id
                        ),

                        t.custom_item || null,

                        safeString(
                            t.part_numbers_alt
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.jenis
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan
                        ),

                        safeNumber(
                            t.jumlah_dasar
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeString(
                            t.tujuan
                        ),

                        safeString(
                            t.keterangan
                        ),

                        safeString(
                            t.source
                        ),

                        safeString(
                            t.kasir
                        ),

                        safeString(
                            t.status_bayar
                        ),

                        safeString(
                            t.metode_bayar
                        ),

                        safeNumber(
                            t.bayar_tunai
                        ),

                        safeNumber(
                            t.transfer_amount
                        ),

                        safeNumber(
                            t.kembalian_diberikan
                        ),

                        safeNumber(
                            t.diskon
                        ),

                        t.tanggal_lunas
                            ? safeDate(
                                t.tanggal_lunas
                            )
                            : null,

                        t.parent_invoice || t.parentInvoice || null,
                        t.shift_id || t.shiftId || null
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {

                await conn.query(`
                    INSERT INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas,
                        parent_invoice,
                        shift_id
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // PARTNERS
        // ----------------------------------------------------

        if (
            Array.isArray(data.partners) &&
            data.partners.length > 0
        ) {

            const values =
                data.partners
                    .filter(
                        p =>
                            safeInteger(p.id) !== null
                    )
                    .map(p => [
                        safeInteger(p.id),
                        safeString(p.nama),
                        safeString(p.tipe),
                        safeString(p.telp),
                        safeString(p.alamat)
                    ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO partners
                    (
                        id,
                        nama,
                        tipe,
                        telp,
                        alamat
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH EXPENSES
        // ----------------------------------------------------

        if (
            Array.isArray(data.cashExpenses) &&
            data.cashExpenses.length > 0
        ) {

            const values =
                data.cashExpenses
                    .filter(
                        e =>
                            safeInteger(e.id) !== null
                    )
                    .map(e => [
                        safeInteger(e.id),
                        safeDate(e.tanggal),
                        safeNumber(e.jumlah),
                        safeString(e.keterangan),
                        safeString(e.kasir),
                        safeString(e.shift_id || e.shiftId),
                        safeString(e.bukti || e.reference || e.no_bukti)
                    ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(data.cashInflows) &&
            data.cashInflows.length > 0
        ) {

            const values =
                data.cashInflows
                    .filter(
                        i =>
                            safeInteger(i.id) !== null
                    )
                    .map(i => [
                        safeInteger(i.id),
                        safeDate(i.tanggal),
                        safeNumber(i.jumlah),
                        safeString(i.keterangan),
                        safeString(i.kasir),
                        safeString(i.shift_id || i.shiftId),
                        safeString(i.bukti || i.reference || i.no_bukti)
                    ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir,
                        shift_id,
                        bukti
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(data.taxRecords) &&
            data.taxRecords.length > 0
        ) {

            const values =
                data.taxRecords
                    .filter(
                        t =>
                            t &&
                            t.tax_id
                    )
                    .map(t => [

                        safeString(
                            t.tax_id
                        ),

                        safeInteger(
                            t.trx_id,
                            0
                        ),

                        safeDate(
                            t.tanggal
                        ),

                        safeString(
                            t.nomor_transaksi
                        ),

                        safeString(
                            t.part_number
                        ),

                        safeString(
                            t.nama
                        ),

                        safeString(
                            t.kategori
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.status_bayar
                        ),

                        safeString(
                            t.pelanggan
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeNumber(
                            t.subtotal
                        ),

                        safeNumber(
                            t.persentase_pajak
                        ),

                        safeNumber(
                            t.nilai_pajak
                        )
                    ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // RETUR RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(data.returRecords) &&
            data.returRecords.length > 0
        ) {

            const values =
                data.returRecords
                    .filter(
                        r =>
                            r &&
                            r.id !== undefined &&
                            r.id !== null &&
                            String(r.id).trim() !== ''
                    )
                    .map(r => [

                        String(r.id),

                        safeString(
                            r.parent_invoice
                        ),

                        safeDate(
                            r.tanggal
                        ),

                        safeString(
                            r.kasir
                        ),

                        safeString(
                            r.pelanggan
                        ),

                        JSON.stringify(
                            Array.isArray(r.items)
                                ? r.items
                                : []
                        ),

                        JSON.stringify(
                            Array.isArray(
                                r.exchange_items
                            )
                                ? r.exchange_items
                                : []
                        ),
                        safeString(r.metode_bayar, 'Tunai'),
                        safeString(r.bank_transfer),
                        safeNumber(r.nilai_retur),
                        safeNumber(r.nilai_tukar),
                        safeNumber(r.selisih),
                        safeString(r.arah_selisih, 'NONE'),
                        safeNumber(r.cash_amount),
                        safeNumber(r.transfer_amount)
                    ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO retur_records
                    (
                        id,
                        parent_invoice,
                        tanggal,
                        kasir,
                        pelanggan,
                        items,
                        exchange_items,
                        metode_bayar,
                        bank_transfer,
                        nilai_retur,
                        nilai_tukar,
                        selisih,
                        arah_selisih,
                        cash_amount,
                        transfer_amount
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        await conn.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?
            WHERE id = 1
        `, [

            safeNumber(
                data.kasAwal
            ),

            data.activeShiftStart ||
                Date.now(),

            JSON.stringify(
                Array.isArray(
                    data.masterPajak
                )
                    ? data.masterPajak
                    : []
            ),

            JSON.stringify(
                Array.isArray(
                    data.users
                )
                    ? data.users
                    : []
            )
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Restore data berhasil!'
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            'Error restore:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {

        conn.release();
    }
});

// ============================================================
// SERVER
// ============================================================

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {
        console.log(
            `Server berjalan di port ${PORT}`
        );
    }
);
