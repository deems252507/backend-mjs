<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>server.js — Muria Jaya — FINAL</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif}.top{position:sticky;top:0;z-index:10;background:#111827;color:#fff;padding:14px 18px;display:flex;gap:16px;align-items:center;justify-content:space-between}.title{font-weight:700}.info{font-size:13px;color:#d1d5db}.badge{background:#374151;padding:5px 9px;border-radius:6px;font-size:12px}pre{margin:0;padding:22px;white-space:pre-wrap;word-break:break-word;tab-size:2;background:#fff;min-height:calc(100vh - 60px);font:13px/1.55 Consolas,Monaco,"Courier New",monospace}</style></head><body><div class="top"><div class="title">server.js — Muria Jaya — FINAL</div><div class="info"><span class="badge">copy → server.js</span></div></div><pre>const express = require(&#x27;express&#x27;);
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
    host: process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || &#x27;b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com&#x27;,
    user: process.env.MYSQL_ADDON_USER || process.env.DB_USER || &#x27;uks2krvuygsynrco&#x27;,
    password: process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || &#x27;fWwkTbshbBANrTGMj8Aq&#x27;,
    database: process.env.MYSQL_ADDON_DB || process.env.DB_NAME || &#x27;b7fgoctdsrijlfhczppz&#x27;,
    waitForConnections: true,
    connectionLimit: 2,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10000,
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
        await initializeDatabase();
        res.json({
            success: true,
            message: &#x27;Database &amp; tabel siap! Migrasi kompatibilitas selesai tanpa menghapus data.&#x27;
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

                    t.tanggal_lunas ? safeDate(t.tanggal_lunas) : null,
                    safeString(t.shift_id), safeString(t.bank_transfer), safeString(t.retur_id), safeString(t.parent_invoice)
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
                        tanggal_lunas, shift_id, bank_transfer, retur_id, parent_invoice
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

let databaseReady = false;
app.get(&#x27;/api/ready&#x27;, async (req,res)=&gt;{
    if(databaseReady) return res.json({success:true,ready:true});
    res.status(503).json({success:false,ready:false,error:&#x27;Database masih disiapkan.&#x27;});
});
app.get(&#x27;/api/login-bootstrap&#x27;, async (req,res)=&gt;{
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (username VARCHAR(100) PRIMARY KEY,password VARCHAR(255) NOT NULL,role VARCHAR(50) NOT NULL,name VARCHAR(255) DEFAULT &#x27;&#x27;,aktif TINYINT(1) DEFAULT 1,data JSON NULL,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        await pool.query(`CREATE TABLE IF NOT EXISTS shift_sessions (id VARCHAR(100) PRIMARY KEY,username VARCHAR(100) DEFAULT &#x27;&#x27;,name VARCHAR(255) DEFAULT &#x27;&#x27;,shift VARCHAR(100) DEFAULT &#x27;&#x27;,start_time DATETIME NULL,end_time DATETIME NULL,status VARCHAR(50) DEFAULT &#x27;&#x27;,data JSON NULL,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        const [users]=await pool.query(`SELECT username,password,role,name,shift,status,aktif,data FROM users ORDER BY username`);
        const [shifts]=await pool.query(`SELECT * FROM shift_sessions ORDER BY COALESCE(start_time,&#x27;1000-01-01&#x27;) DESC,id DESC`);
        res.json({success:true,users:users.map(u=&gt;({...safeJSON(u.data,{}),id:u.username,username:u.username,password:u.password,role:u.role,name:u.name||&#x27;&#x27;,shift:u.shift||&#x27;&#x27;,status:u.status||(Number(u.aktif)===1?&#x27;Aktif&#x27;:&#x27;Nonaktif&#x27;),aktif:Number(u.aktif)===1})),shiftSessions:shifts.map(r=&gt;({...safeJSON(r.data,{}),id:r.id,username:r.username,name:r.name,cashierName:r.name,shift:r.shift,start:r.start_time,end:r.end_time,status:r.status}))});
    } catch(error){res.status(503).json({success:false,error:error.message});}
});

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

        const [masterPajakRows] = await connection.query(`SELECT id, jenis, persentase, kode_pajak, aktif, keterangan FROM master_pajak WHERE aktif = 1 ORDER BY id`);
        const [masterBankRows] = await connection.query(`SELECT id, nama, rekening, atas_nama, aktif, keterangan FROM master_bank WHERE aktif = 1 ORDER BY id`);
        const [userRows] = await connection.query(`SELECT username, password, role, name, shift, status, aktif, data, updated_at FROM users ORDER BY username`);
        const [shiftRows] = await connection.query(`SELECT * FROM shift_sessions ORDER BY COALESCE(start_time, &#x27;1000-01-01&#x27;) DESC, id DESC`);
        const [auditRows] = await connection.query(`SELECT * FROM audit_trail ORDER BY timestamp DESC, created_at DESC LIMIT 1000`);

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

        // Master pajak dibaca dari tabel sebagai sumber utama.
        let masterPajak = masterPajakRows.map(p =&gt; ({
            id:p.id, jenis:p.jenis, persentase:Number(p.persentase)||0,
            kode_pajak:p.kode_pajak||&#x27;&#x27;, aktif:Number(p.aktif)===1, keterangan:p.keterangan||&#x27;&#x27;
        }));
        // Kompatibilitas data lama: jika tabel benar-benar kosong, gunakan JSON lama.
        if (masterPajak.length === 0) {
            masterPajak = safeJSON(settings[0]?.master_pajak, []);
            if (!Array.isArray(masterPajak)) masterPajak = [];
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

        let masterBank = masterBankRows.map(b =&gt; ({
            id: b.id,
            nama: b.nama,
            rekening: b.rekening || &#x27;&#x27;,
            atas_nama: b.atas_nama || &#x27;&#x27;,
            aktif: Number(b.aktif) === 1,
            keterangan: b.keterangan || &#x27;&#x27;
        }));

        // Tabel master_bank adalah sumber utama. JSON lama tidak lagi dipakai saat runtime.
        if (userRows.length &gt; 0) {
            users = userRows.map(u =&gt; {
                const extra = safeJSON(u.data, {});
                return { ...extra, id:u.username, username:u.username, password:u.password, role:u.role, name:u.name, shift:u.shift||&#x27;&#x27;, status:u.status||(Number(u.aktif)===1?&#x27;Aktif&#x27;:&#x27;Nonaktif&#x27;), aktif:Number(u.aktif) === 1 };
            });
        }

        let shiftSessions =
            shiftRows.map(r =&gt; {
                const extra = safeJSON(r.data, {});
                return { ...extra, id:r.id, username:r.username, name:r.name, shift:r.shift, start_time:r.start_time, end_time:r.end_time, status:r.status };
            });
        if (shiftSessions.length === 0) {
            shiftSessions = safeJSON(settings[0]?.shift_sessions, []);
            if (!Array.isArray(shiftSessions)) shiftSessions = [];
        }

        let auditTrail = auditRows.map(r =&gt; {
            const extra = safeJSON(r.data, {});
            return { ...extra, id:r.id, timestamp:Number(r.timestamp)||0, username:r.username, name:r.name, action:r.action, details:r.details };
        });
        if (auditTrail.length === 0) {
            auditTrail = safeJSON(settings[0]?.audit_trail, []);
            if (!Array.isArray(auditTrail)) auditTrail = [];
        }

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

            masterBank,

            users,

            shiftSessions,

            auditTrail
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
                    t.tanggal_lunas ? safeDate(t.tanggal_lunas) : null,
                    safeString(t.shift_id), safeString(t.bank_transfer), safeString(t.retur_id), safeString(t.parent_invoice)
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
                        tanggal_lunas, shift_id, bank_transfer, retur_id, parent_invoice
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
// KAS MASUK / KAS KELUAR
// ============================================================
app.post(&#x27;/api/cash-inflow&#x27;, async (req,res)=&gt;{
    const x=req.body||{}, id=safeInteger(x.id);
    if(id===null) return res.status(400).json({success:false,error:&#x27;ID kas masuk tidak valid&#x27;});
    try {
        await pool.query(`INSERT INTO cash_inflows (id,tanggal,jumlah,keterangan,kasir,shift_id,jenis_mutasi,sumber_dana,nomor_bukti,bukti,username,userName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal),jumlah=VALUES(jumlah),keterangan=VALUES(keterangan),kasir=VALUES(kasir),shift_id=VALUES(shift_id),jenis_mutasi=VALUES(jenis_mutasi),sumber_dana=VALUES(sumber_dana),nomor_bukti=VALUES(nomor_bukti),bukti=VALUES(bukti),username=VALUES(username),userName=VALUES(userName)`,[id,safeDate(x.tanggal),safeNumber(x.jumlah),safeString(x.keterangan),safeString(x.kasir),safeString(x.shift_id),safeString(x.jenis_mutasi,&#x27;MODAL&#x27;),safeString(x.sumber_dana),safeString(x.nomor_bukti),safeString(x.bukti),safeString(x.username),safeString(x.userName)]);
        invalidateDataCache(); res.json({success:true,id});
    } catch(error){res.status(500).json({success:false,error:error.message});}
});
app.post(&#x27;/api/cash-expense&#x27;, async (req,res)=&gt;{
    const x=req.body||{}, id=safeInteger(x.id);
    if(id===null) return res.status(400).json({success:false,error:&#x27;ID kas keluar tidak valid&#x27;});
    try {
        await pool.query(`INSERT INTO cash_expenses (id,tanggal,jumlah,keterangan,kasir,shift_id,jenis_mutasi,nomor_bukti,bukti,tujuan,username,userName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal),jumlah=VALUES(jumlah),keterangan=VALUES(keterangan),kasir=VALUES(kasir),shift_id=VALUES(shift_id),jenis_mutasi=VALUES(jenis_mutasi),nomor_bukti=VALUES(nomor_bukti),bukti=VALUES(bukti),tujuan=VALUES(tujuan),username=VALUES(username),userName=VALUES(userName)`,[id,safeDate(x.tanggal),safeNumber(x.jumlah),safeString(x.keterangan),safeString(x.kasir),safeString(x.shift_id),safeString(x.jenis_mutasi,&#x27;TARIK_KAS&#x27;),safeString(x.nomor_bukti),safeString(x.bukti),safeString(x.tujuan),safeString(x.username),safeString(x.userName)]);
        invalidateDataCache(); res.json({success:true,id});
    } catch(error){res.status(500).json({success:false,error:error.message});}
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

// ============================================================
// 5. SETTINGS RINGAN
// ============================================================
// app_settings hanya menyimpan setting ringan. User, bank, shift dan
// audit trail mempunyai tabel masing-masing sebagai single source of truth.
app.put(&#x27;/api/settings&#x27;, async (req, res) =&gt; {
    const data = req.body || {};
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();
        const [rows] = await conn.query(&#x27;SELECT id FROM app_settings WHERE id = 1 LIMIT 1&#x27;);
        if (!rows.length) {
            await conn.query(`INSERT INTO app_settings
                (id, kas_awal, active_shift_start, master_pajak, users, shift_sessions, master_bank, audit_trail)
                VALUES (1, ?, ?, JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY())`, [
                safeNumber(data.kasAwal), safeNumber(data.activeShiftStart, Date.now())
            ]);
        } else {
            await conn.query(`UPDATE app_settings SET kas_awal=?, active_shift_start=? WHERE id=1`, [
                safeNumber(data.kasAwal), safeNumber(data.activeShiftStart, Date.now())
            ]);
        }
        // Kompatibilitas: data lama yang masih memakai saveData tetap dapat di-upsert.
        for (const x of (Array.isArray(data.cashExpenses) ? data.cashExpenses : [])) {
            if (!x || x.id === undefined || x.id === null) continue;
            await conn.query(`INSERT INTO cash_expenses (id,tanggal,jumlah,keterangan,kasir) VALUES (?,?,?,?,?)
                ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal),jumlah=VALUES(jumlah),keterangan=VALUES(keterangan),kasir=VALUES(kasir)`, [
                safeInteger(x.id), safeDate(x.tanggal), safeNumber(x.jumlah), safeString(x.keterangan), safeString(x.kasir)
            ]);
        }
        for (const x of (Array.isArray(data.cashInflows) ? data.cashInflows : [])) {
            if (!x || x.id === undefined || x.id === null) continue;
            await conn.query(`INSERT INTO cash_inflows (id,tanggal,jumlah,keterangan,kasir) VALUES (?,?,?,?,?)
                ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal),jumlah=VALUES(jumlah),keterangan=VALUES(keterangan),kasir=VALUES(kasir)`, [
                safeInteger(x.id), safeDate(x.tanggal), safeNumber(x.jumlah), safeString(x.keterangan), safeString(x.kasir)
            ]);
        }
        for (const r of (Array.isArray(data.returRecords) ? data.returRecords : [])) {
            if (!r || !String(r.id || &#x27;&#x27;).trim()) continue;
            await conn.query(`INSERT INTO retur_records (id,parent_invoice,tanggal,kasir,pelanggan,items,exchange_items)
                VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE parent_invoice=VALUES(parent_invoice),tanggal=VALUES(tanggal),kasir=VALUES(kasir),pelanggan=VALUES(pelanggan),items=VALUES(items),exchange_items=VALUES(exchange_items)`, [
                safeString(r.id),safeString(r.parent_invoice),safeDate(r.tanggal),safeString(r.kasir),safeString(r.pelanggan),
                JSON.stringify(Array.isArray(r.items)?r.items:[]),JSON.stringify(Array.isArray(r.exchange_items)?r.exchange_items:[])
            ]);
        }
        await conn.commit();
        invalidateDataCache();
        res.json({success:true,message:&#x27;Settings berhasil disimpan.&#x27;});
    } catch(error) {
        if(conn) try{await conn.rollback();}catch(_){ }
        console.error(&#x27;SETTINGS ERROR:&#x27;,error);
        res.status(500).json({success:false,error:error.message});
    } finally { if(conn) conn.release(); }
});

// ============================================================
// USER API - update satu akun, tanpa DELETE/INSERT seluruh tabel
// ============================================================
app.get(&#x27;/api/users&#x27;, async (req,res)=&gt;{
    try {
        const [rows]=await pool.query(`SELECT username,password,role,name,shift,status,aktif,data,updated_at FROM users ORDER BY username`);
        res.json({success:true,users:rows.map(u=&gt;({...safeJSON(u.data,{}),username:u.username,password:u.password,role:u.role,name:u.name||&#x27;&#x27;,shift:u.shift||&#x27;&#x27;,status:u.status||(Number(u.aktif)===1?&#x27;Aktif&#x27;:&#x27;Nonaktif&#x27;),aktif:Number(u.aktif)===1}))});
    } catch(error){res.status(500).json({success:false,error:error.message});}
});
app.post(&#x27;/api/users&#x27;, async (req,res)=&gt;{
    const x=req.body||{}, username=safeString(x.username).trim();
    if(!username) return res.status(400).json({success:false,error:&#x27;Username wajib diisi.&#x27;});
    if(!safeString(x.password).trim()) return res.status(400).json({success:false,error:&#x27;Password wajib diisi.&#x27;});
    try {
        const [dup]=await pool.query(&#x27;SELECT username FROM users WHERE username=? LIMIT 1&#x27;,[username]);
        if(dup.length) return res.status(409).json({success:false,error:&#x27;Username sudah digunakan.&#x27;});
        await pool.query(`INSERT INTO users (username,password,role,name,shift,status,aktif,data) VALUES (?,?,?,?,?,?,?,?)`,[
            username,safeString(x.password),safeString(x.role,&#x27;Kasir&#x27;),safeString(x.name),safeString(x.shift),safeString(x.status,x.aktif===false?&#x27;Nonaktif&#x27;:&#x27;Aktif&#x27;),x.aktif===false?0:1,JSON.stringify(x)
        ]);
        invalidateDataCache(); res.json({success:true});
    } catch(error){res.status(error.code===&#x27;ER_DUP_ENTRY&#x27;?409:500).json({success:false,error:error.message});}
});
app.put(&#x27;/api/users/:username&#x27;, async (req,res)=&gt;{
    const oldUsername=safeString(req.params.username).trim(), x=req.body||{}, username=safeString(x.username,oldUsername).trim();
    if(!oldUsername||!username) return res.status(400).json({success:false,error:&#x27;Username tidak valid.&#x27;});
    try {
        const [rows]=await pool.query(&#x27;SELECT * FROM users WHERE username=? LIMIT 1&#x27;,[oldUsername]);
        if(!rows.length) return res.status(404).json({success:false,error:&#x27;Akun tidak ditemukan.&#x27;});
        if(username!==oldUsername){const [dup]=await pool.query(&#x27;SELECT username FROM users WHERE username=? LIMIT 1&#x27;,[username]);if(dup.length)return res.status(409).json({success:false,error:&#x27;Username sudah digunakan.&#x27;});}
        const old=rows[0];
        const password=(Object.prototype.hasOwnProperty.call(x,&#x27;password&#x27;)&amp;&amp;safeString(x.password).trim())?safeString(x.password).trim():old.password;
        const role=safeString(x.role,old.role||&#x27;Kasir&#x27;), name=safeString(x.name,old.name||&#x27;&#x27;), shift=safeString(x.shift,old.shift||&#x27;&#x27;);
        const aktif=x.aktif===undefined?Number(old.aktif)===1:x.aktif!==false, status=safeString(x.status,aktif?&#x27;Aktif&#x27;:&#x27;Nonaktif&#x27;);
        const merged={...safeJSON(old.data,{}),...x,username,password,role,name,shift,aktif,status};
        await pool.query(`UPDATE users SET username=?,password=?,role=?,name=?,shift=?,status=?,aktif=?,data=? WHERE username=?`,[username,password,role,name,shift,status,aktif?1:0,JSON.stringify(merged),oldUsername]);
        invalidateDataCache(); res.json({success:true,user:merged});
    } catch(error){res.status(error.code===&#x27;ER_DUP_ENTRY&#x27;?409:500).json({success:false,error:error.message});}
});

// ============================================================
// MASTER BANK API
// ============================================================
app.get(&#x27;/api/master-bank&#x27;, async (req,res)=&gt;{try{const [rows]=await pool.query(&#x27;SELECT id,nama,rekening,atas_nama,aktif,keterangan FROM master_bank ORDER BY id&#x27;);res.json({success:true,data:rows.map(x=&gt;({...x,aktif:Number(x.aktif)===1}))});}catch(error){res.status(500).json({success:false,error:error.message});}});
app.post(&#x27;/api/master-bank&#x27;, async (req,res)=&gt;{const x=req.body||{},nama=safeString(x.nama||x.bank).trim();if(!nama)return res.status(400).json({success:false,error:&#x27;Nama bank wajib diisi.&#x27;});try{const [r]=await pool.query(&#x27;INSERT INTO master_bank (nama,rekening,atas_nama,aktif,keterangan) VALUES (?,?,?,?,?)&#x27;,[nama,safeString(x.rekening||x.nomor_rekening),safeString(x.atas_nama||x.nama_rekening),x.aktif===false?0:1,safeString(x.keterangan)]);invalidateDataCache();res.json({success:true,id:r.insertId});}catch(error){res.status(error.code===&#x27;ER_DUP_ENTRY&#x27;?409:500).json({success:false,error:error.message});}});
app.put(&#x27;/api/master-bank/:id&#x27;, async (req,res)=&gt;{const id=safeInteger(req.params.id),x=req.body||{},nama=safeString(x.nama||x.bank).trim();if(!id)return res.status(400).json({success:false,error:&#x27;ID bank tidak valid.&#x27;});if(!nama)return res.status(400).json({success:false,error:&#x27;Nama bank wajib diisi.&#x27;});try{await pool.query(&#x27;UPDATE master_bank SET nama=?,rekening=?,atas_nama=?,aktif=?,keterangan=? WHERE id=?&#x27;,[nama,safeString(x.rekening||x.nomor_rekening),safeString(x.atas_nama||x.nama_rekening),x.aktif===false?0:1,safeString(x.keterangan),id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(error.code===&#x27;ER_DUP_ENTRY&#x27;?409:500).json({success:false,error:error.message});}});
app.delete(&#x27;/api/master-bank/:id&#x27;, async (req,res)=&gt;{const id=safeInteger(req.params.id);if(!id)return res.status(400).json({success:false,error:&#x27;ID bank tidak valid.&#x27;});try{await pool.query(&#x27;UPDATE master_bank SET aktif=0 WHERE id=?&#x27;,[id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});

// ============================================================
// MASTER PAJAK API - upsert tanpa menghapus seluruh tabel
// ============================================================
app.put(&#x27;/api/master-pajak/bulk&#x27;, async (req,res)=&gt;{const items=Array.isArray(req.body?.data)?req.body.data:[];let conn;try{conn=await pool.getConnection();await conn.beginTransaction();for(let i=0;i&lt;items.length;i++){const x=items[i]||{},jenis=safeString(x.jenis||x.nama).trim();if(!jenis)continue;const id=safeInteger(x.id,i+1);await conn.query(`INSERT INTO master_pajak (id,jenis,persentase,kode_pajak,aktif,keterangan) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE jenis=VALUES(jenis),persentase=VALUES(persentase),kode_pajak=VALUES(kode_pajak),aktif=VALUES(aktif),keterangan=VALUES(keterangan)`,[id,jenis,safeNumber(x.persentase),safeString(x.kode_pajak),x.aktif===false?0:1,safeString(x.keterangan)]);}await conn.commit();invalidateDataCache();res.json({success:true});}catch(error){if(conn)try{await conn.rollback();}catch(_){}res.status(500).json({success:false,error:error.message});}finally{if(conn)conn.release();}});

// ============================================================
// SHIFT API - satu sesi per request
// ============================================================
app.get(&#x27;/api/shift-sessions&#x27;, async (req,res)=&gt;{try{const [rows]=await pool.query(`SELECT * FROM shift_sessions ORDER BY COALESCE(start_time,&#x27;1000-01-01&#x27;) DESC,id DESC`);res.json({success:true,data:rows.map(r=&gt;({...safeJSON(r.data,{}),id:r.id,username:r.username,name:r.name,cashierName:r.name,shift:r.shift,start:r.start_time,end:r.end_time,status:r.status}))});}catch(error){res.status(500).json({success:false,error:error.message});}});
app.put(&#x27;/api/shift-sessions/:id&#x27;, async (req,res)=&gt;{const id=safeString(req.params.id).trim(),x=req.body||{};if(!id)return res.status(400).json({success:false,error:&#x27;ID shift tidak valid.&#x27;});try{await pool.query(`INSERT INTO shift_sessions (id,username,name,shift,start_time,end_time,status,data) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE username=VALUES(username),name=VALUES(name),shift=VALUES(shift),start_time=VALUES(start_time),end_time=VALUES(end_time),status=VALUES(status),data=VALUES(data)`,[id,safeString(x.username),safeString(x.name||x.cashierName),safeString(x.shift),x.start_time?safeDate(x.start_time):(x.start?safeDate(x.start):null),x.end_time?safeDate(x.end_time):(x.end?safeDate(x.end):null),safeString(x.status),JSON.stringify(x)]);await pool.query(`UPDATE app_settings SET kas_awal=?, active_shift_start=? WHERE id=1`,[String(x.status).toUpperCase()===&#x27;AKTIF&#x27;?safeNumber(x.kasAwal):0,String(x.status).toUpperCase()===&#x27;AKTIF&#x27;?safeNumber(x.start_time||x.start,Date.now()):0]);invalidateDataCache();const [rows]=await pool.query(&#x27;SELECT id,status,start_time,end_time FROM shift_sessions WHERE id=? LIMIT 1&#x27;,[id]);res.json({success:true,shift:rows[0]||null});}catch(error){res.status(500).json({success:false,error:error.message});}});
app.delete(&#x27;/api/shift-sessions/:id&#x27;, async (req,res)=&gt;{const id=safeString(req.params.id);try{await pool.query(&#x27;DELETE FROM shift_sessions WHERE id=?&#x27;,[id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});

// ============================================================
// AUDIT TRAIL - append only
// ============================================================
app.post(&#x27;/api/audit-trail&#x27;, async (req,res)=&gt;{const x=req.body||{},id=safeString(x.id).trim();if(!id)return res.status(400).json({success:false,error:&#x27;ID audit wajib diisi.&#x27;});try{await pool.query(`INSERT IGNORE INTO audit_trail (id,timestamp,username,name,action,details,data) VALUES (?,?,?,?,?,?,?)`,[id,safeInteger(x.timestamp,Date.now()),safeString(x.username,&#x27;system&#x27;),safeString(x.userName||x.name,&#x27;System&#x27;),safeString(x.action),safeString(x.details||&#x27;&#x27;),JSON.stringify(x)]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});


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
                master_bank = ?,
                users = ?,
                shift_sessions = ?,
                audit_trail = ?
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
                Array.isArray(data.masterBank)
                    ? data.masterBank
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
            ),

            JSON.stringify(
                Array.isArray(data.auditTrail)
                    ? data.auditTrail
                    : []
            )
        ]);

        // Sinkronisasi tabel master tambahan saat restore.
        await conn.query(`DELETE FROM master_pajak`);
        if (Array.isArray(data.masterPajak)) {
            for (let i = 0; i &lt; data.masterPajak.length; i++) {
                const x = data.masterPajak[i] || {};
                await conn.query(`INSERT INTO master_pajak (id, jenis, persentase, kode_pajak, aktif, keterangan) VALUES (?, ?, ?, ?, ?, ?)`, [safeInteger(x.id, i+1), safeString(x.jenis || x.nama), safeNumber(x.persentase), safeString(x.kode_pajak), x.aktif === false ? 0 : 1, safeString(x.keterangan)]);
            }
        }
        await conn.query(`DELETE FROM master_bank`);
        if (Array.isArray(data.masterBank)) {
            for (let i = 0; i &lt; data.masterBank.length; i++) {
                const x = data.masterBank[i] || {};
                await conn.query(`INSERT INTO master_bank (id, nama, rekening, atas_nama, aktif, keterangan) VALUES (?, ?, ?, ?, ?, ?)`, [safeInteger(x.id, i+1), safeString(x.nama || x.bank), safeString(x.rekening || x.nomor_rekening), safeString(x.atas_nama || x.nama_rekening), x.aktif === false ? 0 : 1, safeString(x.keterangan)]);
            }
        }
        await conn.query(`DELETE FROM users`);
        if (Array.isArray(data.users)) {
            for (const x of data.users) {
                if (!x || !x.username) continue;
                await conn.query(`INSERT INTO users (username, password, role, name, aktif, data) VALUES (?, ?, ?, ?, ?, ?)`, [safeString(x.username), safeString(x.password), safeString(x.role, &#x27;Kasir&#x27;), safeString(x.name), x.aktif === false ? 0 : 1, JSON.stringify(x)]);
            }
        }
        const [adminCheck] = await conn.query(`SELECT username FROM users WHERE username=&#x27;admin&#x27; LIMIT 1`);
        if (adminCheck.length === 0) await conn.query(`INSERT INTO users (username,password,role,name,aktif,data) VALUES (&#x27;admin&#x27;,&#x27;admin123&#x27;,&#x27;Admin&#x27;,&#x27;Administrator&#x27;,1,?)`, [JSON.stringify({username:&#x27;admin&#x27;,password:&#x27;admin123&#x27;,role:&#x27;Admin&#x27;,name:&#x27;Administrator&#x27;})]);
        await conn.query(`DELETE FROM shift_sessions`);
        if (Array.isArray(data.shiftSessions)) {
            for (let i = 0; i &lt; data.shiftSessions.length; i++) {
                const x=data.shiftSessions[i]||{}; const id=safeString(x.id||x.sessionId||(&#x27;SHIFT-&#x27;+i+&#x27;-&#x27;+Date.now()));
                await conn.query(`INSERT INTO shift_sessions (id,username,name,shift,start_time,end_time,status,data) VALUES (?,?,?,?,?,?,?,?)`, [id,safeString(x.username||x.user),safeString(x.name),safeString(x.shift),x.start_time?safeDate(x.start_time):null,x.end_time?safeDate(x.end_time):null,safeString(x.status),JSON.stringify(x)]);
            }
        }
        await conn.query(`DELETE FROM audit_trail`);
        if (Array.isArray(data.auditTrail)) {
            for (let i=0;i&lt;data.auditTrail.length &amp;&amp; i&lt;1000;i++) {
                const x=data.auditTrail[i]||{}; const id=safeString(x.id||(&#x27;AUDIT-&#x27;+i+&#x27;-&#x27;+Date.now()));
                await conn.query(`INSERT INTO audit_trail (id,timestamp,username,name,action,details,data) VALUES (?,?,?,?,?,?,?)`, [id,safeNumber(x.timestamp),safeString(x.username||x.user),safeString(x.name),safeString(x.action),safeString(x.details||x.description),JSON.stringify(x)]);
            }
        }

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
// HEALTH CHECK / DATABASE CHECK
// ============================================================
app.get(&#x27;/api/health&#x27;, async (req, res) =&gt; {
    try {
        const [rows] = await pool.query(&#x27;SELECT 1 AS ok&#x27;);
        res.json({ success:true, server:true, database: rows[0]?.ok === 1 });
    } catch (error) {
        res.status(503).json({ success:false, server:true, database:false, error:error.message });
    }
});

// ============================================================
// DATABASE SCHEMA DIAGNOSTIC
// ============================================================
app.get(&#x27;/api/db-schema&#x27;, async (req, res) =&gt; {
    try {
        const [dbRows] = await pool.query(&#x27;SELECT DATABASE() AS database_name&#x27;);
        const [rows] = await pool.query(`SHOW COLUMNS FROM \`spareparts\``);
        const columns = rows.map(x =&gt; x.Field);

        res.json({
            success: true,
            database: dbRows[0]?.database_name || null,
            spareparts: columns,
            pajak_status: columns.includes(&#x27;pajak_status&#x27;),
            kode_pajak: columns.includes(&#x27;kode_pajak&#x27;)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// SERVER
// ============================================================

const PORT =
    process.env.PORT || 3000;

async function startServer() {
    app.listen(PORT, () =&gt; {
        console.log(`Server berjalan di port ${PORT}`);
    });
    for(let attempt=1; attempt&lt;=12; attempt++){
        try {
            await initializeDatabase();
            databaseReady=true;
            console.log(&#x27;Database initialization selesai.&#x27;);
            return;
        } catch(error) {
            databaseReady=false;
            console.error(`Database initialization gagal (percobaan ${attempt}/12):`, error.message);
            if(attempt&lt;12) await new Promise(r=&gt;setTimeout(r, Math.min(5000, 1000*attempt)));
        }
    }
    console.error(&#x27;Database belum siap setelah retry. Server tetap hidup; endpoint login akan menunggu koneksi.&#x27;);
}

startServer();

// ============================================================
// INISIALISASI OTOMATIS
// ============================================================
async function initializeDatabase() {
    // ========================================================
    // Tabel inti aplikasi lama - TIDAK menghapus data lama
    // ========================================================
    await pool.query(`CREATE TABLE IF NOT EXISTS spareparts (
        id BIGINT PRIMARY KEY, kode VARCHAR(50), part_number VARCHAR(255), part_numbers_alt TEXT,
        nama VARCHAR(500), kategori VARCHAR(100), merek VARCHAR(100), satuan VARCHAR(50),
        stok_min INT DEFAULT 0, stok_awal INT DEFAULT 0, harga_beli BIGINT DEFAULT 0, harga_jual BIGINT DEFAULT 0,
        satuan_alt VARCHAR(50), isi_satuan_alt INT DEFAULT 0, harga_jual_alt BIGINT DEFAULT 0,
        pajak_status VARCHAR(20), kode_pajak VARCHAR(50), keterangan TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
        id BIGINT PRIMARY KEY, nomor_transaksi VARCHAR(50), tanggal DATETIME, sparepart_id BIGINT,
        custom_item VARCHAR(500), part_numbers_alt TEXT, merek VARCHAR(100), jenis VARCHAR(20),
        jumlah INT, satuan VARCHAR(50), jumlah_dasar INT, harga_satuan BIGINT, tujuan VARCHAR(255),
        keterangan TEXT, source VARCHAR(50), kasir VARCHAR(100), status_bayar VARCHAR(20), metode_bayar VARCHAR(50),
        bayar_tunai BIGINT DEFAULT 0, transfer_amount BIGINT DEFAULT 0, kembalian_diberikan BIGINT DEFAULT 0,
        diskon BIGINT DEFAULT 0, tanggal_lunas DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS partners (
        id BIGINT PRIMARY KEY, nama VARCHAR(255), tipe VARCHAR(50), telp VARCHAR(50), alamat TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS cash_expenses (
        id BIGINT PRIMARY KEY, tanggal DATETIME, jumlah BIGINT, keterangan TEXT, kasir VARCHAR(100)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS cash_inflows (
        id BIGINT PRIMARY KEY, tanggal DATETIME, jumlah BIGINT, keterangan TEXT, kasir VARCHAR(100)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS tax_records (
        tax_id VARCHAR(100) PRIMARY KEY, trx_id BIGINT, tanggal DATETIME, nomor_transaksi VARCHAR(50),
        part_number VARCHAR(255), nama VARCHAR(500), kategori VARCHAR(100), merek VARCHAR(100),
        status_bayar VARCHAR(20), pelanggan VARCHAR(255), jumlah INT, satuan VARCHAR(50),
        harga_satuan BIGINT, subtotal BIGINT, persentase_pajak DECIMAL(5,2), nilai_pajak BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS retur_records (
        id VARCHAR(50) PRIMARY KEY, parent_invoice VARCHAR(50), tanggal DATETIME, kasir VARCHAR(100),
        pelanggan VARCHAR(255), items JSON, exchange_items JSON
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await pool.query(`ALTER TABLE retur_records ADD COLUMN exchange_items JSON`); } catch(e) {}

    // ========================================================
    // Settings + master database baru
    // ========================================================
    await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
        id INT PRIMARY KEY DEFAULT 1, kas_awal BIGINT DEFAULT 0, active_shift_start BIGINT,
        master_pajak JSON, users JSON, shift_sessions JSON, master_bank JSON NULL, audit_trail JSON NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await pool.query(`ALTER TABLE app_settings ADD COLUMN shift_sessions JSON`); } catch(e) {}
    try { await pool.query(`ALTER TABLE app_settings ADD COLUMN master_bank JSON NULL`); } catch(e) {}
    try { await pool.query(`ALTER TABLE app_settings ADD COLUMN audit_trail JSON NULL`); } catch(e) {}

    await pool.query(`CREATE TABLE IF NOT EXISTS master_pajak (
        id BIGINT PRIMARY KEY, jenis VARCHAR(100) NOT NULL, persentase DECIMAL(5,2) NOT NULL DEFAULT 0,
        kode_pajak VARCHAR(50) DEFAULT &#x27;&#x27;, aktif TINYINT(1) DEFAULT 1, keterangan VARCHAR(255) DEFAULT &#x27;&#x27;,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS master_bank (
        id BIGINT PRIMARY KEY, nama VARCHAR(100) NOT NULL, rekening VARCHAR(100) DEFAULT &#x27;&#x27;,
        atas_nama VARCHAR(255) DEFAULT &#x27;&#x27;, aktif TINYINT(1) DEFAULT 1, keterangan VARCHAR(255) DEFAULT &#x27;&#x27;,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(100) PRIMARY KEY, password VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL,
        name VARCHAR(255) DEFAULT &#x27;&#x27;, aktif TINYINT(1) DEFAULT 1, data JSON NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS shift_sessions (
        id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) DEFAULT &#x27;&#x27;, name VARCHAR(255) DEFAULT &#x27;&#x27;,
        shift VARCHAR(100) DEFAULT &#x27;&#x27;, start_time DATETIME NULL, end_time DATETIME NULL,
        status VARCHAR(50) DEFAULT &#x27;&#x27;, data JSON NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS audit_trail (
        id VARCHAR(100) PRIMARY KEY, timestamp BIGINT DEFAULT 0, username VARCHAR(100) DEFAULT &#x27;&#x27;,
        name VARCHAR(255) DEFAULT &#x27;&#x27;, action VARCHAR(255) DEFAULT &#x27;&#x27;, details TEXT, data JSON NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ========================================================
    // MIGRASI OTOMATIS KOLOM DATABASE LAMA
    // ========================================================
    // CREATE TABLE IF NOT EXISTS hanya membuat tabel jika belum ada.
    // Database lama bisa sudah memiliki tabel tetapi kolomnya belum lengkap.
    // Bagian ini menambahkan kolom yang hilang SATU PER SATU, tanpa DROP,
    // DELETE, TRUNCATE, atau mengubah isi data lama.
    async function ensureColumn(table, column, definition) {
        // Periksa langsung tabel aktif. Tidak mengubah atau menghapus data lama.
        const [rows] = await pool.query(
            `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
            [column]
        );

        if (rows.length === 0) {
            try {
                await pool.query(
                    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
                );
                console.log(`[MIGRASI] ${table}.${column} ditambahkan tanpa menghapus data`);
            } catch (error) {
                const message = String(error?.message || &#x27;&#x27;);
                if (!/duplicate column|duplicate field|already exists/i.test(message)) {
                    throw new Error(`Migrasi ${table}.${column} gagal: ${message}`);
                }
            }
        }

        const [verify] = await pool.query(
            `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
            [column]
        );
        if (verify.length === 0) {
            throw new Error(`Kolom ${table}.${column} tidak tersedia setelah migrasi.`);
        }
    }

    // Spareparts / master barang
    const sparepartColumns = {
        kode: &quot;VARCHAR(50) NULL&quot;,
        part_number: &quot;VARCHAR(255) NULL&quot;,
        part_numbers_alt: &quot;TEXT NULL&quot;,
        nama: &quot;VARCHAR(500) NULL&quot;,
        kategori: &quot;VARCHAR(100) NULL&quot;,
        merek: &quot;VARCHAR(100) NULL&quot;,
        satuan: &quot;VARCHAR(50) NULL&quot;,
        stok_min: &quot;INT DEFAULT 0&quot;,
        stok_awal: &quot;INT DEFAULT 0&quot;,
        harga_beli: &quot;BIGINT DEFAULT 0&quot;,
        harga_jual: &quot;BIGINT DEFAULT 0&quot;,
        satuan_alt: &quot;VARCHAR(50) NULL&quot;,
        isi_satuan_alt: &quot;INT DEFAULT 0&quot;,
        harga_jual_alt: &quot;BIGINT DEFAULT 0&quot;,
        pajak_status: &quot;VARCHAR(20) NULL&quot;,
        kode_pajak: &quot;VARCHAR(50) NULL&quot;,
        keterangan: &quot;TEXT NULL&quot;
    };

    // Transaksi penjualan / piutang / pembayaran
    const transactionColumns = {
        nomor_transaksi: &quot;VARCHAR(50) NULL&quot;,
        tanggal: &quot;DATETIME NULL&quot;,
        sparepart_id: &quot;BIGINT NULL&quot;,
        custom_item: &quot;VARCHAR(500) NULL&quot;,
        part_numbers_alt: &quot;TEXT NULL&quot;,
        merek: &quot;VARCHAR(100) NULL&quot;,
        jenis: &quot;VARCHAR(20) NULL&quot;,
        jumlah: &quot;INT DEFAULT 0&quot;,
        satuan: &quot;VARCHAR(50) NULL&quot;,
        jumlah_dasar: &quot;INT DEFAULT 0&quot;,
        harga_satuan: &quot;BIGINT DEFAULT 0&quot;,
        tujuan: &quot;VARCHAR(255) NULL&quot;,
        keterangan: &quot;TEXT NULL&quot;,
        source: &quot;VARCHAR(50) NULL&quot;,
        kasir: &quot;VARCHAR(100) NULL&quot;,
        status_bayar: &quot;VARCHAR(20) NULL&quot;,
        metode_bayar: &quot;VARCHAR(50) NULL&quot;,
        bayar_tunai: &quot;BIGINT DEFAULT 0&quot;,
        transfer_amount: &quot;BIGINT DEFAULT 0&quot;,
        kembalian_diberikan: &quot;BIGINT DEFAULT 0&quot;,
        diskon: &quot;BIGINT DEFAULT 0&quot;,
        tanggal_lunas: &quot;DATETIME NULL&quot;,
        shift_id: &quot;VARCHAR(100) NULL&quot;, bank_transfer: &quot;VARCHAR(255) NULL&quot;,
        retur_id: &quot;VARCHAR(100) NULL&quot;, parent_invoice: &quot;VARCHAR(50) NULL&quot;
    };

    const partnerColumns = {
        nama: &quot;VARCHAR(255) NULL&quot;, tipe: &quot;VARCHAR(50) NULL&quot;,
        telp: &quot;VARCHAR(50) NULL&quot;, alamat: &quot;TEXT NULL&quot;
    };

    const cashColumns = {
        tanggal: &quot;DATETIME NULL&quot;, jumlah: &quot;BIGINT DEFAULT 0&quot;,
        keterangan: &quot;TEXT NULL&quot;, kasir: &quot;VARCHAR(100) NULL&quot;, shift_id: &quot;VARCHAR(100) NULL&quot;,
        jenis_mutasi: &quot;VARCHAR(50) NULL&quot;, sumber_dana: &quot;VARCHAR(100) NULL&quot;, nomor_bukti: &quot;VARCHAR(100) NULL&quot;, bukti: &quot;TEXT NULL&quot;, tujuan: &quot;VARCHAR(255) NULL&quot;, username: &quot;VARCHAR(100) NULL&quot;, userName: &quot;VARCHAR(255) NULL&quot;
    };

    const taxColumns = {
        trx_id: &quot;BIGINT DEFAULT 0&quot;, tanggal: &quot;DATETIME NULL&quot;,
        nomor_transaksi: &quot;VARCHAR(50) NULL&quot;, part_number: &quot;VARCHAR(255) NULL&quot;,
        nama: &quot;VARCHAR(500) NULL&quot;, kategori: &quot;VARCHAR(100) NULL&quot;,
        merek: &quot;VARCHAR(100) NULL&quot;, status_bayar: &quot;VARCHAR(20) NULL&quot;,
        pelanggan: &quot;VARCHAR(255) NULL&quot;, jumlah: &quot;INT DEFAULT 0&quot;,
        satuan: &quot;VARCHAR(50) NULL&quot;, harga_satuan: &quot;BIGINT DEFAULT 0&quot;,
        subtotal: &quot;BIGINT DEFAULT 0&quot;, persentase_pajak: &quot;DECIMAL(5,2) DEFAULT 0&quot;,
        nilai_pajak: &quot;BIGINT DEFAULT 0&quot;
    };

    const returColumns = {
        parent_invoice: &quot;VARCHAR(50) NULL&quot;, tanggal: &quot;DATETIME NULL&quot;,
        kasir: &quot;VARCHAR(100) NULL&quot;, pelanggan: &quot;VARCHAR(255) NULL&quot;,
        items: &quot;JSON NULL&quot;, exchange_items: &quot;JSON NULL&quot;, shift_id: &quot;VARCHAR(100) NULL&quot;,
        metode_bayar: &quot;VARCHAR(50) NULL&quot;, bank_transfer: &quot;VARCHAR(255) NULL&quot;, retur_value: &quot;BIGINT DEFAULT 0&quot;, exchange_value: &quot;BIGINT DEFAULT 0&quot;,
        net_amount: &quot;BIGINT DEFAULT 0&quot;, payment_direction: &quot;VARCHAR(50) NULL&quot;, payment_method: &quot;VARCHAR(50) NULL&quot;, cash_amount: &quot;BIGINT DEFAULT 0&quot;, transfer_amount: &quot;BIGINT DEFAULT 0&quot;
    };

    const appSettingColumns = {
        kas_awal: &quot;BIGINT DEFAULT 0&quot;, active_shift_start: &quot;BIGINT NULL&quot;,
        master_pajak: &quot;JSON NULL&quot;, users: &quot;JSON NULL&quot;, shift_sessions: &quot;JSON NULL&quot;,
        master_bank: &quot;JSON NULL&quot;, audit_trail: &quot;JSON NULL&quot;
    };

    const masterPajakColumns = {
        jenis: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;, persentase: &quot;DECIMAL(5,2) DEFAULT 0&quot;,
        kode_pajak: &quot;VARCHAR(50) DEFAULT &#x27;&#x27;&quot;, aktif: &quot;TINYINT(1) DEFAULT 1&quot;,
        keterangan: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;,
        updated_at: &quot;DATETIME NULL&quot;
    };

    const masterBankColumns = {
        nama: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;, rekening: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;,
        atas_nama: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;, aktif: &quot;TINYINT(1) DEFAULT 1&quot;,
        keterangan: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;, updated_at: &quot;DATETIME NULL&quot;
    };

    const userColumns = {
        password: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;, role: &quot;VARCHAR(50) DEFAULT &#x27;&#x27;&quot;,
        name: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;, shift: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;,
        status: &quot;VARCHAR(20) DEFAULT &#x27;Aktif&#x27;&quot;, aktif: &quot;TINYINT(1) DEFAULT 1&quot;,
        data: &quot;JSON NULL&quot;, updated_at: &quot;DATETIME NULL&quot;
    };

    const shiftColumns = {
        username: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;, name: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;,
        shift: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;, start_time: &quot;DATETIME NULL&quot;,
        end_time: &quot;DATETIME NULL&quot;, status: &quot;VARCHAR(50) DEFAULT &#x27;&#x27;&quot;,
        data: &quot;JSON NULL&quot;, updated_at: &quot;DATETIME NULL&quot;
    };

    const auditColumns = {
        timestamp: &quot;BIGINT DEFAULT 0&quot;, username: &quot;VARCHAR(100) DEFAULT &#x27;&#x27;&quot;,
        name: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;, action: &quot;VARCHAR(255) DEFAULT &#x27;&#x27;&quot;,
        details: &quot;TEXT NULL&quot;, data: &quot;JSON NULL&quot;, created_at: &quot;DATETIME NULL&quot;
    };

    for (const [column, definition] of Object.entries(sparepartColumns)) await ensureColumn(&#x27;spareparts&#x27;, column, definition);
    for (const [column, definition] of Object.entries(transactionColumns)) await ensureColumn(&#x27;transactions&#x27;, column, definition);
    for (const [column, definition] of Object.entries(partnerColumns)) await ensureColumn(&#x27;partners&#x27;, column, definition);
    for (const [column, definition] of Object.entries(cashColumns)) await ensureColumn(&#x27;cash_expenses&#x27;, column, definition);
    for (const [column, definition] of Object.entries(cashColumns)) await ensureColumn(&#x27;cash_inflows&#x27;, column, definition);
    for (const [column, definition] of Object.entries(taxColumns)) await ensureColumn(&#x27;tax_records&#x27;, column, definition);
    for (const [column, definition] of Object.entries(returColumns)) await ensureColumn(&#x27;retur_records&#x27;, column, definition);
    for (const [column, definition] of Object.entries(appSettingColumns)) await ensureColumn(&#x27;app_settings&#x27;, column, definition);
    for (const [column, definition] of Object.entries(masterPajakColumns)) await ensureColumn(&#x27;master_pajak&#x27;, column, definition);
    for (const [column, definition] of Object.entries(masterBankColumns)) await ensureColumn(&#x27;master_bank&#x27;, column, definition);
    for (const [column, definition] of Object.entries(userColumns)) await ensureColumn(&#x27;users&#x27;, column, definition);
    for (const [column, definition] of Object.entries(shiftColumns)) await ensureColumn(&#x27;shift_sessions&#x27;, column, definition);
    for (const [column, definition] of Object.entries(auditColumns)) await ensureColumn(&#x27;audit_trail&#x27;, column, definition);

    console.log(&#x27;[MIGRASI] Pemeriksaan kolom database selesai tanpa menghapus data.&#x27;);

    // ========================================================
    // VERIFIKASI STRUKTUR PAJAK SPAREPART
    // ========================================================
    // Aplikasi awal memakai dua kolom yang berbeda:
    // pajak_status = status Pajak / Non Pajak
    // kode_pajak   = kode pajak
    // Keduanya dipertahankan; tidak ada rename/drop/reorder.
    const [sparepartSchema] = await pool.query(`SHOW COLUMNS FROM \`spareparts\``);
    const sparepartColumnNames = sparepartSchema.map(x =&gt; x.Field);
    const hasPajakStatus = sparepartColumnNames.includes(&#x27;pajak_status&#x27;);
    const hasKodePajak = sparepartColumnNames.includes(&#x27;kode_pajak&#x27;);

    if (!hasPajakStatus || !hasKodePajak) {
        throw new Error(
            `Struktur pajak spareparts belum lengkap. Kolom yang tersedia: ${sparepartColumnNames.join(&#x27;, &#x27;)}. ` +
            `Wajib ada pajak_status dan kode_pajak.`
        );
    }

    console.log(&#x27;[PAJAK] spareparts.pajak_status tersedia.&#x27;);
    console.log(&#x27;[PAJAK] spareparts.kode_pajak tersedia.&#x27;);

    // ========================================================
    // Pastikan row settings utama tersedia
    // ========================================================
    const defaultPajak = [
        {jenis:&#x27;Aki Basah&#x27;,persentase:20}, {jenis:&#x27;Aki Kering&#x27;,persentase:11},
        {jenis:&#x27;Oli&#x27;,persentase:4}, {jenis:&#x27;Air Radiator&#x27;,persentase:4},
        {jenis:&#x27;Minyak Rem&#x27;,persentase:4}, {jenis:&#x27;Lainnya&#x27;,persentase:11}
    ];
    const defaultUsers = [
        {username:&#x27;owner&#x27;,password:&#x27;owner123&#x27;,role:&#x27;Owner&#x27;,name:&#x27;Pemilik&#x27;},
        {username:&#x27;admin&#x27;,password:&#x27;admin123&#x27;,role:&#x27;Admin&#x27;,name:&#x27;Administrator&#x27;},
        {username:&#x27;pagi&#x27;,password:&#x27;pagi123&#x27;,role:&#x27;Kasir&#x27;,name:&#x27;Kasir Pagi&#x27;},
        {username:&#x27;siang&#x27;,password:&#x27;siang123&#x27;,role:&#x27;Kasir&#x27;,name:&#x27;Kasir Siang&#x27;}
    ];

    const [settings] = await pool.query(`SELECT * FROM app_settings WHERE id=1 LIMIT 1`);
    if (settings.length === 0) {
        await pool.query(`INSERT INTO app_settings
            (id,kas_awal,active_shift_start,master_pajak,users,shift_sessions,master_bank,audit_trail)
            VALUES (?,?,?,?,?,?,?,?)`, [
                1,0,Date.now(),JSON.stringify(defaultPajak),JSON.stringify(defaultUsers),JSON.stringify([]),JSON.stringify([]),JSON.stringify([])
            ]);
    }

    // ========================================================
    // Master pajak: jangan menimpa data yang sudah ada
    // ========================================================
    const [pajakCount] = await pool.query(`SELECT COUNT(*) AS n FROM master_pajak`);
    if (Number(pajakCount[0].n) === 0) {
        for (let i=0;i&lt;defaultPajak.length;i++) {
            const x=defaultPajak[i];
            await pool.query(`INSERT INTO master_pajak (id,jenis,persentase,aktif) VALUES (?,?,?,1)`, [i+1,x.jenis,x.persentase]);
        }
    }

    // ========================================================
    // User: jangan menghapus user lama; pastikan admin selalu ada
    // ========================================================
    for (const u of defaultUsers) {
        await pool.query(`INSERT IGNORE INTO users (username,password,role,name,aktif,data) VALUES (?,?,?,?,1,?)`,
            [u.username,u.password,u.role,u.name,JSON.stringify(u)]);
    }

    // Migrasi satu kali dari JSON lama -&gt; tabel jika tabel master masih kosong.
    // Tidak pernah menghapus tabel yang sudah berisi data.
    const [bankCount] = await pool.query(&#x27;SELECT COUNT(*) AS n FROM master_bank&#x27;);
    if (Number(bankCount[0].n) === 0) {
        const [st] = await pool.query(&#x27;SELECT master_bank FROM app_settings WHERE id=1 LIMIT 1&#x27;);
        const legacyBanks = safeJSON(st[0]?.master_bank, []);
        if (Array.isArray(legacyBanks)) {
            for (let i=0;i&lt;legacyBanks.length;i++) {
                const b=legacyBanks[i]; const nama=typeof b===&#x27;string&#x27;?b:safeString(b?.nama||b?.bank).trim();
                if(!nama) continue;
                try { await pool.query(&#x27;INSERT INTO master_bank (id,nama,rekening,atas_nama,aktif,keterangan) VALUES (?,?,?,?,?,?)&#x27;,[
                    safeInteger(typeof b===&#x27;object&#x27;?b.id:null,i+1),nama,typeof b===&#x27;object&#x27;?safeString(b.rekening||b.nomor_rekening):&#x27;&#x27;,typeof b===&#x27;object&#x27;?safeString(b.atas_nama||b.nama_rekening):&#x27;&#x27;,typeof b===&#x27;object&#x27;&amp;&amp;b.aktif===false?0:1,typeof b===&#x27;object&#x27;?safeString(b.keterangan):&#x27;&#x27;
                ]); } catch(e) { if(e.code!==&#x27;ER_DUP_ENTRY&#x27;) throw e; }
            }
        }
    }

    const [pajakTableCount] = await pool.query(&#x27;SELECT COUNT(*) AS n FROM master_pajak&#x27;);
    if (Number(pajakTableCount[0].n) === 0) {
        const [stPajak] = await pool.query(&#x27;SELECT master_pajak FROM app_settings WHERE id=1 LIMIT 1&#x27;);
        const legacyPajak = safeJSON(stPajak[0]?.master_pajak, []);
        if (Array.isArray(legacyPajak)) {
            for (let i=0;i&lt;legacyPajak.length;i++) {
                const x=legacyPajak[i]||{}, jenis=safeString(x.jenis||x.nama).trim(); if(!jenis) continue;
                try { await pool.query(&#x27;INSERT INTO master_pajak (id,jenis,persentase,kode_pajak,aktif,keterangan) VALUES (?,?,?,?,?,?)&#x27;,[
                    safeInteger(x.id,i+1),jenis,safeNumber(x.persentase),safeString(x.kode_pajak),x.aktif===false?0:1,safeString(x.keterangan)
                ]); } catch(e) { if(e.code!==&#x27;ER_DUP_ENTRY&#x27;) throw e; }
            }
        }
    }

    // Sinkronisasi settings lama jika JSON-nya kosong.
    const [freshSettings] = await pool.query(`SELECT master_pajak,users FROM app_settings WHERE id=1 LIMIT 1`);
    if (freshSettings.length) {
        const mp = safeJSON(freshSettings[0].master_pajak, []);
        if (!Array.isArray(mp) || mp.length === 0) {
            const [rows] = await pool.query(`SELECT jenis,persentase,kode_pajak FROM master_pajak WHERE aktif=1 ORDER BY id`);
            await pool.query(`UPDATE app_settings SET master_pajak=? WHERE id=1`, [JSON.stringify(rows.map(x=&gt;({jenis:x.jenis,persentase:Number(x.persentase),kode_pajak:x.kode_pajak||&#x27;&#x27;})))]);
        }
        const us = safeJSON(freshSettings[0].users, []);
        if (!Array.isArray(us) || us.length === 0) {
            const [rows] = await pool.query(`SELECT username,password,role,name FROM users WHERE aktif=1 ORDER BY username`);
            await pool.query(`UPDATE app_settings SET users=? WHERE id=1`, [JSON.stringify(rows)]);
        }
    }
}</pre></body></html>
