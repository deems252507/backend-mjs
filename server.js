const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();

/* =========================================================
   BASIC CONFIG
========================================================= */

app.use(cors());

app.use(bodyParser.json({
    limit: '50mb'
}));

app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
}));

/* =========================================================
   TEST SERVER
========================================================= */

app.get('/api/test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server berhasil berjalan!'
    });
});

/* =========================================================
   DATABASE
   Gunakan Environment Variable jika tersedia.
   Fallback hanya untuk kompatibilitas dengan konfigurasi lama.
========================================================= */

const DB_CONFIG = {
    host: process.env.DB_HOST || 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: process.env.DB_USER || 'uks2krvuygsynrco',
    password: process.env.DB_PASSWORD || 'fWwkTbshbBANrTGMj8Aq',
    database: process.env.DB_NAME || 'b7fgoctdsrijlfhczppz',
    port: Number(process.env.DB_PORT || 3306),

    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 4),
    queueLimit: 0,

    charset: 'utf8mb4',

    connectTimeout: 20000,

    // Membantu koneksi Clever Cloud/MySQL yang idle
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

const pool = mysql.createPool(DB_CONFIG);

/* =========================================================
   ERROR HANDLERS
========================================================= */

pool.on('error', (err) => {
    console.error('[DATABASE POOL ERROR]', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
});

/* =========================================================
   CACHE
========================================================= */

let dataCache = null;
let dataCacheTime = 0;

const DATA_CACHE_TTL = 1000;

function invalidateDataCache() {
    dataCache = null;
    dataCacheTime = 0;
}

/*
   Jangan cache request mutasi.
*/
app.use((req, res, next) => {
    if (req.method !== 'GET') {
        invalidateDataCache();
    }

    next();
});

/* =========================================================
   HELPER
========================================================= */

function safeNumber(value, defaultValue = 0) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return defaultValue;
    }

    return n;
}

function safeInteger(value, defaultValue = 0) {
    const n = Number(value);

    if (!Number.isInteger(n)) {
        return defaultValue;
    }

    return n;
}

function safeJson(value, defaultValue = []) {
    if (value === null || value === undefined) {
        return defaultValue;
    }

    if (typeof value === 'object') {
        return value;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return defaultValue;
        }
    }

    return defaultValue;
}

