<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>server.js - Muria Jaya Sakti</title>
<style>
* { box-sizing: border-box; }
body {
    margin: 0;
    background: #0f1115;
    color: #e6e9ef;
    font-family: Arial, sans-serif;
}
header {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 14px 18px;
    background: #171a21;
    border-bottom: 1px solid #2a2f3a;
}
.title { font-size: 18px; font-weight: 700; }
.sub { color: #9aa3b2; font-size: 12px; margin-top: 4px; }
.toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 12px;
}
button, input {
    border: 1px solid #343b49;
    background: #202530;
    color: #e6e9ef;
    border-radius: 7px;
    padding: 9px 12px;
    font-size: 13px;
}
button { cursor: pointer; }
button:hover { background: #2a3040; }
input { min-width: 260px; flex: 1; }
#code {
    margin: 0;
    padding: 20px;
    overflow: auto;
    min-height: calc(100vh - 130px);
    font: 13px/1.55 Consolas, "Courier New", monospace;
    white-space: pre;
    tab-size: 4;
    color: #d9dee8;
}
.status {
    color: #8bd49c;
    font-size: 12px;
    align-self: center;
}
mark { background: #665d25; color: #fff; }
</style>
</head>
<body>
<header>
    <div class="title">server.js — Muria Jaya Sakti</div>
    <div class="sub">Viewer kode • 3,642 baris • Kode server.js tidak dijalankan oleh HTML ini</div>
    <div class="toolbar">
        <button onclick="copyAll()">Copy All</button>
        <button onclick="selectAllCode()">Select All</button>
        <button onclick="downloadJS()">Simpan sebagai server.js</button>
        <input id="search" type="text" placeholder="Cari kode..." oninput="searchCode()">
        <span id="status" class="status"></span>
    </div>
</header>

<pre id="code">const express = require(&#x27;express&#x27;);
const cors = require(&#x27;cors&#x27;);
const bodyParser = require(&#x27;body-parser&#x27;);
const mysql = require(&#x27;mysql2/promise&#x27;);

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: &#x27;50mb&#x27; }));

// ============================================================
// TEST SERVER
// ============================================================

app.get(&#x27;/api/test&#x27;, (req, res) =&gt; {
    res.json({
        status: &#x27;OK&#x27;,
        message: &#x27;Server berhasil berjalan!&#x27;
    });
});

// ============================================================
// DATABASE CLEVER CLOUD
// ============================================================

const pool = mysql.createPool({
    host: &#x27;b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com&#x27;,
    user: &#x27;uks2krvuygsynrco&#x27;,
    password: &#x27;fWwkTbshbBANrTGMj8Aq&#x27;,
    database: &#x27;b7fgoctdsrijlfhczppz&#x27;,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0
});

// ============================================================
// ERROR HANDLER
// ============================================================

pool.on(&#x27;error&#x27;, (err) =&gt; {
    console.error(&#x27;Database pool error:&#x27;, err);
});

process.on(&#x27;unhandledRejection&#x27;, (reason) =&gt; {
    console.error(&#x27;Unhandled Rejection:&#x27;, reason);
});

process.on(&#x27;uncaughtException&#x27;, (error) =&gt; {
    console.error(&#x27;Uncaught Exception:&#x27;, error);
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
app.use((req, res, next) =&gt; {
    if (req.method !== &#x27;GET&#x27;) {
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

function safeString(value, defaultValue = &#x27;&#x27;) {
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

    if (Array.isArray(value) || typeof value === &#x27;object&#x27;) {
        return value;
    }

    if (typeof value === &#x27;string&#x27;) {
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

app.get(&#x27;/api/init&#x27;, async (req, res) =&gt; {
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
                tanggal_lunas DATETIME NULL
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
                kasir VARCHAR(100)
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
                kasir VARCHAR(100)
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
                exchange_items JSON
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        // =====================================================
        // Pastikan exchange_items tersedia pada database lama
        // =====================================================

        try {
            await pool.query(`
                ALTER TABLE retur_records
                ADD COLUMN exchange_items JSON
            `);
        } catch (e) {
            // Kolom kemungkinan sudah ada.
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

        // Pastikan kolom shift_sessions tersedia pada database lama.
        try {
            await pool.query(`
                ALTER TABLE app_settings
                ADD COLUMN shift_sessions JSON
            `);
        } catch (e) {
            // Kolom sudah ada, lanjut.
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
                    users,
                    shift_sessions
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                1,
                0,
                Date.now(),
                JSON.stringify([
                    {
                        jenis: &#x27;Aki Basah&#x27;,
                        persentase: 20
                    },
                    {
                        jenis: &#x27;Aki Kering&#x27;,
                        persentase: 11
                    },
                    {
                        jenis: &#x27;Oli&#x27;,
                        persentase: 4
                    },
                    {
                        jenis: &#x27;Air Radiator&#x27;,
                        persentase: 4
                    },
                    {
                        jenis: &#x27;Minyak Rem&#x27;,
                        persentase: 4
                    },
                    {
                        jenis: &#x27;Lainnya&#x27;,
                        persentase: 11
                    }
                ]),
                JSON.stringify([
                    {
                        username: &#x27;owner&#x27;,
                        password: &#x27;owner123&#x27;,
                        role: &#x27;Owner&#x27;,
                        name: &#x27;Pemilik&#x27;
                    },
                    {
                        username: &#x27;admin&#x27;,
                        password: &#x27;admin123&#x27;,
                        role: &#x27;Admin&#x27;,
                        name: &#x27;Administrator&#x27;
                    },
                    {
                        username: &#x27;pagi&#x27;,
                        password: &#x27;pagi123&#x27;,
                        role: &#x27;Kasir&#x27;,
                        name: &#x27;Kasir Pagi&#x27;
                    },
                    {
                        username: &#x27;siang&#x27;,
                        password: &#x27;siang123&#x27;,
                        role: &#x27;Kasir&#x27;,
                        name: &#x27;Kasir Siang&#x27;
                    }
                ]),
                JSON.stringify([])
            ]);
        }

        res.json({
            success: true,
            message: &#x27;Database &amp; tabel siap!&#x27;
        });

    } catch (error) {

        console.error(&#x27;INIT ERROR:&#x27;, error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 2. MIGRASI DATA
// ============================================================

app.post(&#x27;/api/migrate&#x27;, async (req, res) =&gt; {

    const oldData = req.body || {};

    try {

        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.spareparts) &amp;&amp;
            oldData.spareparts.length &gt; 0
        ) {

            const values = oldData.spareparts.map(sp =&gt; [
                safeInteger(sp.id, Date.now()),
                safeString(sp.kode),
                safeString(sp.part_number),
                safeString(sp.part_numbers_alt),
                safeString(sp.nama),
                safeString(sp.kategori, &#x27;Umum&#x27;),
                safeString(sp.merek),
                safeString(sp.satuan, &#x27;Pcs&#x27;),
                safeNumber(sp.stok_min),
                safeNumber(sp.stok_awal),
                safeNumber(sp.harga_beli),
                safeNumber(sp.harga_jual),
                safeString(sp.satuan_alt),
                safeNumber(sp.isi_satuan_alt),
                safeNumber(sp.harga_jual_alt),
                safeString(sp.pajak_status, &#x27;Non Pajak&#x27;),
                safeString(sp.kode_pajak),
                safeString(sp.keterangan)
            ]);

            for (let i = 0; i &lt; values.length; i += 500) {

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
            Array.isArray(oldData.transactions) &amp;&amp;
            oldData.transactions.length &gt; 0
        ) {

            const values = oldData.transactions
                .filter(t =&gt; safeInteger(t.id) !== null)
                .map(t =&gt; [

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
                        : null
                ]);

            for (let i = 0; i &lt; values.length; i += 500) {

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

        // ----------------------------------------------------
        // PARTNERS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.partners) &amp;&amp;
            oldData.partners.length &gt; 0
        ) {

            const values = oldData.partners
                .filter(p =&gt; safeInteger(p.id) !== null)
                .map(p =&gt; [
                    safeInteger(p.id),
                    safeString(p.nama),
                    safeString(p.tipe),
                    safeString(p.telp),
                    safeString(p.alamat)
                ]);

            if (values.length &gt; 0) {

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
            Array.isArray(oldData.cashExpenses) &amp;&amp;
            oldData.cashExpenses.length &gt; 0
        ) {

            const values = oldData.cashExpenses
                .filter(e =&gt; safeInteger(e.id) !== null)
                .map(e =&gt; [
                    safeInteger(e.id),
                    safeDate(e.tanggal),
                    safeNumber(e.jumlah),
                    safeString(e.keterangan),
                    safeString(e.kasir)
                ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.cashInflows) &amp;&amp;
            oldData.cashInflows.length &gt; 0
        ) {

            const values = oldData.cashInflows
                .filter(i =&gt; safeInteger(i.id) !== null)
                .map(i =&gt; [
                    safeInteger(i.id),
                    safeDate(i.tanggal),
                    safeNumber(i.jumlah),
                    safeString(i.keterangan),
                    safeString(i.kasir)
                ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.taxRecords) &amp;&amp;
            oldData.taxRecords.length &gt; 0
        ) {

            const values = oldData.taxRecords
                .filter(t =&gt; t.tax_id)
                .map(t =&gt; [
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

            if (values.length &gt; 0) {

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
                    users = ?,
                    shift_sessions = ?
                WHERE id = 1
            `, [
                safeNumber(oldData.kasAwal),
                oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []),
                JSON.stringify(oldData.users || []),
                JSON.stringify(Array.isArray(oldData.shiftSessions) ? oldData.shiftSessions : [])
            ]);
        }

        invalidateDataCache();

        res.json({
            success: true,
            message: &#x27;Migrasi data lama berhasil!&#x27;
        });

    } catch (error) {

        console.error(&#x27;MIGRATE ERROR:&#x27;, error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 3. GET ALL DATA
// ============================================================

app.get(&#x27;/api/data&#x27;, async (req, res) =&gt; {

    const now = Date.now();

    if (
        dataCache &amp;&amp;
        (now - dataCacheTime) &lt; DATA_CACHE_TTL
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
                &#x27;Gagal membaca retur_records:&#x27;,
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

        transactions.forEach(t =&gt; {

            if (t.tanggal instanceof Date) {
                t.tanggal = t.tanggal.toISOString();
            }

            if (t.tanggal_lunas instanceof Date) {
                t.tanggal_lunas =
                    t.tanggal_lunas.toISOString();
            }
        });

        cashExpenses.forEach(e =&gt; {

            if (e.tanggal instanceof Date) {
                e.tanggal =
                    e.tanggal.toISOString();
            }
        });

        cashInflows.forEach(i =&gt; {

            if (i.tanggal instanceof Date) {
                i.tanggal =
                    i.tanggal.toISOString();
            }
        });

        taxRecords.forEach(t =&gt; {

            if (t.tanggal instanceof Date) {
                t.tanggal =
                    t.tanggal.toISOString();
            }
        });

        // ----------------------------------------------------
        // RETUR
        // ----------------------------------------------------

        const returRecords = returs.map(r =&gt; {

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

        if (typeof masterPajak === &#x27;string&#x27;) {

            try {
                masterPajak =
                    JSON.parse(masterPajak);
            } catch (e) {
                masterPajak = [];
            }
        }

        let users =
            settings[0]?.users || [];

        if (typeof users === &#x27;string&#x27;) {

            try {
                users =
                    JSON.parse(users);
            } catch (e) {
                users = [];
            }
        }

        let shiftSessions =
            settings[0]?.shift_sessions || [];

        if (typeof shiftSessions === &#x27;string&#x27;) {
            try {
                shiftSessions = JSON.parse(shiftSessions);
            } catch (e) {
                shiftSessions = [];
            }
        }

        if (!Array.isArray(shiftSessions)) {
            shiftSessions = [];
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
            &#x27;Error GET DATA:&#x27;,
            error
        );

        // Jangan mengembalikan cache lama
        // jika database benar-benar gagal.
        if (dataCache) {

            console.log(
                &#x27;Mengembalikan data cache karena error database&#x27;
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

app.post(&#x27;/api/sparepart&#x27;, async (req, res) =&gt; {

    try {

        await pool.query(
            &#x27;INSERT INTO spareparts SET ?&#x27;,
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: &#x27;Sparepart disimpan&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error sparepart:&#x27;,
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post(&#x27;/api/sparepart/bulk&#x27;, async (req, res) =&gt; {

    const { items } = req.body;

    try {

        if (
            Array.isArray(items) &amp;&amp;
            items.length &gt; 0
        ) {

            const values = items
                .filter(sp =&gt; safeInteger(sp.id) !== null)
                .map(sp =&gt; [
                    safeInteger(sp.id),
                    safeString(sp.kode),
                    safeString(sp.part_number),
                    safeString(sp.part_numbers_alt),
                    safeString(sp.nama),
                    safeString(sp.kategori, &#x27;Umum&#x27;),
                    safeString(sp.merek),
                    safeString(sp.satuan, &#x27;Pcs&#x27;),
                    safeNumber(sp.stok_min),
                    safeNumber(sp.stok_awal),
                    safeNumber(sp.harga_beli),
                    safeNumber(sp.harga_jual),
                    safeString(sp.satuan_alt),
                    safeNumber(sp.isi_satuan_alt),
                    safeNumber(sp.harga_jual_alt),
                    safeString(sp.pajak_status, &#x27;Non Pajak&#x27;),
                    safeString(sp.kode_pajak),
                    safeString(sp.keterangan)
                ]);

            for (let i = 0; i &lt; values.length; i += 500) {

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
            message: &#x27;Sparepart bulk disimpan&#x27;
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put(&#x27;/api/sparepart/:id&#x27;, async (req, res) =&gt; {

    const id = safeInteger(req.params.id);

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID sparepart tidak valid&#x27;
        });
    }

    try {

        await pool.query(
            &#x27;UPDATE spareparts SET ? WHERE id = ?&#x27;,
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: &#x27;Sparepart diupdate&#x27;
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete(&#x27;/api/sparepart/:id&#x27;, async (req, res) =&gt; {

    const id = safeInteger(req.params.id);

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID sparepart tidak valid&#x27;
        });
    }

    try {

        await pool.query(
            &#x27;DELETE FROM spareparts WHERE id = ?&#x27;,
            [id]
        );

        await pool.query(
            &#x27;DELETE FROM transactions WHERE sparepart_id = ?&#x27;,
            [id]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message: &#x27;Sparepart dihapus&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus sparepart:&#x27;,
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

app.post(&#x27;/api/transactions&#x27;, async (req, res) =&gt; {

    const {
        transactions,
        taxRecords
    } = req.body || {};

    try {

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(transactions) &amp;&amp;
            transactions.length &gt; 0
        ) {

            const values = transactions
                .filter(t =&gt; safeInteger(t.id) !== null)
                .map(t =&gt; [

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
                        : null
                ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(taxRecords) &amp;&amp;
            taxRecords.length &gt; 0
        ) {

            const values = taxRecords
                .filter(t =&gt; t &amp;&amp; t.tax_id)
                .map(t =&gt; [

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

            if (values.length &gt; 0) {

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
            message: &#x27;Transaksi disimpan&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error transaksi:&#x27;,
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
app.post(&#x27;/api/transaction/retur&#x27;, async (req, res) =&gt; {
    const body = req.body || {};

    console.log(&#x27;==========================================&#x27;);
    console.log(&#x27;[RETUR] Request diterima&#x27;);
    console.log(&#x27;[RETUR] Body keys:&#x27;, Object.keys(body));
    console.log(&#x27;[RETUR] Body:&#x27;, JSON.stringify(body, null, 2));
    console.log(&#x27;==========================================&#x27;);

    /*
     * Frontend bisa saja mengirim:
     *
     * {
     *   returRecord: {...},
     *   transactions: [...],
     *   taxRecords: [...]
     * }
     *
     * atau:
     *
     * {
     *   retur: {...},
     *   transactions: [...],
     *   taxRecords: [...]
     * }
     *
     * atau langsung:
     *
     * {
     *   id: &quot;...&quot;,
     *   parent_invoice: &quot;...&quot;,
     *   items: [...]
     * }
     */

    let returRecord =
        body.returRecord ||
        body.retur ||
        body.returnRecord ||
        body.return ||
        null;

    let transactions =
        body.transactions ||
        body.transaction ||
        [];

    let taxRecords =
        body.taxRecords ||
        body.tax_records ||
        [];

    // Jika frontend langsung mengirim object retur tanpa wrapper
    if (!returRecord &amp;&amp; body.id &amp;&amp; (body.parent_invoice || body.parentInvoice)) {
        returRecord = body;
    }

    // Pastikan array
    if (!Array.isArray(transactions)) {
        transactions = [];
    }

    if (!Array.isArray(taxRecords)) {
        taxRecords = [];
    }

    // ============================================================
    // VALIDASI RETUR
    // ============================================================
    if (!returRecord || typeof returRecord !== &#x27;object&#x27;) {
        console.error(&#x27;[RETUR] returRecord tidak ditemukan.&#x27;);
        console.error(&#x27;[RETUR] Body yang diterima:&#x27;, body);

        return res.status(400).json({
            success: false,
            error: &#x27;Data retur tidak valid: returRecord tidak ditemukan&#x27;,
            receivedKeys: Object.keys(body)
        });
    }

    // ============================================================
    // NORMALISASI NAMA FIELD
    // ============================================================
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
        &#x27;&#x27;;

    const pelanggan =
        returRecord.pelanggan ||
        returRecord.customer ||
        returRecord.nama_pelanggan ||
        &#x27;&#x27;;

    const items =
        returRecord.items ||
        returRecord.retur_items ||
        returRecord.return_items ||
        [];

    const exchangeItems =
        returRecord.exchange_items ||
        returRecord.exchangeItems ||
        returRecord.tukar_items ||
        returRecord.tukarItems ||
        [];

    // ============================================================
    // VALIDASI FIELD WAJIB
    // ============================================================
    if (!returId) {
        return res.status(400).json({
            success: false,
            error: &#x27;Data retur tidak valid: ID retur tidak ditemukan&#x27;
        });
    }

    if (!parentInvoice) {
        return res.status(400).json({
            success: false,
            error: &#x27;Data retur tidak valid: nomor invoice tidak ditemukan&#x27;
        });
    }

    // Pastikan items berbentuk array
    const normalizedItems = Array.isArray(items) ? items : [];

    const normalizedExchangeItems =
        Array.isArray(exchangeItems) ? exchangeItems : [];

    // ============================================================
    // DATABASE TRANSACTION
    // ============================================================
    let conn;

    try {
        conn = await pool.getConnection();

        await conn.beginTransaction();

        // ========================================================
        // SIMPAN RETUR RECORD
        // ========================================================
        await conn.query(
            `
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
            `,
            [
                String(returId),
                String(parentInvoice),
                new Date(tanggal),
                String(kasir),
                String(pelanggan),
                JSON.stringify(normalizedItems),
                JSON.stringify(normalizedExchangeItems)
            ]
        );

        // ========================================================
        // SIMPAN TRANSAKSI RETUR / TRANSAKSI TAMBAHAN
        // ========================================================
        if (transactions.length &gt; 0) {

            const values = transactions
                .filter(t =&gt; t &amp;&amp; t.id != null)
                .map(t =&gt; [
                    parseInt(t.id),

                    t.nomor_transaksi ||
                    t.nomorTransaksi ||
                    String(returId),

                    t.tanggal || new Date(),

                    t.sparepart_id ??
                    t.sparepartId ??
                    null,

                    t.custom_item ||
                    t.customItem ||
                    null,

                    t.part_numbers_alt ||
                    t.partNumbersAlt ||
                    &#x27;&#x27;,

                    t.merek || &#x27;&#x27;,

                    t.jenis || &#x27;Keluar&#x27;,

                    Number(t.jumlah) || 0,

                    t.satuan || &#x27;Pcs&#x27;,

                    Number(t.jumlah_dasar ?? t.jumlahDasar) || 0,

                    Number(t.harga_satuan ?? t.hargaSatuan) || 0,

                    t.tujuan || &#x27;&#x27;,

                    t.keterangan || &#x27;&#x27;,

                    t.source || &#x27;retur&#x27;,

                    t.kasir || kasir || &#x27;&#x27;,

                    t.status_bayar || &#x27;Lunas&#x27;,

                    t.metode_bayar || &#x27;&#x27;,

                    Number(t.bayar_tunai) || 0,

                    Number(t.transfer_amount) || 0,

                    Number(t.kembalian_diberikan) || 0,

                    Number(t.diskon) || 0,

                    t.tanggal_lunas || null
                ]);

            if (values.length &gt; 0) {
                await conn.query(
                    `
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
                    `,
                    [values]
                );
            }
        }

        // ========================================================
        // SIMPAN TAX RECORD
        // ========================================================
        if (taxRecords.length &gt; 0) {

            const values = taxRecords
                .filter(t =&gt; t &amp;&amp; t.tax_id != null)
                .map(t =&gt; [
                    String(t.tax_id),

                    parseInt(
                        t.trx_id ??
                        t.trxId ??
                        0
                    ),

                    t.tanggal || new Date(),

                    t.nomor_transaksi ||
                    t.nomorTransaksi ||
                    String(returId),

                    t.part_number ||
                    t.partNumber ||
                    &#x27;&#x27;,

                    t.nama || &#x27;&#x27;,

                    t.kategori || &#x27;&#x27;,

                    t.merek || &#x27;&#x27;,

                    t.status_bayar ||
                    t.statusBayar ||
                    &#x27;Lunas&#x27;,

                    t.pelanggan ||
                    t.customer ||
                    pelanggan ||
                    &#x27;&#x27;,

                    Number(t.jumlah) || 0,

                    t.satuan || &#x27;Pcs&#x27;,

                    Number(
                        t.harga_satuan ??
                        t.hargaSatuan
                    ) || 0,

                    Number(t.subtotal) || 0,

                    Number(
                        t.persentase_pajak ??
                        t.persentasePajak
                    ) || 0,

                    Number(
                        t.nilai_pajak ??
                        t.nilaiPajak
                    ) || 0
                ]);

            if (values.length &gt; 0) {
                await conn.query(
                    `
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
                    `,
                    [values]
                );
            }
        }

        // ========================================================
        // VERIFIKASI RETUR
        // ========================================================
        const [verify] = await conn.query(
            `
            SELECT
                id,
                parent_invoice,
                tanggal
            FROM retur_records
            WHERE id = ?
            LIMIT 1
            `,
            [String(returId)]
        );

        if (verify.length === 0) {
            await conn.rollback();

            return res.status(500).json({
                success: false,
                error: &#x27;Verifikasi gagal: data retur tidak tersimpan di database&#x27;
            });
        }

        // ========================================================
        // COMMIT
        // ========================================================
        await conn.commit();

        invalidateDataCache();

        console.log(
            &#x27;[RETUR] Berhasil disimpan:&#x27;,
            String(returId),
            &#x27;Invoice:&#x27;,
            String(parentInvoice)
        );

        return res.json({
            success: true,
            message: &#x27;Retur berhasil disimpan ke server&#x27;,
            returId: String(returId),
            parentInvoice: String(parentInvoice)
        });

    } catch (error) {

        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error(
                    &#x27;[RETUR] Rollback error:&#x27;,
                    rollbackError
                );
            }
        }

        console.error(
            &#x27;[RETUR] ERROR:&#x27;,
            error
        );

        return res.status(500).json({
            success: false,
            error: &#x27;Gagal menyimpan retur: &#x27; + error.message
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

app.post(&#x27;/api/transaction/delete-invoice&#x27;, async (req, res) =&gt; {

    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === &#x27;&#x27;
    ) {

        return res.status(400).json({
            success: false,
            error: &#x27;Nomor invoice tidak valid&#x27;
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

        if (returs.length &gt; 0) {

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
                &#x27;Invoice &amp; retur berhasil dihapus dari server&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus invoice:&#x27;,
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

app.post(&#x27;/api/transaction/delete-retur&#x27;, async (req, res) =&gt; {

    const returId =
        req.body?.returId;

    if (
        returId === undefined ||
        returId === null ||
        String(returId).trim() === &#x27;&#x27;
    ) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID retur tidak valid&#x27;
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
                &#x27;Retur berhasil dihapus dari server&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus retur:&#x27;,
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

app.post(&#x27;/api/transaction/delete&#x27;, async (req, res) =&gt; {

    const cleanId =
        safeInteger(req.body?.id);

    if (cleanId === null) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID transaksi tidak valid&#x27;
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
                &#x27;Transaksi berhasil dihapus dari server&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus transaksi:&#x27;,
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

app.put(&#x27;/api/transaction/edit-struk&#x27;, async (req, res) =&gt; {

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
        String(invoice).trim() === &#x27;&#x27;
    ) {

        return res.status(400).json({
            success: false,
            error: &#x27;Invoice tidak valid&#x27;
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
                    &#x27;Invoice tidak ditemukan di database&#x27;
            });
        }

        // ----------------------------------------------------
        // Update berdasarkan index database
        // ----------------------------------------------------

        for (
            let i = 0;
            i &lt; trxRows.length;
            i++
        ) {

            if (
                i &gt;= items.length
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
            diskon !== undefined &amp;&amp;
            diskon !== null &amp;&amp;
            trxRows.length &gt; 0
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
            &#x27;[EDIT STRUK] SUCCESS:&#x27;,
            invoice
        );

        res.json({
            success: true,
            message:
                &#x27;Struk berhasil diedit&#x27;,
            invoice:
                String(invoice)
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            &#x27;[EDIT STRUK] ERROR:&#x27;,
            error
        );

        res.status(500).json({
            success: false,
            error:
                &#x27;Gagal menyimpan edit struk: &#x27; +
                error.message
        });

    } finally {

        conn.release();
    }
});

// ============================================================
// 11. PAYOFF / PELUNASAN BON
// ============================================================

app.put(&#x27;/api/transactions/payoff&#x27;, async (req, res) =&gt; {

    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(trxId).trim() === &#x27;&#x27;
    ) {

        return res.status(400).json({
            success: false,
            error: &#x27;Nomor invoice tidak valid&#x27;
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
                    &#x27;Invoice tidak ditemukan&#x27;
            });
        }

        const isAlreadyLunas =
            trxRows.every(
                t =&gt;
                    t.status_bayar === &#x27;Lunas&#x27;
            );

        if (isAlreadyLunas) {

            await conn.rollback();

            return res.status(400).json({
                success: false,
                error:
                    &#x27;Invoice sudah lunas&#x27;
            });
        }

        const total =
            trxRows.reduce(
                (sum, t) =&gt;
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
                status_bayar = &#x27;Lunas&#x27;,
                keterangan = &#x27;Bon (Lunas)&#x27;,
                tanggal_lunas = NOW()
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await conn.query(`
            UPDATE tax_records
            SET status_bayar = &#x27;Lunas&#x27;
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
                kasir
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            Date.now(),
            new Date(),
            total,
            &#x27;Pelunasan Bon: &#x27; +
                String(trxId),
            trxRows[0].kasir ||
                &#x27;Admin&#x27;
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                &#x27;Piutang berhasil dilunasi&#x27;,
            total
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            &#x27;Error payoff:&#x27;,
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

app.put(&#x27;/api/transaction/:id&#x27;, async (req, res) =&gt; {

    const transactionId =
        safeInteger(req.params.id);

    if (
        transactionId === null ||
        transactionId &lt;= 0
    ) {

        return res.status(400).json({
            success: false,
            error:
                &#x27;ID transaksi tidak valid&#x27;
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
                &#x27;Transaksi berhasil diupdate&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error edit transaksi:&#x27;,
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

app.post(&#x27;/api/cash-expense/delete&#x27;, async (req, res) =&gt; {

    const id =
        safeInteger(
            req.body?.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID kas tidak valid&#x27;
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
                &#x27;Pengeluaran kas berhasil dihapus&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus cash expense:&#x27;,
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

app.post(&#x27;/api/cash-inflow/delete&#x27;, async (req, res) =&gt; {

    const id =
        safeInteger(
            req.body?.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error: &#x27;ID kas tidak valid&#x27;
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
                &#x27;Tambahan kas berhasil dihapus&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error hapus cash inflow:&#x27;,
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

app.post(&#x27;/api/partner&#x27;, async (req, res) =&gt; {

    try {

        await pool.query(
            &#x27;INSERT INTO partners SET ?&#x27;,
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                &#x27;Partner disimpan&#x27;
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put(&#x27;/api/partner/:id&#x27;, async (req, res) =&gt; {

    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error:
                &#x27;ID partner tidak valid&#x27;
        });
    }

    try {

        await pool.query(
            &#x27;UPDATE partners SET ? WHERE id = ?&#x27;,
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                &#x27;Partner diupdate&#x27;
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete(&#x27;/api/partner/:id&#x27;, async (req, res) =&gt; {

    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {

        return res.status(400).json({
            success: false,
            error:
                &#x27;ID partner tidak valid&#x27;
        });
    }

    try {

        await pool.query(
            &#x27;DELETE FROM partners WHERE id = ?&#x27;,
            [id]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                &#x27;Partner dihapus&#x27;
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

app.put(&#x27;/api/settings&#x27;, async (req, res) =&gt; {

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
            Array.isArray(cashExpenses) &amp;&amp;
            cashExpenses.length &gt; 0
        ) {

            const values =
                cashExpenses
                    .filter(
                        e =&gt;
                            safeInteger(e.id) !== null
                    )
                    .map(e =&gt; [
                        safeInteger(e.id),
                        safeDate(e.tanggal),
                        safeNumber(e.jumlah),
                        safeString(e.keterangan),
                        safeString(e.kasir)
                    ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(cashInflows) &amp;&amp;
            cashInflows.length &gt; 0
        ) {

            const values =
                cashInflows
                    .filter(
                        i =&gt;
                            safeInteger(i.id) !== null
                    )
                    .map(i =&gt; [
                        safeInteger(i.id),
                        safeDate(i.tanggal),
                        safeNumber(i.jumlah),
                        safeString(i.keterangan),
                        safeString(i.kasir)
                    ]);

            if (values.length &gt; 0) {

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
            success: true,
            message:
                &#x27;Settings berhasil disimpan&#x27;
        });

    } catch (error) {

        console.error(
            &#x27;Error settings:&#x27;,
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

app.post(&#x27;/api/restore&#x27;, async (req, res) =&gt; {

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
            &#x27;DELETE FROM spareparts&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM transactions&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM partners&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM cash_expenses&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM cash_inflows&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM tax_records&#x27;
        );

        await conn.query(
            &#x27;DELETE FROM retur_records&#x27;
        );

        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(data.spareparts) &amp;&amp;
            data.spareparts.length &gt; 0
        ) {

            const values =
                data.spareparts
                    .filter(
                        sp =&gt;
                            safeInteger(sp.id) !== null
                    )
                    .map(sp =&gt; [
                        safeInteger(sp.id),
                        safeString(sp.kode),
                        safeString(sp.part_number),
                        safeString(sp.part_numbers_alt),
                        safeString(sp.nama),
                        safeString(sp.kategori, &#x27;Umum&#x27;),
                        safeString(sp.merek),
                        safeString(sp.satuan, &#x27;Pcs&#x27;),
                        safeNumber(sp.stok_min),
                        safeNumber(sp.stok_awal),
                        safeNumber(sp.harga_beli),
                        safeNumber(sp.harga_jual),
                        safeString(sp.satuan_alt),
                        safeNumber(sp.isi_satuan_alt),
                        safeNumber(sp.harga_jual_alt),
                        safeString(sp.pajak_status, &#x27;Non Pajak&#x27;),
                        safeString(sp.kode_pajak),
                        safeString(sp.keterangan)
                    ]);

            for (
                let i = 0;
                i &lt; values.length;
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
            Array.isArray(data.transactions) &amp;&amp;
            data.transactions.length &gt; 0
        ) {

            const values =
                data.transactions
                    .filter(
                        t =&gt;
                            safeInteger(t.id) !== null
                    )
                    .map(t =&gt; [

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
                            : null
                    ]);

            for (
                let i = 0;
                i &lt; values.length;
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
            Array.isArray(data.partners) &amp;&amp;
            data.partners.length &gt; 0
        ) {

            const values =
                data.partners
                    .filter(
                        p =&gt;
                            safeInteger(p.id) !== null
                    )
                    .map(p =&gt; [
                        safeInteger(p.id),
                        safeString(p.nama),
                        safeString(p.tipe),
                        safeString(p.telp),
                        safeString(p.alamat)
                    ]);

            if (values.length &gt; 0) {

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
            Array.isArray(data.cashExpenses) &amp;&amp;
            data.cashExpenses.length &gt; 0
        ) {

            const values =
                data.cashExpenses
                    .filter(
                        e =&gt;
                            safeInteger(e.id) !== null
                    )
                    .map(e =&gt; [
                        safeInteger(e.id),
                        safeDate(e.tanggal),
                        safeNumber(e.jumlah),
                        safeString(e.keterangan),
                        safeString(e.kasir)
                    ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(data.cashInflows) &amp;&amp;
            data.cashInflows.length &gt; 0
        ) {

            const values =
                data.cashInflows
                    .filter(
                        i =&gt;
                            safeInteger(i.id) !== null
                    )
                    .map(i =&gt; [
                        safeInteger(i.id),
                        safeDate(i.tanggal),
                        safeNumber(i.jumlah),
                        safeString(i.keterangan),
                        safeString(i.kasir)
                    ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(data.taxRecords) &amp;&amp;
            data.taxRecords.length &gt; 0
        ) {

            const values =
                data.taxRecords
                    .filter(
                        t =&gt;
                            t &amp;&amp;
                            t.tax_id
                    )
                    .map(t =&gt; [

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

            if (values.length &gt; 0) {

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
            Array.isArray(data.returRecords) &amp;&amp;
            data.returRecords.length &gt; 0
        ) {

            const values =
                data.returRecords
                    .filter(
                        r =&gt;
                            r &amp;&amp;
                            r.id !== undefined &amp;&amp;
                            r.id !== null &amp;&amp;
                            String(r.id).trim() !== &#x27;&#x27;
                    )
                    .map(r =&gt; [

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
                        )
                    ]);

            if (values.length &gt; 0) {

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

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        await conn.query(`
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
            ),

            JSON.stringify(
                Array.isArray(data.shiftSessions)
                    ? data.shiftSessions
                    : []
            )
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                &#x27;Restore data berhasil!&#x27;
        });

    } catch (error) {

        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            &#x27;Error restore:&#x27;,
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
    () =&gt; {
        console.log(
            `Server berjalan di port ${PORT}`
        );
    }
);</pre>

<script>
const source = 'const express = require(\'express\');\nconst cors = require(\'cors\');\nconst bodyParser = require(\'body-parser\');\nconst mysql = require(\'mysql2/promise\');\n\nconst app = express();\n\napp.use(cors());\napp.use(bodyParser.json({ limit: \'50mb\' }));\n\n// ============================================================\n// TEST SERVER\n// ============================================================\n\napp.get(\'/api/test\', (req, res) => {\n    res.json({\n        status: \'OK\',\n        message: \'Server berhasil berjalan!\'\n    });\n});\n\n// ============================================================\n// DATABASE CLEVER CLOUD\n// ============================================================\n\nconst pool = mysql.createPool({\n    host: \'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com\',\n    user: \'uks2krvuygsynrco\',\n    password: \'fWwkTbshbBANrTGMj8Aq\',\n    database: \'b7fgoctdsrijlfhczppz\',\n    waitForConnections: true,\n    connectionLimit: 4,\n    queueLimit: 0\n});\n\n// ============================================================\n// ERROR HANDLER\n// ============================================================\n\npool.on(\'error\', (err) => {\n    console.error(\'Database pool error:\', err);\n});\n\nprocess.on(\'unhandledRejection\', (reason) => {\n    console.error(\'Unhandled Rejection:\', reason);\n});\n\nprocess.on(\'uncaughtException\', (error) => {\n    console.error(\'Uncaught Exception:\', error);\n});\n\n// ============================================================\n// CACHE DATA\n// ============================================================\n\nlet dataCache = null;\nlet dataCacheTime = 0;\n\nconst DATA_CACHE_TTL = 2000;\n\nfunction invalidateDataCache() {\n    dataCache = null;\n    dataCacheTime = 0;\n}\n\n// Semua request selain GET dianggap mengubah data\napp.use((req, res, next) => {\n    if (req.method !== \'GET\') {\n        invalidateDataCache();\n    }\n\n    next();\n});\n\n// ============================================================\n// HELPER\n// ============================================================\n\nfunction safeNumber(value, defaultValue = 0) {\n    const n = Number(value);\n\n    if (!Number.isFinite(n)) {\n        return defaultValue;\n    }\n\n    return n;\n}\n\nfunction safeInteger(value, defaultValue = null) {\n    const n = Number(value);\n\n    if (!Number.isInteger(n)) {\n        return defaultValue;\n    }\n\n    return n;\n}\n\nfunction safeString(value, defaultValue = \'\') {\n    if (value === undefined || value === null) {\n        return defaultValue;\n    }\n\n    return String(value);\n}\n\nfunction safeDate(value) {\n    if (!value) {\n        return new Date();\n    }\n\n    const d = new Date(value);\n\n    if (Number.isNaN(d.getTime())) {\n        return new Date();\n    }\n\n    return d;\n}\n\nfunction safeJSON(value, defaultValue = []) {\n    if (value === undefined || value === null) {\n        return defaultValue;\n    }\n\n    if (Array.isArray(value) || typeof value === \'object\') {\n        return value;\n    }\n\n    if (typeof value === \'string\') {\n        try {\n            return JSON.parse(value);\n        } catch (e) {\n            return defaultValue;\n        }\n    }\n\n    return defaultValue;\n}\n\n// ============================================================\n// 1. INISIALISASI TABEL\n// ============================================================\n\napp.get(\'/api/init\', async (req, res) => {\n    try {\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS spareparts (\n                id BIGINT PRIMARY KEY,\n                kode VARCHAR(50),\n                part_number VARCHAR(255),\n                part_numbers_alt TEXT,\n                nama VARCHAR(500),\n                kategori VARCHAR(100),\n                merek VARCHAR(100),\n                satuan VARCHAR(50),\n                stok_min INT DEFAULT 0,\n                stok_awal INT DEFAULT 0,\n                harga_beli BIGINT DEFAULT 0,\n                harga_jual BIGINT DEFAULT 0,\n                satuan_alt VARCHAR(50),\n                isi_satuan_alt INT DEFAULT 0,\n                harga_jual_alt BIGINT DEFAULT 0,\n                pajak_status VARCHAR(20),\n                kode_pajak VARCHAR(50),\n                keterangan TEXT\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS transactions (\n                id BIGINT PRIMARY KEY,\n                nomor_transaksi VARCHAR(50),\n                tanggal DATETIME,\n                sparepart_id BIGINT,\n                custom_item VARCHAR(500),\n                part_numbers_alt TEXT,\n                merek VARCHAR(100),\n                jenis VARCHAR(20),\n                jumlah INT,\n                satuan VARCHAR(50),\n                jumlah_dasar INT,\n                harga_satuan BIGINT,\n                tujuan VARCHAR(255),\n                keterangan TEXT,\n                source VARCHAR(50),\n                kasir VARCHAR(100),\n                status_bayar VARCHAR(20),\n                metode_bayar VARCHAR(50),\n                bayar_tunai BIGINT DEFAULT 0,\n                transfer_amount BIGINT DEFAULT 0,\n                kembalian_diberikan BIGINT DEFAULT 0,\n                diskon BIGINT DEFAULT 0,\n                tanggal_lunas DATETIME NULL\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS partners (\n                id BIGINT PRIMARY KEY,\n                nama VARCHAR(255),\n                tipe VARCHAR(50),\n                telp VARCHAR(50),\n                alamat TEXT\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS cash_expenses (\n                id BIGINT PRIMARY KEY,\n                tanggal DATETIME,\n                jumlah BIGINT,\n                keterangan TEXT,\n                kasir VARCHAR(100)\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS cash_inflows (\n                id BIGINT PRIMARY KEY,\n                tanggal DATETIME,\n                jumlah BIGINT,\n                keterangan TEXT,\n                kasir VARCHAR(100)\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS tax_records (\n                tax_id VARCHAR(100) PRIMARY KEY,\n                trx_id BIGINT,\n                tanggal DATETIME,\n                nomor_transaksi VARCHAR(50),\n                part_number VARCHAR(255),\n                nama VARCHAR(500),\n                kategori VARCHAR(100),\n                merek VARCHAR(100),\n                status_bayar VARCHAR(20),\n                pelanggan VARCHAR(255),\n                jumlah INT,\n                satuan VARCHAR(50),\n                harga_satuan BIGINT,\n                subtotal BIGINT,\n                persentase_pajak DECIMAL(5,2),\n                nilai_pajak BIGINT\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS retur_records (\n                id VARCHAR(50) PRIMARY KEY,\n                parent_invoice VARCHAR(50),\n                tanggal DATETIME,\n                kasir VARCHAR(100),\n                pelanggan VARCHAR(255),\n                items JSON,\n                exchange_items JSON\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        // =====================================================\n        // Pastikan exchange_items tersedia pada database lama\n        // =====================================================\n\n        try {\n            await pool.query(`\n                ALTER TABLE retur_records\n                ADD COLUMN exchange_items JSON\n            `);\n        } catch (e) {\n            // Kolom kemungkinan sudah ada.\n        }\n\n        await pool.query(`\n            CREATE TABLE IF NOT EXISTS app_settings (\n                id INT PRIMARY KEY DEFAULT 1,\n                kas_awal BIGINT DEFAULT 0,\n                active_shift_start BIGINT,\n                master_pajak JSON,\n                users JSON,\n                shift_sessions JSON\n            )\n            ENGINE=InnoDB\n            DEFAULT CHARSET=utf8mb4\n        `);\n\n        // Pastikan kolom shift_sessions tersedia pada database lama.\n        try {\n            await pool.query(`\n                ALTER TABLE app_settings\n                ADD COLUMN shift_sessions JSON\n            `);\n        } catch (e) {\n            // Kolom sudah ada, lanjut.\n        }\n\n        const [settings] = await pool.query(`\n            SELECT *\n            FROM app_settings\n            WHERE id = 1\n        `);\n\n        if (settings.length === 0) {\n\n            await pool.query(`\n                INSERT INTO app_settings\n                (\n                    id,\n                    kas_awal,\n                    active_shift_start,\n                    master_pajak,\n                    users,\n                    shift_sessions\n                )\n                VALUES (?, ?, ?, ?, ?, ?)\n            `, [\n                1,\n                0,\n                Date.now(),\n                JSON.stringify([\n                    {\n                        jenis: \'Aki Basah\',\n                        persentase: 20\n                    },\n                    {\n                        jenis: \'Aki Kering\',\n                        persentase: 11\n                    },\n                    {\n                        jenis: \'Oli\',\n                        persentase: 4\n                    },\n                    {\n                        jenis: \'Air Radiator\',\n                        persentase: 4\n                    },\n                    {\n                        jenis: \'Minyak Rem\',\n                        persentase: 4\n                    },\n                    {\n                        jenis: \'Lainnya\',\n                        persentase: 11\n                    }\n                ]),\n                JSON.stringify([\n                    {\n                        username: \'owner\',\n                        password: \'owner123\',\n                        role: \'Owner\',\n                        name: \'Pemilik\'\n                    },\n                    {\n                        username: \'admin\',\n                        password: \'admin123\',\n                        role: \'Admin\',\n                        name: \'Administrator\'\n                    },\n                    {\n                        username: \'pagi\',\n                        password: \'pagi123\',\n                        role: \'Kasir\',\n                        name: \'Kasir Pagi\'\n                    },\n                    {\n                        username: \'siang\',\n                        password: \'siang123\',\n                        role: \'Kasir\',\n                        name: \'Kasir Siang\'\n                    }\n                ]),\n                JSON.stringify([])\n            ]);\n        }\n\n        res.json({\n            success: true,\n            message: \'Database & tabel siap!\'\n        });\n\n    } catch (error) {\n\n        console.error(\'INIT ERROR:\', error);\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 2. MIGRASI DATA\n// ============================================================\n\napp.post(\'/api/migrate\', async (req, res) => {\n\n    const oldData = req.body || {};\n\n    try {\n\n        // ----------------------------------------------------\n        // SPAREPART\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.spareparts) &&\n            oldData.spareparts.length > 0\n        ) {\n\n            const values = oldData.spareparts.map(sp => [\n                safeInteger(sp.id, Date.now()),\n                safeString(sp.kode),\n                safeString(sp.part_number),\n                safeString(sp.part_numbers_alt),\n                safeString(sp.nama),\n                safeString(sp.kategori, \'Umum\'),\n                safeString(sp.merek),\n                safeString(sp.satuan, \'Pcs\'),\n                safeNumber(sp.stok_min),\n                safeNumber(sp.stok_awal),\n                safeNumber(sp.harga_beli),\n                safeNumber(sp.harga_jual),\n                safeString(sp.satuan_alt),\n                safeNumber(sp.isi_satuan_alt),\n                safeNumber(sp.harga_jual_alt),\n                safeString(sp.pajak_status, \'Non Pajak\'),\n                safeString(sp.kode_pajak),\n                safeString(sp.keterangan)\n            ]);\n\n            for (let i = 0; i < values.length; i += 500) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO spareparts\n                    (\n                        id,\n                        kode,\n                        part_number,\n                        part_numbers_alt,\n                        nama,\n                        kategori,\n                        merek,\n                        satuan,\n                        stok_min,\n                        stok_awal,\n                        harga_beli,\n                        harga_jual,\n                        satuan_alt,\n                        isi_satuan_alt,\n                        harga_jual_alt,\n                        pajak_status,\n                        kode_pajak,\n                        keterangan\n                    )\n                    VALUES ?\n                `, [\n                    values.slice(i, i + 500)\n                ]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // TRANSACTIONS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.transactions) &&\n            oldData.transactions.length > 0\n        ) {\n\n            const values = oldData.transactions\n                .filter(t => safeInteger(t.id) !== null)\n                .map(t => [\n\n                    safeInteger(t.id),\n\n                    safeString(t.nomor_transaksi),\n\n                    safeDate(t.tanggal),\n\n                    safeInteger(t.sparepart_id),\n\n                    t.custom_item || null,\n\n                    safeString(t.part_numbers_alt),\n\n                    safeString(t.merek),\n\n                    safeString(t.jenis),\n\n                    safeNumber(t.jumlah),\n\n                    safeString(t.satuan),\n\n                    safeNumber(t.jumlah_dasar),\n\n                    safeNumber(t.harga_satuan),\n\n                    safeString(t.tujuan),\n\n                    safeString(t.keterangan),\n\n                    safeString(t.source),\n\n                    safeString(t.kasir),\n\n                    safeString(t.status_bayar),\n\n                    safeString(t.metode_bayar),\n\n                    safeNumber(t.bayar_tunai),\n\n                    safeNumber(t.transfer_amount),\n\n                    safeNumber(t.kembalian_diberikan),\n\n                    safeNumber(t.diskon),\n\n                    t.tanggal_lunas\n                        ? safeDate(t.tanggal_lunas)\n                        : null\n                ]);\n\n            for (let i = 0; i < values.length; i += 500) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO transactions\n                    (\n                        id,\n                        nomor_transaksi,\n                        tanggal,\n                        sparepart_id,\n                        custom_item,\n                        part_numbers_alt,\n                        merek,\n                        jenis,\n                        jumlah,\n                        satuan,\n                        jumlah_dasar,\n                        harga_satuan,\n                        tujuan,\n                        keterangan,\n                        source,\n                        kasir,\n                        status_bayar,\n                        metode_bayar,\n                        bayar_tunai,\n                        transfer_amount,\n                        kembalian_diberikan,\n                        diskon,\n                        tanggal_lunas\n                    )\n                    VALUES ?\n                `, [\n                    values.slice(i, i + 500)\n                ]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // PARTNERS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.partners) &&\n            oldData.partners.length > 0\n        ) {\n\n            const values = oldData.partners\n                .filter(p => safeInteger(p.id) !== null)\n                .map(p => [\n                    safeInteger(p.id),\n                    safeString(p.nama),\n                    safeString(p.tipe),\n                    safeString(p.telp),\n                    safeString(p.alamat)\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO partners\n                    (\n                        id,\n                        nama,\n                        tipe,\n                        telp,\n                        alamat\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // CASH EXPENSES\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.cashExpenses) &&\n            oldData.cashExpenses.length > 0\n        ) {\n\n            const values = oldData.cashExpenses\n                .filter(e => safeInteger(e.id) !== null)\n                .map(e => [\n                    safeInteger(e.id),\n                    safeDate(e.tanggal),\n                    safeNumber(e.jumlah),\n                    safeString(e.keterangan),\n                    safeString(e.kasir)\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO cash_expenses\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // CASH INFLOWS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.cashInflows) &&\n            oldData.cashInflows.length > 0\n        ) {\n\n            const values = oldData.cashInflows\n                .filter(i => safeInteger(i.id) !== null)\n                .map(i => [\n                    safeInteger(i.id),\n                    safeDate(i.tanggal),\n                    safeNumber(i.jumlah),\n                    safeString(i.keterangan),\n                    safeString(i.kasir)\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO cash_inflows\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // TAX RECORDS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(oldData.taxRecords) &&\n            oldData.taxRecords.length > 0\n        ) {\n\n            const values = oldData.taxRecords\n                .filter(t => t.tax_id)\n                .map(t => [\n                    safeString(t.tax_id),\n                    safeInteger(t.trx_id, 0),\n                    safeDate(t.tanggal),\n                    safeString(t.nomor_transaksi),\n                    safeString(t.part_number),\n                    safeString(t.nama),\n                    safeString(t.kategori),\n                    safeString(t.merek),\n                    safeString(t.status_bayar),\n                    safeString(t.pelanggan),\n                    safeNumber(t.jumlah),\n                    safeString(t.satuan),\n                    safeNumber(t.harga_satuan),\n                    safeNumber(t.subtotal),\n                    safeNumber(t.persentase_pajak),\n                    safeNumber(t.nilai_pajak)\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO tax_records\n                    (\n                        tax_id,\n                        trx_id,\n                        tanggal,\n                        nomor_transaksi,\n                        part_number,\n                        nama,\n                        kategori,\n                        merek,\n                        status_bayar,\n                        pelanggan,\n                        jumlah,\n                        satuan,\n                        harga_satuan,\n                        subtotal,\n                        persentase_pajak,\n                        nilai_pajak\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // SETTINGS\n        // ----------------------------------------------------\n\n        if (\n            oldData.kasAwal !== undefined ||\n            oldData.users\n        ) {\n\n            await pool.query(`\n                UPDATE app_settings\n                SET\n                    kas_awal = ?,\n                    active_shift_start = ?,\n                    master_pajak = ?,\n                    users = ?,\n                    shift_sessions = ?\n                WHERE id = 1\n            `, [\n                safeNumber(oldData.kasAwal),\n                oldData.activeShiftStart || Date.now(),\n                JSON.stringify(oldData.masterPajak || []),\n                JSON.stringify(oldData.users || []),\n                JSON.stringify(Array.isArray(oldData.shiftSessions) ? oldData.shiftSessions : [])\n            ]);\n        }\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Migrasi data lama berhasil!\'\n        });\n\n    } catch (error) {\n\n        console.error(\'MIGRATE ERROR:\', error);\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 3. GET ALL DATA\n// ============================================================\n\napp.get(\'/api/data\', async (req, res) => {\n\n    const now = Date.now();\n\n    if (\n        dataCache &&\n        (now - dataCacheTime) < DATA_CACHE_TTL\n    ) {\n        return res.json(dataCache);\n    }\n\n    let connection;\n\n    try {\n\n        connection = await pool.getConnection();\n\n        const [spareparts] = await connection.query(`\n            SELECT *\n            FROM spareparts\n        `);\n\n        const [transactions] = await connection.query(`\n            SELECT *\n            FROM transactions\n        `);\n\n        const [partners] = await connection.query(`\n            SELECT *\n            FROM partners\n        `);\n\n        const [cashExpenses] = await connection.query(`\n            SELECT *\n            FROM cash_expenses\n        `);\n\n        const [cashInflows] = await connection.query(`\n            SELECT *\n            FROM cash_inflows\n        `);\n\n        const [taxRecords] = await connection.query(`\n            SELECT *\n            FROM tax_records\n        `);\n\n        let returs = [];\n\n        try {\n\n            const [returResult] = await connection.query(`\n                SELECT *\n                FROM retur_records\n            `);\n\n            returs = returResult;\n\n        } catch (e) {\n\n            console.error(\n                \'Gagal membaca retur_records:\',\n                e.message\n            );\n        }\n\n        const [settings] = await connection.query(`\n            SELECT *\n            FROM app_settings\n            WHERE id = 1\n        `);\n\n        // ----------------------------------------------------\n        // DATE CONVERSION\n        // ----------------------------------------------------\n\n        transactions.forEach(t => {\n\n            if (t.tanggal instanceof Date) {\n                t.tanggal = t.tanggal.toISOString();\n            }\n\n            if (t.tanggal_lunas instanceof Date) {\n                t.tanggal_lunas =\n                    t.tanggal_lunas.toISOString();\n            }\n        });\n\n        cashExpenses.forEach(e => {\n\n            if (e.tanggal instanceof Date) {\n                e.tanggal =\n                    e.tanggal.toISOString();\n            }\n        });\n\n        cashInflows.forEach(i => {\n\n            if (i.tanggal instanceof Date) {\n                i.tanggal =\n                    i.tanggal.toISOString();\n            }\n        });\n\n        taxRecords.forEach(t => {\n\n            if (t.tanggal instanceof Date) {\n                t.tanggal =\n                    t.tanggal.toISOString();\n            }\n        });\n\n        // ----------------------------------------------------\n        // RETUR\n        // ----------------------------------------------------\n\n        const returRecords = returs.map(r => {\n\n            let items = safeJSON(r.items, []);\n\n            let exchangeItems =\n                safeJSON(r.exchange_items, []);\n\n            if (!Array.isArray(items)) {\n                items = [];\n            }\n\n            if (!Array.isArray(exchangeItems)) {\n                exchangeItems = [];\n            }\n\n            let tanggal = r.tanggal;\n\n            if (tanggal) {\n                tanggal = safeDate(tanggal).toISOString();\n            }\n\n            return {\n                ...r,\n\n                id: safeString(r.id),\n\n                parent_invoice:\n                    safeString(r.parent_invoice),\n\n                tanggal,\n\n                kasir:\n                    safeString(r.kasir),\n\n                pelanggan:\n                    safeString(r.pelanggan),\n\n                items,\n\n                exchange_items:\n                    exchangeItems\n            };\n        });\n\n        // ----------------------------------------------------\n        // SETTINGS\n        // ----------------------------------------------------\n\n        let masterPajak =\n            settings[0]?.master_pajak || [];\n\n        if (typeof masterPajak === \'string\') {\n\n            try {\n                masterPajak =\n                    JSON.parse(masterPajak);\n            } catch (e) {\n                masterPajak = [];\n            }\n        }\n\n        let users =\n            settings[0]?.users || [];\n\n        if (typeof users === \'string\') {\n\n            try {\n                users =\n                    JSON.parse(users);\n            } catch (e) {\n                users = [];\n            }\n        }\n\n        let shiftSessions =\n            settings[0]?.shift_sessions || [];\n\n        if (typeof shiftSessions === \'string\') {\n            try {\n                shiftSessions = JSON.parse(shiftSessions);\n            } catch (e) {\n                shiftSessions = [];\n            }\n        }\n\n        if (!Array.isArray(shiftSessions)) {\n            shiftSessions = [];\n        }\n\n        const result = {\n\n            spareparts,\n\n            transactions,\n\n            partners,\n\n            cashExpenses,\n\n            cashInflows,\n\n            taxRecords,\n\n            returRecords,\n\n            kasAwal:\n                settings[0]?.kas_awal || 0,\n\n            activeShiftStart:\n                settings[0]?.active_shift_start ||\n                Date.now(),\n\n            masterPajak,\n\n            users,\n\n            shiftSessions\n        };\n\n        dataCache = result;\n        dataCacheTime = Date.now();\n\n        res.json(result);\n\n    } catch (error) {\n\n        console.error(\n            \'Error GET DATA:\',\n            error\n        );\n\n        // Jangan mengembalikan cache lama\n        // jika database benar-benar gagal.\n        if (dataCache) {\n\n            console.log(\n                \'Mengembalikan data cache karena error database\'\n            );\n\n            return res.json(dataCache);\n        }\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n\n    } finally {\n\n        if (connection) {\n            connection.release();\n        }\n    }\n});\n\n// ============================================================\n// 4. SPAREPART\n// ============================================================\n\napp.post(\'/api/sparepart\', async (req, res) => {\n\n    try {\n\n        await pool.query(\n            \'INSERT INTO spareparts SET ?\',\n            req.body\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Sparepart disimpan\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error sparepart:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\napp.post(\'/api/sparepart/bulk\', async (req, res) => {\n\n    const { items } = req.body;\n\n    try {\n\n        if (\n            Array.isArray(items) &&\n            items.length > 0\n        ) {\n\n            const values = items\n                .filter(sp => safeInteger(sp.id) !== null)\n                .map(sp => [\n                    safeInteger(sp.id),\n                    safeString(sp.kode),\n                    safeString(sp.part_number),\n                    safeString(sp.part_numbers_alt),\n                    safeString(sp.nama),\n                    safeString(sp.kategori, \'Umum\'),\n                    safeString(sp.merek),\n                    safeString(sp.satuan, \'Pcs\'),\n                    safeNumber(sp.stok_min),\n                    safeNumber(sp.stok_awal),\n                    safeNumber(sp.harga_beli),\n                    safeNumber(sp.harga_jual),\n                    safeString(sp.satuan_alt),\n                    safeNumber(sp.isi_satuan_alt),\n                    safeNumber(sp.harga_jual_alt),\n                    safeString(sp.pajak_status, \'Non Pajak\'),\n                    safeString(sp.kode_pajak),\n                    safeString(sp.keterangan)\n                ]);\n\n            for (let i = 0; i < values.length; i += 500) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO spareparts\n                    (\n                        id,\n                        kode,\n                        part_number,\n                        part_numbers_alt,\n                        nama,\n                        kategori,\n                        merek,\n                        satuan,\n                        stok_min,\n                        stok_awal,\n                        harga_beli,\n                        harga_jual,\n                        satuan_alt,\n                        isi_satuan_alt,\n                        harga_jual_alt,\n                        pajak_status,\n                        kode_pajak,\n                        keterangan\n                    )\n                    VALUES ?\n                `, [\n                    values.slice(i, i + 500)\n                ]);\n            }\n        }\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Sparepart bulk disimpan\'\n        });\n\n    } catch (error) {\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\napp.put(\'/api/sparepart/:id\', async (req, res) => {\n\n    const id = safeInteger(req.params.id);\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID sparepart tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(\n            \'UPDATE spareparts SET ? WHERE id = ?\',\n            [\n                req.body,\n                id\n            ]\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Sparepart diupdate\'\n        });\n\n    } catch (error) {\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\napp.delete(\'/api/sparepart/:id\', async (req, res) => {\n\n    const id = safeInteger(req.params.id);\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID sparepart tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(\n            \'DELETE FROM spareparts WHERE id = ?\',\n            [id]\n        );\n\n        await pool.query(\n            \'DELETE FROM transactions WHERE sparepart_id = ?\',\n            [id]\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Sparepart dihapus\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus sparepart:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 5. TRANSAKSI\n// ============================================================\n\napp.post(\'/api/transactions\', async (req, res) => {\n\n    const {\n        transactions,\n        taxRecords\n    } = req.body || {};\n\n    try {\n\n        // ----------------------------------------------------\n        // TRANSACTIONS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(transactions) &&\n            transactions.length > 0\n        ) {\n\n            const values = transactions\n                .filter(t => safeInteger(t.id) !== null)\n                .map(t => [\n\n                    safeInteger(t.id),\n\n                    safeString(t.nomor_transaksi),\n\n                    safeDate(t.tanggal),\n\n                    safeInteger(t.sparepart_id),\n\n                    t.custom_item || null,\n\n                    safeString(t.part_numbers_alt),\n\n                    safeString(t.merek),\n\n                    safeString(t.jenis),\n\n                    safeNumber(t.jumlah),\n\n                    safeString(t.satuan),\n\n                    safeNumber(t.jumlah_dasar),\n\n                    safeNumber(t.harga_satuan),\n\n                    safeString(t.tujuan),\n\n                    safeString(t.keterangan),\n\n                    safeString(t.source),\n\n                    safeString(t.kasir),\n\n                    safeString(t.status_bayar),\n\n                    safeString(t.metode_bayar),\n\n                    safeNumber(t.bayar_tunai),\n\n                    safeNumber(t.transfer_amount),\n\n                    safeNumber(t.kembalian_diberikan),\n\n                    safeNumber(t.diskon),\n\n                    t.tanggal_lunas\n                        ? safeDate(t.tanggal_lunas)\n                        : null\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO transactions\n                    (\n                        id,\n                        nomor_transaksi,\n                        tanggal,\n                        sparepart_id,\n                        custom_item,\n                        part_numbers_alt,\n                        merek,\n                        jenis,\n                        jumlah,\n                        satuan,\n                        jumlah_dasar,\n                        harga_satuan,\n                        tujuan,\n                        keterangan,\n                        source,\n                        kasir,\n                        status_bayar,\n                        metode_bayar,\n                        bayar_tunai,\n                        transfer_amount,\n                        kembalian_diberikan,\n                        diskon,\n                        tanggal_lunas\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // TAX RECORDS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(taxRecords) &&\n            taxRecords.length > 0\n        ) {\n\n            const values = taxRecords\n                .filter(t => t && t.tax_id)\n                .map(t => [\n\n                    safeString(t.tax_id),\n\n                    safeInteger(t.trx_id, 0),\n\n                    safeDate(t.tanggal),\n\n                    safeString(t.nomor_transaksi),\n\n                    safeString(t.part_number),\n\n                    safeString(t.nama),\n\n                    safeString(t.kategori),\n\n                    safeString(t.merek),\n\n                    safeString(t.status_bayar),\n\n                    safeString(t.pelanggan),\n\n                    safeNumber(t.jumlah),\n\n                    safeString(t.satuan),\n\n                    safeNumber(t.harga_satuan),\n\n                    safeNumber(t.subtotal),\n\n                    safeNumber(t.persentase_pajak),\n\n                    safeNumber(t.nilai_pajak)\n                ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT IGNORE INTO tax_records\n                    (\n                        tax_id,\n                        trx_id,\n                        tanggal,\n                        nomor_transaksi,\n                        part_number,\n                        nama,\n                        kategori,\n                        merek,\n                        status_bayar,\n                        pelanggan,\n                        jumlah,\n                        satuan,\n                        harga_satuan,\n                        subtotal,\n                        persentase_pajak,\n                        nilai_pajak\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message: \'Transaksi disimpan\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error transaksi:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// SIMPAN RETUR\n// Kompatibel dengan beberapa format request dari frontend\n// ============================================================\napp.post(\'/api/transaction/retur\', async (req, res) => {\n    const body = req.body || {};\n\n    console.log(\'==========================================\');\n    console.log(\'[RETUR] Request diterima\');\n    console.log(\'[RETUR] Body keys:\', Object.keys(body));\n    console.log(\'[RETUR] Body:\', JSON.stringify(body, null, 2));\n    console.log(\'==========================================\');\n\n    /*\n     * Frontend bisa saja mengirim:\n     *\n     * {\n     *   returRecord: {...},\n     *   transactions: [...],\n     *   taxRecords: [...]\n     * }\n     *\n     * atau:\n     *\n     * {\n     *   retur: {...},\n     *   transactions: [...],\n     *   taxRecords: [...]\n     * }\n     *\n     * atau langsung:\n     *\n     * {\n     *   id: "...",\n     *   parent_invoice: "...",\n     *   items: [...]\n     * }\n     */\n\n    let returRecord =\n        body.returRecord ||\n        body.retur ||\n        body.returnRecord ||\n        body.return ||\n        null;\n\n    let transactions =\n        body.transactions ||\n        body.transaction ||\n        [];\n\n    let taxRecords =\n        body.taxRecords ||\n        body.tax_records ||\n        [];\n\n    // Jika frontend langsung mengirim object retur tanpa wrapper\n    if (!returRecord && body.id && (body.parent_invoice || body.parentInvoice)) {\n        returRecord = body;\n    }\n\n    // Pastikan array\n    if (!Array.isArray(transactions)) {\n        transactions = [];\n    }\n\n    if (!Array.isArray(taxRecords)) {\n        taxRecords = [];\n    }\n\n    // ============================================================\n    // VALIDASI RETUR\n    // ============================================================\n    if (!returRecord || typeof returRecord !== \'object\') {\n        console.error(\'[RETUR] returRecord tidak ditemukan.\');\n        console.error(\'[RETUR] Body yang diterima:\', body);\n\n        return res.status(400).json({\n            success: false,\n            error: \'Data retur tidak valid: returRecord tidak ditemukan\',\n            receivedKeys: Object.keys(body)\n        });\n    }\n\n    // ============================================================\n    // NORMALISASI NAMA FIELD\n    // ============================================================\n    const returId =\n        returRecord.id ||\n        returRecord.retur_id ||\n        returRecord.returId;\n\n    const parentInvoice =\n        returRecord.parent_invoice ||\n        returRecord.parentInvoice ||\n        returRecord.invoice ||\n        returRecord.no_invoice ||\n        returRecord.nomor_transaksi;\n\n    const tanggal =\n        returRecord.tanggal ||\n        returRecord.date ||\n        new Date();\n\n    const kasir =\n        returRecord.kasir ||\n        returRecord.user ||\n        returRecord.operator ||\n        \'\';\n\n    const pelanggan =\n        returRecord.pelanggan ||\n        returRecord.customer ||\n        returRecord.nama_pelanggan ||\n        \'\';\n\n    const items =\n        returRecord.items ||\n        returRecord.retur_items ||\n        returRecord.return_items ||\n        [];\n\n    const exchangeItems =\n        returRecord.exchange_items ||\n        returRecord.exchangeItems ||\n        returRecord.tukar_items ||\n        returRecord.tukarItems ||\n        [];\n\n    // ============================================================\n    // VALIDASI FIELD WAJIB\n    // ============================================================\n    if (!returId) {\n        return res.status(400).json({\n            success: false,\n            error: \'Data retur tidak valid: ID retur tidak ditemukan\'\n        });\n    }\n\n    if (!parentInvoice) {\n        return res.status(400).json({\n            success: false,\n            error: \'Data retur tidak valid: nomor invoice tidak ditemukan\'\n        });\n    }\n\n    // Pastikan items berbentuk array\n    const normalizedItems = Array.isArray(items) ? items : [];\n\n    const normalizedExchangeItems =\n        Array.isArray(exchangeItems) ? exchangeItems : [];\n\n    // ============================================================\n    // DATABASE TRANSACTION\n    // ============================================================\n    let conn;\n\n    try {\n        conn = await pool.getConnection();\n\n        await conn.beginTransaction();\n\n        // ========================================================\n        // SIMPAN RETUR RECORD\n        // ========================================================\n        await conn.query(\n            `\n            INSERT INTO retur_records\n            (\n                id,\n                parent_invoice,\n                tanggal,\n                kasir,\n                pelanggan,\n                items,\n                exchange_items\n            )\n            VALUES (?, ?, ?, ?, ?, ?, ?)\n            ON DUPLICATE KEY UPDATE\n                parent_invoice = VALUES(parent_invoice),\n                tanggal = VALUES(tanggal),\n                kasir = VALUES(kasir),\n                pelanggan = VALUES(pelanggan),\n                items = VALUES(items),\n                exchange_items = VALUES(exchange_items)\n            `,\n            [\n                String(returId),\n                String(parentInvoice),\n                new Date(tanggal),\n                String(kasir),\n                String(pelanggan),\n                JSON.stringify(normalizedItems),\n                JSON.stringify(normalizedExchangeItems)\n            ]\n        );\n\n        // ========================================================\n        // SIMPAN TRANSAKSI RETUR / TRANSAKSI TAMBAHAN\n        // ========================================================\n        if (transactions.length > 0) {\n\n            const values = transactions\n                .filter(t => t && t.id != null)\n                .map(t => [\n                    parseInt(t.id),\n\n                    t.nomor_transaksi ||\n                    t.nomorTransaksi ||\n                    String(returId),\n\n                    t.tanggal || new Date(),\n\n                    t.sparepart_id ??\n                    t.sparepartId ??\n                    null,\n\n                    t.custom_item ||\n                    t.customItem ||\n                    null,\n\n                    t.part_numbers_alt ||\n                    t.partNumbersAlt ||\n                    \'\',\n\n                    t.merek || \'\',\n\n                    t.jenis || \'Keluar\',\n\n                    Number(t.jumlah) || 0,\n\n                    t.satuan || \'Pcs\',\n\n                    Number(t.jumlah_dasar ?? t.jumlahDasar) || 0,\n\n                    Number(t.harga_satuan ?? t.hargaSatuan) || 0,\n\n                    t.tujuan || \'\',\n\n                    t.keterangan || \'\',\n\n                    t.source || \'retur\',\n\n                    t.kasir || kasir || \'\',\n\n                    t.status_bayar || \'Lunas\',\n\n                    t.metode_bayar || \'\',\n\n                    Number(t.bayar_tunai) || 0,\n\n                    Number(t.transfer_amount) || 0,\n\n                    Number(t.kembalian_diberikan) || 0,\n\n                    Number(t.diskon) || 0,\n\n                    t.tanggal_lunas || null\n                ]);\n\n            if (values.length > 0) {\n                await conn.query(\n                    `\n                    INSERT IGNORE INTO transactions\n                    (\n                        id,\n                        nomor_transaksi,\n                        tanggal,\n                        sparepart_id,\n                        custom_item,\n                        part_numbers_alt,\n                        merek,\n                        jenis,\n                        jumlah,\n                        satuan,\n                        jumlah_dasar,\n                        harga_satuan,\n                        tujuan,\n                        keterangan,\n                        source,\n                        kasir,\n                        status_bayar,\n                        metode_bayar,\n                        bayar_tunai,\n                        transfer_amount,\n                        kembalian_diberikan,\n                        diskon,\n                        tanggal_lunas\n                    )\n                    VALUES ?\n                    `,\n                    [values]\n                );\n            }\n        }\n\n        // ========================================================\n        // SIMPAN TAX RECORD\n        // ========================================================\n        if (taxRecords.length > 0) {\n\n            const values = taxRecords\n                .filter(t => t && t.tax_id != null)\n                .map(t => [\n                    String(t.tax_id),\n\n                    parseInt(\n                        t.trx_id ??\n                        t.trxId ??\n                        0\n                    ),\n\n                    t.tanggal || new Date(),\n\n                    t.nomor_transaksi ||\n                    t.nomorTransaksi ||\n                    String(returId),\n\n                    t.part_number ||\n                    t.partNumber ||\n                    \'\',\n\n                    t.nama || \'\',\n\n                    t.kategori || \'\',\n\n                    t.merek || \'\',\n\n                    t.status_bayar ||\n                    t.statusBayar ||\n                    \'Lunas\',\n\n                    t.pelanggan ||\n                    t.customer ||\n                    pelanggan ||\n                    \'\',\n\n                    Number(t.jumlah) || 0,\n\n                    t.satuan || \'Pcs\',\n\n                    Number(\n                        t.harga_satuan ??\n                        t.hargaSatuan\n                    ) || 0,\n\n                    Number(t.subtotal) || 0,\n\n                    Number(\n                        t.persentase_pajak ??\n                        t.persentasePajak\n                    ) || 0,\n\n                    Number(\n                        t.nilai_pajak ??\n                        t.nilaiPajak\n                    ) || 0\n                ]);\n\n            if (values.length > 0) {\n                await conn.query(\n                    `\n                    INSERT IGNORE INTO tax_records\n                    (\n                        tax_id,\n                        trx_id,\n                        tanggal,\n                        nomor_transaksi,\n                        part_number,\n                        nama,\n                        kategori,\n                        merek,\n                        status_bayar,\n                        pelanggan,\n                        jumlah,\n                        satuan,\n                        harga_satuan,\n                        subtotal,\n                        persentase_pajak,\n                        nilai_pajak\n                    )\n                    VALUES ?\n                    `,\n                    [values]\n                );\n            }\n        }\n\n        // ========================================================\n        // VERIFIKASI RETUR\n        // ========================================================\n        const [verify] = await conn.query(\n            `\n            SELECT\n                id,\n                parent_invoice,\n                tanggal\n            FROM retur_records\n            WHERE id = ?\n            LIMIT 1\n            `,\n            [String(returId)]\n        );\n\n        if (verify.length === 0) {\n            await conn.rollback();\n\n            return res.status(500).json({\n                success: false,\n                error: \'Verifikasi gagal: data retur tidak tersimpan di database\'\n            });\n        }\n\n        // ========================================================\n        // COMMIT\n        // ========================================================\n        await conn.commit();\n\n        invalidateDataCache();\n\n        console.log(\n            \'[RETUR] Berhasil disimpan:\',\n            String(returId),\n            \'Invoice:\',\n            String(parentInvoice)\n        );\n\n        return res.json({\n            success: true,\n            message: \'Retur berhasil disimpan ke server\',\n            returId: String(returId),\n            parentInvoice: String(parentInvoice)\n        });\n\n    } catch (error) {\n\n        if (conn) {\n            try {\n                await conn.rollback();\n            } catch (rollbackError) {\n                console.error(\n                    \'[RETUR] Rollback error:\',\n                    rollbackError\n                );\n            }\n        }\n\n        console.error(\n            \'[RETUR] ERROR:\',\n            error\n        );\n\n        return res.status(500).json({\n            success: false,\n            error: \'Gagal menyimpan retur: \' + error.message\n        });\n\n    } finally {\n\n        if (conn) {\n            conn.release();\n        }\n    }\n});\n// ============================================================\n// 7. HAPUS INVOICE\n// ============================================================\n\napp.post(\'/api/transaction/delete-invoice\', async (req, res) => {\n\n    const trxId =\n        req.body?.trxId;\n\n    if (\n        trxId === undefined ||\n        trxId === null ||\n        String(trxId).trim() === \'\'\n    ) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'Nomor invoice tidak valid\'\n        });\n    }\n\n    try {\n\n        const [returs] =\n            await pool.query(`\n                SELECT id\n                FROM retur_records\n                WHERE parent_invoice = ?\n            `, [String(trxId)]);\n\n        await pool.query(`\n            DELETE FROM transactions\n            WHERE nomor_transaksi = ?\n        `, [String(trxId)]);\n\n        await pool.query(`\n            DELETE FROM tax_records\n            WHERE nomor_transaksi = ?\n        `, [String(trxId)]);\n\n        if (returs.length > 0) {\n\n            for (const r of returs) {\n\n                await pool.query(`\n                    DELETE FROM transactions\n                    WHERE nomor_transaksi = ?\n                `, [String(r.id)]);\n\n                await pool.query(`\n                    DELETE FROM tax_records\n                    WHERE nomor_transaksi = ?\n                `, [String(r.id)]);\n            }\n        }\n\n        await pool.query(`\n            DELETE FROM retur_records\n            WHERE parent_invoice = ?\n        `, [String(trxId)]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Invoice & retur berhasil dihapus dari server\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus invoice:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 8. HAPUS RETUR\n// ============================================================\n\napp.post(\'/api/transaction/delete-retur\', async (req, res) => {\n\n    const returId =\n        req.body?.returId;\n\n    if (\n        returId === undefined ||\n        returId === null ||\n        String(returId).trim() === \'\'\n    ) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID retur tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(`\n            DELETE FROM transactions\n            WHERE nomor_transaksi = ?\n        `, [String(returId)]);\n\n        await pool.query(`\n            DELETE FROM tax_records\n            WHERE nomor_transaksi = ?\n        `, [String(returId)]);\n\n        await pool.query(`\n            DELETE FROM retur_records\n            WHERE id = ?\n        `, [String(returId)]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Retur berhasil dihapus dari server\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus retur:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 9. HAPUS TRANSAKSI\n// ============================================================\n\napp.post(\'/api/transaction/delete\', async (req, res) => {\n\n    const cleanId =\n        safeInteger(req.body?.id);\n\n    if (cleanId === null) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID transaksi tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(`\n            DELETE FROM transactions\n            WHERE id = ?\n        `, [cleanId]);\n\n        await pool.query(`\n            DELETE FROM tax_records\n            WHERE trx_id = ?\n        `, [cleanId]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Transaksi berhasil dihapus dari server\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus transaksi:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 10. EDIT STRUK\n// ============================================================\n\napp.put(\'/api/transaction/edit-struk\', async (req, res) => {\n\n    const invoice =\n        req.body?.invoice;\n\n    const items =\n        Array.isArray(req.body?.items)\n            ? req.body.items\n            : [];\n\n    const diskon =\n        req.body?.diskon;\n\n    if (\n        invoice === undefined ||\n        invoice === null ||\n        String(invoice).trim() === \'\'\n    ) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'Invoice tidak valid\'\n        });\n    }\n\n    const conn =\n        await pool.getConnection();\n\n    try {\n\n        await conn.beginTransaction();\n\n        // ----------------------------------------------------\n        // Ambil ID asli dari database\n        // ----------------------------------------------------\n\n        const [trxRows] =\n            await conn.query(`\n                SELECT\n                    id,\n                    nomor_transaksi\n                FROM transactions\n                WHERE nomor_transaksi = ?\n                ORDER BY id ASC\n            `, [\n                String(invoice)\n            ]);\n\n        if (trxRows.length === 0) {\n\n            await conn.rollback();\n\n            return res.status(404).json({\n                success: false,\n                error:\n                    \'Invoice tidak ditemukan di database\'\n            });\n        }\n\n        // ----------------------------------------------------\n        // Update berdasarkan index database\n        // ----------------------------------------------------\n\n        for (\n            let i = 0;\n            i < trxRows.length;\n            i++\n        ) {\n\n            if (\n                i >= items.length\n            ) {\n                continue;\n            }\n\n            const dbId =\n                safeInteger(\n                    trxRows[i].id\n                );\n\n            if (dbId === null) {\n                continue;\n            }\n\n            const newHarga =\n                safeNumber(\n                    items[i]?.harga_satuan,\n                    0\n                );\n\n            // ------------------------------------------------\n            // Update transaksi\n            // ------------------------------------------------\n\n            await conn.query(`\n                UPDATE transactions\n                SET harga_satuan = ?\n                WHERE id = ?\n            `, [\n                newHarga,\n                dbId\n            ]);\n\n            // ------------------------------------------------\n            // Update pajak\n            // ------------------------------------------------\n\n            const [taxRows] =\n                await conn.query(`\n                    SELECT\n                        tax_id,\n                        jumlah,\n                        persentase_pajak\n                    FROM tax_records\n                    WHERE trx_id = ?\n                `, [\n                    dbId\n                ]);\n\n            for (\n                const tax of taxRows\n            ) {\n\n                const jumlah =\n                    safeNumber(\n                        tax.jumlah\n                    );\n\n                const persen =\n                    safeNumber(\n                        tax.persentase_pajak\n                    );\n\n                const newSubtotal =\n                    newHarga * jumlah;\n\n                const newNilaiPajak =\n                    (\n                        newSubtotal *\n                        persen\n                    ) / 100;\n\n                await conn.query(`\n                    UPDATE tax_records\n                    SET\n                        harga_satuan = ?,\n                        subtotal = ?,\n                        nilai_pajak = ?\n                    WHERE tax_id = ?\n                `, [\n                    newHarga,\n                    newSubtotal,\n                    newNilaiPajak,\n                    String(tax.tax_id)\n                ]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // Update diskon\n        // ----------------------------------------------------\n\n        if (\n            diskon !== undefined &&\n            diskon !== null &&\n            trxRows.length > 0\n        ) {\n\n            const firstId =\n                safeInteger(\n                    trxRows[0].id\n                );\n\n            if (firstId !== null) {\n\n                await conn.query(`\n                    UPDATE transactions\n                    SET diskon = ?\n                    WHERE id = ?\n                `, [\n                    safeNumber(diskon),\n                    firstId\n                ]);\n            }\n        }\n\n        await conn.commit();\n\n        invalidateDataCache();\n\n        console.log(\n            \'[EDIT STRUK] SUCCESS:\',\n            invoice\n        );\n\n        res.json({\n            success: true,\n            message:\n                \'Struk berhasil diedit\',\n            invoice:\n                String(invoice)\n        });\n\n    } catch (error) {\n\n        try {\n            await conn.rollback();\n        } catch (e) {}\n\n        console.error(\n            \'[EDIT STRUK] ERROR:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error:\n                \'Gagal menyimpan edit struk: \' +\n                error.message\n        });\n\n    } finally {\n\n        conn.release();\n    }\n});\n\n// ============================================================\n// 11. PAYOFF / PELUNASAN BON\n// ============================================================\n\napp.put(\'/api/transactions/payoff\', async (req, res) => {\n\n    const trxId =\n        req.body?.trxId;\n\n    if (\n        trxId === undefined ||\n        trxId === null ||\n        String(trxId).trim() === \'\'\n    ) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'Nomor invoice tidak valid\'\n        });\n    }\n\n    const conn =\n        await pool.getConnection();\n\n    try {\n\n        await conn.beginTransaction();\n\n        const [trxRows] =\n            await conn.query(`\n                SELECT *\n                FROM transactions\n                WHERE nomor_transaksi = ?\n            `, [\n                String(trxId)\n            ]);\n\n        if (trxRows.length === 0) {\n\n            await conn.rollback();\n\n            return res.status(404).json({\n                success: false,\n                error:\n                    \'Invoice tidak ditemukan\'\n            });\n        }\n\n        const isAlreadyLunas =\n            trxRows.every(\n                t =>\n                    t.status_bayar === \'Lunas\'\n            );\n\n        if (isAlreadyLunas) {\n\n            await conn.rollback();\n\n            return res.status(400).json({\n                success: false,\n                error:\n                    \'Invoice sudah lunas\'\n            });\n        }\n\n        const total =\n            trxRows.reduce(\n                (sum, t) =>\n                    sum +\n                    (\n                        safeNumber(\n                            t.harga_satuan\n                        ) *\n                        safeNumber(\n                            t.jumlah\n                        )\n                    ),\n                0\n            )\n            -\n            safeNumber(\n                trxRows[0].diskon\n            );\n\n        await conn.query(`\n            UPDATE transactions\n            SET\n                status_bayar = \'Lunas\',\n                keterangan = \'Bon (Lunas)\',\n                tanggal_lunas = NOW()\n            WHERE nomor_transaksi = ?\n        `, [\n            String(trxId)\n        ]);\n\n        await conn.query(`\n            UPDATE tax_records\n            SET status_bayar = \'Lunas\'\n            WHERE nomor_transaksi = ?\n        `, [\n            String(trxId)\n        ]);\n\n        await conn.query(`\n            INSERT INTO cash_inflows\n            (\n                id,\n                tanggal,\n                jumlah,\n                keterangan,\n                kasir\n            )\n            VALUES (?, ?, ?, ?, ?)\n        `, [\n            Date.now(),\n            new Date(),\n            total,\n            \'Pelunasan Bon: \' +\n                String(trxId),\n            trxRows[0].kasir ||\n                \'Admin\'\n        ]);\n\n        await conn.commit();\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Piutang berhasil dilunasi\',\n            total\n        });\n\n    } catch (error) {\n\n        try {\n            await conn.rollback();\n        } catch (e) {}\n\n        console.error(\n            \'Error payoff:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n\n    } finally {\n\n        conn.release();\n    }\n});\n\n// ============================================================\n// 12. EDIT TRANSAKSI MANUAL\n// ============================================================\n\napp.put(\'/api/transaction/:id\', async (req, res) => {\n\n    const transactionId =\n        safeInteger(req.params.id);\n\n    if (\n        transactionId === null ||\n        transactionId <= 0\n    ) {\n\n        return res.status(400).json({\n            success: false,\n            error:\n                \'ID transaksi tidak valid\'\n        });\n    }\n\n    const updatedData =\n        req.body || {};\n\n    try {\n\n        await pool.query(`\n            UPDATE transactions\n            SET\n                sparepart_id = ?,\n                custom_item = ?,\n                jenis = ?,\n                jumlah = ?,\n                satuan = ?,\n                jumlah_dasar = ?,\n                tujuan = ?,\n                keterangan = ?\n            WHERE id = ?\n        `, [\n\n            safeInteger(\n                updatedData.sparepart_id\n            ),\n\n            updatedData.custom_item ||\n                null,\n\n            safeString(\n                updatedData.jenis\n            ),\n\n            safeNumber(\n                updatedData.jumlah\n            ),\n\n            safeString(\n                updatedData.satuan\n            ),\n\n            safeNumber(\n                updatedData.jumlah_dasar\n            ),\n\n            safeString(\n                updatedData.tujuan\n            ),\n\n            safeString(\n                updatedData.keterangan\n            ),\n\n            transactionId\n        ]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Transaksi berhasil diupdate\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error edit transaksi:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 13. HAPUS KAS KELUAR\n// ============================================================\n\napp.post(\'/api/cash-expense/delete\', async (req, res) => {\n\n    const id =\n        safeInteger(\n            req.body?.id\n        );\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID kas tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(`\n            DELETE FROM cash_expenses\n            WHERE id = ?\n        `, [id]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Pengeluaran kas berhasil dihapus\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus cash expense:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 14. HAPUS KAS MASUK\n// ============================================================\n\napp.post(\'/api/cash-inflow/delete\', async (req, res) => {\n\n    const id =\n        safeInteger(\n            req.body?.id\n        );\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error: \'ID kas tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(`\n            DELETE FROM cash_inflows\n            WHERE id = ?\n        `, [id]);\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Tambahan kas berhasil dihapus\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error hapus cash inflow:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 15. PARTNER\n// ============================================================\n\napp.post(\'/api/partner\', async (req, res) => {\n\n    try {\n\n        await pool.query(\n            \'INSERT INTO partners SET ?\',\n            req.body\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Partner disimpan\'\n        });\n\n    } catch (error) {\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\napp.put(\'/api/partner/:id\', async (req, res) => {\n\n    const id =\n        safeInteger(\n            req.params.id\n        );\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error:\n                \'ID partner tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(\n            \'UPDATE partners SET ? WHERE id = ?\',\n            [\n                req.body,\n                id\n            ]\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Partner diupdate\'\n        });\n\n    } catch (error) {\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\napp.delete(\'/api/partner/:id\', async (req, res) => {\n\n    const id =\n        safeInteger(\n            req.params.id\n        );\n\n    if (id === null) {\n\n        return res.status(400).json({\n            success: false,\n            error:\n                \'ID partner tidak valid\'\n        });\n    }\n\n    try {\n\n        await pool.query(\n            \'DELETE FROM partners WHERE id = ?\',\n            [id]\n        );\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Partner dihapus\'\n        });\n\n    } catch (error) {\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 16. SETTINGS\n// ============================================================\n\napp.put(\'/api/settings\', async (req, res) => {\n\n    const {\n        kasAwal,\n        activeShiftStart,\n        masterPajak,\n        users,\n        shiftSessions,\n        cashExpenses,\n        cashInflows\n    } = req.body || {};\n\n    try {\n\n        await pool.query(`\n            UPDATE app_settings\n            SET\n                kas_awal = ?,\n                active_shift_start = ?,\n                master_pajak = ?,\n                users = ?,\n                shift_sessions = ?\n            WHERE id = 1\n        `, [\n\n            safeNumber(\n                kasAwal\n            ),\n\n            activeShiftStart ||\n                Date.now(),\n\n            JSON.stringify(\n                Array.isArray(masterPajak)\n                    ? masterPajak\n                    : []\n            ),\n\n            JSON.stringify(\n                Array.isArray(users)\n                    ? users\n                    : []\n            ),\n\n            JSON.stringify(\n                Array.isArray(shiftSessions)\n                    ? shiftSessions\n                    : []\n            )\n        ]);\n\n        // ----------------------------------------------------\n        // CASH EXPENSES\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(cashExpenses) &&\n            cashExpenses.length > 0\n        ) {\n\n            const values =\n                cashExpenses\n                    .filter(\n                        e =>\n                            safeInteger(e.id) !== null\n                    )\n                    .map(e => [\n                        safeInteger(e.id),\n                        safeDate(e.tanggal),\n                        safeNumber(e.jumlah),\n                        safeString(e.keterangan),\n                        safeString(e.kasir)\n                    ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT INTO cash_expenses\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                    ON DUPLICATE KEY UPDATE\n                        tanggal = VALUES(tanggal),\n                        jumlah = VALUES(jumlah),\n                        keterangan = VALUES(keterangan),\n                        kasir = VALUES(kasir)\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // CASH INFLOWS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(cashInflows) &&\n            cashInflows.length > 0\n        ) {\n\n            const values =\n                cashInflows\n                    .filter(\n                        i =>\n                            safeInteger(i.id) !== null\n                    )\n                    .map(i => [\n                        safeInteger(i.id),\n                        safeDate(i.tanggal),\n                        safeNumber(i.jumlah),\n                        safeString(i.keterangan),\n                        safeString(i.kasir)\n                    ]);\n\n            if (values.length > 0) {\n\n                await pool.query(`\n                    INSERT INTO cash_inflows\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                    ON DUPLICATE KEY UPDATE\n                        tanggal = VALUES(tanggal),\n                        jumlah = VALUES(jumlah),\n                        keterangan = VALUES(keterangan),\n                        kasir = VALUES(kasir)\n                `, [values]);\n            }\n        }\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Settings berhasil disimpan\'\n        });\n\n    } catch (error) {\n\n        console.error(\n            \'Error settings:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n    }\n});\n\n// ============================================================\n// 17. RESTORE DATA\n// ============================================================\n// CATATAN:\n// Endpoint ini TIDAK dipanggil otomatis.\n// Data hanya dihapus jika frontend benar-benar\n// memanggil POST /api/restore.\n// ============================================================\n\napp.post(\'/api/restore\', async (req, res) => {\n\n    const data =\n        req.body || {};\n\n    const conn =\n        await pool.getConnection();\n\n    try {\n\n        await conn.beginTransaction();\n\n        // ----------------------------------------------------\n        // HAPUS DATA LAMA\n        // ----------------------------------------------------\n\n        await conn.query(\n            \'DELETE FROM spareparts\'\n        );\n\n        await conn.query(\n            \'DELETE FROM transactions\'\n        );\n\n        await conn.query(\n            \'DELETE FROM partners\'\n        );\n\n        await conn.query(\n            \'DELETE FROM cash_expenses\'\n        );\n\n        await conn.query(\n            \'DELETE FROM cash_inflows\'\n        );\n\n        await conn.query(\n            \'DELETE FROM tax_records\'\n        );\n\n        await conn.query(\n            \'DELETE FROM retur_records\'\n        );\n\n        // ----------------------------------------------------\n        // SPAREPART\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.spareparts) &&\n            data.spareparts.length > 0\n        ) {\n\n            const values =\n                data.spareparts\n                    .filter(\n                        sp =>\n                            safeInteger(sp.id) !== null\n                    )\n                    .map(sp => [\n                        safeInteger(sp.id),\n                        safeString(sp.kode),\n                        safeString(sp.part_number),\n                        safeString(sp.part_numbers_alt),\n                        safeString(sp.nama),\n                        safeString(sp.kategori, \'Umum\'),\n                        safeString(sp.merek),\n                        safeString(sp.satuan, \'Pcs\'),\n                        safeNumber(sp.stok_min),\n                        safeNumber(sp.stok_awal),\n                        safeNumber(sp.harga_beli),\n                        safeNumber(sp.harga_jual),\n                        safeString(sp.satuan_alt),\n                        safeNumber(sp.isi_satuan_alt),\n                        safeNumber(sp.harga_jual_alt),\n                        safeString(sp.pajak_status, \'Non Pajak\'),\n                        safeString(sp.kode_pajak),\n                        safeString(sp.keterangan)\n                    ]);\n\n            for (\n                let i = 0;\n                i < values.length;\n                i += 500\n            ) {\n\n                await conn.query(`\n                    INSERT INTO spareparts\n                    (\n                        id,\n                        kode,\n                        part_number,\n                        part_numbers_alt,\n                        nama,\n                        kategori,\n                        merek,\n                        satuan,\n                        stok_min,\n                        stok_awal,\n                        harga_beli,\n                        harga_jual,\n                        satuan_alt,\n                        isi_satuan_alt,\n                        harga_jual_alt,\n                        pajak_status,\n                        kode_pajak,\n                        keterangan\n                    )\n                    VALUES ?\n                `, [\n                    values.slice(\n                        i,\n                        i + 500\n                    )\n                ]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // TRANSACTIONS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.transactions) &&\n            data.transactions.length > 0\n        ) {\n\n            const values =\n                data.transactions\n                    .filter(\n                        t =>\n                            safeInteger(t.id) !== null\n                    )\n                    .map(t => [\n\n                        safeInteger(t.id),\n\n                        safeString(\n                            t.nomor_transaksi\n                        ),\n\n                        safeDate(\n                            t.tanggal\n                        ),\n\n                        safeInteger(\n                            t.sparepart_id\n                        ),\n\n                        t.custom_item || null,\n\n                        safeString(\n                            t.part_numbers_alt\n                        ),\n\n                        safeString(\n                            t.merek\n                        ),\n\n                        safeString(\n                            t.jenis\n                        ),\n\n                        safeNumber(\n                            t.jumlah\n                        ),\n\n                        safeString(\n                            t.satuan\n                        ),\n\n                        safeNumber(\n                            t.jumlah_dasar\n                        ),\n\n                        safeNumber(\n                            t.harga_satuan\n                        ),\n\n                        safeString(\n                            t.tujuan\n                        ),\n\n                        safeString(\n                            t.keterangan\n                        ),\n\n                        safeString(\n                            t.source\n                        ),\n\n                        safeString(\n                            t.kasir\n                        ),\n\n                        safeString(\n                            t.status_bayar\n                        ),\n\n                        safeString(\n                            t.metode_bayar\n                        ),\n\n                        safeNumber(\n                            t.bayar_tunai\n                        ),\n\n                        safeNumber(\n                            t.transfer_amount\n                        ),\n\n                        safeNumber(\n                            t.kembalian_diberikan\n                        ),\n\n                        safeNumber(\n                            t.diskon\n                        ),\n\n                        t.tanggal_lunas\n                            ? safeDate(\n                                t.tanggal_lunas\n                            )\n                            : null\n                    ]);\n\n            for (\n                let i = 0;\n                i < values.length;\n                i += 500\n            ) {\n\n                await conn.query(`\n                    INSERT INTO transactions\n                    (\n                        id,\n                        nomor_transaksi,\n                        tanggal,\n                        sparepart_id,\n                        custom_item,\n                        part_numbers_alt,\n                        merek,\n                        jenis,\n                        jumlah,\n                        satuan,\n                        jumlah_dasar,\n                        harga_satuan,\n                        tujuan,\n                        keterangan,\n                        source,\n                        kasir,\n                        status_bayar,\n                        metode_bayar,\n                        bayar_tunai,\n                        transfer_amount,\n                        kembalian_diberikan,\n                        diskon,\n                        tanggal_lunas\n                    )\n                    VALUES ?\n                `, [\n                    values.slice(\n                        i,\n                        i + 500\n                    )\n                ]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // PARTNERS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.partners) &&\n            data.partners.length > 0\n        ) {\n\n            const values =\n                data.partners\n                    .filter(\n                        p =>\n                            safeInteger(p.id) !== null\n                    )\n                    .map(p => [\n                        safeInteger(p.id),\n                        safeString(p.nama),\n                        safeString(p.tipe),\n                        safeString(p.telp),\n                        safeString(p.alamat)\n                    ]);\n\n            if (values.length > 0) {\n\n                await conn.query(`\n                    INSERT INTO partners\n                    (\n                        id,\n                        nama,\n                        tipe,\n                        telp,\n                        alamat\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // CASH EXPENSES\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.cashExpenses) &&\n            data.cashExpenses.length > 0\n        ) {\n\n            const values =\n                data.cashExpenses\n                    .filter(\n                        e =>\n                            safeInteger(e.id) !== null\n                    )\n                    .map(e => [\n                        safeInteger(e.id),\n                        safeDate(e.tanggal),\n                        safeNumber(e.jumlah),\n                        safeString(e.keterangan),\n                        safeString(e.kasir)\n                    ]);\n\n            if (values.length > 0) {\n\n                await conn.query(`\n                    INSERT INTO cash_expenses\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // CASH INFLOWS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.cashInflows) &&\n            data.cashInflows.length > 0\n        ) {\n\n            const values =\n                data.cashInflows\n                    .filter(\n                        i =>\n                            safeInteger(i.id) !== null\n                    )\n                    .map(i => [\n                        safeInteger(i.id),\n                        safeDate(i.tanggal),\n                        safeNumber(i.jumlah),\n                        safeString(i.keterangan),\n                        safeString(i.kasir)\n                    ]);\n\n            if (values.length > 0) {\n\n                await conn.query(`\n                    INSERT INTO cash_inflows\n                    (\n                        id,\n                        tanggal,\n                        jumlah,\n                        keterangan,\n                        kasir\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // TAX RECORDS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.taxRecords) &&\n            data.taxRecords.length > 0\n        ) {\n\n            const values =\n                data.taxRecords\n                    .filter(\n                        t =>\n                            t &&\n                            t.tax_id\n                    )\n                    .map(t => [\n\n                        safeString(\n                            t.tax_id\n                        ),\n\n                        safeInteger(\n                            t.trx_id,\n                            0\n                        ),\n\n                        safeDate(\n                            t.tanggal\n                        ),\n\n                        safeString(\n                            t.nomor_transaksi\n                        ),\n\n                        safeString(\n                            t.part_number\n                        ),\n\n                        safeString(\n                            t.nama\n                        ),\n\n                        safeString(\n                            t.kategori\n                        ),\n\n                        safeString(\n                            t.merek\n                        ),\n\n                        safeString(\n                            t.status_bayar\n                        ),\n\n                        safeString(\n                            t.pelanggan\n                        ),\n\n                        safeNumber(\n                            t.jumlah\n                        ),\n\n                        safeString(\n                            t.satuan\n                        ),\n\n                        safeNumber(\n                            t.harga_satuan\n                        ),\n\n                        safeNumber(\n                            t.subtotal\n                        ),\n\n                        safeNumber(\n                            t.persentase_pajak\n                        ),\n\n                        safeNumber(\n                            t.nilai_pajak\n                        )\n                    ]);\n\n            if (values.length > 0) {\n\n                await conn.query(`\n                    INSERT INTO tax_records\n                    (\n                        tax_id,\n                        trx_id,\n                        tanggal,\n                        nomor_transaksi,\n                        part_number,\n                        nama,\n                        kategori,\n                        merek,\n                        status_bayar,\n                        pelanggan,\n                        jumlah,\n                        satuan,\n                        harga_satuan,\n                        subtotal,\n                        persentase_pajak,\n                        nilai_pajak\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // RETUR RECORDS\n        // ----------------------------------------------------\n\n        if (\n            Array.isArray(data.returRecords) &&\n            data.returRecords.length > 0\n        ) {\n\n            const values =\n                data.returRecords\n                    .filter(\n                        r =>\n                            r &&\n                            r.id !== undefined &&\n                            r.id !== null &&\n                            String(r.id).trim() !== \'\'\n                    )\n                    .map(r => [\n\n                        String(r.id),\n\n                        safeString(\n                            r.parent_invoice\n                        ),\n\n                        safeDate(\n                            r.tanggal\n                        ),\n\n                        safeString(\n                            r.kasir\n                        ),\n\n                        safeString(\n                            r.pelanggan\n                        ),\n\n                        JSON.stringify(\n                            Array.isArray(r.items)\n                                ? r.items\n                                : []\n                        ),\n\n                        JSON.stringify(\n                            Array.isArray(\n                                r.exchange_items\n                            )\n                                ? r.exchange_items\n                                : []\n                        )\n                    ]);\n\n            if (values.length > 0) {\n\n                await conn.query(`\n                    INSERT INTO retur_records\n                    (\n                        id,\n                        parent_invoice,\n                        tanggal,\n                        kasir,\n                        pelanggan,\n                        items,\n                        exchange_items\n                    )\n                    VALUES ?\n                `, [values]);\n            }\n        }\n\n        // ----------------------------------------------------\n        // SETTINGS\n        // ----------------------------------------------------\n\n        await conn.query(`\n            UPDATE app_settings\n            SET\n                kas_awal = ?,\n                active_shift_start = ?,\n                master_pajak = ?,\n                users = ?,\n                shift_sessions = ?\n            WHERE id = 1\n        `, [\n\n            safeNumber(\n                data.kasAwal\n            ),\n\n            data.activeShiftStart ||\n                Date.now(),\n\n            JSON.stringify(\n                Array.isArray(\n                    data.masterPajak\n                )\n                    ? data.masterPajak\n                    : []\n            ),\n\n            JSON.stringify(\n                Array.isArray(\n                    data.users\n                )\n                    ? data.users\n                    : []\n            ),\n\n            JSON.stringify(\n                Array.isArray(data.shiftSessions)\n                    ? data.shiftSessions\n                    : []\n            )\n        ]);\n\n        await conn.commit();\n\n        invalidateDataCache();\n\n        res.json({\n            success: true,\n            message:\n                \'Restore data berhasil!\'\n        });\n\n    } catch (error) {\n\n        try {\n            await conn.rollback();\n        } catch (e) {}\n\n        console.error(\n            \'Error restore:\',\n            error\n        );\n\n        res.status(500).json({\n            success: false,\n            error: error.message\n        });\n\n    } finally {\n\n        conn.release();\n    }\n});\n\n// ============================================================\n// SERVER\n// ============================================================\n\nconst PORT =\n    process.env.PORT || 3000;\n\napp.listen(\n    PORT,\n    () => {\n        console.log(\n            `Server berjalan di port ${PORT}`\n        );\n    }\n);';

function copyAll() {
    navigator.clipboard.writeText(source).then(() => {
        showStatus('Kode berhasil disalin.');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = source;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showStatus('Kode berhasil disalin.');
    });
}

function selectAllCode() {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('code'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    showStatus('Semua kode dipilih.');
}

function downloadJS() {
    const blob = new Blob([source], {type: 'text/javascript;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'server.js';
    a.click();
    URL.revokeObjectURL(a.href);
    showStatus('server.js dibuat.');
}

function showStatus(text) {
    const el = document.getElementById('status');
    el.textContent = text;
    setTimeout(() => el.textContent = '', 2500);
}

function searchCode() {
    // Pencarian sederhana: scroll ke kecocokan pertama tanpa mengubah source.
    const q = document.getElementById('search').value.trim();
    if (!q) return;
    const index = source.toLowerCase().indexOf(q.toLowerCase());
    if (index < 0) {
        showStatus('Tidak ditemukan.');
        return;
    }
    const before = source.slice(0, index);
    const line = before.split('\n').length;
    const code = document.getElementById('code');
    const lineHeight = 13 * 1.55;
    code.scrollTop = Math.max(0, (line - 3) * lineHeight);
    showStatus('Ditemukan di baris ' + line + '.');
}
</script>
</body>
</html>
