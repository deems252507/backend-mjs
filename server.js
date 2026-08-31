
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
    host: process.env.DB_HOST || 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: process.env.DB_USER || 'uks2krvuygsynrco',
    password: process.env.DB_PASSWORD || 'fWwkTbshbBANrTGMj8Aq',
    database: process.env.DB_NAME || 'b7fgoctdsrijlfhczppz',
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
        await initializeDatabase();
        res.json({
            success: true,
            message: 'Database & tabel siap! Migrasi kompatibilitas selesai tanpa menghapus data.'
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
                        : null
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

        const [masterPajakRows] = await connection.query(`SELECT id, jenis, persentase, kode_pajak, aktif, keterangan FROM master_pajak WHERE aktif = 1 ORDER BY id`);
        const [masterBankRows] = await connection.query(`SELECT id, nama, rekening, atas_nama, aktif, keterangan FROM master_bank WHERE aktif = 1 ORDER BY id`);
        const [userRows] = await connection.query(`SELECT id, username, password, role, name, shift, status, aktif, data, created_at, updated_at FROM users ORDER BY username`);
        const [shiftRows] = await connection.query(`SELECT * FROM shift_sessions ORDER BY COALESCE(start_time, '1000-01-01') DESC, id DESC`);
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

        // Master pajak dibaca dari tabel sebagai sumber utama.
        let masterPajak = masterPajakRows.map(p => ({
            id:p.id, jenis:p.jenis, persentase:Number(p.persentase)||0,
            kode_pajak:p.kode_pajak||'', aktif:Number(p.aktif)===1, keterangan:p.keterangan||''
        }));
        // Kompatibilitas data lama: jika tabel benar-benar kosong, gunakan JSON lama.
        if (masterPajak.length === 0) {
            masterPajak = safeJSON(settings[0]?.master_pajak, []);
            if (!Array.isArray(masterPajak)) masterPajak = [];
        }

        let users =
            settings[0]?.users || [];

        if (typeof users === 'string') {

            try {
                users =
                    JSON.parse(users);
            } catch (e) {
                users = [];
            }
        }

        let masterBank = masterBankRows.map(b => ({
            id: b.id,
            nama: b.nama,
            rekening: b.rekening || '',
            atas_nama: b.atas_nama || '',
            aktif: Number(b.aktif) === 1,
            keterangan: b.keterangan || ''
        }));

        // Tabel master_bank adalah sumber utama. JSON lama tidak lagi dipakai saat runtime.
        if (userRows.length > 0) {
            users = userRows.map(u => {
                const extra = safeJSON(u.data, {});
                return { ...extra, id:u.id, username:u.username, password:u.password, role:u.role, name:u.name, shift:u.shift||'', status:u.status||(Number(u.aktif)===1?'Aktif':'Nonaktif'), aktif:Number(u.aktif) === 1 };
            });
        }

        let shiftSessions =
            shiftRows.map(r => {
                const extra = safeJSON(r.data, {});
                return { ...extra, id:r.id, username:r.username, name:r.name, shift:r.shift, start_time:r.start_time, end_time:r.end_time, status:r.status };
            });
        if (shiftSessions.length === 0) {
            shiftSessions = safeJSON(settings[0]?.shift_sessions, []);
            if (!Array.isArray(shiftSessions)) shiftSessions = [];
        }

        let auditTrail = auditRows.map(r => {
            const extra = safeJSON(r.data, {});
            return { ...extra, id:r.id, timestamp:Number(r.timestamp)||0, username:r.username, name:r.name, action:r.action, details:r.details };
        });
        if (auditTrail.length === 0) {
            auditTrail = safeJSON(settings[0]?.audit_trail, []);
            if (!Array.isArray(auditTrail)) auditTrail = [];
        }

        if (typeof shiftSessions === 'string') {
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
                        : null
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
    console.log('[RETUR] Body:', JSON.stringify(body, null, 2));
    console.log('==========================================');

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
     *   id: "...",
     *   parent_invoice: "...",
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
    if (!returRecord && body.id && (body.parent_invoice || body.parentInvoice)) {
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
    if (!returRecord || typeof returRecord !== 'object') {
        console.error('[RETUR] returRecord tidak ditemukan.');
        console.error('[RETUR] Body yang diterima:', body);

        return res.status(400).json({
            success: false,
            error: 'Data retur tidak valid: returRecord tidak ditemukan',
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
        '';

    const pelanggan =
        returRecord.pelanggan ||
        returRecord.customer ||
        returRecord.nama_pelanggan ||
        '';

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
            error: 'Data retur tidak valid: ID retur tidak ditemukan'
        });
    }

    if (!parentInvoice) {
        return res.status(400).json({
            success: false,
            error: 'Data retur tidak valid: nomor invoice tidak ditemukan'
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
        if (transactions.length > 0) {

            const values = transactions
                .filter(t => t && t.id != null)
                .map(t => [
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
                    '',

                    t.merek || '',

                    t.jenis || 'Keluar',

                    Number(t.jumlah) || 0,

                    t.satuan || 'Pcs',

                    Number(t.jumlah_dasar ?? t.jumlahDasar) || 0,

                    Number(t.harga_satuan ?? t.hargaSatuan) || 0,

                    t.tujuan || '',

                    t.keterangan || '',

                    t.source || 'retur',

                    t.kasir || kasir || '',

                    t.status_bayar || 'Lunas',

                    t.metode_bayar || '',

                    Number(t.bayar_tunai) || 0,

                    Number(t.transfer_amount) || 0,

                    Number(t.kembalian_diberikan) || 0,

                    Number(t.diskon) || 0,

                    t.tanggal_lunas || null
                ]);

            if (values.length > 0) {
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
        if (taxRecords.length > 0) {

            const values = taxRecords
                .filter(t => t && t.tax_id != null)
                .map(t => [
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
                    '',

                    t.nama || '',

                    t.kategori || '',

                    t.merek || '',

                    t.status_bayar ||
                    t.statusBayar ||
                    'Lunas',

                    t.pelanggan ||
                    t.customer ||
                    pelanggan ||
                    '',

                    Number(t.jumlah) || 0,

                    t.satuan || 'Pcs',

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

            if (values.length > 0) {
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
                error: 'Verifikasi gagal: data retur tidak tersimpan di database'
            });
        }

        // ========================================================
        // COMMIT
        // ========================================================
        await conn.commit();

        invalidateDataCache();

        console.log(
            '[RETUR] Berhasil disimpan:',
            String(returId),
            'Invoice:',
            String(parentInvoice)
        );

        return res.json({
            success: true,
            message: 'Retur berhasil disimpan ke server',
            returId: String(returId),
            parentInvoice: String(parentInvoice)
        });

    } catch (error) {

        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error(
                    '[RETUR] Rollback error:',
                    rollbackError
                );
            }
        }

        console.error(
            '[RETUR] ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Gagal menyimpan retur: ' + error.message
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
                kasir
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            Date.now(),
            new Date(),
            total,
            'Pelunasan Bon: ' +
                String(trxId),
            trxRows[0].kasir ||
                'Admin'
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

// ============================================================
// 5. SETTINGS RINGAN
// ============================================================
// app_settings hanya menyimpan setting ringan. User, bank, shift dan
// audit trail mempunyai tabel masing-masing sebagai single source of truth.
app.put('/api/settings', async (req, res) => {
    const data = req.body || {};
    let conn;
    try {
        await initializeDatabase();
        conn = await pool.getConnection();
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT id FROM app_settings WHERE id = 1 LIMIT 1');
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
            if (!r || !String(r.id || '').trim()) continue;
            await conn.query(`INSERT INTO retur_records (id,parent_invoice,tanggal,kasir,pelanggan,items,exchange_items)
                VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE parent_invoice=VALUES(parent_invoice),tanggal=VALUES(tanggal),kasir=VALUES(kasir),pelanggan=VALUES(pelanggan),items=VALUES(items),exchange_items=VALUES(exchange_items)`, [
                safeString(r.id),safeString(r.parent_invoice),safeDate(r.tanggal),safeString(r.kasir),safeString(r.pelanggan),
                JSON.stringify(Array.isArray(r.items)?r.items:[]),JSON.stringify(Array.isArray(r.exchange_items)?r.exchange_items:[])
            ]);
        }
        await conn.commit();
        invalidateDataCache();
        res.json({success:true,message:'Settings berhasil disimpan.'});
    } catch(error) {
        if(conn) try{await conn.rollback();}catch(_){ }
        console.error('SETTINGS ERROR:',error);
        res.status(500).json({success:false,error:error.message});
    } finally { if(conn) conn.release(); }
});

// ============================================================
// USER API - update satu akun, tanpa DELETE/INSERT seluruh tabel
// ============================================================
app.get('/api/users', async (req,res)=>{
    try {
        const [rows]=await pool.query(`SELECT username,password,role,name,shift,status,aktif,data,updated_at FROM users ORDER BY username`);
        res.json({success:true,users:rows.map(u=>({...safeJSON(u.data,{}),username:u.username,password:u.password,role:u.role,name:u.name||'',shift:u.shift||'',status:u.status||(Number(u.aktif)===1?'Aktif':'Nonaktif'),aktif:Number(u.aktif)===1}))});
    } catch(error){res.status(500).json({success:false,error:error.message});}
});
app.post('/api/users', async (req,res)=>{
    const x=req.body||{}, username=safeString(x.username).trim();
    if(!username) return res.status(400).json({success:false,error:'Username wajib diisi.'});
    if(!safeString(x.password).trim()) return res.status(400).json({success:false,error:'Password wajib diisi.'});
    try {
        const [dup]=await pool.query('SELECT username FROM users WHERE username=? LIMIT 1',[username]);
        if(dup.length) return res.status(409).json({success:false,error:'Username sudah digunakan.'});
        await pool.query(`INSERT INTO users (username,password,role,name,shift,status,aktif,data) VALUES (?,?,?,?,?,?,?,?)`,[
            username,safeString(x.password),safeString(x.role,'Kasir'),safeString(x.name),safeString(x.shift),safeString(x.status,x.aktif===false?'Nonaktif':'Aktif'),x.aktif===false?0:1,JSON.stringify(x)
        ]);
        invalidateDataCache(); res.json({success:true});
    } catch(error){res.status(error.code==='ER_DUP_ENTRY'?409:500).json({success:false,error:error.message});}
});
app.put('/api/users/:username', async (req,res)=>{
    const oldUsername=safeString(req.params.username).trim(), x=req.body||{}, username=safeString(x.username,oldUsername).trim();
    if(!oldUsername||!username) return res.status(400).json({success:false,error:'Username tidak valid.'});
    try {
        const [rows]=await pool.query('SELECT * FROM users WHERE username=? LIMIT 1',[oldUsername]);
        if(!rows.length) return res.status(404).json({success:false,error:'Akun tidak ditemukan.'});
        if(username!==oldUsername){const [dup]=await pool.query('SELECT username FROM users WHERE username=? LIMIT 1',[username]);if(dup.length)return res.status(409).json({success:false,error:'Username sudah digunakan.'});}
        const old=rows[0];
        const password=(Object.prototype.hasOwnProperty.call(x,'password')&&safeString(x.password).trim())?safeString(x.password).trim():old.password;
        const role=safeString(x.role,old.role||'Kasir'), name=safeString(x.name,old.name||''), shift=safeString(x.shift,old.shift||'');
        const aktif=x.aktif===undefined?Number(old.aktif)===1:x.aktif!==false, status=safeString(x.status,aktif?'Aktif':'Nonaktif');
        const merged={...safeJSON(old.data,{}),...x,username,password,role,name,shift,aktif,status};
        await pool.query(`UPDATE users SET username=?,password=?,role=?,name=?,shift=?,status=?,aktif=?,data=? WHERE username=?`,[username,password,role,name,shift,status,aktif?1:0,JSON.stringify(merged),oldUsername]);
        invalidateDataCache(); res.json({success:true,user:merged});
    } catch(error){res.status(error.code==='ER_DUP_ENTRY'?409:500).json({success:false,error:error.message});}
});

// ============================================================
// MASTER BANK API
// ============================================================
app.get('/api/master-bank', async (req,res)=>{try{const [rows]=await pool.query('SELECT id,nama,rekening,atas_nama,aktif,keterangan FROM master_bank ORDER BY id');res.json({success:true,data:rows.map(x=>({...x,aktif:Number(x.aktif)===1}))});}catch(error){res.status(500).json({success:false,error:error.message});}});
app.post('/api/master-bank', async (req,res)=>{const x=req.body||{},nama=safeString(x.nama||x.bank).trim();if(!nama)return res.status(400).json({success:false,error:'Nama bank wajib diisi.'});try{const [r]=await pool.query('INSERT INTO master_bank (nama,rekening,atas_nama,aktif,keterangan) VALUES (?,?,?,?,?)',[nama,safeString(x.rekening||x.nomor_rekening),safeString(x.atas_nama||x.nama_rekening),x.aktif===false?0:1,safeString(x.keterangan)]);invalidateDataCache();res.json({success:true,id:r.insertId});}catch(error){res.status(error.code==='ER_DUP_ENTRY'?409:500).json({success:false,error:error.message});}});
app.put('/api/master-bank/:id', async (req,res)=>{const id=safeInteger(req.params.id),x=req.body||{},nama=safeString(x.nama||x.bank).trim();if(!id)return res.status(400).json({success:false,error:'ID bank tidak valid.'});if(!nama)return res.status(400).json({success:false,error:'Nama bank wajib diisi.'});try{await pool.query('UPDATE master_bank SET nama=?,rekening=?,atas_nama=?,aktif=?,keterangan=? WHERE id=?',[nama,safeString(x.rekening||x.nomor_rekening),safeString(x.atas_nama||x.nama_rekening),x.aktif===false?0:1,safeString(x.keterangan),id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(error.code==='ER_DUP_ENTRY'?409:500).json({success:false,error:error.message});}});
app.delete('/api/master-bank/:id', async (req,res)=>{const id=safeInteger(req.params.id);if(!id)return res.status(400).json({success:false,error:'ID bank tidak valid.'});try{await pool.query('UPDATE master_bank SET aktif=0 WHERE id=?',[id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});

// ============================================================
// MASTER PAJAK API - upsert tanpa menghapus seluruh tabel
// ============================================================
app.put('/api/master-pajak/bulk', async (req,res)=>{const items=Array.isArray(req.body?.data)?req.body.data:[];let conn;try{conn=await pool.getConnection();await conn.beginTransaction();for(let i=0;i<items.length;i++){const x=items[i]||{},jenis=safeString(x.jenis||x.nama).trim();if(!jenis)continue;const id=safeInteger(x.id,i+1);await conn.query(`INSERT INTO master_pajak (id,jenis,persentase,kode_pajak,aktif,keterangan) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE jenis=VALUES(jenis),persentase=VALUES(persentase),kode_pajak=VALUES(kode_pajak),aktif=VALUES(aktif),keterangan=VALUES(keterangan)`,[id,jenis,safeNumber(x.persentase),safeString(x.kode_pajak),x.aktif===false?0:1,safeString(x.keterangan)]);}await conn.commit();invalidateDataCache();res.json({success:true});}catch(error){if(conn)try{await conn.rollback();}catch(_){}res.status(500).json({success:false,error:error.message});}finally{if(conn)conn.release();}});

// ============================================================
// SHIFT API - satu sesi per request
// ============================================================
app.put('/api/shift-sessions/:id', async (req,res)=>{const id=safeString(req.params.id).trim(),x=req.body||{};if(!id)return res.status(400).json({success:false,error:'ID shift tidak valid.'});try{await pool.query(`INSERT INTO shift_sessions (id,username,name,shift,start_time,end_time,status,data) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE username=VALUES(username),name=VALUES(name),shift=VALUES(shift),start_time=VALUES(start_time),end_time=VALUES(end_time),status=VALUES(status),data=VALUES(data)`,[id,safeString(x.username),safeString(x.name||x.cashierName),safeString(x.shift),x.start_time?safeDate(x.start_time):(x.start?safeDate(x.start):null),x.end_time?safeDate(x.end_time):(x.end?safeDate(x.end):null),safeString(x.status),JSON.stringify(x)]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});
app.delete('/api/shift-sessions/:id', async (req,res)=>{const id=safeString(req.params.id);try{await pool.query('DELETE FROM shift_sessions WHERE id=?',[id]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});

// ============================================================
// AUDIT TRAIL - append only
// ============================================================
app.post('/api/audit-trail', async (req,res)=>{const x=req.body||{},id=safeString(x.id).trim();if(!id)return res.status(400).json({success:false,error:'ID audit wajib diisi.'});try{await pool.query(`INSERT IGNORE INTO audit_trail (id,timestamp,username,name,action,details,data) VALUES (?,?,?,?,?,?,?)`,[id,safeInteger(x.timestamp,Date.now()),safeString(x.username,'system'),safeString(x.userName||x.name,'System'),safeString(x.action),safeString(x.details||''),JSON.stringify(x)]);invalidateDataCache();res.json({success:true});}catch(error){res.status(500).json({success:false,error:error.message});}});


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
                            : null
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
                        safeString(e.kasir)
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
                        safeString(i.kasir)
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
            for (let i = 0; i < data.masterPajak.length; i++) {
                const x = data.masterPajak[i] || {};
                await conn.query(`INSERT INTO master_pajak (id, jenis, persentase, kode_pajak, aktif, keterangan) VALUES (?, ?, ?, ?, ?, ?)`, [safeInteger(x.id, i+1), safeString(x.jenis || x.nama), safeNumber(x.persentase), safeString(x.kode_pajak), x.aktif === false ? 0 : 1, safeString(x.keterangan)]);
            }
        }
        await conn.query(`DELETE FROM master_bank`);
        if (Array.isArray(data.masterBank)) {
            for (let i = 0; i < data.masterBank.length; i++) {
                const x = data.masterBank[i] || {};
                await conn.query(`INSERT INTO master_bank (id, nama, rekening, atas_nama, aktif, keterangan) VALUES (?, ?, ?, ?, ?, ?)`, [safeInteger(x.id, i+1), safeString(x.nama || x.bank), safeString(x.rekening || x.nomor_rekening), safeString(x.atas_nama || x.nama_rekening), x.aktif === false ? 0 : 1, safeString(x.keterangan)]);
            }
        }
        await conn.query(`DELETE FROM users`);
        if (Array.isArray(data.users)) {
            for (const x of data.users) {
                if (!x || !x.username) continue;
                await conn.query(`INSERT INTO users (username, password, role, name, aktif, data) VALUES (?, ?, ?, ?, ?, ?)`, [safeString(x.username), safeString(x.password), safeString(x.role, 'Kasir'), safeString(x.name), x.aktif === false ? 0 : 1, JSON.stringify(x)]);
            }
        }
        const [adminCheck] = await conn.query(`SELECT username FROM users WHERE username='admin' LIMIT 1`);
        if (adminCheck.length === 0) await conn.query(`INSERT INTO users (username,password,role,name,aktif,data) VALUES ('admin','admin123','Admin','Administrator',1,?)`, [JSON.stringify({username:'admin',password:'admin123',role:'Admin',name:'Administrator'})]);
        await conn.query(`DELETE FROM shift_sessions`);
        if (Array.isArray(data.shiftSessions)) {
            for (let i = 0; i < data.shiftSessions.length; i++) {
                const x=data.shiftSessions[i]||{}; const id=safeString(x.id||x.sessionId||('SHIFT-'+i+'-'+Date.now()));
                await conn.query(`INSERT INTO shift_sessions (id,username,name,shift,start_time,end_time,status,data) VALUES (?,?,?,?,?,?,?,?)`, [id,safeString(x.username||x.user),safeString(x.name),safeString(x.shift),x.start_time?safeDate(x.start_time):null,x.end_time?safeDate(x.end_time):null,safeString(x.status),JSON.stringify(x)]);
            }
        }
        await conn.query(`DELETE FROM audit_trail`);
        if (Array.isArray(data.auditTrail)) {
            for (let i=0;i<data.auditTrail.length && i<1000;i++) {
                const x=data.auditTrail[i]||{}; const id=safeString(x.id||('AUDIT-'+i+'-'+Date.now()));
                await conn.query(`INSERT INTO audit_trail (id,timestamp,username,name,action,details,data) VALUES (?,?,?,?,?,?,?)`, [id,safeNumber(x.timestamp),safeString(x.username||x.user),safeString(x.name),safeString(x.action),safeString(x.details||x.description),JSON.stringify(x)]);
            }
        }

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
// HEALTH CHECK / DATABASE CHECK
// ============================================================
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 AS ok');
        res.json({ success:true, server:true, database: rows[0]?.ok === 1 });
    } catch (error) {
        res.status(503).json({ success:false, server:true, database:false, error:error.message });
    }
});

// ============================================================
// DATABASE SCHEMA DIAGNOSTIC
// ============================================================
app.get('/api/db-schema', async (req, res) => {
    try {
        const [dbRows] = await pool.query('SELECT DATABASE() AS database_name');
        const [rows] = await pool.query(`SHOW COLUMNS FROM \`spareparts\``);
        const columns = rows.map(x => x.Field);

        res.json({
            success: true,
            database: dbRows[0]?.database_name || null,
            spareparts: columns,
            pajak_status: columns.includes('pajak_status'),
            kode_pajak: columns.includes('kode_pajak')
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
    try {
        await initializeDatabase();
        console.log('Database initialization selesai.');

        app.listen(PORT, () => {
            console.log(`Server berjalan di port ${PORT}`);
        });
    } catch (error) {
        console.error('Database initialization gagal:', error);
        process.exit(1);
    }
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
        kode_pajak VARCHAR(50) DEFAULT '', aktif TINYINT(1) DEFAULT 1, keterangan VARCHAR(255) DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS master_bank (
        id BIGINT PRIMARY KEY, nama VARCHAR(100) NOT NULL, rekening VARCHAR(100) DEFAULT '',
        atas_nama VARCHAR(255) DEFAULT '', aktif TINYINT(1) DEFAULT 1, keterangan VARCHAR(255) DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(100) PRIMARY KEY, password VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL,
        name VARCHAR(255) DEFAULT '', aktif TINYINT(1) DEFAULT 1, data JSON NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS shift_sessions (
        id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) DEFAULT '', name VARCHAR(255) DEFAULT '',
        shift VARCHAR(100) DEFAULT '', start_time DATETIME NULL, end_time DATETIME NULL,
        status VARCHAR(50) DEFAULT '', data JSON NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS audit_trail (
        id VARCHAR(100) PRIMARY KEY, timestamp BIGINT DEFAULT 0, username VARCHAR(100) DEFAULT '',
        name VARCHAR(255) DEFAULT '', action VARCHAR(255) DEFAULT '', details TEXT, data JSON NULL,
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
                const message = String(error?.message || '');
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
        kode: "VARCHAR(50) NULL",
        part_number: "VARCHAR(255) NULL",
        part_numbers_alt: "TEXT NULL",
        nama: "VARCHAR(500) NULL",
        kategori: "VARCHAR(100) NULL",
        merek: "VARCHAR(100) NULL",
        satuan: "VARCHAR(50) NULL",
        stok_min: "INT DEFAULT 0",
        stok_awal: "INT DEFAULT 0",
        harga_beli: "BIGINT DEFAULT 0",
        harga_jual: "BIGINT DEFAULT 0",
        satuan_alt: "VARCHAR(50) NULL",
        isi_satuan_alt: "INT DEFAULT 0",
        harga_jual_alt: "BIGINT DEFAULT 0",
        pajak_status: "VARCHAR(20) NULL",
        kode_pajak: "VARCHAR(50) NULL",
        keterangan: "TEXT NULL"
    };

    // Transaksi penjualan / piutang / pembayaran
    const transactionColumns = {
        nomor_transaksi: "VARCHAR(50) NULL",
        tanggal: "DATETIME NULL",
        sparepart_id: "BIGINT NULL",
        custom_item: "VARCHAR(500) NULL",
        part_numbers_alt: "TEXT NULL",
        merek: "VARCHAR(100) NULL",
        jenis: "VARCHAR(20) NULL",
        jumlah: "INT DEFAULT 0",
        satuan: "VARCHAR(50) NULL",
        jumlah_dasar: "INT DEFAULT 0",
        harga_satuan: "BIGINT DEFAULT 0",
        tujuan: "VARCHAR(255) NULL",
        keterangan: "TEXT NULL",
        source: "VARCHAR(50) NULL",
        kasir: "VARCHAR(100) NULL",
        status_bayar: "VARCHAR(20) NULL",
        metode_bayar: "VARCHAR(50) NULL",
        bayar_tunai: "BIGINT DEFAULT 0",
        transfer_amount: "BIGINT DEFAULT 0",
        kembalian_diberikan: "BIGINT DEFAULT 0",
        diskon: "BIGINT DEFAULT 0",
        tanggal_lunas: "DATETIME NULL"
    };

    const partnerColumns = {
        nama: "VARCHAR(255) NULL", tipe: "VARCHAR(50) NULL",
        telp: "VARCHAR(50) NULL", alamat: "TEXT NULL"
    };

    const cashColumns = {
        tanggal: "DATETIME NULL", jumlah: "BIGINT DEFAULT 0",
        keterangan: "TEXT NULL", kasir: "VARCHAR(100) NULL"
    };

    const taxColumns = {
        trx_id: "BIGINT DEFAULT 0", tanggal: "DATETIME NULL",
        nomor_transaksi: "VARCHAR(50) NULL", part_number: "VARCHAR(255) NULL",
        nama: "VARCHAR(500) NULL", kategori: "VARCHAR(100) NULL",
        merek: "VARCHAR(100) NULL", status_bayar: "VARCHAR(20) NULL",
        pelanggan: "VARCHAR(255) NULL", jumlah: "INT DEFAULT 0",
        satuan: "VARCHAR(50) NULL", harga_satuan: "BIGINT DEFAULT 0",
        subtotal: "BIGINT DEFAULT 0", persentase_pajak: "DECIMAL(5,2) DEFAULT 0",
        nilai_pajak: "BIGINT DEFAULT 0"
    };

    const returColumns = {
        parent_invoice: "VARCHAR(50) NULL", tanggal: "DATETIME NULL",
        kasir: "VARCHAR(100) NULL", pelanggan: "VARCHAR(255) NULL",
        items: "JSON NULL", exchange_items: "JSON NULL"
    };

    const appSettingColumns = {
        kas_awal: "BIGINT DEFAULT 0", active_shift_start: "BIGINT NULL",
        master_pajak: "JSON NULL", users: "JSON NULL", shift_sessions: "JSON NULL",
        master_bank: "JSON NULL", audit_trail: "JSON NULL"
    };

    const masterPajakColumns = {
        jenis: "VARCHAR(100) DEFAULT ''", persentase: "DECIMAL(5,2) DEFAULT 0",
        kode_pajak: "VARCHAR(50) DEFAULT ''", aktif: "TINYINT(1) DEFAULT 1",
        keterangan: "VARCHAR(255) DEFAULT ''",
        updated_at: "DATETIME NULL"
    };

    const masterBankColumns = {
        nama: "VARCHAR(100) DEFAULT ''", rekening: "VARCHAR(100) DEFAULT ''",
        atas_nama: "VARCHAR(255) DEFAULT ''", aktif: "TINYINT(1) DEFAULT 1",
        keterangan: "VARCHAR(255) DEFAULT ''", updated_at: "DATETIME NULL"
    };

    const userColumns = {
        password: "VARCHAR(255) DEFAULT ''", role: "VARCHAR(50) DEFAULT ''",
        name: "VARCHAR(255) DEFAULT ''", shift: "VARCHAR(100) DEFAULT ''",
        status: "VARCHAR(20) DEFAULT 'Aktif'", aktif: "TINYINT(1) DEFAULT 1",
        data: "JSON NULL", updated_at: "DATETIME NULL"
    };

    const shiftColumns = {
        username: "VARCHAR(100) DEFAULT ''", name: "VARCHAR(255) DEFAULT ''",
        shift: "VARCHAR(100) DEFAULT ''", start_time: "DATETIME NULL",
        end_time: "DATETIME NULL", status: "VARCHAR(50) DEFAULT ''",
        data: "JSON NULL", updated_at: "DATETIME NULL"
    };

    const auditColumns = {
        timestamp: "BIGINT DEFAULT 0", username: "VARCHAR(100) DEFAULT ''",
        name: "VARCHAR(255) DEFAULT ''", action: "VARCHAR(255) DEFAULT ''",
        details: "TEXT NULL", data: "JSON NULL", created_at: "DATETIME NULL"
    };

    for (const [column, definition] of Object.entries(sparepartColumns)) await ensureColumn('spareparts', column, definition);
    for (const [column, definition] of Object.entries(transactionColumns)) await ensureColumn('transactions', column, definition);
    for (const [column, definition] of Object.entries(partnerColumns)) await ensureColumn('partners', column, definition);
    for (const [column, definition] of Object.entries(cashColumns)) await ensureColumn('cash_expenses', column, definition);
    for (const [column, definition] of Object.entries(cashColumns)) await ensureColumn('cash_inflows', column, definition);
    for (const [column, definition] of Object.entries(taxColumns)) await ensureColumn('tax_records', column, definition);
    for (const [column, definition] of Object.entries(returColumns)) await ensureColumn('retur_records', column, definition);
    for (const [column, definition] of Object.entries(appSettingColumns)) await ensureColumn('app_settings', column, definition);
    for (const [column, definition] of Object.entries(masterPajakColumns)) await ensureColumn('master_pajak', column, definition);
    for (const [column, definition] of Object.entries(masterBankColumns)) await ensureColumn('master_bank', column, definition);
    for (const [column, definition] of Object.entries(userColumns)) await ensureColumn('users', column, definition);
    for (const [column, definition] of Object.entries(shiftColumns)) await ensureColumn('shift_sessions', column, definition);
    for (const [column, definition] of Object.entries(auditColumns)) await ensureColumn('audit_trail', column, definition);

    console.log('[MIGRASI] Pemeriksaan kolom database selesai tanpa menghapus data.');

    // ========================================================
    // VERIFIKASI STRUKTUR PAJAK SPAREPART
    // ========================================================
    // Aplikasi awal memakai dua kolom yang berbeda:
    // pajak_status = status Pajak / Non Pajak
    // kode_pajak   = kode pajak
    // Keduanya dipertahankan; tidak ada rename/drop/reorder.
    const [sparepartSchema] = await pool.query(`SHOW COLUMNS FROM \`spareparts\``);
    const sparepartColumnNames = sparepartSchema.map(x => x.Field);
    const hasPajakStatus = sparepartColumnNames.includes('pajak_status');
    const hasKodePajak = sparepartColumnNames.includes('kode_pajak');

    if (!hasPajakStatus || !hasKodePajak) {
        throw new Error(
            `Struktur pajak spareparts belum lengkap. Kolom yang tersedia: ${sparepartColumnNames.join(', ')}. ` +
            `Wajib ada pajak_status dan kode_pajak.`
        );
    }

    console.log('[PAJAK] spareparts.pajak_status tersedia.');
    console.log('[PAJAK] spareparts.kode_pajak tersedia.');

    // ========================================================
    // Pastikan row settings utama tersedia
    // ========================================================
    const defaultPajak = [
        {jenis:'Aki Basah',persentase:20}, {jenis:'Aki Kering',persentase:11},
        {jenis:'Oli',persentase:4}, {jenis:'Air Radiator',persentase:4},
        {jenis:'Minyak Rem',persentase:4}, {jenis:'Lainnya',persentase:11}
    ];
    const defaultUsers = [
        {username:'owner',password:'owner123',role:'Owner',name:'Pemilik'},
        {username:'admin',password:'admin123',role:'Admin',name:'Administrator'},
        {username:'pagi',password:'pagi123',role:'Kasir',name:'Kasir Pagi'},
        {username:'siang',password:'siang123',role:'Kasir',name:'Kasir Siang'}
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
        for (let i=0;i<defaultPajak.length;i++) {
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

    // Migrasi satu kali dari JSON lama -> tabel jika tabel master masih kosong.
    // Tidak pernah menghapus tabel yang sudah berisi data.
    const [bankCount] = await pool.query('SELECT COUNT(*) AS n FROM master_bank');
    if (Number(bankCount[0].n) === 0) {
        const [st] = await pool.query('SELECT master_bank FROM app_settings WHERE id=1 LIMIT 1');
        const legacyBanks = safeJSON(st[0]?.master_bank, []);
        if (Array.isArray(legacyBanks)) {
            for (let i=0;i<legacyBanks.length;i++) {
                const b=legacyBanks[i]; const nama=typeof b==='string'?b:safeString(b?.nama||b?.bank).trim();
                if(!nama) continue;
                try { await pool.query('INSERT INTO master_bank (id,nama,rekening,atas_nama,aktif,keterangan) VALUES (?,?,?,?,?,?)',[
                    safeInteger(typeof b==='object'?b.id:null,i+1),nama,typeof b==='object'?safeString(b.rekening||b.nomor_rekening):'',typeof b==='object'?safeString(b.atas_nama||b.nama_rekening):'',typeof b==='object'&&b.aktif===false?0:1,typeof b==='object'?safeString(b.keterangan):''
                ]); } catch(e) { if(e.code!=='ER_DUP_ENTRY') throw e; }
            }
        }
    }

    const [pajakTableCount] = await pool.query('SELECT COUNT(*) AS n FROM master_pajak');
    if (Number(pajakTableCount[0].n) === 0) {
        const [stPajak] = await pool.query('SELECT master_pajak FROM app_settings WHERE id=1 LIMIT 1');
        const legacyPajak = safeJSON(stPajak[0]?.master_pajak, []);
        if (Array.isArray(legacyPajak)) {
            for (let i=0;i<legacyPajak.length;i++) {
                const x=legacyPajak[i]||{}, jenis=safeString(x.jenis||x.nama).trim(); if(!jenis) continue;
                try { await pool.query('INSERT INTO master_pajak (id,jenis,persentase,kode_pajak,aktif,keterangan) VALUES (?,?,?,?,?,?)',[
                    safeInteger(x.id,i+1),jenis,safeNumber(x.persentase),safeString(x.kode_pajak),x.aktif===false?0:1,safeString(x.keterangan)
                ]); } catch(e) { if(e.code!=='ER_DUP_ENTRY') throw e; }
            }
        }
    }

    // Sinkronisasi settings lama jika JSON-nya kosong.
    const [freshSettings] = await pool.query(`SELECT master_pajak,users FROM app_settings WHERE id=1 LIMIT 1`);
    if (freshSettings.length) {
        const mp = safeJSON(freshSettings[0].master_pajak, []);
        if (!Array.isArray(mp) || mp.length === 0) {
            const [rows] = await pool.query(`SELECT jenis,persentase,kode_pajak FROM master_pajak WHERE aktif=1 ORDER BY id`);
            await pool.query(`UPDATE app_settings SET master_pajak=? WHERE id=1`, [JSON.stringify(rows.map(x=>({jenis:x.jenis,persentase:Number(x.persentase),kode_pajak:x.kode_pajak||''})))]);
        }
        const us = safeJSON(freshSettings[0].users, []);
        if (!Array.isArray(us) || us.length === 0) {
            const [rows] = await pool.query(`SELECT username,password,role,name FROM users WHERE aktif=1 ORDER BY username`);
            await pool.query(`UPDATE app_settings SET users=? WHERE id=1`, [JSON.stringify(rows)]);
        }
    }
}