function normalizeDate(value) {
    if (!value) {
        return null;
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    return d;
}

function normalizeTransaction(t) {
    return [
        safeInteger(t.id, 0),
        t.nomor_transaksi || '',
        t.tanggal || new Date(),
        t.sparepart_id === null ||
        t.sparepart_id === undefined ||
        t.sparepart_id === ''
            ? null
            : safeInteger(t.sparepart_id, null),

        t.custom_item || null,
        t.part_numbers_alt || '',
        t.merek || '',
        t.jenis || '',
        safeInteger(t.jumlah, 0),
        t.satuan || '',
        safeInteger(t.jumlah_dasar, 0),
        safeNumber(t.harga_satuan, 0),
        t.tujuan || '',
        t.keterangan || '',
        t.source || '',
        t.kasir || '',
        t.status_bayar || '',
        t.metode_bayar || '',
        safeNumber(t.bayar_tunai, 0),
        safeNumber(t.transfer_amount, 0),
        safeNumber(t.kembalian_diberikan, 0),
        safeNumber(t.diskon, 0),
        t.tanggal_lunas || null
    ];
}

function normalizeSparepart(sp) {
    return [
        safeInteger(sp.id, 0),
        sp.kode || '',
        sp.part_number || '',
        sp.part_numbers_alt || '',
        sp.nama || '',
        sp.kategori || 'Umum',
        sp.merek || '',
        sp.satuan || 'Pcs',
        safeInteger(sp.stok_min, 0),
        safeInteger(sp.stok_awal, 0),
        safeNumber(sp.harga_beli, 0),
        safeNumber(sp.harga_jual, 0),
        sp.satuan_alt || '',
        safeInteger(sp.isi_satuan_alt, 0),
        safeNumber(sp.harga_jual_alt, 0),
        sp.pajak_status || 'Non Pajak',
        sp.kode_pajak || '',
        sp.keterangan || ''
    ];
}

function normalizeTaxRecord(t) {
    return [
        t.tax_id || '',
        safeInteger(t.trx_id, 0),
        t.tanggal || new Date(),
        t.nomor_transaksi || '',
        t.part_number || '',
        t.nama || '',
        t.kategori || '',
        t.merek || '',
        t.status_bayar || '',
        t.pelanggan || '',
        safeInteger(t.jumlah, 0),
        t.satuan || '',
        safeNumber(t.harga_satuan, 0),
        safeNumber(t.subtotal, 0),
        safeNumber(t.persentase_pajak, 0),
        safeNumber(t.nilai_pajak, 0)
    ];
}

/* =========================================================
   1. INISIALISASI TABEL
========================================================= */

app.get('/api/init', async (req, res) => {
    let connection;

    try {
        connection = await pool.getConnection();

        await connection.query(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS partners (
                id BIGINT PRIMARY KEY,
                nama VARCHAR(255),
                tipe VARCHAR(50),
                telp VARCHAR(50),
                alamat TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS cash_expenses (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS cash_inflows (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS retur_records (
                id VARCHAR(50) PRIMARY KEY,
                parent_invoice VARCHAR(50),
                tanggal DATETIME,
                kasir VARCHAR(100),
                pelanggan VARCHAR(255),
                items JSON,
                exchange_items JSON
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        /*
           Pastikan tabel lama yang belum mempunyai exchange_items
           tetap kompatibel.
        */
        try {
            await connection.query(`
                ALTER TABLE retur_records
                ADD COLUMN exchange_items JSON
            `);
        } catch (e) {
            /*
               Kolom sudah ada -> abaikan.
            */
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INT PRIMARY KEY DEFAULT 1,
                kas_awal BIGINT DEFAULT 0,
                active_shift_start BIGINT,
                master_pajak JSON,
                users JSON
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        /*
           Pastikan row settings tersedia.
        */
        const [settings] = await connection.query(`
            SELECT *
            FROM app_settings
            WHERE id = 1
            LIMIT 1
        `);

        if (settings.length === 0) {
            await connection.query(`
                INSERT INTO app_settings
                (
                    id,
                    kas_awal,
                    active_shift_start,
                    master_pajak,
                    users
                )
                VALUES (1, ?, ?, ?, ?)
            `, [
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

        invalidateDataCache();

        res.json({
            message: 'Database & tabel siap!'
        });

    } catch (error) {
        console.error('[INIT ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   2. MIGRASI DATA
========================================================= */

app.post('/api/migrate', async (req, res) => {
    const oldData = req.body || {};

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /* ================= SPAREPART ================= */

        if (
            Array.isArray(oldData.spareparts) &&
            oldData.spareparts.length > 0
        ) {
            const values = oldData.spareparts.map(normalizeSparepart);

            for (let i = 0; i < values.length; i += 500) {
                await connection.query(`
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

        /* ================= TRANSACTIONS ================= */

        if (
            Array.isArray(oldData.transactions) &&
            oldData.transactions.length > 0
        ) {
            const values = oldData.transactions
                .map(normalizeTransaction)
                .filter(row => row[0] > 0);

            for (let i = 0; i < values.length; i += 500) {
                await connection.query(`
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

        /* ================= PARTNERS ================= */

        if (
            Array.isArray(oldData.partners) &&
            oldData.partners.length > 0
        ) {
            const values = oldData.partners.map(p => [
                safeInteger(p.id, 0),
                p.nama || '',
                p.tipe || '',
                p.telp || '',
                p.alamat || ''
            ]).filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= CASH EXPENSES ================= */

        if (
            Array.isArray(oldData.cashExpenses) &&
            oldData.cashExpenses.length > 0
        ) {
            const values = oldData.cashExpenses.map(e => [
                safeInteger(e.id, 0),
                normalizeDate(e.tanggal) || new Date(),
                safeNumber(e.jumlah, 0),
                e.keterangan || '',
                e.kasir || ''
            ]).filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= CASH INFLOWS ================= */

        if (
            Array.isArray(oldData.cashInflows) &&
            oldData.cashInflows.length > 0
        ) {
            const values = oldData.cashInflows.map(i => [
                safeInteger(i.id, 0),
                normalizeDate(i.tanggal) || new Date(),
                safeNumber(i.jumlah, 0),
                i.keterangan || '',
                i.kasir || ''
            ]).filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= TAX RECORDS ================= */

        if (
            Array.isArray(oldData.taxRecords) &&
            oldData.taxRecords.length > 0
        ) {
            const values = oldData.taxRecords
                .map(normalizeTaxRecord)
                .filter(row => row[0]);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= RETUR ================= */

        if (
            Array.isArray(oldData.returRecords) &&
            oldData.returRecords.length > 0
        ) {
            const values = oldData.returRecords
                .filter(r => r && r.id)
                .map(r => [
                    String(r.id),
                    r.parent_invoice || '',
                    normalizeDate(r.tanggal) || new Date(),
                    r.kasir || '',
                    r.pelanggan || '',
                    JSON.stringify(r.items || []),
                    JSON.stringify(r.exchange_items || [])
                ]);

            if (values.length > 0) {
                await connection.query(`
                    INSERT IGNORE INTO retur_records
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

        /* ================= SETTINGS ================= */

        if (
            oldData.kasAwal !== undefined ||
            oldData.activeShiftStart !== undefined ||
            oldData.masterPajak !== undefined ||
            oldData.users !== undefined
        ) {
            await connection.query(`
                UPDATE app_settings
                SET
                    kas_awal = ?,
                    active_shift_start = ?,
                    master_pajak = ?,
                    users = ?
                WHERE id = 1
            `, [
                safeNumber(oldData.kasAwal, 0),
                oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []),
                JSON.stringify(oldData.users || [])
            ]);
        }

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Migrasi data lama berhasil!'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('[MIGRATE ROLLBACK ERROR]', rollbackError);
            }
        }

        console.error('[MIGRATE ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   3. GET ALL DATA
   PENTING:
   - Selalu membaca database.
   - Cache sangat pendek.
   - Tidak menggunakan fallback cache jika database gagal,
     supaya web tidak menampilkan data lama secara diam-diam.
========================================================= */

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

        const [
            spareparts,
            transactions,
            partners,
            cashExpenses,
            cashInflows,
            taxRecords,
            returResult,
            settings
        ] = await Promise.all([
            connection.query(`
                SELECT *
                FROM spareparts
                ORDER BY id ASC
            `),

            connection.query(`
                SELECT *
                FROM transactions
                ORDER BY id ASC
            `),

            connection.query(`
                SELECT *
                FROM partners
                ORDER BY id ASC
            `),

            connection.query(`
                SELECT *
                FROM cash_expenses
                ORDER BY id ASC
            `),

            connection.query(`
                SELECT *
                FROM cash_inflows
                ORDER BY id ASC
            `),

            connection.query(`
                SELECT *
                FROM tax_records
                ORDER BY tax_id ASC
            `),

            connection.query(`
                SELECT *
                FROM retur_records
                ORDER BY tanggal ASC
            `),

            connection.query(`
                SELECT *
                FROM app_settings
                WHERE id = 1
                LIMIT 1
            `)
        ]);

        const sparepartRows = spareparts[0];
        const transactionRows = transactions[0];
        const partnerRows = partners[0];
        const cashExpenseRows = cashExpenses[0];
        const cashInflowRows = cashInflows[0];
        const taxRows = taxRecords[0];
        const returRows = returResult[0];
        const settingRows = settings[0];

        /* ================= DATE ================= */

        transactionRows.forEach(t => {
            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }

            if (t.tanggal_lunas instanceof Date) {
                t.tanggal_lunas = t.tanggal_lunas.toISOString();
            }
        });

        cashExpenseRows.forEach(e => {
            if (e.tanggal instanceof Date) {
                e.tanggal = e.tanggal.toISOString();
            }
        });

        cashInflowRows.forEach(i => {
            if (i.tanggal instanceof Date) {
                i.tanggal = i.tanggal.toISOString();
            }
        });

        taxRows.forEach(t => {
            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }
        });

        /* ================= RETUR ================= */

        const returRecords = returRows.map(r => {
            r.items = safeJson(r.items, []);

            r.exchange_items = safeJson(
                r.exchange_items,
                []
            );

            if (r.tanggal) {
                const date = new Date(r.tanggal);

                if (!Number.isNaN(date.getTime())) {
                    r.tanggal = date.toISOString();
                }
            }

            return r;
        });

        /* ================= SETTINGS ================= */

        let masterPajak = [];

        if (settingRows.length > 0) {
            masterPajak = safeJson(
                settingRows[0].master_pajak,
                []
            );
        }

        let users = [];

        if (settingRows.length > 0) {
            users = safeJson(
                settingRows[0].users,
                []
            );
        }

        const result = {
            spareparts: sparepartRows,
            transactions: transactionRows,
            partners: partnerRows,
            cashExpenses: cashExpenseRows,
            cashInflows: cashInflowRows,
            taxRecords: taxRows,
            returRecords: returRecords,

            kasAwal: settingRows.length > 0
                ? safeNumber(settingRows[0].kas_awal, 0)
                : 0,

            activeShiftStart: settingRows.length > 0
                ? settingRows[0].active_shift_start || Date.now()
                : Date.now(),

            masterPajak,
            users
        };

        dataCache = result;
        dataCacheTime = Date.now();

        res.json(result);

    } catch (error) {
        console.error('[GET DATA ERROR]', error);

        /*
           Jangan kirim cache lama.
           Frontend harus tahu kalau database sedang error.
        */
        res.status(500).json({
            error: error.message,
            message: 'Gagal mengambil data dari database'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   4. SPAREPART
========================================================= */

app.post('/api/sparepart', async (req, res) => {
    try {
        const sp = req.body;

        if (
            sp.id === undefined ||
            sp.id === null ||
            !Number.isFinite(Number(sp.id))
        ) {
            return res.status(400).json({
                error: 'ID sparepart tidak valid'
            });
        }

        await pool.query(
            'INSERT INTO spareparts SET ?',
            sp
        );

        invalidateDataCache();

        res.json({
            message: 'Sparepart disimpan'
        });

    } catch (error) {
        console.error('[SPAREPART INSERT ERROR]', error);

        res.status(500).json({
            error: error.message
        });
    }
});

app.post('/api/sparepart/bulk', async (req, res) => {
    const {
        items
    } = req.body || {};

    try {
        if (
            Array.isArray(items) &&
            items.length > 0
        ) {
            const values = items
                .map(normalizeSparepart)
                .filter(row => row[0] > 0);

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
            message: 'Sparepart bulk disimpan'
        });

    } catch (error) {
        console.error('[SPAREPART BULK ERROR]', error);

        res.status(500).json({
            error: error.message
        });
    }
});

app.put('/api/sparepart/:id', async (req, res) => {
    const id = safeInteger(req.params.id, 0);

    if (id <= 0) {
        return res.status(400).json({
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
            message: 'Sparepart diupdate'
        });

    } catch (error) {
        console.error('[SPAREPART UPDATE ERROR]', error);

        res.status(500).json({
            error: error.message
        });
    }
});

app.delete('/api/sparepart/:id', async (req, res) => {
    const id = safeInteger(req.params.id, 0);

    if (id <= 0) {
        return res.status(400).json({
            error: 'ID sparepart tidak valid'
        });
    }

    try {
        /*
           PENTING:
           Jangan hapus transactions ketika master barang dihapus.

           Histori transaksi harus tetap ada.
        */

        await pool.query(
            'DELETE FROM spareparts WHERE id = ?',
            [id]
        );

        invalidateDataCache();

        res.json({
            message: 'Sparepart berhasil dihapus'
        });

    } catch (error) {
        console.error('[SPAREPART DELETE ERROR]', error);

        res.status(500).json({
            error: error.message
        });
    }
});

/* =========================================================
   5. TRANSAKSI
========================================================= */

app.post('/api/transactions', async (req, res) => {
    const {
        transactions,
        taxRecords
    } = req.body || {};

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /* ================= TRANSACTIONS ================= */

        if (
            Array.isArray(transactions) &&
            transactions.length > 0
        ) {
            const values = transactions
                .map(normalizeTransaction)
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= TAX ================= */

        if (
            Array.isArray(taxRecords) &&
            taxRecords.length > 0
        ) {
            const values = taxRecords
                .map(normalizeTaxRecord)
                .filter(row => row[0]);

            if (values.length > 0) {
                await connection.query(`
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

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Transaksi disimpan'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[TRANSACTION INSERT ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   RETUR
========================================================= */

app.post('/api/transaction/retur', async (req, res) => {
    const {
        returRecord,
        transactions,
        taxRecords
    } = req.body || {};

    if (
        !returRecord ||
        !returRecord.id
    ) {
        return res.status(400).json({
            error: 'Data retur tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /* ================= RETUR RECORD ================= */

        await connection.query(`
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
            String(returRecord.id),

            returRecord.parent_invoice || '',

            normalizeDate(returRecord.tanggal) || new Date(),

            returRecord.kasir || '',

            returRecord.pelanggan || '',

            JSON.stringify(
                returRecord.items || []
            ),

            JSON.stringify(
                returRecord.exchange_items || []
            )
        ]);

        /* ================= TRANSACTIONS RETUR ================= */

        if (
            Array.isArray(transactions) &&
            transactions.length > 0
        ) {
            const values = transactions
                .map(normalizeTransaction)
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= TAX RETUR ================= */

        if (
            Array.isArray(taxRecords) &&
            taxRecords.length > 0
        ) {
            const values = taxRecords
                .map(normalizeTaxRecord)
                .filter(row => row[0]);

            if (values.length > 0) {
                await connection.query(`
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

        /* ================= VERIFY ================= */

        const [verify] = await connection.query(`
            SELECT id
            FROM retur_records
            WHERE id = ?
            LIMIT 1
        `, [
            String(returRecord.id)
        ]);

        if (verify.length === 0) {
            await connection.rollback();

            return res.status(500).json({
                error: 'Verifikasi gagal: retur tidak tersimpan'
            });
        }

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Retur berhasil disimpan ke server',
            success: true
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[RETUR ERROR]', error);

        res.status(500).json({
            error: 'Gagal menyimpan retur: ' + error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   DELETE INVOICE
========================================================= */

app.post('/api/transaction/delete-invoice', async (req, res) => {
    const {
        trxId
    } = req.body || {};

    if (!trxId) {
        return res.status(400).json({
            error: 'Nomor invoice tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /*
           Cari retur berdasarkan invoice utama.
        */
        const [returs] = await connection.query(`
            SELECT id
            FROM retur_records
            WHERE parent_invoice = ?
        `, [
            trxId
        ]);

        /*
           Hapus transaksi invoice utama.
        */
        await connection.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [
            trxId
        ]);

        /*
           Hapus pajak invoice utama.
        */
        await connection.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [
            trxId
        ]);

        /*
           Hapus transaksi dan pajak retur
           yang memang terkait invoice tersebut.
        */
        for (const r of returs) {
            await connection.query(`
                DELETE FROM transactions
                WHERE nomor_transaksi = ?
            `, [
                r.id
            ]);

            await connection.query(`
                DELETE FROM tax_records
                WHERE nomor_transaksi = ?
            `, [
                r.id
            ]);
        }

        /*
           Hapus record retur.
        */
        await connection.query(`
            DELETE FROM retur_records
            WHERE parent_invoice = ?
        `, [
            trxId
        ]);

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Invoice & Retur berhasil dihapus dari server'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[DELETE INVOICE ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   DELETE RETUR
========================================================= */

app.post('/api/transaction/delete-retur', async (req, res) => {
    const {
        returId
    } = req.body || {};

    if (!returId) {
        return res.status(400).json({
            error: 'ID retur tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        await connection.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [
            returId
        ]);

        await connection.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [
            returId
        ]);

        await connection.query(`
            DELETE FROM retur_records
            WHERE id = ?
        `, [
            returId
        ]);

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Retur berhasil dihapus dari server'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[DELETE RETUR ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   DELETE SINGLE TRANSACTION
========================================================= */

app.post('/api/transaction/delete', async (req, res) => {
    const {
        id
    } = req.body || {};

    const cleanId = safeInteger(id, 0);

    if (cleanId <= 0) {
        return res.status(400).json({
            error: 'ID transaksi tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        await connection.query(`
            DELETE FROM transactions
            WHERE id = ?
        `, [
            cleanId
        ]);

        await connection.query(`
            DELETE FROM tax_records
            WHERE trx_id = ?
        `, [
            cleanId
        ]);

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Transaksi berhasil dihapus dari server'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[DELETE TRANSACTION ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   EDIT STRUK
========================================================= */

app.put('/api/transaction/edit-struk', async (req, res) => {
    const {
        invoice,
        items,
        diskon
    } = req.body || {};

    if (!invoice) {
        return res.status(400).json({
            error: 'Invoice tidak valid'
        });
    }

    if (!Array.isArray(items)) {
        return res.status(400).json({
            error: 'Data item tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /*
           Ambil ID asli dari database berdasarkan invoice.
        */
        const [trxRows] = await connection.query(`
            SELECT
                id,
                nomor_transaksi
            FROM transactions
            WHERE nomor_transaksi = ?
            ORDER BY id ASC
        `, [
            invoice
        ]);

        if (trxRows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                error: 'Invoice tidak ditemukan di database'
            });
        }

        /*
           Update item berdasarkan posisi.
        */
        const jumlahUpdate = Math.min(
            trxRows.length,
            items.length
        );

        for (let i = 0; i < jumlahUpdate; i++) {
            const dbId = safeInteger(
                trxRows[i].id,
                0
            );

            if (dbId <= 0) {
                continue;
            }

            const newHarga = safeNumber(
                items[i]?.harga_satuan,
                0
            );

            await connection.query(`
                UPDATE transactions
                SET harga_satuan = ?
                WHERE id = ?
            `, [
                newHarga,
                dbId
            ]);

            /*
               Update pajak berdasarkan trx_id.
            */
            const [taxRows] = await connection.query(`
                SELECT
                    tax_id,
                    jumlah,
                    persentase_pajak
                FROM tax_records
                WHERE trx_id = ?
            `, [
                dbId
            ]);

            for (const tax of taxRows) {
                const jumlah = safeNumber(
                    tax.jumlah,
                    0
                );

                const persen = safeNumber(
                    tax.persentase_pajak,
                    0
                );

                const newSubtotal =
                    newHarga * jumlah;

                const newNilaiPajak =
                    (
                        newSubtotal *
                        persen
                    ) / 100;

                await connection.query(`
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

        /*
           Diskon disimpan pada transaksi pertama.
        */
        if (
            diskon !== undefined &&
            trxRows.length > 0
        ) {
            const firstId = safeInteger(
                trxRows[0].id,
                0
            );

            if (firstId > 0) {
                await connection.query(`
                    UPDATE transactions
                    SET diskon = ?
                    WHERE id = ?
                `, [
                    safeNumber(diskon, 0),
                    firstId
                ]);
            }
        }

        await connection.commit();

        invalidateDataCache();

        console.log(
            '[EDIT STRUK SUCCESS]',
            invoice
        );

        res.json({
            message: 'Struk berhasil diedit',
            invoice: invoice
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error(
            '[EDIT STRUK ERROR]',
            error
        );

        res.status(500).json({
            error:
                'Gagal menyimpan edit struk: ' +
                error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   PAYOFF / PELUNASAN BON
========================================================= */

app.put('/api/transactions/payoff', async (req, res) => {
    const {
        trxId
    } = req.body || {};

    if (!trxId) {
        return res.status(400).json({
            error: 'Invoice tidak valid'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        const [trxRows] = await connection.query(`
            SELECT *
            FROM transactions
            WHERE nomor_transaksi = ?
            ORDER BY id ASC
        `, [
            trxId
        ]);

        if (trxRows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                error: 'Invoice tidak ditemukan'
            });
        }

        const isAlreadyLunas =
            trxRows.every(
                t => t.status_bayar === 'Lunas'
            );

        if (isAlreadyLunas) {
            await connection.rollback();

            return res.status(400).json({
                error: 'Invoice sudah lunas'
            });
        }

        let total = 0;

        for (const t of trxRows) {
            total +=
                safeNumber(t.harga_satuan, 0) *
                safeNumber(t.jumlah, 0);
        }

        total -= safeNumber(
            trxRows[0].diskon,
            0
        );

        if (total < 0) {
            total = 0;
        }

        await connection.query(`
            UPDATE transactions
            SET
                status_bayar = 'Lunas',
                keterangan = 'Bon (Lunas)',
                tanggal_lunas = NOW()
            WHERE nomor_transaksi = ?
        `, [
            trxId
        ]);

        await connection.query(`
            UPDATE tax_records
            SET status_bayar = 'Lunas'
            WHERE nomor_transaksi = ?
        `, [
            trxId
        ]);

        /*
           ID kas masuk dibuat cukup unik.
        */
        const cashId =
            Date.now() +
            Math.floor(
                Math.random() * 1000
            );

        await connection.query(`
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
            cashId,
            new Date(),
            total,
            'Pelunasan Bon: ' + trxId,
            trxRows[0].kasir || 'Admin'
        ]);

        await connection.commit();

        invalidateDataCache();

        res.json({
            message: 'Piutang berhasil dilunasi',
            total: total
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error('[PAYOFF ERROR]', error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   EDIT TRANSAKSI MANUAL / TUKAR BARANG
========================================================= */

app.put('/api/transaction/:id', async (req, res) => {
    const transactionId =
        safeInteger(
            req.params.id,
            0
        );

    if (transactionId <= 0) {
        return res.status(400).json({
            error: 'ID transaksi tidak valid'
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
            updatedData.sparepart_id === null ||
            updatedData.sparepart_id === undefined ||
            updatedData.sparepart_id === ''
                ? null
                : safeInteger(
                    updatedData.sparepart_id,
                    null
                ),

            updatedData.custom_item || null,

            updatedData.jenis || '',

            safeInteger(
                updatedData.jumlah,
                0
            ),

            updatedData.satuan || '',

            safeInteger(
                updatedData.jumlah_dasar,
                0
            ),

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
            '[EDIT TRANSACTION ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

/* =========================================================
   CASH EXPENSE DELETE
========================================================= */

app.post('/api/cash-expense/delete', async (req, res) => {
    const id =
        safeInteger(
            req.body?.id,
            0
        );

    if (id <= 0) {
        return res.status(400).json({
            error: 'ID kas keluar tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM cash_expenses
            WHERE id = ?
        `, [
            id
        ]);

        invalidateDataCache();

        res.json({
            message:
                'Pengeluaran kas berhasil dihapus'
        });

    } catch (error) {
        console.error(
            '[CASH EXPENSE DELETE ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

/* =========================================================
   CASH INFLOW DELETE
========================================================= */

app.post('/api/cash-inflow/delete', async (req, res) => {
    const id =
        safeInteger(
            req.body?.id,
            0
        );

    if (id <= 0) {
        return res.status(400).json({
            error: 'ID kas masuk tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM cash_inflows
            WHERE id = ?
        `, [
            id
        ]);

        invalidateDataCache();

        res.json({
            message:
                'Tambahan kas berhasil dihapus'
        });

    } catch (error) {
        console.error(
            '[CASH INFLOW DELETE ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

/* =========================================================
   6. PARTNER
========================================================= */

app.post('/api/partner', async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO partners SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            message: 'Partner disimpan'
        });

    } catch (error) {
        console.error(
            '[PARTNER INSERT ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

app.put('/api/partner/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id,
            0
        );

    if (id <= 0) {
        return res.status(400).json({
            error: 'ID partner tidak valid'
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
            message: 'Partner diupdate'
        });

    } catch (error) {
        console.error(
            '[PARTNER UPDATE ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

app.delete('/api/partner/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id,
            0
        );

    if (id <= 0) {
        return res.status(400).json({
            error: 'ID partner tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM partners
            WHERE id = ?
        `, [
            id
        ]);

        invalidateDataCache();

        res.json({
            message: 'Partner dihapus'
        });

    } catch (error) {
        console.error(
            '[PARTNER DELETE ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});

/* =========================================================
   7. SETTINGS
========================================================= */

app.put('/api/settings', async (req, res) => {
    const {
        kasAwal,
        activeShiftStart,
        masterPajak,
        users,
        cashExpenses,
        cashInflows
    } = req.body || {};

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        await connection.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?
            WHERE id = 1
        `, [
            safeNumber(kasAwal, 0),

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
            )
        ]);

        /* ================= CASH EXPENSE ================= */

        if (
            Array.isArray(cashExpenses) &&
            cashExpenses.length > 0
        ) {
            const values = cashExpenses
                .map(e => [
                    safeInteger(e.id, 0),
                    normalizeDate(e.tanggal) || new Date(),
                    safeNumber(e.jumlah, 0),
                    e.keterangan || '',
                    e.kasir || ''
                ])
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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
                `, [
                    values
                ]);
            }
        }

        /* ================= CASH INFLOW ================= */

        if (
            Array.isArray(cashInflows) &&
            cashInflows.length > 0
        ) {
            const values = cashInflows
                .map(i => [
                    safeInteger(i.id, 0),
                    normalizeDate(i.tanggal) || new Date(),
                    safeNumber(i.jumlah, 0),
                    i.keterangan || '',
                    i.kasir || ''
                ])
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
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
                `, [
                    values
                ]);
            }
        }

        await connection.commit();

        invalidateDataCache();

        res.json({
            message:
                'Settings berhasil disimpan'
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (e) {}
        }

        console.error(
            '[SETTINGS ERROR]',
            error
        );

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   8. RESTORE DATA
   SANGAT PENTING:
   - TIDAK ADA DELETE DI LUAR TRANSACTION.
   - Kalau INSERT gagal -> ROLLBACK.
   - Data lama tetap kembali seperti semula.
========================================================= */

app.post('/api/restore', async (req, res) => {
    const data = req.body || {};

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        /*
           Hanya restore setelah request benar-benar diterima.
           Semua DELETE dan INSERT berada dalam satu transaction.
        */

        await connection.query(
            'DELETE FROM spareparts'
        );

        await connection.query(
            'DELETE FROM transactions'
        );

        await connection.query(
            'DELETE FROM partners'
        );

        await connection.query(
            'DELETE FROM cash_expenses'
        );

        await connection.query(
            'DELETE FROM cash_inflows'
        );

        await connection.query(
            'DELETE FROM tax_records'
        );

        await connection.query(
            'DELETE FROM retur_records'
        );

        /* ================= SPAREPART ================= */

        if (
            Array.isArray(data.spareparts) &&
            data.spareparts.length > 0
        ) {
            const values = data.spareparts
                .map(normalizeSparepart)
                .filter(row => row[0] > 0);

            for (let i = 0; i < values.length; i += 500) {
                await connection.query(`
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

        /* ================= TRANSACTIONS ================= */

        if (
            Array.isArray(data.transactions) &&
            data.transactions.length > 0
        ) {
            const values = data.transactions
                .map(normalizeTransaction)
                .filter(row => row[0] > 0);

            for (let i = 0; i < values.length; i += 500) {
                await connection.query(`
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

        /* ================= PARTNERS ================= */

        if (
            Array.isArray(data.partners) &&
            data.partners.length > 0
        ) {
            const values = data.partners
                .map(p => [
                    safeInteger(p.id, 0),
                    p.nama || '',
                    p.tipe || '',
                    p.telp || '',
                    p.alamat || ''
                ])
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
                    INSERT INTO partners
                    (
                        id,
                        nama,
                        tipe,
                        telp,
                        alamat
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        /* ================= CASH EXPENSES ================= */

        if (
            Array.isArray(data.cashExpenses) &&
            data.cashExpenses.length > 0
        ) {
            const values = data.cashExpenses
                .map(e => [
                    safeInteger(e.id, 0),
                    normalizeDate(e.tanggal) || new Date(),
                    safeNumber(e.jumlah, 0),
                    e.keterangan || '',
                    e.kasir || ''
                ])
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        /* ================= CASH INFLOWS ================= */

        if (
            Array.isArray(data.cashInflows) &&
            data.cashInflows.length > 0
        ) {
            const values = data.cashInflows
                .map(i => [
                    safeInteger(i.id, 0),
                    normalizeDate(i.tanggal) || new Date(),
                    safeNumber(i.jumlah, 0),
                    i.keterangan || '',
                    i.kasir || ''
                ])
                .filter(row => row[0] > 0);

            if (values.length > 0) {
                await connection.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        /* ================= TAX ================= */

        if (
            Array.isArray(data.taxRecords) &&
            data.taxRecords.length > 0
        ) {
            const values = data.taxRecords
                .map(normalizeTaxRecord)
                .filter(row => row[0]);

            if (values.length > 0) {
                await connection.query(`
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
                `, [
                    values
                ]);
            }
        }

        /* ================= RETUR ================= */

        if (
            Array.isArray(data.returRecords) &&
            data.returRecords.length > 0
        ) {
            const values = data.returRecords
                .filter(r => r && r.id)
                .map(r => [
                    String(r.id),
                    r.parent_invoice || '',
                    normalizeDate(r.tanggal) || new Date(),
                    r.kasir || '',
                    r.pelanggan || '',
                    JSON.stringify(r.items || []),
                    JSON.stringify(r.exchange_items || [])
                ]);

            if (values.length > 0) {
                await connection.query(`
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
                `, [
                    values
                ]);
            }
        }

        /* ================= SETTINGS ================= */

        await connection.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?
            WHERE id = 1
        `, [
            safeNumber(data.kasAwal, 0),

            data.activeShiftStart ||
                Date.now(),

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

        /*
           Verifikasi jumlah dasar sebelum COMMIT.
        */

        const [[spCount]] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM spareparts
        `);

        const [[trxCount]] = await connection.query(`
            SELECT COUNT(*) AS total
            FROM transactions
        `);

        const expectedSpareparts =
            Array.isArray(data.spareparts)
                ? data.spareparts.length
                : 0;

        const expectedTransactions =
            Array.isArray(data.transactions)
                ? data.transactions.length
                : 0;

        /*
           Jika backup memiliki data tetapi database
           tidak menerima semuanya, batalkan restore.
        */

        if (
            expectedSpareparts > 0 &&
            Number(spCount.total) !== expectedSpareparts
        ) {
            throw new Error(
                `Verifikasi sparepart gagal. Diharapkan ${expectedSpareparts}, tersimpan ${spCount.total}`
            );
        }

        if (
            expectedTransactions > 0 &&
            Number(trxCount.total) !== expectedTransactions
        ) {
            throw new Error(
                `Verifikasi transaksi gagal. Diharapkan ${expectedTransactions}, tersimpan ${trxCount.total}`
            );
        }

        /*
           BARU SEKARANG COMMIT.
        */

        await connection.commit();

        invalidateDataCache();

        res.json({
            message:
                'Restore data berhasil! Semua data telah dipulihkan.'
        });

    } catch (error) {
        /*
           Ini bagian yang sangat penting.

           Jika ada error setelah DELETE,
           ROLLBACK mengembalikan data lama.
        */

        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    '[RESTORE ROLLBACK ERROR]',
                    rollbackError
                );
            }
        }

        console.error(
            '[RESTORE ERROR]',
            error
        );

        res.status(500).json({
            error:
                'Restore gagal dan data lama tidak diubah: ' +
                error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   HEALTH CHECK DATABASE
   Bisa dipakai untuk memastikan web benar-benar terhubung
   ke database.
========================================================= */

app.get('/api/db-test', async (req, res) => {
    let connection;

    try {
        connection = await pool.getConnection();

        const [rows] = await connection.query(`
            SELECT
                DATABASE() AS database_name,
                NOW() AS server_time
        `);

        res.json({
            status: 'OK',
            message: 'Database berhasil terhubung',
            database: rows[0]?.database_name || null,
            serverTime: rows[0]?.server_time || null
        });

    } catch (error) {
        console.error(
            '[DB TEST ERROR]',
            error
        );

        res.status(500).json({
            status: 'ERROR',
            error: error.message
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/* =========================================================
   START SERVER
========================================================= */

const PORT =
    Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
    console.log(
        `Server berjalan di port ${PORT}`
    );

    console.log(
        `Database host: ${DB_CONFIG.host}`
    );

    console.log(
        `Database name: ${DB_CONFIG.database}`
    );

    console.log(
        `Connection limit: ${DB_CONFIG.connectionLimit}`
    );
});
