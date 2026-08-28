const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/api/test', (req, res) => {
    res.json({ status: "OK", message: "Server baru berhasil di-deploy!" });
});

// KREDENSIAL DATABASE CLEVER CLOUD
const pool = mysql.createPool({
    host: 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: 'uks2krvuygsynrco',
    password: 'fWwkTbshbBANrTGMj8Aq',
    database: 'b7fgoctdsrijlfhczppz',
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0
});

// === Error handlers untuk mencegah server crash ===
pool.on('error', (err) => {
    console.error('Database pool error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// === In-memory cache untuk /api/data ===
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

// 1. INISIALISASI TABEL
app.get('/api/init', async (req, res) => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS spareparts (
            id BIGINT PRIMARY KEY, kode VARCHAR(50), part_number VARCHAR(255), part_numbers_alt TEXT,
            nama VARCHAR(500), kategori VARCHAR(100), merek VARCHAR(100), satuan VARCHAR(50),
            stok_min INT DEFAULT 0, stok_awal INT DEFAULT 0, harga_beli BIGINT DEFAULT 0,
            harga_jual BIGINT DEFAULT 0, satuan_alt VARCHAR(50), isi_satuan_alt INT DEFAULT 0,
            harga_jual_alt BIGINT DEFAULT 0, pajak_status VARCHAR(20), kode_pajak VARCHAR(50), keterangan TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
            id BIGINT PRIMARY KEY, nomor_transaksi VARCHAR(50), tanggal DATETIME, sparepart_id BIGINT,
            custom_item VARCHAR(500), part_numbers_alt TEXT, merek VARCHAR(100), jenis VARCHAR(20),
            jumlah INT, satuan VARCHAR(50), jumlah_dasar INT, harga_satuan BIGINT, tujuan VARCHAR(255),
            keterangan TEXT, source VARCHAR(50), kasir VARCHAR(100), status_bayar VARCHAR(20),
            metode_bayar VARCHAR(50), bayar_tunai BIGINT DEFAULT 0, transfer_amount BIGINT DEFAULT 0,
            kembalian_diberikan BIGINT DEFAULT 0, diskon BIGINT DEFAULT 0, tanggal_lunas DATETIME NULL
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
            id VARCHAR(50) PRIMARY KEY, parent_invoice VARCHAR(50), tanggal DATETIME,
            kasir VARCHAR(100), pelanggan VARCHAR(255), items JSON, exchange_items JSON
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
            id INT PRIMARY KEY DEFAULT 1, kas_awal BIGINT DEFAULT 0, active_shift_start BIGINT,
            master_pajak JSON, users JSON
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        const [settings] = await pool.query('SELECT * FROM app_settings WHERE id = 1');
        if (settings.length === 0) {
            await pool.query(`INSERT INTO app_settings (id, kas_awal, active_shift_start, master_pajak, users) VALUES (1, 0, ?, ?, ?)`, [
                Date.now(),
                JSON.stringify([
                    { jenis: 'Aki Basah', persentase: 20 }, { jenis: 'Aki Kering', persentase: 11 },
                    { jenis: 'Oli', persentase: 4 }, { jenis: 'Air Radiator', persentase: 4 },
                    { jenis: 'Minyak Rem', persentase: 4 }, { jenis: 'Lainnya', persentase: 11 }
                ]),
                JSON.stringify([
                    { username: 'owner', password: 'owner123', role: 'Owner', name: 'Pemilik' },
                    { username: 'admin', password: 'admin123', role: 'Admin', name: 'Administrator' },
                    { username: 'pagi', password: 'pagi123', role: 'Kasir', name: 'Kasir Pagi' },
                    { username: 'siang', password: 'siang123', role: 'Kasir', name: 'Kasir Siang' }
                ])
            ]);
        }
        res.json({ message: "Database & Tabel siap!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. API MIGRASI
app.post('/api/migrate', async (req, res) => {
    const oldData = req.body;
    try {
        if (oldData.spareparts?.length > 0) {
            const values = oldData.spareparts.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (oldData.transactions?.length > 0) {
            const values = oldData.transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (oldData.partners?.length > 0) {
            const values = oldData.partners.map(p => [p.id, p.nama, p.tipe, p.telp||'', p.alamat||'']);
            await pool.query('INSERT IGNORE INTO partners (id, nama, tipe, telp, alamat) VALUES ?', [values]);
        }
        if (oldData.cashExpenses?.length > 0) {
            const values = oldData.cashExpenses.map(e => [e.id, e.tanggal, e.jumlah, e.keterangan, e.kasir||'']);
            await pool.query('INSERT IGNORE INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (oldData.cashInflows?.length > 0) {
            const values = oldData.cashInflows.map(i => [i.id, i.tanggal, i.jumlah, i.keterangan, i.kasir||'']);
            await pool.query('INSERT IGNORE INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (oldData.taxRecords?.length > 0) {
            const values = oldData.taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT IGNORE INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        if (oldData.kasAwal !== undefined || oldData.users) {
            await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
                oldData.kasAwal || 0, oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []), JSON.stringify(oldData.users || [])
            ]);
        }
        res.json({ message: "Migrasi data lama berhasil!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 3. GET ALL DATA (DIOPTIMALKAN)
app.get('/api/data', async (req, res) => {
    const now = Date.now();
    if (dataCache && (now - dataCacheTime) < DATA_CACHE_TTL) {
        return res.json(dataCache);
    }

    let connection;
    try {
        connection = await pool.getConnection();

        const [spareparts] = await connection.query('SELECT * FROM spareparts');
        const [transactions] = await connection.query('SELECT * FROM transactions');
        const [partners] = await connection.query('SELECT * FROM partners');
        const [cashExpenses] = await connection.query('SELECT * FROM cash_expenses');
        const [cashInflows] = await connection.query('SELECT * FROM cash_inflows');
        const [taxRecords] = await connection.query('SELECT * FROM tax_records');
        let returs = [];
        try {
            const [returResult] = await connection.query('SELECT * FROM retur_records');
            returs = returResult;
        } catch (e) { }

        const [settings] = await connection.query('SELECT * FROM app_settings WHERE id = 1');

        // Konversi tanggal ke ISO string untuk konsistensi
        transactions.forEach(t => {
            if (t.tanggal instanceof Date) t.tanggal = t.tanggal.toISOString();
            if (t.tanggal_lunas instanceof Date) t.tanggal_lunas = t.tanggal_lunas.toISOString();
        });
        cashExpenses.forEach(e => {
            if (e.tanggal instanceof Date) e.tanggal = e.tanggal.toISOString();
        });
        cashInflows.forEach(i => {
            if (i.tanggal instanceof Date) i.tanggal = i.tanggal.toISOString();
        });
        taxRecords.forEach(t => {
            if (t.tanggal instanceof Date) t.tanggal = t.tanggal.toISOString();
        });

        let returRecords = [];
        if (returs && returs.length > 0) {
            returRecords = returs.map(r => {
                let parsedItems = r.items;
                if (typeof parsedItems === 'string') {
                    try { parsedItems = JSON.parse(parsedItems); } catch(e) { parsedItems = []; }
                }
                r.items = parsedItems;

                let parsedExchangeItems = r.exchange_items;
                if (typeof parsedExchangeItems === 'string') {
                    try { parsedExchangeItems = JSON.parse(parsedExchangeItems); } catch(e) { parsedExchangeItems = []; }
                } else if (!parsedExchangeItems) {
                    parsedExchangeItems = [];
                }
                r.exchange_items = parsedExchangeItems;

                if (r.tanggal) r.tanggal = new Date(r.tanggal).toISOString();
                return r;
            });
        }

        let masterPajak = settings[0]?.master_pajak || [];
        if (typeof masterPajak === 'string') { try { masterPajak = JSON.parse(masterPajak); } catch(e) { masterPajak = []; } }

        let users = settings[0]?.users || [];
        if (typeof users === 'string') { try { users = JSON.parse(users); } catch(e) { users = []; } }

        const result = {
            spareparts, transactions, partners, cashExpenses, cashInflows, taxRecords,
            returRecords,
            kasAwal: settings[0]?.kas_awal || 0,
            activeShiftStart: settings[0]?.active_shift_start || Date.now(),
            masterPajak: masterPajak,
            users: users
        };

        dataCache = result;
        dataCacheTime = Date.now();

        res.json(result);
    } catch (error) {
        console.error("Error GET DATA:", error);
        if (dataCache) {
            console.log("Mengembalikan data cache karena error database");
            return res.json(dataCache);
        }
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// 4. SPAREPART
app.post('/api/sparepart', async (req, res) => {
    const sp = req.body;
    try {
        await pool.query('INSERT INTO spareparts SET ?', sp);
        res.json({ message: "Sparepart disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/sparepart/bulk', async (req, res) => {
    const { items } = req.body;
    try {
        if (items?.length > 0) {
            const values = items.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        res.json({ message: "Sparepart bulk disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/sparepart/:id', async (req, res) => {
    try {
        await pool.query('UPDATE spareparts SET ? WHERE id = ?', [req.body, req.params.id]);
        res.json({ message: "Sparepart diupdate" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/sparepart/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM spareparts WHERE id = ?', [req.params.id]);
        await pool.query('DELETE FROM transactions WHERE sparepart_id = ?', [req.params.id]);
        res.json({ message: "Sparepart dihapus" });
    } catch (error) {
        console.error("Error hapus sparepart:", error);
        res.status(500).json({ error: error.message });
    }
});

// 5. TRANSAKSI
app.post('/api/transactions', async (req, res) => {
    const { transactions, taxRecords } = req.body;
    try {
        if (transactions?.length > 0) {
            const values = transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            await pool.query('INSERT IGNORE INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values]);
        }
        if (taxRecords?.length > 0) {
            const values = taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT IGNORE INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        res.json({ message: "Transaksi disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/transaction/delete-invoice', async (req, res) => {
    const { trxId } = req.body;
    try {
        const [returs] = await pool.query('SELECT id FROM retur_records WHERE parent_invoice = ?', [trxId]);

        await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [trxId]);
        await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [trxId]);

        if (returs.length > 0) {
            for (const r of returs) {
                await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [r.id]);
                await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [r.id]);
            }
        }

        await pool.query('DELETE FROM retur_records WHERE parent_invoice = ?', [trxId]);
        res.json({ message: "Invoice & Retur berhasil dihapus dari server" });
    } catch (error) {
        console.error("Error hapus invoice:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/transaction/delete-retur', async (req, res) => {
    const { returId } = req.body;
    try {
        await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [returId]);
        await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [returId]);
        await pool.query('DELETE FROM retur_records WHERE id = ?', [returId]);
        res.json({ message: "Retur berhasil dihapus dari server" });
    } catch (error) {
        console.error("Error hapus retur:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/transaction/delete', async (req, res) => {
    const { id } = req.body;
    try {
        const cleanId = parseInt(id);
        await pool.query('DELETE FROM transactions WHERE id = ?', [cleanId]);
        await pool.query('DELETE FROM tax_records WHERE trx_id = ?', [cleanId]);
        res.json({ message: "Transaksi berhasil dihapus dari server" });
    } catch (error) {
        console.error("Error hapus transaksi:", error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/transaction/:id', async (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;
    try {
        await pool.query('UPDATE transactions SET sparepart_id=?, custom_item=?, jenis=?, jumlah=?, satuan=?, jumlah_dasar=?, tujuan=?, keterangan=? WHERE id = ?', [
            updatedData.sparepart_id, updatedData.custom_item, updatedData.jenis, updatedData.jumlah,
            updatedData.satuan, updatedData.jumlah_dasar, updatedData.tujuan, updatedData.keterangan, parseInt(id)
        ]);
        res.json({ message: "Transaksi berhasil diupdate (Tukar Barang)" });
    } catch (error) {
        console.error("Error edit transaksi:", error);
        res.status(500).json({ error: error.message });
    }
});

// === ENDPOINT BARU: EDIT STRUK UNTUK BON ===
// Hanya mengubah harga_satuan dan diskon, TIDAK mengubah jumlah/stok
app.put('/api/transaction/edit-struk', async (req, res) => {
    const { invoice, items, diskon } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Verifikasi invoice ada di database
        const [trxRows] = await conn.query(
            'SELECT id, nomor_transaksi, status_bayar, harga_satuan, jumlah, diskon FROM transactions WHERE nomor_transaksi = ? ORDER BY id ASC',
            [invoice]
        );
        if (trxRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Invoice tidak ditemukan di database' });
        }

        // Update setiap item harga_satuan
        for (const item of items) {
            await conn.query(
                'UPDATE transactions SET harga_satuan = ? WHERE id = ? AND nomor_transaksi = ?',
                [item.harga_satuan, item.id, invoice]
            );

            // Update tax_records jika ada
            const [taxRows] = await conn.query(
                'SELECT tax_id, jumlah, persentase_pajak FROM tax_records WHERE trx_id = ?',
                [item.id]
            );
            for (const tax of taxRows) {
                const newSubtotal = item.harga_satuan * tax.jumlah;
                const newNilaiPajak = (newSubtotal * parseFloat(tax.persentase_pajak)) / 100;
                await conn.query(
                    'UPDATE tax_records SET harga_satuan = ?, subtotal = ?, nilai_pajak = ? WHERE tax_id = ?',
                    [item.harga_satuan, newSubtotal, newNilaiPajak, tax.tax_id]
                );
            }
        }

        // Update diskon pada transaksi pertama (sesuai struktur yang ada)
        if (diskon !== undefined && trxRows.length > 0) {
            await conn.query(
                'UPDATE transactions SET diskon = ? WHERE id = ?',
                [diskon, trxRows[0].id]
            );
        }

        await conn.commit();
        res.json({ message: 'Struk berhasil diedit', invoice: invoice });
    } catch (error) {
        await conn.rollback();
        console.error('Error edit struk:', error);
        res.status(500).json({ error: 'Gagal menyimpan edit struk: ' + error.message });
    } finally {
        conn.release();
    }
});

// === ENDPOINT BARU: HAPUS CASH EXPENSE PER RECORD ===
app.post('/api/cash-expense/delete', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM cash_expenses WHERE id = ?', [id]);
        res.json({ message: 'Pengeluaran kas berhasil dihapus' });
    } catch (error) {
        console.error('Error hapus cash expense:', error);
        res.status(500).json({ error: error.message });
    }
});

// === ENDPOINT BARU: HAPUS CASH INFLOW PER RECORD ===
app.post('/api/cash-inflow/delete', async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM cash_inflows WHERE id = ?', [id]);
        res.json({ message: 'Tambahan kas berhasil dihapus' });
    } catch (error) {
        console.error('Error hapus cash inflow:', error);
        res.status(500).json({ error: error.message });
    }
});

// === PAYOFF: DIPERBAIKI untuk mencatat kas masuk ===
app.put('/api/transactions/payoff', async (req, res) => {
    const { trxId } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Ambil data transaksi untuk menghitung total terbaru
        const [trxRows] = await conn.query(
            'SELECT * FROM transactions WHERE nomor_transaksi = ?',
            [trxId]
        );
        if (trxRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }

        // Cek apakah sudah lunas
        const isAlreadyLunas = trxRows.every(t => t.status_bayar === 'Lunas');
        if (isAlreadyLunas) {
            await conn.rollback();
            return res.status(400).json({ error: 'Invoice sudah lunas' });
        }

        // Hitung total terbaru dari database (bukan dari frontend)
        const total = trxRows.reduce((sum, t) => sum + (t.harga_satuan * t.jumlah), 0) - (trxRows[0].diskon || 0);

        // Update status menjadi lunas
        await conn.query(
            'UPDATE transactions SET status_bayar = "Lunas", keterangan = "Bon (Lunas)", tanggal_lunas = NOW() WHERE nomor_transaksi = ?',
            [trxId]
        );
        await conn.query(
            'UPDATE tax_records SET status_bayar = "Lunas" WHERE nomor_transaksi = ?',
            [trxId]
        );

        // Catat kas masuk (cash inflow) sesuai nominal pelunasan terbaru
        await conn.query(
            'INSERT INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES (?, ?, ?, ?, ?)',
            [Date.now(), new Date(), total, 'Pelunasan Bon: ' + trxId, trxRows[0].kasir || 'Admin']
        );

        await conn.commit();
        res.json({ message: "Piutang berhasil dilunasi", total: total });
    } catch (error) {
        await conn.rollback();
        console.error('Error payoff:', error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

// 6. PARTNER
app.post('/api/partner', async (req, res) => { try { await pool.query('INSERT INTO partners SET ?', req.body); res.json({message:"Partner disimpan"}); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/partner/:id', async (req, res) => { try { await pool.query('UPDATE partners SET ? WHERE id = ?', [req.body, req.params.id]); res.json({message:"Partner diupdate"}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/partner/:id', async (req, res) => { try { await pool.query('DELETE FROM partners WHERE id = ?', [req.params.id]); res.json({message:"Partner dihapus"}); } catch(e){ res.status(500).json({error:e.message}); } });

// 7. SETTINGS — DIPERBAIKI: TIDAK ADA DELETE MASSAL
// Hanya UPSERT, tidak pernah menghapus data lama
app.put('/api/settings', async (req, res) => {
    const { kasAwal, activeShiftStart, masterPajak, users, returRecords, cashExpenses, cashInflows } = req.body;
    try {
        await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
            kasAwal || 0, activeShiftStart || Date.now(), JSON.stringify(masterPajak || []), JSON.stringify(users || [])
        ]);

        // UPSERT retur_records — TIDAK ADA DELETE
        // Data retur adalah DATA PERMANEN, tidak boleh dihapus karena payload kosong
        if (returRecords && Array.isArray(returRecords) && returRecords.length > 0) {
            const values = returRecords.map(r => [
                r.id,
                r.parent_invoice,
                new Date(r.tanggal),
                r.kasir||'',
                r.pelanggan||'',
                JSON.stringify(r.items || []),
                JSON.stringify(r.exchange_items || [])
            ]);
            await pool.query(
                'INSERT INTO retur_records (id, parent_invoice, tanggal, kasir, pelanggan, items, exchange_items) VALUES ? ON DUPLICATE KEY UPDATE parent_invoice=VALUES(parent_invoice), tanggal=VALUES(tanggal), kasir=VALUES(kasir), pelanggan=VALUES(pelanggan), items=VALUES(items), exchange_items=VALUES(exchange_items)',
                [values]
            );
        }
        // JIKA returRecords kosong/null: TIDAK MELAKUKAN APA-APA
        // Data retur lama tetap aman di database

        // UPSERT cash_expenses — TIDAK ADA DELETE
        if (cashExpenses && Array.isArray(cashExpenses) && cashExpenses.length > 0) {
            const values = cashExpenses.map(e => [e.id, new Date(e.tanggal), e.jumlah, e.keterangan||'', e.kasir||'']);
            await pool.query(
                'INSERT INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ? ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal), jumlah=VALUES(jumlah), keterangan=VALUES(keterangan), kasir=VALUES(kasir)',
                [values]
            );
        }
        // JIKA cashExpenses kosong/null: TIDAK MELAKUKAN APA-APA
        // Penghapusan cash_expense hanya melalui endpoint /api/cash-expense/delete

        // UPSERT cash_inflows — TIDAK ADA DELETE
        if (cashInflows && Array.isArray(cashInflows) && cashInflows.length > 0) {
            const values = cashInflows.map(i => [i.id, new Date(i.tanggal), i.jumlah, i.keterangan||'', i.kasir||'']);
            await pool.query(
                'INSERT INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ? ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal), jumlah=VALUES(jumlah), keterangan=VALUES(keterangan), kasir=VALUES(kasir)',
                [values]
            );
        }
        // JIKA cashInflows kosong/null: TIDAK MELAKUKAN APA-APA
        // Penghapusan cash_inflow hanya melalui endpoint /api/cash-inflow/delete

        res.json({ message: "Settings berhasil disimpan" });
    } catch (error) {
        console.error("Error settings:", error);
        res.status(500).json({ error: error.message });
    }
});

// 8. RESTORE DATA
app.post('/api/restore', async (req, res) => {
    const data = req.body;
    try {
        await pool.query('DELETE FROM spareparts');
        await pool.query('DELETE FROM transactions');
        await pool.query('DELETE FROM partners');
        await pool.query('DELETE FROM cash_expenses');
        await pool.query('DELETE FROM cash_inflows');
        await pool.query('DELETE FROM tax_records');
        await pool.query('DELETE FROM retur_records');

        if (data.spareparts?.length > 0) {
            const values = data.spareparts.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (data.transactions?.length > 0) {
            const values = data.transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (data.partners?.length > 0) {
            const values = data.partners.map(p => [p.id, p.nama, p.tipe, p.telp||'', p.alamat||'']);
            await pool.query('INSERT INTO partners (id, nama, tipe, telp, alamat) VALUES ?', [values]);
        }
        if (data.cashExpenses?.length > 0) {
            const values = data.cashExpenses.map(e => [e.id, e.tanggal, e.jumlah, e.keterangan, e.kasir||'']);
            await pool.query('INSERT INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (data.cashInflows?.length > 0) {
            const values = data.cashInflows.map(i => [i.id, i.tanggal, i.jumlah, i.keterangan, i.kasir||'']);
            await pool.query('INSERT INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (data.taxRecords?.length > 0) {
            const values = data.taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        if (data.returRecords?.length > 0) {
            const values = data.returRecords.map(r => [r.id, r.parent_invoice, new Date(r.tanggal), r.kasir||'', r.pelanggan||'', JSON.stringify(r.items || []), JSON.stringify(r.exchange_items || [])]);
            await pool.query('INSERT INTO retur_records (id, parent_invoice, tanggal, kasir, pelanggan, items, exchange_items) VALUES ?', [values]);
        }

        await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
            data.kasAwal || 0, data.activeShiftStart || Date.now(),
            JSON.stringify(data.masterPajak || []), JSON.stringify(data.users || [])
        ]);

        res.json({ message: "Restore data berhasil! Semua tabel di server telah ditimpa." });
    } catch (error) {
        console.error("Error restore:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
