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
        message: 'Server baru berhasil di-deploy!'
    });
});

// ============================================================
// DATABASE CLEVER CLOUD
// ============================================================
// Password jangan ditulis langsung di server.js.
// Set environment variable:
// DB_PASSWORD=PASSWORD_DATABASE_ANDA
// ============================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: process.env.DB_USER || 'uks2krvuygsynrco',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'b7fgoctdsrijlfhczppz',
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0
});

// ============================================================
// ERROR HANDLERS
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

app.use((req, res, next) => {
    if (req.method !== 'GET') {
        invalidateDataCache();
    }

    next();
});

// ============================================================
// 1. INISIALISASI TABEL
// ============================================================
app.get('/api/init', async (req, res) => {
    try {

        // --------------------------------------------------------
        // SPAREPARTS
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // TRANSACTIONS
        // --------------------------------------------------------
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
                tanggal_lunas DATETIME NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // --------------------------------------------------------
        // PARTNERS
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // CASH EXPENSES
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_expenses (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // --------------------------------------------------------
        // CASH INFLOWS
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_inflows (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // --------------------------------------------------------
        // TAX RECORDS
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // RETUR RECORDS
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS retur_records (
                id VARCHAR(50) PRIMARY KEY,
                parent_invoice VARCHAR(50),
                tanggal DATETIME,
                kasir VARCHAR(100),
                pelanggan VARCHAR(255),
                items JSON,
                exchange_items JSON
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // Jika tabel lama belum mempunyai exchange_items
        try {
            await pool.query(`
                ALTER TABLE retur_records
                ADD COLUMN exchange_items JSON
            `);
        } catch (e) {
            // Kolom sudah ada, abaikan
        }

        // --------------------------------------------------------
        // APP SETTINGS
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INT PRIMARY KEY DEFAULT 1,
                kas_awal BIGINT DEFAULT 0,
                active_shift_start BIGINT,
                master_pajak JSON,
                users JSON
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // --------------------------------------------------------
        // DEFAULT SETTINGS
        // --------------------------------------------------------
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
            message: 'Database & Tabel siap!'
        });

    } catch (error) {
        console.error('INIT ERROR:', error);

        res.status(500).json({
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

        // --------------------------------------------------------
        // SPAREPARTS
        // --------------------------------------------------------
        if (Array.isArray(oldData.spareparts) && oldData.spareparts.length > 0) {

            const validItems = oldData.spareparts.filter(
                sp => sp && sp.id !== undefined && sp.id !== null
            );

            const values = validItems.map(sp => [
                sp.id,
                sp.kode || '',
                sp.part_number || '',
                sp.part_numbers_alt || '',
                sp.nama || '',
                sp.kategori || 'Umum',
                sp.merek || '',
                sp.satuan || 'Pcs',
                sp.stok_min || 0,
                sp.stok_awal || 0,
                sp.harga_beli || 0,
                sp.harga_jual || 0,
                sp.satuan_alt || '',
                sp.isi_satuan_alt || 0,
                sp.harga_jual_alt || 0,
                sp.pajak_status || 'Non Pajak',
                sp.kode_pajak || '',
                sp.keterangan || ''
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

        // --------------------------------------------------------
        // TRANSACTIONS
        // --------------------------------------------------------
        if (Array.isArray(oldData.transactions) && oldData.transactions.length > 0) {

            const validItems = oldData.transactions.filter(
                t =>
                    t &&
                    t.id !== undefined &&
                    t.id !== null &&
                    !isNaN(Number(t.id))
            );

            const values = validItems.map(t => [
                parseInt(t.id),
                t.nomor_transaksi || '',
                t.tanggal || new Date(),
                t.sparepart_id || null,
                t.custom_item || null,
                t.part_numbers_alt || '',
                t.merek || '',
                t.jenis || '',
                Number(t.jumlah) || 0,
                t.satuan || 'Pcs',
                Number(t.jumlah_dasar) || 0,
                Number(t.harga_satuan) || 0,
                t.tujuan || '',
                t.keterangan || '',
                t.source || '',
                t.kasir || '',
                t.status_bayar || '',
                t.metode_bayar || '',
                Number(t.bayar_tunai) || 0,
                Number(t.transfer_amount) || 0,
                Number(t.kembalian_diberikan) || 0,
                Number(t.diskon) || 0,
                t.tanggal_lunas || null
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
                        tanggal_lunas
                    )
                    VALUES ?
                `, [
                    values.slice(i, i + 500)
                ]);
            }
        }

        // --------------------------------------------------------
        // PARTNERS
        // --------------------------------------------------------
        if (Array.isArray(oldData.partners) && oldData.partners.length > 0) {

            const validItems = oldData.partners.filter(
                p => p && p.id !== undefined && p.id !== null
            );

            const values = validItems.map(p => [
                p.id,
                p.nama || '',
                p.tipe || '',
                p.telp || '',
                p.alamat || ''
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

        // --------------------------------------------------------
        // CASH EXPENSES
        // --------------------------------------------------------
        if (Array.isArray(oldData.cashExpenses) && oldData.cashExpenses.length > 0) {

            const validItems = oldData.cashExpenses.filter(
                e => e && e.id !== undefined && e.id !== null
            );

            const values = validItems.map(e => [
                e.id,
                e.tanggal || new Date(),
                Number(e.jumlah) || 0,
                e.keterangan || '',
                e.kasir || ''
            ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // --------------------------------------------------------
        // CASH INFLOWS
        // --------------------------------------------------------
        if (Array.isArray(oldData.cashInflows) && oldData.cashInflows.length > 0) {

            const validItems = oldData.cashInflows.filter(
                i => i && i.id !== undefined && i.id !== null
            );

            const values = validItems.map(i => [
                i.id,
                i.tanggal || new Date(),
                Number(i.jumlah) || 0,
                i.keterangan || '',
                i.kasir || ''
            ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // --------------------------------------------------------
        // TAX RECORDS
        // --------------------------------------------------------
        if (Array.isArray(oldData.taxRecords) && oldData.taxRecords.length > 0) {

            const validItems = oldData.taxRecords.filter(
                t =>
                    t &&
                    t.tax_id &&
                    t.trx_id !== undefined &&
                    t.trx_id !== null &&
                    !isNaN(Number(t.trx_id))
            );

            const values = validItems.map(t => [
                t.tax_id,
                parseInt(t.trx_id),
                t.tanggal || new Date(),
                t.nomor_transaksi || '',
                t.part_number || '',
                t.nama || '',
                t.kategori || '',
                t.merek || '',
                t.status_bayar || '',
                t.pelanggan || '',
                Number(t.jumlah) || 0,
                t.satuan || 'Pcs',
                Number(t.harga_satuan) || 0,
                Number(t.subtotal) || 0,
                Number(t.persentase_pajak) || 0,
                Number(t.nilai_pajak) || 0
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

        // --------------------------------------------------------
        // SETTINGS
        // --------------------------------------------------------
        if (
            oldData.kasAwal !== undefined ||
            oldData.users !== undefined ||
            oldData.masterPajak !== undefined
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
                oldData.kasAwal || 0,
                oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []),
                JSON.stringify(oldData.users || [])
            ]);
        }

        // --------------------------------------------------------
        // RETUR RECORDS
        // --------------------------------------------------------
        if (Array.isArray(oldData.returRecords) && oldData.returRecords.length > 0) {

            const validReturs = oldData.returRecords.filter(
                r =>
                    r &&
                    r.id !== undefined &&
                    r.id !== null &&
                    String(r.id).trim() !== ''
            );

            const values = validReturs.map(r => [
                String(r.id),
                r.parent_invoice || '',
                r.tanggal ? new Date(r.tanggal) : new Date(),
                r.kasir || '',
                r.pelanggan || '',
                JSON.stringify(Array.isArray(r.items) ? r.items : []),
                JSON.stringify(
                    Array.isArray(r.exchange_items)
                        ? r.exchange_items
                        : []
                )
            ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT INTO retur_records
                    (
                        id,
                        parent_invoice,
                        tanggal,
                        kasir,
                        pelanggan,
                        items,
                        exchange_items
                    )
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        parent_invoice = VALUES(parent_invoice),
                        tanggal = VALUES(tanggal),
                        kasir = VALUES(kasir),
                        pelanggan = VALUES(pelanggan),
                        items = VALUES(items),
                        exchange_items = VALUES(exchange_items)
                `, [values]);
            }
        }

        invalidateDataCache();

        res.json({
            message: 'Migrasi data lama berhasil!'
        });

    } catch (error) {
        console.error('MIGRATE ERROR:', error);

        res.status(500).json({
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

            returs = [];
        }

        const [settings] = await connection.query(`
            SELECT *
            FROM app_settings
            WHERE id = 1
        `);

        // --------------------------------------------------------
        // DATE CONVERSION
        // --------------------------------------------------------
        transactions.forEach(t => {

            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }

            if (t.tanggal_lunas instanceof Date) {
                t.tanggal_lunas = t.tanggal_lunas.toISOString();
            }

        });

        cashExpenses.forEach(e => {

            if (e.tanggal instanceof Date) {
                e.tanggal = e.tanggal.toISOString();
            }

        });

        cashInflows.forEach(i => {

            if (i.tanggal instanceof Date) {
                i.tanggal = i.tanggal.toISOString();
            }

        });

        taxRecords.forEach(t => {

            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }

        });

        // --------------------------------------------------------
        // RETUR CONVERSION
        // --------------------------------------------------------
        let returRecords = [];

        if (Array.isArray(returs) && returs.length > 0) {

            returRecords = returs
                .filter(r => r)
                .map(r => {

                    let parsedItems = r.items;

                    if (typeof parsedItems === 'string') {

                        try {
                            parsedItems = JSON.parse(parsedItems);
                        } catch (e) {
                            parsedItems = [];
                        }

                    }

                    if (!Array.isArray(parsedItems)) {
                        parsedItems = [];
                    }

                    r.items = parsedItems;

                    let parsedExchangeItems = r.exchange_items;

                    if (typeof parsedExchangeItems === 'string') {

                        try {
                            parsedExchangeItems =
                                JSON.parse(parsedExchangeItems);
                        } catch (e) {
                            parsedExchangeItems = [];
                        }

                    }

                    if (!Array.isArray(parsedExchangeItems)) {
                        parsedExchangeItems = [];
                    }

                    r.exchange_items = parsedExchangeItems;

                    if (r.tanggal) {

                        try {
                            r.tanggal =
                                new Date(r.tanggal).toISOString();
                        } catch (e) {
                            r.tanggal =
                                new Date().toISOString();
                        }

                    }

                    return r;
                });

        }

        // --------------------------------------------------------
        // MASTER PAJAK
        // --------------------------------------------------------
        let masterPajak =
            settings[0]?.master_pajak || [];

        if (typeof masterPajak === 'string') {

            try {
                masterPajak = JSON.parse(masterPajak);
            } catch (e) {
                masterPajak = [];
            }

        }

        // --------------------------------------------------------
        // USERS
        // --------------------------------------------------------
        let users =
            settings[0]?.users || [];

        if (typeof users === 'string') {

            try {
                users = JSON.parse(users);
            } catch (e) {
                users = [];
            }

        }

        // --------------------------------------------------------
        // RESULT
        // --------------------------------------------------------
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
            users
        };

        dataCache = result;
        dataCacheTime = Date.now();

        res.json(result);

    } catch (error) {

        console.error(
            'Error GET DATA:',
            error
        );

        if (dataCache) {

            console.log(
                'Mengembalikan data cache karena error database'
            );

            return res.json(dataCache);
        }

        res.status(500).json({
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

    const sp = req.body;

    try {

        await pool.query(
            'INSERT INTO spareparts SET ?',
            sp
        );

        invalidateDataCache();

        res.json({
            message: 'Sparepart disimpan'
        });

    } catch (error) {

        console.error(
            'Error sparepart:',
            error
        );

        res.status(500).json({
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

            const validItems = items.filter(
                sp =>
                    sp &&
                    sp.id !== undefined &&
                    sp.id !== null
            );

            const values = validItems.map(sp => [
                sp.id,
                sp.kode || '',
                sp.part_number || '',
                sp.part_numbers_alt || '',
                sp.nama || '',
                sp.kategori || 'Umum',
                sp.merek || '',
                sp.satuan || 'Pcs',
                sp.stok_min || 0,
                sp.stok_awal || 0,
                sp.harga_beli || 0,
                sp.harga_jual || 0,
                sp.satuan_alt || '',
                sp.isi_satuan_alt || 0,
                sp.harga_jual_alt || 0,
                sp.pajak_status || 'Non Pajak',
                sp.kode_pajak || '',
                sp.keterangan || ''
            ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {

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
            message: 'Sparepart bulk disimpan'
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});

app.put('/api/sparepart/:id', async (req, res) => {

    try {

        await pool.query(
            'UPDATE spareparts SET ? WHERE id = ?',
            [
                req.body,
                req.params.id
            ]
        );

        invalidateDataCache();

        res.json({
            message: 'Sparepart diupdate'
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});

app.delete('/api/sparepart/:id', async (req, res) => {

    try {

        await pool.query(
            'DELETE FROM spareparts WHERE id = ?',
            [req.params.id]
        );

        await pool.query(
            'DELETE FROM transactions WHERE sparepart_id = ?',
            [req.params.id]
        );

        invalidateDataCache();

        res.json({
            message: 'Sparepart dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus sparepart:',
            error
        );

        res.status(500).json({
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
    } = req.body;

    try {

        // --------------------------------------------------------
        // TRANSACTIONS
        // --------------------------------------------------------
        if (
            Array.isArray(transactions) &&
            transactions.length > 0
        ) {

            const validTransactions =
                transactions.filter(
                    t =>
                        t &&
                        t.id !== undefined &&
                        t.id !== null &&
                        !isNaN(Number(t.id))
                );

            if (validTransactions.length > 0) {

                const values =
                    validTransactions.map(t => [
                        parseInt(t.id),
                        t.nomor_transaksi || '',
                        t.tanggal || new Date(),
                        t.sparepart_id || null,
                        t.custom_item || null,
                        t.part_numbers_alt || '',
                        t.merek || '',
                        t.jenis || '',
                        Number(t.jumlah) || 0,
                        t.satuan || 'Pcs',
                        Number(t.jumlah_dasar) || 0,
                        Number(t.harga_satuan) || 0,
                        t.tujuan || '',
                        t.keterangan || '',
                        t.source || '',
                        t.kasir || '',
                        t.status_bayar || '',
                        t.metode_bayar || '',
                        Number(t.bayar_tunai) || 0,
                        Number(t.transfer_amount) || 0,
                        Number(t.kembalian_diberikan) || 0,
                        Number(t.diskon) || 0,
                        t.tanggal_lunas || null
                    ]);

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
                        tanggal_lunas
                    )
                    VALUES ?
                `, [values]);

            }
        }

        // --------------------------------------------------------
        // TAX
        // --------------------------------------------------------
        if (
            Array.isArray(taxRecords) &&
            taxRecords.length > 0
        ) {

            const validTaxRecords =
                taxRecords.filter(
                    t =>
                        t &&
                        t.tax_id &&
                        t.trx_id !== undefined &&
                        t.trx_id !== null &&
                        !isNaN(Number(t.trx_id))
                );

            if (validTaxRecords.length > 0) {

                const values =
                    validTaxRecords.map(t => [
                        t.tax_id,
                        parseInt(t.trx_id),
                        t.tanggal || new Date(),
                        t.nomor_transaksi || '',
                        t.part_number || '',
                        t.nama || '',
                        t.kategori || '',
                        t.merek || '',
                        t.status_bayar || '',
                        t.pelanggan || '',
                        Number(t.jumlah) || 0,
                        t.satuan || 'Pcs',
                        Number(t.harga_satuan) || 0,
                        Number(t.subtotal) || 0,
                        Number(t.persentase_pajak) || 0,
                        Number(t.nilai_pajak) || 0
                    ]);

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
            message: 'Transaksi disimpan'
        });

    } catch (error) {

        console.error(
            'Error transaksi:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 6. SIMPAN RETUR KHUSUS
// ============================================================
// PENTING:
// Endpoint ini tidak menggunakan /api/settings.
// ============================================================
app.post('/api/transaction/retur', async (req, res) => {

    const {
        returRecord,
        transactions,
        taxRecords
    } = req.body || {};

    // ========================================================
    // VALIDASI returRecord
    // ========================================================
    if (
        !returRecord ||
        typeof returRecord !== 'object'
    ) {

        console.error(
            'RETUR ERROR: returRecord tidak dikirim dari frontend'
        );

        console.error(
            'REQUEST BODY:',
            JSON.stringify(req.body, null, 2)
        );

        return res.status(400).json({
            success: false,
            error:
                'Data retur tidak lengkap: returRecord tidak ditemukan'
        });
    }

    // ========================================================
    // VALIDASI ID RETUR
    // ========================================================
    if (
        returRecord.id === undefined ||
        returRecord.id === null ||
        String(returRecord.id).trim() === ''
    ) {

        console.error(
            'RETUR ERROR: ID retur kosong'
        );

        console.error(
            'RETUR RECORD:',
            JSON.stringify(returRecord, null, 2)
        );

        return res.status(400).json({
            success: false,
            error:
                'Data retur tidak lengkap: ID retur tidak ditemukan'
        });
    }

    // ========================================================
    // NORMALISASI DATA RETUR
    // ========================================================
    const cleanReturId =
        String(returRecord.id).trim();

    const cleanParentInvoice =
        returRecord.parent_invoice
            ? String(returRecord.parent_invoice)
            : '';

    const cleanTanggal =
        returRecord.tanggal
            ? new Date(returRecord.tanggal)
            : new Date();

    const cleanKasir =
        returRecord.kasir || '';

    const cleanPelanggan =
        returRecord.pelanggan || '';

    const cleanItems =
        Array.isArray(returRecord.items)
            ? returRecord.items
            : [];

    const cleanExchangeItems =
        Array.isArray(returRecord.exchange_items)
            ? returRecord.exchange_items
            : [];

    let conn;

    try {

        conn = await pool.getConnection();

        await conn.beginTransaction();

        // ====================================================
        // 1. SIMPAN RETUR
        // ====================================================
        await conn.query(`
            INSERT INTO retur_records
            (
                id,
                parent_invoice,
                tanggal,
                kasir,
                pelanggan,
                items,
                exchange_items
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)

            ON DUPLICATE KEY UPDATE
                parent_invoice = VALUES(parent_invoice),
                tanggal = VALUES(tanggal),
                kasir = VALUES(kasir),
                pelanggan = VALUES(pelanggan),
                items = VALUES(items),
                exchange_items = VALUES(exchange_items)
        `, [
            cleanReturId,
            cleanParentInvoice,
            cleanTanggal,
            cleanKasir,
            cleanPelanggan,
            JSON.stringify(cleanItems),
            JSON.stringify(cleanExchangeItems)
        ]);

        // ====================================================
        // 2. SIMPAN TRANSAKSI RETUR / TUKAR
        // ====================================================
        if (
            Array.isArray(transactions) &&
            transactions.length > 0
        ) {

            const validTransactions =
                transactions.filter(
                    t =>
                        t &&
                        t.id !== undefined &&
                        t.id !== null &&
                        !isNaN(Number(t.id))
                );

            if (validTransactions.length > 0) {

                const values =
                    validTransactions.map(t => [
                        parseInt(t.id),
                        t.nomor_transaksi || '',
                        t.tanggal || new Date(),
                        t.sparepart_id || null,
                        t.custom_item || null,
                        t.part_numbers_alt || '',
                        t.merek || '',
                        t.jenis || '',
                        Number(t.jumlah) || 0,
                        t.satuan || 'Pcs',
                        Number(t.jumlah_dasar) || 0,
                        Number(t.harga_satuan) || 0,
                        t.tujuan || '',
                        t.keterangan || '',
                        t.source || '',
                        t.kasir || '',
                        t.status_bayar || '',
                        t.metode_bayar || '',
                        Number(t.bayar_tunai) || 0,
                        Number(t.transfer_amount) || 0,
                        Number(t.kembalian_diberikan) || 0,
                        Number(t.diskon) || 0,
                        t.tanggal_lunas || null
                    ]);

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
                        tanggal_lunas
                    )
                    VALUES ?
                `, [values]);

            }
        }

        // ====================================================
        // 3. SIMPAN TAX RECORD
        // ====================================================
        if (
            Array.isArray(taxRecords) &&
            taxRecords.length > 0
        ) {

            const validTaxRecords =
                taxRecords.filter(
                    t =>
                        t &&
                        t.tax_id &&
                        t.trx_id !== undefined &&
                        t.trx_id !== null &&
                        !isNaN(Number(t.trx_id))
                );

            if (validTaxRecords.length > 0) {

                const values =
                    validTaxRecords.map(t => [
                        t.tax_id,
                        parseInt(t.trx_id),
                        t.tanggal || new Date(),
                        t.nomor_transaksi || '',
                        t.part_number || '',
                        t.nama || '',
                        t.kategori || '',
                        t.merek || '',
                        t.status_bayar || '',
                        t.pelanggan || '',
                        Number(t.jumlah) || 0,
                        t.satuan || 'Pcs',
                        Number(t.harga_satuan) || 0,
                        Number(t.subtotal) || 0,
                        Number(t.persentase_pajak) || 0,
                        Number(t.nilai_pajak) || 0
                    ]);

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

        // ====================================================
        // 4. VERIFIKASI RETUR
        // ====================================================
        const [verify] = await conn.query(`
            SELECT id
            FROM retur_records
            WHERE id = ?
            LIMIT 1
        `, [
            cleanReturId
        ]);

        if (
            !verify ||
            verify.length === 0
        ) {

            await conn.rollback();

            return res.status(500).json({
                success: false,
                error:
                    'Verifikasi gagal: Retur tidak tersimpan di database'
            });
        }

        // ====================================================
        // 5. COMMIT
        // ====================================================
        await conn.commit();

        invalidateDataCache();

        console.log(
            '===================================='
        );

        console.log(
            '[RETUR] SUCCESS'
        );

        console.log(
            'Retur ID:',
            cleanReturId
        );

        console.log(
            'Invoice:',
            cleanParentInvoice
        );

        console.log(
            'Items:',
            cleanItems.length
        );

        console.log(
            'Exchange:',
            cleanExchangeItems.length
        );

        console.log(
            '===================================='
        );

        return res.json({
            success: true,
            message:
                'Retur berhasil disimpan ke server',
            returId:
                cleanReturId
        });

    } catch (error) {

        if (conn) {

            try {
                await conn.rollback();
            } catch (rollbackError) {

                console.error(
                    'Rollback error:',
                    rollbackError
                );

            }

        }

        console.error(
            '===================================='
        );

        console.error(
            'ERROR SIMPAN RETUR'
        );

        console.error(
            'Message:',
            error.message
        );

        console.error(
            'Retur ID:',
            cleanReturId
        );

        console.error(
            'Invoice:',
            cleanParentInvoice
        );

        console.error(
            'Retur Record:',
            JSON.stringify(
                returRecord,
                null,
                2
            )
        );

        console.error(
            '===================================='
        );

        return res.status(500).json({
            success: false,
            error:
                'Gagal menyimpan retur: ' +
                error.message
        });

    } finally {

        if (conn) {
            conn.release();
        }

    }
});

// ============================================================
// 7. HAPUS INVOICE
// ============================================================
app.post('/api/transaction/delete-invoice', async (req, res) => {

    const { trxId } = req.body;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === ''
    ) {
        return res.status(400).json({
            error: 'Nomor invoice tidak valid'
        });
    }

    try {

        const [returs] = await pool.query(`
            SELECT id
            FROM retur_records
            WHERE parent_invoice = ?
        `, [trxId]);

        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [trxId]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [trxId]);

        if (
            Array.isArray(returs) &&
            returs.length > 0
        ) {

            for (const r of returs) {

                if (
                    r &&
                    r.id !== undefined &&
                    r.id !== null
                ) {

                    await pool.query(`
                        DELETE FROM transactions
                        WHERE nomor_transaksi = ?
                    `, [r.id]);

                    await pool.query(`
                        DELETE FROM tax_records
                        WHERE nomor_transaksi = ?
                    `, [r.id]);
                }

            }
        }

        await pool.query(`
            DELETE FROM retur_records
            WHERE parent_invoice = ?
        `, [trxId]);

        invalidateDataCache();

        res.json({
            message:
                'Invoice & Retur berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus invoice:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 8. HAPUS RETUR
// ============================================================
app.post('/api/transaction/delete-retur', async (req, res) => {

    const { returId } = req.body;

    if (
        returId === undefined ||
        returId === null ||
        String(returId).trim() === ''
    ) {
        return res.status(400).json({
            error: 'ID retur tidak valid'
        });
    }

    try {

        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [returId]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [returId]);

        await pool.query(`
            DELETE FROM retur_records
            WHERE id = ?
        `, [returId]);

        invalidateDataCache();

        res.json({
            message:
                'Retur berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus retur:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 9. HAPUS TRANSAKSI
// ============================================================
app.post('/api/transaction/delete', async (req, res) => {

    const { id } = req.body;

    try {

        const cleanId = parseInt(id);

        if (isNaN(cleanId)) {

            return res.status(400).json({
                error: 'ID tidak valid'
            });
        }

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
            message:
                'Transaksi berhasil dihapus dari server'
        });

    } catch (error) {

        console.error(
            'Error hapus transaksi:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 10. EDIT STRUK
// ============================================================
app.put('/api/transaction/edit-struk', async (req, res) => {

    const {
        invoice,
        items,
        diskon
    } = req.body;

    if (
        !invoice ||
        !Array.isArray(items)
    ) {
        return res.status(400).json({
            error:
                'Data edit struk tidak lengkap'
        });
    }

    const conn =
        await pool.getConnection();

    try {

        await conn.beginTransaction();

        // --------------------------------------------------------
        // Ambil ID asli dari database
        // --------------------------------------------------------
        const [trxRows] =
            await conn.query(`
                SELECT id, nomor_transaksi
                FROM transactions
                WHERE nomor_transaksi = ?
                ORDER BY id ASC
            `, [invoice]);

        if (trxRows.length === 0) {

            await conn.rollback();

            return res.status(404).json({
                error:
                    'Invoice tidak ditemukan di database'
            });
        }

        // --------------------------------------------------------
        // Update harga
        // --------------------------------------------------------
        for (
            let i = 0;
            i < trxRows.length;
            i++
        ) {

            if (i >= items.length) {
                continue;
            }

            const dbId =
                trxRows[i].id;

            const newHarga =
                Number(items[i].harga_satuan) || 0;

            await conn.query(`
                UPDATE transactions
                SET harga_satuan = ?
                WHERE id = ?
            `, [
                newHarga,
                dbId
            ]);

            // ----------------------------------------------------
            // UPDATE TAX
            // ----------------------------------------------------
            const [taxRows] =
                await conn.query(`
                    SELECT
                        tax_id,
                        jumlah,
                        persentase_pajak
                    FROM tax_records
                    WHERE trx_id = ?
                `, [dbId]);

            for (const tax of taxRows) {

                const jumlah =
                    Number(tax.jumlah) || 0;

                const persentase =
                    parseFloat(
                        tax.persentase_pajak
                    ) || 0;

                const newSubtotal =
                    newHarga * jumlah;

                const newNilaiPajak =
                    (
                        newSubtotal *
                        persentase
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
                    tax.tax_id
                ]);
            }
        }

        // --------------------------------------------------------
        // UPDATE DISKON
        // --------------------------------------------------------
        if (
            diskon !== undefined &&
            trxRows.length > 0
        ) {

            await conn.query(`
                UPDATE transactions
                SET diskon = ?
                WHERE id = ?
            `, [
                Number(diskon) || 0,
                trxRows[0].id
            ]);
        }

        await conn.commit();

        invalidateDataCache();

        console.log(
            '[EDIT STRUK] SUCCESS invoice:',
            invoice
        );

        res.json({
            message:
                'Struk berhasil diedit',
            invoice
        });

    } catch (error) {

        await conn.rollback();

        console.error(
            '[EDIT STRUK] Error:',
            error
        );

        res.status(500).json({
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

    const { trxId } = req.body;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === ''
    ) {
        return res.status(400).json({
            error:
                'Nomor transaksi tidak valid'
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
            `, [trxId]);

        if (trxRows.length === 0) {

            await conn.rollback();

            return res.status(404).json({
                error:
                    'Invoice tidak ditemukan'
            });
        }

        const isAlreadyLunas =
            trxRows.every(
                t => t.status_bayar === 'Lunas'
            );

        if (isAlreadyLunas) {

            await conn.rollback();

            return res.status(400).json({
                error:
                    'Invoice sudah lunas'
            });
        }

        const total =
            trxRows.reduce(
                (sum, t) =>
                    sum +
                    (
                        (Number(t.harga_satuan) || 0) *
                        (Number(t.jumlah) || 0)
                    ),
                0
            ) -
            (Number(trxRows[0].diskon) || 0);

        await conn.query(`
            UPDATE transactions
            SET
                status_bayar = 'Lunas',
                keterangan = 'Bon (Lunas)',
                tanggal_lunas = NOW()
            WHERE nomor_transaksi = ?
        `, [trxId]);

        await conn.query(`
            UPDATE tax_records
            SET status_bayar = 'Lunas'
            WHERE nomor_transaksi = ?
        `, [trxId]);

        await conn.query(`
            INSERT INTO cash_inflows
            (
                id,
                tanggal,
                jumlah,
                keterangan,
                kasir
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            Date.now(),
            new Date(),
            total,
            'Pelunasan Bon: ' + trxId,
            trxRows[0].kasir || 'Admin'
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            message:
                'Piutang berhasil dilunasi',
            total
        });

    } catch (error) {

        await conn.rollback();

        console.error(
            'Error payoff:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    } finally {

        conn.release();

    }
});

// ============================================================
// 12. EDIT TRANSAKSI MANUAL / TUKAR
// ============================================================
app.put('/api/transaction/:id', async (req, res) => {

    const { id } = req.params;

    const transactionId =
        Number(id);

    if (
        !Number.isInteger(transactionId) ||
        transactionId <= 0
    ) {

        return res.status(400).json({
            error:
                'ID transaksi tidak valid (NaN)'
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
            updatedData.sparepart_id || null,
            updatedData.custom_item || null,
            updatedData.jenis || '',
            Number(updatedData.jumlah) || 0,
            updatedData.satuan || 'Pcs',
            Number(updatedData.jumlah_dasar) || 0,
            updatedData.tujuan || '',
            updatedData.keterangan || '',
            transactionId
        ]);

        invalidateDataCache();

        res.json({
            message:
                'Transaksi berhasil diupdate (Tukar Barang)'
        });

    } catch (error) {

        console.error(
            'Error edit transaksi:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 13. HAPUS KAS
// ============================================================
app.post('/api/cash-expense/delete', async (req, res) => {

    const { id } = req.body;

    try {

        await pool.query(`
            DELETE FROM cash_expenses
            WHERE id = ?
        `, [id]);

        invalidateDataCache();

        res.json({
            message:
                'Pengeluaran kas berhasil dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus cash expense:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

app.post('/api/cash-inflow/delete', async (req, res) => {

    const { id } = req.body;

    try {

        await pool.query(`
            DELETE FROM cash_inflows
            WHERE id = ?
        `, [id]);

        invalidateDataCache();

        res.json({
            message:
                'Tambahan kas berhasil dihapus'
        });

    } catch (error) {

        console.error(
            'Error hapus cash inflow:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 14. PARTNER
// ============================================================
app.post('/api/partner', async (req, res) => {

    try {

        await pool.query(
            'INSERT INTO partners SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            message:
                'Partner disimpan'
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});

app.put('/api/partner/:id', async (req, res) => {

    try {

        await pool.query(
            'UPDATE partners SET ? WHERE id = ?',
            [
                req.body,
                req.params.id
            ]
        );

        invalidateDataCache();

        res.json({
            message:
                'Partner diupdate'
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});

app.delete('/api/partner/:id', async (req, res) => {

    try {

        await pool.query(
            'DELETE FROM partners WHERE id = ?',
            [req.params.id]
        );

        invalidateDataCache();

        res.json({
            message:
                'Partner dihapus'
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 15. SETTINGS
// ============================================================
app.put('/api/settings', async (req, res) => {

    const {
        kasAwal,
        activeShiftStart,
        masterPajak,
        users,
        cashExpenses,
        cashInflows
    } = req.body || {};

    try {

        // --------------------------------------------------------
        // SETTINGS
        // --------------------------------------------------------
        await pool.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?
            WHERE id = 1
        `, [
            kasAwal || 0,
            activeShiftStart || Date.now(),
            JSON.stringify(
                Array.isArray(masterPajak)
                    ? masterPajak
                    : []
            ),
            JSON.stringify(
                Array.isArray(users)
                    ? users
                    : []
            )
        ]);

        // --------------------------------------------------------
        // CASH EXPENSE
        // --------------------------------------------------------
        if (
            Array.isArray(cashExpenses) &&
            cashExpenses.length > 0
        ) {

            const validItems =
                cashExpenses.filter(
                    e =>
                        e &&
                        e.id !== undefined &&
                        e.id !== null
                );

            if (validItems.length > 0) {

                const values =
                    validItems.map(e => [
                        e.id,
                        e.tanggal || new Date(),
                        Number(e.jumlah) || 0,
                        e.keterangan || '',
                        e.kasir || ''
                    ]);

                await pool.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?

                    ON DUPLICATE KEY UPDATE
                        tanggal = VALUES(tanggal),
                        jumlah = VALUES(jumlah),
                        keterangan = VALUES(keterangan),
                        kasir = VALUES(kasir)
                `, [values]);
            }
        }

        // --------------------------------------------------------
        // CASH INFLOW
        // --------------------------------------------------------
        if (
            Array.isArray(cashInflows) &&
            cashInflows.length > 0
        ) {

            const validItems =
                cashInflows.filter(
                    i =>
                        i &&
                        i.id !== undefined &&
                        i.id !== null
                );

            if (validItems.length > 0) {

                const values =
                    validItems.map(i => [
                        i.id,
                        i.tanggal || new Date(),
                        Number(i.jumlah) || 0,
                        i.keterangan || '',
                        i.kasir || ''
                    ]);

                await pool.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?

                    ON DUPLICATE KEY UPDATE
                        tanggal = VALUES(tanggal),
                        jumlah = VALUES(jumlah),
                        keterangan = VALUES(keterangan),
                        kasir = VALUES(kasir)
                `, [values]);
            }
        }

        invalidateDataCache();

        res.json({
            message:
                'Settings berhasil disimpan'
        });

    } catch (error) {

        console.error(
            'Error settings:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    }
});

// ============================================================
// 16. RESTORE DATA
// ============================================================
app.post('/api/restore', async (req, res) => {

    const data =
        req.body || {};

    let conn;

    try {

        conn =
            await pool.getConnection();

        await conn.beginTransaction();

        // --------------------------------------------------------
        // HAPUS DATA LAMA
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // SPAREPARTS
        // --------------------------------------------------------
        if (
            Array.isArray(data.spareparts) &&
            data.spareparts.length > 0
        ) {

            const validItems =
                data.spareparts.filter(
                    sp =>
                        sp &&
                        sp.id !== undefined &&
                        sp.id !== null
                );

            const values =
                validItems.map(sp => [
                    sp.id,
                    sp.kode || '',
                    sp.part_number || '',
                    sp.part_numbers_alt || '',
                    sp.nama || '',
                    sp.kategori || 'Umum',
                    sp.merek || '',
                    sp.satuan || 'Pcs',
                    sp.stok_min || 0,
                    sp.stok_awal || 0,
                    sp.harga_beli || 0,
                    sp.harga_jual || 0,
                    sp.satuan_alt || '',
                    sp.isi_satuan_alt || 0,
                    sp.harga_jual_alt || 0,
                    sp.pajak_status || 'Non Pajak',
                    sp.kode_pajak || '',
                    sp.keterangan || ''
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
                    values.slice(i, i + 500)
                ]);
            }
        }

        // --------------------------------------------------------
        // TRANSACTIONS
        // --------------------------------------------------------
        if (
            Array.isArray(data.transactions) &&
            data.transactions.length > 0
        ) {

            const validItems =
                data.transactions.filter(
                    t =>
                        t &&
                        t.id !== undefined &&
                        t.id !== null &&
                        !isNaN(Number(t.id))
                );

            const values =
                validItems.map(t => [
                    parseInt(t.id),
                    t.nomor_transaksi || '',
                    t.tanggal || new Date(),
                    t.sparepart_id || null,
                    t.custom_item || null,
                    t.part_numbers_alt || '',
                    t.merek || '',
                    t.jenis || '',
                    Number(t.jumlah) || 0,
                    t.satuan || 'Pcs',
                    Number(t.jumlah_dasar) || 0,
                    Number(t.harga_satuan) || 0,
                    t.tujuan || '',
                    t.keterangan || '',
                    t.source || '',
                    t.kasir || '',
                    t.status_bayar || '',
                    t.metode_bayar || '',
                    Number(t.bayar_tunai) || 0,
                    Number(t.transfer_amount) || 0,
                    Number(t.kembalian_diberikan) || 0,
                    Number(t.diskon) || 0,
                    t.tanggal_lunas || null
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
                        tanggal_lunas
                    )
                    VALUES ?
                `, [
                    values.slice(i, i + 500)
                ]);
            }
        }

        // --------------------------------------------------------
        // PARTNERS
        // --------------------------------------------------------
        if (
            Array.isArray(data.partners) &&
            data.partners.length > 0
        ) {

            const validItems =
                data.partners.filter(
                    p =>
                        p &&
                        p.id !== undefined &&
                        p.id !== null
                );

            const values =
                validItems.map(p => [
                    p.id,
                    p.nama || '',
                    p.tipe || '',
                    p.telp || '',
                    p.alamat || ''
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

        // --------------------------------------------------------
        // CASH EXPENSES
        // --------------------------------------------------------
        if (
            Array.isArray(data.cashExpenses) &&
            data.cashExpenses.length > 0
        ) {

            const validItems =
                data.cashExpenses.filter(
                    e =>
                        e &&
                        e.id !== undefined &&
                        e.id !== null
                );

            const values =
                validItems.map(e => [
                    e.id,
                    e.tanggal || new Date(),
                    Number(e.jumlah) || 0,
                    e.keterangan || '',
                    e.kasir || ''
                ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);

            }
        }

        // --------------------------------------------------------
        // CASH INFLOWS
        // --------------------------------------------------------
        if (
            Array.isArray(data.cashInflows) &&
            data.cashInflows.length > 0
        ) {

            const validItems =
                data.cashInflows.filter(
                    i =>
                        i &&
                        i.id !== undefined &&
                        i.id !== null
                );

            const values =
                validItems.map(i => [
                    i.id,
                    i.tanggal || new Date(),
                    Number(i.jumlah) || 0,
                    i.keterangan || '',
                    i.kasir || ''
                ]);

            if (values.length > 0) {

                await conn.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);

            }
        }

        // --------------------------------------------------------
        // TAX RECORDS
        // --------------------------------------------------------
        if (
            Array.isArray(data.taxRecords) &&
            data.taxRecords.length > 0
        ) {

            const validItems =
                data.taxRecords.filter(
                    t =>
                        t &&
                        t.tax_id &&
                        t.trx_id !== undefined &&
                        t.trx_id !== null &&
                        !isNaN(Number(t.trx_id))
                );

            const values =
                validItems.map(t => [
                    t.tax_id,
                    parseInt(t.trx_id),
                    t.tanggal || new Date(),
                    t.nomor_transaksi || '',
                    t.part_number || '',
                    t.nama || '',
                    t.kategori || '',
                    t.merek || '',
                    t.status_bayar || '',
                    t.pelanggan || '',
                    Number(t.jumlah) || 0,
                    t.satuan || 'Pcs',
                    Number(t.harga_satuan) || 0,
                    Number(t.subtotal) || 0,
                    Number(t.persentase_pajak) || 0,
                    Number(t.nilai_pajak) || 0
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

        // --------------------------------------------------------
        // RETUR RECORDS
        // --------------------------------------------------------
        if (
            Array.isArray(data.returRecords) &&
            data.returRecords.length > 0
        ) {

            const validReturs =
                data.returRecords.filter(
                    r =>
                        r &&
                        r.id !== undefined &&
                        r.id !== null &&
                        String(r.id).trim() !== ''
                );

            const values =
                validReturs.map(r => [
                    String(r.id),
                    r.parent_invoice || '',
                    r.tanggal
                        ? new Date(r.tanggal)
                        : new Date(),
                    r.kasir || '',
                    r.pelanggan || '',
                    JSON.stringify(
                        Array.isArray(r.items)
                            ? r.items
                            : []
                    ),
                    JSON.stringify(
                        Array.isArray(r.exchange_items)
                            ? r.exchange_items
                            : []
                    )
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
                        exchange_items
                    )
                    VALUES ?
                `, [values]);

            }
        }

        // --------------------------------------------------------
        // SETTINGS
        // --------------------------------------------------------
        await conn.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?
            WHERE id = 1
        `, [
            data.kasAwal || 0,
            data.activeShiftStart || Date.now(),
            JSON.stringify(
                Array.isArray(data.masterPajak)
                    ? data.masterPajak
                    : []
            ),
            JSON.stringify(
                Array.isArray(data.users)
                    ? data.users
                    : []
            )
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            message:
                'Restore data berhasil! Semua tabel di server telah ditimpa.'
        });

    } catch (error) {

        if (conn) {

            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error(
                    'Rollback restore error:',
                    rollbackError
                );
            }

        }

        console.error(
            'Error restore:',
            error
        );

        res.status(500).json({
            error: error.message
        });

    } finally {

        if (conn) {
            conn.release();
        }

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
